"""The compiled engine against upstream's own TorchModel: bit-for-bit on random networks with identical
input spikes, unchanged by thread count, and the worker's fast path on the real connectome."""

import importlib.util
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

import numpy as np

import fastfly

TEST_ROOT = os.environ.get("FLY_BRAIN_TEST_ROOT")


def upstream_module():
    spec = importlib.util.spec_from_file_location("fly_up_test", Path(TEST_ROOT) / "code/run_pytorch.py")
    bench = importlib.util.spec_from_file_location("benchmark", Path(TEST_ROOT) / "code/benchmark.py")
    sys.modules["benchmark"] = importlib.util.module_from_spec(bench)
    bench.loader.exec_module(sys.modules["benchmark"])
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def random_network(n, pairs, seed):
    rng = np.random.default_rng(seed)
    post = rng.integers(0, n, pairs)
    pre = rng.integers(0, n, pairs)
    # Excitatory and inhibitory counts, with some duplicate pairs (coalesced by both).
    values = (rng.integers(1, 40, pairs) * rng.choice([1, 1, 1, -1], pairs)).astype(np.float32)
    post = np.r_[post, post[:20]]; pre = np.r_[pre, pre[:20]]; values = np.r_[values, values[:20]]
    return post, pre, values


@unittest.skipUnless(TEST_ROOT, "FLY_BRAIN_TEST_ROOT (the pinned upstream checkout) is required")
class ParityTests(unittest.TestCase):
    def run_both(self, n=400, pairs=12000, steps=1500, seed=4, threads=1):
        import torch
        U = upstream_module()
        post, pre, values = random_network(n, pairs, seed)
        stimulated = list(range(0, n, 9))
        weights = torch.sparse_coo_tensor(np.stack([post, pre]), values, (n, n), dtype=torch.float32).to_sparse_csr()
        model = U.TorchModel(1, n, U.DT, U.MODEL_PARAMS, weights, exc_indices=stimulated)
        conn = fastfly.FastConnectome(post, pre, values, n, U.MODEL_PARAMS, U.DT, exc_indices=stimulated,
                                      stim_indices=stimulated, readout_flat=list(range(10)), threads=threads)
        forced = (np.random.default_rng(seed + 1).random((steps, len(conn.stim_idx))) < 0.04).astype(np.uint8)
        rows = iter(range(steps))

        def poisson(rates, generator=None):
            out = torch.zeros(1, n)
            out[0, torch.as_tensor(conn.stim_idx, dtype=torch.long)] = torch.as_tensor(forced[next(rows)], dtype=torch.float32)
            return out * U.MODEL_PARAMS["scalePoisson"]
        model.poisson.forward = poisson
        state, st = model.state_init(), conn.new_state(1)
        rates = np.zeros(n, np.float32)
        torch_counts, fast_counts, total = np.zeros(10), np.zeros(10), 0
        with torch.no_grad():
            for s in range(steps):
                state = model(torch.from_numpy(rates)[None], *state)
                fast_counts += conn.run(st, 1, rates, forced=forced[s:s + 1])
                spiking = torch.nonzero(state[2][0]).flatten().tolist()
                self.assertEqual(spiking, st.prev_list[:st.n_prev].tolist(), f"step {s}")
                torch_counts += state[2][0, :10].numpy()
                total += len(spiking)
        self.assertGreater(total, 100, "the network must actually be active for parity to mean anything")
        np.testing.assert_array_equal(state[0][0].numpy(), st.g)
        np.testing.assert_array_equal(state[3][0].numpy(), st.v)
        np.testing.assert_array_equal(torch_counts, fast_counts)
        return st

    def test_bit_for_bit_with_upstream(self):
        self.run_both()

    def test_threads_do_not_change_results(self):
        one, two = self.run_both(threads=1), self.run_both(threads=3)
        np.testing.assert_array_equal(one.v, two.v)
        np.testing.assert_array_equal(one.g, two.g)


class EngineTests(unittest.TestCase):
    PARAMS = {"tauSyn": 5.0, "tDelay": 1.8, "v0": -52.0, "vReset": -52.0, "vRest": -52.0, "vThreshold": -45.0,
              "tauMem": 20.0, "tRefrac": 2.2, "scalePoisson": 250, "wScale": 0.275}

    def test_streams_are_per_creature_and_reproducible(self):
        conn = fastfly.FastConnectome([1], [0], [5.0], 4, self.PARAMS, 0.1, stim_indices=[0], readout_flat=[0])
        rates = np.zeros(4, np.float32); rates[0] = 300.0
        a, b, c = conn.new_state(11), conn.new_state(11), conn.new_state(12)
        ca, cb, cc = conn.run(a, 2000, rates), conn.run(b, 2000, rates), conn.run(c, 2000, rates)
        self.assertEqual(ca.tolist(), cb.tolist())
        self.assertNotEqual(ca.tolist(), cc.tolist())
        self.assertGreater(ca[0], 0)

    def test_rejects_bad_connectivity_and_silent_stays_silent(self):
        with self.assertRaises(ValueError):
            fastfly.FastConnectome([5], [0], [1.0], 4, self.PARAMS, 0.1)
        conn = fastfly.FastConnectome([1, 2], [0, 1], [5.0, 5.0], 4, self.PARAMS, 0.1, readout_flat=[0, 1, 2])
        st = conn.new_state(3)
        self.assertEqual(conn.run(st, 500, np.zeros(4, np.float32)).tolist(), [0, 0, 0])
        self.assertTrue((st.v == np.float32(-52.0)).all() and (st.g == 0).all())


@unittest.skipUnless(TEST_ROOT, "FLY_BRAIN_TEST_ROOT (the pinned upstream checkout) is required")
class WorkerFastTests(unittest.TestCase):
    def test_worker_fast_path_on_the_real_connectome(self):
        from worker import FlyBrain
        with patch.dict(os.environ, {"FLY_BRAIN_ENGINE": "fast", "FLY_BRAIN_STEP_MS": "20", "FLY_BRAIN_THREADS": "2"}):
            brain = FlyBrain(Path(TEST_ROOT), device="cpu")
        self.assertEqual(brain.engine, "fast")
        self.assertEqual((brain.neuron_count, brain.synapse_count), (138639, 15091983))
        inputs = {"food": 1.0, "danger": 0.5, "drive": 0.25, "bitter": .75, "odor": .6, "touch": .2, "turn": .5}
        result = brain.step("fast/a", inputs)
        self.assertEqual(sorted(set(brain.rates[brain.input_indices["food"]].tolist())), [200.0])
        self.assertEqual(brain.rates[brain.input_indices["drive"]].tolist(), [12.5, 25.0])
        self.assertEqual(result["simulatedMs"], 20.0)
        self.assertEqual(set(result["activity"]), set(brain.readout_indices))
        # A reset session replays its own stream exactly; another creature differs.
        again = brain.step("fast/a", inputs, reset=True)
        self.assertEqual(again["activity"], result["activity"])
        self.assertIsNot(brain._session("fast/b", False).state, brain._session("fast/a", False).state)


if __name__ == "__main__":
    unittest.main()
