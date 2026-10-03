"""A compiled, spike-driven engine for the same FlyWire LIF model the upstream TorchModel runs.

The upstream model (Eon fly-brain, pinned in upstream.json) advances every 0.1 ms step with a sparse
matrix product over all 15.1M connected pairs, though only a handful of the 138,639 neurons spike in
any step. This engine keeps the identical per-neuron equations and float32 arithmetic order, sweeps the
neurons once per step (split over threads), and sends input only from neurons that actually spiked:

  refrac  <- 0 if it spiked last step, else refrac + 1   (saturating at 250: it is only compared with 22)
  ok      <- refrac >= refractory steps (0 for stimulated input neurons, as the worker configures)
  g'      <- g * (1 - dt/tauSyn) + delayed input * ok      (the delay ring has upstream's steps_delay + 1 slots)
  v       <- v + stimulus;  v <- v + dt/tauMem * (g - (v - v_rest))     (the old g, as upstream)
  spike   <- v > v_threshold;  on a spike v <- v - (v - v_reset) and g' <- 0
  input   <- wScale * (weights · last step's spikes), summed per target in ascending presynaptic order
             (as a CSR row sums) and written into the ring slot just consumed

With identical input spikes it matches the upstream TorchModel bit for bit (every step's spiking set,
and the final membrane and synapse state: .agent/runtime/fastfly_parity.py). The only intended
difference is the Poisson input stream: a per-creature xorshift64* generator, not torch's.
"""
from __future__ import annotations

import numpy as np
from numba import njit, prange

UINT64_MULT = np.uint64(2685821657736338717)
REFRAC_CAP = 250


@njit(cache=False, nogil=True)
def _next_unit(rng):
    # xorshift64*: a small per-session stream (rng is a length-1 uint64 array).
    x = rng[0]
    x ^= x >> np.uint64(12)
    x ^= x << np.uint64(25)
    x ^= x >> np.uint64(27)
    rng[0] = x
    return float((x * UINT64_MULT) >> np.uint64(11)) * (1.0 / 9007199254740992.0)


@njit(cache=False, nogil=True, parallel=True)
def _neuron_pass(bounds, refrac_steps, g, v, refrac, slot, stim, spiked_prev, chunk_spikes, chunk_n,
                 c, f, v_rest, v_th, v_reset):
    """One step for every neuron, in contiguous chunks (a few per worker thread). Each chunk keeps its
    spikes in ascending order in its own region, so the concatenation is ascending too."""
    one = np.float32(1.0)
    zero = np.float32(0.0)
    for ch in prange(bounds.shape[0] - 1):
        lo = bounds[ch]
        hi = bounds[ch + 1]
        k = lo
        for n in range(lo, hi):
            r = 0 if spiked_prev[n] else refrac[n] + 1
            if r > REFRAC_CAP:
                r = REFRAC_CAP
            refrac[n] = r
            okf = one if r >= refrac_steps[n] else zero
            g_old = g[n]
            g_new = g_old * c + slot[n] * okf
            slot[n] = zero
            vv = v[n] + stim[n]
            vv = vv + f * (g_old - (vv - v_rest))
            if vv > v_th:
                vv = vv - (vv - v_reset)
                g_new = g_new - g_new
                chunk_spikes[k] = n
                k += 1
            g[n] = g_new
            v[n] = vv
        chunk_n[ch] = k - lo


@njit(cache=False, nogil=True)
def run_steps(n_steps, bounds, ptr, tgt, wts, refrac_steps, g, v, refrac, ring, head, prev_list, n_prev,
              spiked_prev, chunk_spikes, chunk_n, stim, stim_idx, stim_p, rng, forced, readout_pos, counts,
              c, f, v_rest, v_th, v_reset, scale, stim_amp, touched, touched_list, step_spikes):
    """Advance n_steps 0.1 ms steps in place. Returns (head, n_prev). step_spikes[s] gets each step's count."""
    L = ring.shape[0]
    K = stim_idx.shape[0]
    zero = np.float32(0.0)
    for s in range(n_steps):
        # Poisson (or forced, for parity checks) stimulation of the input neurons this step.
        for k in range(K):
            fire = forced[s, k] != 0 if forced.shape[0] > 0 else _next_unit(rng) < stim_p[k]
            if fire:
                stim[stim_idx[k]] = stim_amp
        slot = ring[head]
        _neuron_pass(bounds, refrac_steps, g, v, refrac, slot, stim, spiked_prev, chunk_spikes, chunk_n,
                     c, f, v_rest, v_th, v_reset)
        for k in range(K):
            stim[stim_idx[k]] = zero
        for i in range(n_prev):
            spiked_prev[prev_list[i]] = 0
        # Input from last step's spikes enters the slot just consumed (upstream writes it after the roll).
        n_touched = 0
        for i in range(n_prev):
            j = prev_list[i]
            for e in range(ptr[j], ptr[j + 1]):
                t = tgt[e]
                if touched[t] == 0:
                    touched[t] = 1
                    touched_list[n_touched] = t
                    n_touched += 1
                slot[t] += wts[e]
        for i in range(n_touched):
            t = touched_list[i]
            slot[t] = scale * slot[t]
            touched[t] = 0
        # This step's spikes, in ascending order, become next step's.
        n_new = 0
        for ch in range(bounds.shape[0] - 1):
            lo = bounds[ch]
            for i in range(chunk_n[ch]):
                n = chunk_spikes[lo + i]
                prev_list[n_new] = n
                n_new += 1
                spiked_prev[n] = 1
                p = readout_pos[n]
                if p >= 0:
                    counts[p] += 1.0
        n_prev = n_new
        step_spikes[s] = n_new
        head = head + 1
        if head == L:
            head = 0
    return head, n_prev


class FastConnectome:
    """The shared connectome (presynaptic-ordered sparse weights) and constants."""

    def __init__(self, post, pre, values, neuron_count, params, dt, exc_indices=(), stim_indices=(), readout_flat=(), threads=1):
        post = np.asarray(post, dtype=np.int64); pre = np.asarray(pre, dtype=np.int64)
        values = np.asarray(values, dtype=np.float32)
        if post.shape != pre.shape or post.shape != values.shape:
            raise ValueError('connectivity arrays differ in length')
        self.N = int(neuron_count)
        if len(post) and (min(post.min(), pre.min()) < 0 or max(post.max(), pre.max()) >= self.N or not np.isfinite(values).all()):
            raise ValueError('invalid connectivity')
        # Merge duplicate (pre, post) pairs as torch's coalesce does, and order by presynaptic neuron, then target.
        key = pre * self.N + post
        order = np.argsort(key, kind='stable')
        key, values = key[order], values[order]
        if len(key):
            starts = np.flatnonzero(np.r_[True, key[1:] != key[:-1]])
            values = np.add.reduceat(values, starts).astype(np.float32)
            key = key[starts]
        pre, post = key // self.N, key % self.N
        self.tgt = post.astype(np.int32)
        self.wts = values
        self.ptr = np.zeros(self.N + 1, dtype=np.int64)
        np.cumsum(np.bincount(pre, minlength=self.N), out=self.ptr[1:])
        self.synapse_count = int(values.shape[0])
        self.dt = float(dt)
        f32 = np.float32
        self.c = f32(1 - dt / params['tauSyn'])  # (torch: conductance * (1 - time_factor), the scalar cast to float32)
        self.f = f32(dt / params['tauMem'])
        self.v_rest, self.v_th, self.v_reset, self.v0 = f32(params['vRest']), f32(params['vThreshold']), f32(params['vReset']), f32(params['v0'])
        self.scale = f32(params['wScale'])
        self.stim_amp = f32(f32(params['wScale']) * f32(params['scalePoisson']))
        self.delay_slots = int(params['tDelay'] / dt) + 1  # (the same expression as upstream's steps_delay + 1)
        base_refrac = int(round(params['tRefrac'] / dt))
        if not 0 <= base_refrac < REFRAC_CAP:
            raise ValueError('refractory period outside the saturating counter')
        self.refrac_steps = np.full(self.N, base_refrac, dtype=np.uint8)
        self.refrac_steps[np.asarray(list(exc_indices), dtype=np.int64)] = 0
        self.stim_idx = np.asarray(sorted(set(int(i) for i in stim_indices)), dtype=np.int32)
        self.readout_pos = np.full(self.N, -1, dtype=np.int32)
        for p, n in enumerate(readout_flat):
            self.readout_pos[int(n)] = p
        self.readout_count = len(readout_flat)
        # Contiguous chunks for the neuron sweep: a few per thread.
        chunks = max(1, int(threads)) * 4
        self.bounds = np.linspace(0, self.N, chunks + 1).astype(np.int64)
        self.chunk_spikes = np.zeros(self.N, dtype=np.int32)
        self.chunk_n = np.zeros(chunks, dtype=np.int64)
        self.touched = np.zeros(self.N, dtype=np.uint8)
        self.touched_list = np.zeros(self.N, dtype=np.int32)
        self.stim = np.zeros(self.N, dtype=np.float32)
        self._no_force = np.zeros((0, max(1, len(self.stim_idx))), dtype=np.uint8)

    def new_state(self, seed: int):
        return FastState(self, seed)

    def warm(self):
        """Compile the kernels once (a few seconds) before serving."""
        self.run(self.new_state(1), 2, np.zeros(self.N, dtype=np.float32))

    def run(self, st, n_steps, rates, forced=None):
        """Advance st by n_steps at the given per-neuron rates (Hz). Returns readout spike counts (float64)."""
        p = (np.asarray(rates, dtype=np.float64)[self.stim_idx] * (self.dt / 1000.0)) if len(self.stim_idx) else np.zeros(0)
        counts = np.zeros(max(1, self.readout_count), dtype=np.float64)
        st.step_spikes = np.zeros(n_steps, dtype=np.int32)
        st.head, st.n_prev = run_steps(
            n_steps, self.bounds, self.ptr, self.tgt, self.wts, self.refrac_steps, st.g, st.v, st.refrac, st.ring, st.head,
            st.prev_list, st.n_prev, st.spiked_prev, self.chunk_spikes, self.chunk_n, self.stim, self.stim_idx, p, st.rng,
            self._no_force if forced is None else np.ascontiguousarray(forced, dtype=np.uint8),
            self.readout_pos, counts, self.c, self.f, self.v_rest, self.v_th, self.v_reset, self.scale,
            self.stim_amp, self.touched, self.touched_list, st.step_spikes)
        return counts[:self.readout_count]


class FastState:
    """One creature's membrane, synapse, delay-ring and refractory state, and its random stream."""

    def __init__(self, conn: FastConnectome, seed: int):
        N = conn.N
        self.g = np.zeros(N, dtype=np.float32)
        self.v = np.full(N, conn.v0, dtype=np.float32)
        # (Upstream starts each counter at its own refractory period, so nothing is refractory at first.)
        self.refrac = conn.refrac_steps.copy()
        self.ring = np.zeros((conn.delay_slots, N), dtype=np.float32)
        self.head = 0
        self.prev_list = np.zeros(N, dtype=np.int32)
        self.n_prev = 0
        self.spiked_prev = np.zeros(N, dtype=np.uint8)
        self.rng = np.array([np.uint64(seed) or np.uint64(0x9E3779B97F4A7C15)], dtype=np.uint64)
        self.step_spikes = np.zeros(0, dtype=np.int32)

    def clone(self):
        other = object.__new__(FastState)
        for k, val in self.__dict__.items():
            setattr(other, k, val.copy() if isinstance(val, np.ndarray) else val)
        return other
