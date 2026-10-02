"""Biologically inspired fish-like recurrent sensorimotor controller.

Hand-designed sector populations and bilateral recurrent motor units; no real
zebrafish connectome, fitted biological parameters, training or reinforcement.
Only normalized sensory channels and internal state enter this network.
"""
from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import os
import re
import threading
import time

SECTORS = 16
CHANNELS = ("food", "threat", "same", "other", "obstacle", "motion", "prey", "cover")
INTERNAL = ("hunger", "energy", "speed", "depth", "comfort")
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
    if not isinstance(internal, dict) or set(internal) != set(INTERNAL) or any(not bounded(v) for v in internal.values()):
        raise InvalidInput("Invalid internal state")
    if not isinstance(gains, dict) or set(gains) - set(GAINS) or any(not bounded(v, 2) for v in gains.values()):
        raise InvalidInput("Invalid gains")
    return name, {"sectors": sectors, "internal": internal, "gains": {k: gains.get(k, 1) for k in GAINS}}, reset


@dataclass
class Session:
    last_used: float
    attraction: list = field(default_factory=lambda: [0.0] * SECTORS)
    aversion: list = field(default_factory=lambda: [0.0] * SECTORS)
    left: float = 0.0
    right: float = 0.0
    thrust: float = 0.0
    feeding: float = 0.0
    startle: float = 0.0
    refractory: float = 0.0


class FishBrain:
    def __init__(self, max_sessions=32, ttl=120.0, clock=time.monotonic):
        self.max_sessions, self.ttl, self.clock = max_sessions, ttl, clock
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
            self.sessions[name] = Session(now)
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
            attraction = [g["food"] * x["food"] * hunger + g["prey"] * x["prey"] * hunger +
                          .45 * g["same"] * x["same"] + .15 * g["other"] * x["other"] +
                          .35 * g["cover"] * x["cover"] * (1 - internal["comfort"]) for x in s]
            aversion = [1.8 * g["threat"] * x["threat"] + 2 * g["obstacle"] * x["obstacle"] +
                        .25 * g["motion"] * x["motion"] * x["threat"] for x in s]
            danger = max(x["threat"] for x in s)
            front_food = max((x["food"] * g["food"] + x["prey"] * g["prey"]) * max(0, self.cos[i])**4 for i, x in enumerate(s))
            front_obstacle = max(x["obstacle"] * max(0, self.cos[i])**4 for i, x in enumerate(s))
            startle_event = False
            # Ten 20 ms neural steps per 200 ms control sample. Sector recurrence
            # retains recent stimuli; mutual motor inhibition selects a side.
            for _ in range(10):
                old_a, old_v = state.attraction[:], state.aversion[:]
                for i in range(SECTORS):
                    recurrence = .28 * old_a[i] + .08 * (old_a[i-1] + old_a[(i+1) % SECTORS])
                    state.attraction[i] += .22 * (math.tanh(attraction[i] + recurrence) - state.attraction[i])
                    recurrence = .22 * old_v[i] + .06 * (old_v[i-1] + old_v[(i+1) % SECTORS])
                    state.aversion[i] += .3 * (math.tanh(aversion[i] + recurrence) - state.aversion[i])
                steering = sum((a - v) * self.sin[i] for i, (a, v) in enumerate(zip(state.attraction, state.aversion))) / 2
                # Obstacles directly ahead recruit one escape side without
                # choosing a world-coordinate destination.
                steering += .35 * front_obstacle
                left_target = max(0, math.tanh(-steering + .2*state.left - .15*state.right))
                right_target = max(0, math.tanh(steering + .2*state.right - .15*state.left))
                state.left += .3 * (left_target - state.left)
                state.right += .3 * (right_target - state.right)
                state.refractory = max(0, state.refractory - .02)
                state.startle += .4 * (danger - state.startle)
                if state.startle > .72 and state.refractory == 0:
                    startle_event = True
                    state.refractory = .8
                drive = min(1, g["drive"] * (.2 + .35*hunger + .25*max(state.attraction) + .3*danger))
                drive *= (.25 + .75*energy) * (1 - .8*front_obstacle)
                state.thrust += .22 * (drive + .12*state.thrust*(1-drive) - state.thrust)
                state.feeding += .25 * (min(1, front_food*hunger)*(1-danger) - state.feeding)
            return {"source": "fish-brain", "motor": {
                "left": min(1, max(0, state.left)), "right": min(1, max(0, state.right)),
                "thrust": min(1, max(0, state.thrust)), "startle": startle_event,
                "feeding": state.feeding > .2,
            }}
        except Exception:
            self.sessions.pop(name, None)
            raise
        finally:
            self.lock.release()


class WorkerServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 8

    def __init__(self, address, brain=None):
        super().__init__(address, Handler)
        self.brain = brain or FishBrain()
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
        self.send(200, {"ready": True, "source": "fish-brain", "model": "biologically-inspired-recurrent-v1", "sectors": SECTORS})

    def do_POST(self):
        if self.path != "/step":
            return self.send(404, {"error": "Not found"})
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
    WorkerServer((os.environ.get("FISH_BRAIN_HOST", "0.0.0.0"), int(os.environ.get("FISH_BRAIN_PORT", "8091")))).serve_forever()
