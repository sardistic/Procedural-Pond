"""Stateful adapter for the pinned Eon fly-brain PyTorch connectome model.

The simulator is imported from a verified, separately downloaded upstream tree.
Pond stimuli and motor scaling are game mappings, not a fish neuroscience model.
This adapter does not train a network or substitute a synthetic brain.
"""

from __future__ import annotations

import argparse
from collections import OrderedDict, deque
from dataclasses import dataclass, field
from hashlib import sha256
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import sys
import threading
import time
from typing import Any


UPSTREAM_REVISION = "a3db62f9436074e485c0278290c2164ed6150808"
SOURCE_HASHES = {
    "LICENSE": "8177f97513213526df2cf6184d8ff986c675afb514d4e68a404010521b880643",
    "code/run_pytorch.py": "699655db7a56045271ba467268be153d0a3318d4cc4cecc0a13f33e69ce79667",
    "code/benchmark.py": "e18dae9072baf9ee0f0581282641c58864fdc138c6e75b718a542eb27d272874",
    "data/2025_Completeness_783.csv": "52b0ac6094cd32c546f8d4c341e094376f48f4e791f8db9b166de5dff8199ea4",
    "data/2025_Connectivity_783.parquet": "efeb23fb99098e9c390f6869969b2a121a2ee92c833cfc45ecb2c1d8e1af0347",
}

# Published optogenetic activation and readout populations, from upstream's
# code/paper-phil-drosophila/example.ipynb at UPSTREAM_REVISION.
# Sugar and P9 activation populations come directly from benchmark.EXPERIMENTS.
LC4_IDS = (
    720575940605598892, 720575940611134833, 720575940612580977,
    720575940613256863, 720575940613260959, 720575940614914107,
    720575940615462587, 720575940617176321, 720575940617266722,
    720575940618807105, 720575940620795728, 720575940622108001,
    720575940624017251, 720575940625038090, 720575940625934973,
    720575940625991043, 720575940626605200, 720575940626626895,
    720575940628454522, 720575940628462340, 720575940630851036,
    720575940638496720, 720575940603637438, 720575940610522009,
    720575940612093351, 720575940612323025, 720575940612380723,
    720575940612498129, 720575940612518055, 720575940612968421,
    720575940613609484, 720575940613638041, 720575940614572742,
    720575940614582946, 720575940615053580, 720575940615127227,
    720575940615232217, 720575940615575007, 720575940616066705,
    720575940616713355, 720575940617026260, 720575940617348379,
    720575940618002644, 720575940618234704, 720575940618234715,
    720575940618266459, 720575940618267227, 720575940618275520,
    720575940618312606, 720575940618676440, 720575940618709158,
    720575940618723749, 720575940619397542, 720575940620314221,
    720575940620314612, 720575940620731380, 720575940620903551,
    720575940621145821, 720575940621522458, 720575940621753579,
    720575940622330582, 720575940622531767, 720575940622939836,
    720575940624111763, 720575940624790781, 720575940624856762,
    720575940625841351, 720575940625845447, 720575940625906702,
    720575940625932421, 720575940626553596, 720575940626916936,
    720575940627519107, 720575940628064260, 720575940628081541,
    720575940628419527, 720575940628518400, 720575940628599895,
    720575940628606713, 720575940628699560, 720575940628891863,
    720575940629753807, 720575940629964591, 720575940630154660,
    720575940630484495, 720575940630998339, 720575940631032657,
    720575940631338271, 720575940632475449, 720575940632715234,
    720575940632769180, 720575940633013355, 720575940633218863,
    720575940633580384, 720575940634517856, 720575940635835967,
    720575940636957006, 720575940638456227, 720575940639817947,
    720575940640612480, 720575940641213824, 720575940645821316,
    720575940649229433, 720575940652611745,
)
READOUT_IDS = {
    "forward": (720575940626730883, 720575940620300308),
    "left": (720575940644438551, 720575940604737708),
    "right": (720575940627787609, 720575940629327659),
    "feeding": (720575940660219265, 720575940618238523),
    "escape": (720575940622838154, 720575940632499757),
    "reverse": (
        720575940616026939, 720575940631082808,
        720575940640331472, 720575940610236514,
    ),
}
SESSION_PATTERN = re.compile(r"[A-Za-z0-9_/-]{1,96}\Z")
MAX_BODY_BYTES = 16_384
STEP_BUDGET_SECONDS = 3.5
ACTIVITY_WINDOW_MS = 50.0


class InvalidInput(ValueError):
    pass


class Busy(RuntimeError):
    pass


def validate_input(body: Any) -> tuple[str, dict[str, float], bool]:
    """Accept only the small, bounded public controller contract."""
    if not isinstance(body, dict) or set(body) - {"session", "inputs", "reset"}:
        raise InvalidInput("Invalid request")
    session = body.get("session")
    values = body.get("inputs")
    reset = body.get("reset", False)
    if not isinstance(session, str) or not SESSION_PATTERN.fullmatch(session):
        raise InvalidInput("Invalid session")
    if type(reset) is not bool or not isinstance(values, dict):
        raise InvalidInput("Invalid inputs")
    if set(values) != {"food", "danger", "drive"}:
        raise InvalidInput("Invalid inputs")
    for value in values.values():
        if type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= 1:
            raise InvalidInput("Invalid input range")
    return session, {key: float(value) for key, value in values.items()}, reset


def decode_motor(activity: dict[str, float]) -> dict[str, Any]:
    """Game-defined normalization of measured population mean firing rates (Hz)."""
    if set(activity) != set(READOUT_IDS) or any(
        not math.isfinite(value) or value < 0 for value in activity.values()
    ):
        raise RuntimeError("Invalid neural readout")
    left, right = activity["left"], activity["right"]
    return {
        "drive": math.tanh(activity["forward"] / 50.0),
        "turn": (right - left) / (right + left + 20.0),
        "feeding": activity["feeding"] >= 5.0,
        "escape": activity["escape"] >= 5.0,
        "reverse": activity["reverse"] >= 5.0,
    }


def readout_activity(history: deque, counts: list[float], duration_ms: float) -> tuple[dict[str, float], float]:
    """Average actual spikes over retained complete windows of at most 50 ms.

    Keeping complete windows avoids inventing spike timing within a count-only
    window. Older windows expire in neural time, even when requests are sparse.
    """
    if (not math.isfinite(duration_ms) or not 0 < duration_ms <= ACTIVITY_WINDOW_MS
            or len(counts) != sum(map(len, READOUT_IDS.values()))
            or any(not math.isfinite(value) or value < 0 for value in counts)):
        raise RuntimeError("Invalid measured spike window")
    history.append((duration_ms, counts))
    window_ms = sum(duration for duration, _ in history)
    while len(history) > 1 and window_ms > ACTIVITY_WINDOW_MS:
        duration, _ = history.popleft()
        window_ms -= duration
    totals = [sum(window[index] for _, window in history) for index in range(len(counts))]
    activity = {}
    offset = 0
    for name, neurons in READOUT_IDS.items():
        activity[name] = sum(totals[offset:offset + len(neurons)]) / len(neurons) / (window_ms / 1000)
        offset += len(neurons)
    return activity, window_ms


@dataclass
class Session:
    state: Any
    generator: Any
    last_used: float
    history: deque = field(default_factory=deque)


class FlyBrain:
    """One full upstream connectome shared by independently stateful creatures.

    Only one step runs at a time; competing callers fail fast. Sessions retain
    membrane, synapse, delay and refractory state plus their own random stream.
    """

    def __init__(self, root: Path, device: str = "cpu", max_sessions: int = 8,
                 ttl: float = 120.0, clock=time.monotonic):
        self.clock = clock
        self.ttl = ttl
        self.max_sessions = max_sessions
        self.sessions: OrderedDict[str, Session] = OrderedDict()
        self.lock = threading.Lock()
        root = root.resolve()
        for relative, expected in SOURCE_HASHES.items():
            path = root / relative
            with path.open("rb") as source:
                digest = sha256()
                for block in iter(lambda: source.read(1_048_576), b""):
                    digest.update(block)
            if digest.hexdigest() != expected:
                raise RuntimeError(f"Pinned upstream file failed verification: {relative}")

        # The upstream model imports these in this order to avoid an Arrow/Torch
        # shared-library conflict. Do not load any downloaded pickle caches.
        import pandas as pd
        import pyarrow  # noqa: F401
        import numpy as np
        import torch
        self.torch = torch
        torch.set_num_threads(max(1, min(4, int(os.environ.get("FLY_BRAIN_THREADS", "1")))))
        try:
            torch.set_num_interop_threads(1)
        except RuntimeError:
            pass  # An existing process may already have started Torch work.
        if device not in {"cpu", "cuda"} or device == "cuda" and not torch.cuda.is_available():
            raise RuntimeError("Configured fly-brain device is unavailable")
        self.device = device

        # Resolve imports only from the verified upstream source directory.
        benchmark_spec = importlib.util.spec_from_file_location("benchmark", root / "code/benchmark.py")
        benchmark = importlib.util.module_from_spec(benchmark_spec)
        sys.modules["benchmark"] = benchmark
        benchmark_spec.loader.exec_module(benchmark)
        model_spec = importlib.util.spec_from_file_location("fly_brain_upstream", root / "code/run_pytorch.py")
        upstream = importlib.util.module_from_spec(model_spec)
        model_spec.loader.exec_module(upstream)
        self.dt = upstream.DT
        self.step_ms = float(os.environ.get("FLY_BRAIN_STEP_MS", "50" if device == "cuda" else "10"))
        if not math.isfinite(self.step_ms) or not 5 <= self.step_ms <= 50:
            raise RuntimeError("Invalid configured neural step duration")
        self.steps = int(round(self.step_ms / self.dt))
        if not math.isclose(self.steps * self.dt, self.step_ms):
            raise RuntimeError("Neural step duration must align with upstream timestep")
        self.id_to_index, _ = upstream.get_hash_tables(str(root / "data/2025_Completeness_783.csv"))
        self.neuron_count = len(self.id_to_index)
        self.input_indices = {
            "food": [self.id_to_index[neuron] for neuron in benchmark.EXPERIMENTS["sugar"]["neu_exc"]],
            "danger": [self.id_to_index[neuron] for neuron in LC4_IDS],
            "drive": [self.id_to_index[neuron] for neuron in benchmark.EXPERIMENTS["p9"]["neu_exc"]],
        }
        self.readout_indices = {
            name: [self.id_to_index[neuron] for neuron in neurons]
            for name, neurons in READOUT_IDS.items()
        }
        # This matches upstream get_weights()'s construction and coalescing,
        # while deliberately excluding its pickle cache loading.
        connections = pd.read_parquet(root / "data/2025_Connectivity_783.parquet", columns=[
            "Postsynaptic_Index", "Presynaptic_Index", "Excitatory x Connectivity",
        ])
        indices = np.stack([
            connections["Postsynaptic_Index"].to_numpy(dtype=np.int64),
            connections["Presynaptic_Index"].to_numpy(dtype=np.int64),
        ])
        values = connections["Excitatory x Connectivity"].to_numpy(dtype=np.float32)
        if (indices.min() < 0 or indices.max() >= self.neuron_count
                or not np.isfinite(values).all()):
            raise RuntimeError("Invalid upstream connectivity")
        weights = torch.sparse_coo_tensor(indices, values, (
            self.neuron_count, self.neuron_count,
        ), dtype=torch.float32).to_sparse_csr().to(device)
        self.synapse_count = weights._nnz()
        del connections, indices, values
        stimulated = sorted(set(index for group in self.input_indices.values() for index in group))
        self.model = upstream.TorchModel(1, self.neuron_count, self.dt, upstream.MODEL_PARAMS,
                                         weights, exc_indices=stimulated, device=device)
        self.rates = torch.zeros(1, self.neuron_count, device=device)
        self.readout_flat = [index for group in self.readout_indices.values() for index in group]
        self.readout_tensor = torch.tensor(self.readout_flat, dtype=torch.long, device=device)

    def _session(self, name: str, reset: bool) -> Session:
        now = self.clock()
        for key in list(self.sessions):
            if now - self.sessions[key].last_used >= self.ttl:
                del self.sessions[key]
        if reset:
            self.sessions.pop(name, None)
        if name not in self.sessions:
            if len(self.sessions) >= self.max_sessions:
                self.sessions.popitem(last=False)
            generator = self.torch.Generator(device=self.device)
            # A stable per-creature seed makes fresh sessions reproducible;
            # independent generator state continues across subsequent steps.
            generator.manual_seed(int.from_bytes(sha256(name.encode()).digest()[:8], "big") % (2**63 - 1))
            self.sessions[name] = Session(self.model.state_init(), generator, now)
        session = self.sessions[name]
        session.last_used = now
        self.sessions.move_to_end(name)
        return session

    def step(self, session: str, inputs: dict[str, float], reset: bool = False) -> dict[str, Any]:
        session, inputs, reset = validate_input({"session": session, "inputs": inputs, "reset": reset})
        if not self.lock.acquire(blocking=False):
            raise Busy("Fly brain is busy")
        try:
            started = time.monotonic()
            state = self._session(session, reset)
            self.rates.zero_()
            for name, multiplier in {"food": 200.0, "danger": 200.0, "drive": 100.0}.items():
                self.rates[:, self.input_indices[name]] = inputs[name] * multiplier
            counts = self.torch.zeros(len(self.readout_flat), device=self.device)
            completed = 0
            with self.torch.no_grad():
                for _ in range(self.steps):
                    state.state = self.model(self.rates, *state.state, generator=state.generator)
                    counts += state.state[2][0, self.readout_tensor]
                    completed += 1
                    # A slow host advances fewer real upstream timesteps. It
                    # retains partial membrane/synapse state for the next call;
                    # rates use the actual completed window, never a fictitious
                    # full duration. Bound-check every ten steps for efficiency.
                    if completed % 10 == 0 and time.monotonic() - started >= STEP_BUDGET_SECONDS:
                        break
            raw_counts = counts.cpu().tolist()  # Synchronizes CUDA before response/timing.
            activity, activity_window = readout_activity(state.history, raw_counts, completed * self.dt)
            state.last_used = self.clock()
            return {"motor": decode_motor(activity), "activity": activity, "source": "fly-brain",
                    "simulatedMs": completed * self.dt,
                    "activityWindowMs": activity_window,
                    "elapsedMs": round((time.monotonic() - started) * 1000, 2)}
        except Exception:
            self.sessions.pop(session, None)  # A partial step never survives a failed response.
            raise
        finally:
            self.lock.release()


class WorkerServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 2

    def __init__(self, address):
        super().__init__(address, WorkerHandler)
        self.brain: FlyBrain | None = None
        self.failed = False
        # One request body/step at a time; excess requests receive 429, with no
        # application work queue or ever-growing pile of neural sessions.
        self.request_slot = threading.BoundedSemaphore(1)


class WorkerHandler(BaseHTTPRequestHandler):
    server_version = "FlyBrain/1"

    def log_message(self, *_):
        pass

    def _send(self, status: int, body: dict[str, Any]):
        payload = json.dumps(body, allow_nan=False, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        if self.path != "/health":
            self._send(404, {"error": "Not found"})
            return
        ready = self.server.brain is not None
        self._send(200 if ready else 503, {
            "ready": ready, "source": "fly-brain", "revision": UPSTREAM_REVISION,
            "neuronCount": self.server.brain.neuron_count if ready else 0,
        })

    def do_POST(self):
        if self.path != "/step":
            self._send(404, {"error": "Not found"})
            return
        if self.server.brain is None:
            self._send(503, {"error": "Fly brain is unavailable"})
            return
        if not self.server.request_slot.acquire(blocking=False):
            self._send(429, {"error": "Fly brain is busy"})
            return
        try:
            length_text = self.headers.get("Content-Length", "")
            if not length_text.isdecimal() or not 0 < int(length_text) <= MAX_BODY_BYTES:
                self._send(400, {"error": "Invalid request size"})
                return
            if self.headers.get("Transfer-Encoding") or self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                self._send(400, {"error": "Invalid request encoding"})
                return
            self.connection.settimeout(5.0)
            body = json.loads(self.rfile.read(int(length_text)), parse_constant=lambda _: (_ for _ in ()).throw(InvalidInput("Invalid number")))
            session, inputs, reset = validate_input(body)
            self._send(200, self.server.brain.step(session, inputs, reset))
        except (InvalidInput, ValueError, UnicodeError, TimeoutError):
            self._send(400, {"error": "Invalid request"})
        except Busy:
            self._send(429, {"error": "Fly brain is busy"})
        except Exception:
            self._send(503, {"error": "Fly brain step failed"})
        finally:
            self.server.request_slot.release()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--smoke", action="store_true", help="Run three real stimulus windows and exit")
    parser.add_argument("--smoke-windows", type=int, default=1, help="Repeat each stimulus on its retained neural state (1-20)")
    parser.add_argument("--smoke-case", choices=("all", "forward", "food", "danger"), default="all")
    parser.add_argument("--smoke-drive", type=float, default=1.0, help="Explicit P9 drive for the forward smoke case (0-1)")
    args = parser.parse_args()
    root = Path(os.environ.get("FLY_BRAIN_ROOT", "/opt/fly-brain"))
    device = os.environ.get("FLY_BRAIN_DEVICE", "cpu")
    started = time.monotonic()
    if args.smoke:
        if not 1 <= args.smoke_windows <= 20:
            parser.error("--smoke-windows must be from 1 to 20")
        if not math.isfinite(args.smoke_drive) or not 0 <= args.smoke_drive <= 1:
            parser.error("--smoke-drive must be from 0 to 1")
        brain = FlyBrain(root, device)
        print(json.dumps({"ready": True, "device": device, "neurons": brain.neuron_count,
                          "synapses": brain.synapse_count, "setupSeconds": round(time.monotonic() - started, 3)}), flush=True)
        for name, inputs in {
            "forward": {"food": 0, "danger": 0, "drive": args.smoke_drive},
            "food": {"food": 1, "danger": 0, "drive": 0},
            "danger": {"food": 0, "danger": 1, "drive": 0},
        }.items():
            if args.smoke_case != "all" and args.smoke_case != name:
                continue
            for window in range(args.smoke_windows):
                stepped = time.monotonic()
                result = brain.step(f"smoke-{name}", inputs)
                print(json.dumps({"case": name, "window": window + 1,
                                  "elapsedSeconds": round(time.monotonic() - stepped, 3), **result}), flush=True)
        return
    port = int(os.environ.get("FLY_BRAIN_PORT", "8090"))
    server = WorkerServer((os.environ.get("FLY_BRAIN_HOST", "0.0.0.0"), port))

    def load():
        try:
            server.brain = FlyBrain(root, device)
            print(json.dumps({"ready": True, "source": "fly-brain", "device": device,
                              "neurons": server.brain.neuron_count,
                              "setupSeconds": round(time.monotonic() - started, 3)}), flush=True)
        except Exception:
            server.failed = True
            print(json.dumps({"ready": False, "error": "Verified upstream model could not load"}), flush=True)
    threading.Thread(target=load, daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
