"""Fish1 HMI connectome-constrained controller with modeled sensory/motor coupling.

Partial measured hindbrain connectivity; not a full zebrafish brain, recorded
activity or a trained model. See README.md and UPSTREAM.md for assumptions.
"""
from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import os
import re
import struct
import threading
import time

from connectome import Connectome, ConnectomeError, NeuralState, MODEL, REVISION

SECTORS = 16
CHANNELS = ("food", "threat", "same", "other", "obstacle", "motion", "prey", "cover")
INTERNAL = ("hunger", "energy", "speed", "depth", "comfort")
# Optional modeled urge to approach rivals, derived in game code from traits,
# corruption and rage. Older clients omit it.
OPTIONAL_INTERNAL = ("rage",)
ACTIVITY = ("input-layer", "class-I", "class-II", "spn-turning", "spn-forward")
GAINS = (*CHANNELS, "drive")
SESSION_RE = re.compile(r"[A-Za-z0-9_/-]{1,96}\Z")


class InvalidInput(ValueError):
    pass


class Busy(RuntimeError):
    pass


def bounded(value, maximum=1):
    return type(value) in (int, float) and math.isfinite(value) and 0 <= value <= maximum


def validate_input(body):
    if not isinstance(body, dict) or set(body) - {"session", "inputs", "reset"}:
        raise InvalidInput("Invalid request")
    name, inputs, reset = body.get("session"), body.get("inputs"), body.get("reset", False)
    if not isinstance(name, str) or not SESSION_RE.fullmatch(name) or type(reset) is not bool:
        raise InvalidInput("Invalid session")
    if not isinstance(inputs, dict) or set(inputs) - {"sectors", "internal", "gains"}:
        raise InvalidInput("Invalid sensory input")
    sectors, internal, gains = inputs.get("sectors"), inputs.get("internal"), inputs.get("gains", {})
    if not isinstance(sectors, list) or len(sectors) != SECTORS or any(
        not isinstance(s, dict) or set(s) != set(CHANNELS) or any(not bounded(v) for v in s.values()) for s in sectors
    ):
        raise InvalidInput("Invalid sectors")
    if not isinstance(internal, dict) or not set(INTERNAL) <= set(internal) <= set(INTERNAL + OPTIONAL_INTERNAL) or any(not bounded(v) for v in internal.values()):
        raise InvalidInput("Invalid internal state")
    if not isinstance(gains, dict) or set(gains) - set(GAINS) or any(not bounded(v, 2) for v in gains.values()):
        raise InvalidInput("Invalid gains")
    return name, {"sectors": sectors, "internal": internal, "gains": {k: gains.get(k, 1) for k in GAINS}}, reset


@dataclass
class Session:
    last_used: float
    neural: NeuralState
    feeding: float = 0.0
    startle: float = 0.0
    refractory: float = 0.0


class FishBrain:
    def __init__(self, max_sessions=32, ttl=120.0, clock=time.monotonic, data_root=None, noise=.25):
        self.max_sessions, self.ttl, self.clock = max_sessions, ttl, clock
        self.network = Connectome(data_root)
        self.noise = noise
        self.sessions = OrderedDict()
        self.lock = threading.Lock()
        # Sector 0 faces forward, positive angles face the creature's right.
        self.sin = [math.sin(i * math.tau / SECTORS) for i in range(SECTORS)]
        self.cos = [math.cos(i * math.tau / SECTORS) for i in range(SECTORS)]

    def _session(self, name, reset=False):
        now = self.clock()
        for key in list(self.sessions):
            if now - self.sessions[key].last_used >= self.ttl:
                del self.sessions[key]
        if reset:
            self.sessions.pop(name, None)
        if name not in self.sessions:
            if len(self.sessions) >= self.max_sessions:
                self.sessions.popitem(last=False)
            self.sessions[name] = Session(now, self.network.new_state(name))
        self.sessions.move_to_end(name)
        self.sessions[name].last_used = now
        return self.sessions[name]

    def step(self, name, inputs, reset=False):
        name, inputs, reset = validate_input({"session": name, "inputs": inputs, "reset": reset})
        if not self.lock.acquire(blocking=False):
            raise Busy("Fish Brain is busy")
        try:
            state = self._session(name, reset)
            s, internal, g = inputs["sectors"], inputs["internal"], inputs["gains"]
            hunger, energy = internal["hunger"], internal["energy"]
            # Prey/rival evidence is approached when hungry or when the game's
            # rage drive is high; food stays hunger-driven.
            urge = max(hunger, internal.get("rage", 0))
            attraction = [g["food"] * x["food"] * hunger + g["prey"] * x["prey"] * urge +
                          .45 * g["same"] * x["same"] + .15 * g["other"] * x["other"] +
                          .35 * g["cover"] * x["cover"] * (1 - internal["comfort"]) for x in s]
            aversion = [1.8 * g["threat"] * x["threat"] + 2 * g["obstacle"] * x["obstacle"] +
                        .25 * g["motion"] * x["motion"] * x["threat"] for x in s]
            danger = max(x["threat"] for x in s)
            front_food = max((x["food"] * g["food"] * hunger + x["prey"] * g["prey"] * urge) * max(0, self.cos[i])**4 for i, x in enumerate(s))
            front_obstacle = max(x["obstacle"] * max(0, self.cos[i])**4 for i, x in enumerate(s))
            # Game channels are modeled evidence, not biological cell labels.
            # Project evidence only into the published traced input layer.
            evidence = sum((a - v) * self.sin[i] for i, (a, v) in enumerate(zip(attraction, aversion))) / 2
            evidence += .35 * front_obstacle
            drive = min(1, g["drive"] * (.2 + .35*urge + .25*max(attraction) + .3*danger))
            drive *= (.25 + .75*energy) * (1 - .8*front_obstacle)
            strengths = [min(1, max(0, drive * (1 + direction * evidence))) for direction in (-1, 1)]
            activity = self.network.advance(state.neural, *strengths, noise=self.noise)
            left, right = activity["spn-turning"]
            # Scaling descending rates into the existing game's speed/turn range
            # is a modeled motor plant. Silent readouts stay silent.
            thrust = 8 * sum(activity["spn-forward"]) / 2
            # Feeding and startle are supplementary modeled reflexes: the HMI
            # artifact contains no identified feeding or startle populations.
            state.refractory = max(0, state.refractory - .2)
            state.startle += .95 * (danger - state.startle)
            startle_event = state.startle > .72 and state.refractory == 0
            if startle_event:
                state.refractory = .8
            state.feeding += .9 * (min(1, front_food)*(1-danger) - state.feeding)
            return {"source": "fish-brain", "motor": {
                "left": min(1, max(0, 4*left)), "right": min(1, max(0, 4*right)),
                "thrust": min(1, max(0, thrust)), "startle": startle_event,
                "feeding": state.feeding > .2,
            }, "activity": {name: [round(min(1, max(0, v)), 4) for v in activity[name]] for name in ACTIVITY}}
        except Exception:
            self.sessions.pop(name, None)
            raise
        finally:
            self.lock.release()


class WorkerServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 8

    def __init__(self, address, brain=None, data_root=None):
        super().__init__(address, Handler)
        try:
            self.brain = brain if brain is not None else FishBrain(data_root=data_root)
        except (OSError, ConnectomeError, ValueError, KeyError, struct.error):
            self.brain = None
        self.request_slot = threading.BoundedSemaphore(1)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def send(self, status, body):
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
            return self.send(404, {"error": "Not found"})
        ready = self.server.brain is not None
        self.send(200 if ready else 503, {"ready": ready, "source": "fish-brain", "model": MODEL,
                                         "revision": REVISION, "sectors": SECTORS,
                                         "measuredNeurons": 865, "measuredEdges": 1235,
                                         "simulatedNeurons": 1730, "fullBrain": False})

    def do_POST(self):
        if self.path != "/step":
            return self.send(404, {"error": "Not found"})
        if self.server.brain is None:
            return self.send(503, {"error": "Fish1 circuit unavailable"})
        if not self.server.request_slot.acquire(blocking=False):
            return self.send(429, {"error": "Fish Brain is busy"})
        try:
            self.connection.settimeout(2)
            length = self.headers.get("Content-Length", "")
            if not length.isdecimal() or not 0 < int(length) <= 16384 or self.headers.get("Transfer-Encoding") or self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                raise InvalidInput("Invalid body")
            name, inputs, reset = validate_input(json.loads(self.rfile.read(int(length))))
            self.send(200, self.server.brain.step(name, inputs, reset))
        except (ValueError, TypeError, TimeoutError):
            self.send(400, {"error": "Invalid neural input"})
        except Busy:
            self.send(429, {"error": "Fish Brain is busy"})
        except Exception:
            self.send(500, {"error": "Neural step interrupted"})
        finally:
            self.server.request_slot.release()


if __name__ == "__main__":
    WorkerServer((os.environ.get("FISH_BRAIN_HOST", "0.0.0.0"), int(os.environ.get("FISH_BRAIN_PORT", "8091"))),
                 data_root=os.environ.get("FISH_BRAIN_DATA_DIR")).serve_forever()
