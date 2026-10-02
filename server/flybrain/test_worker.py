"""Adapter tests. The miniature fixtures below are not a brain fallback."""

import math
import os
import http.client
import json
from pathlib import Path
import threading
import unittest

from worker import Busy, FlyBrain, InvalidInput, READOUT_IDS, WorkerServer, decode_motor, readout_activity, validate_input


class InputTests(unittest.TestCase):
    def test_only_bounded_stimuli_and_session_are_accepted(self):
        session, inputs, reset = validate_input({
            "session": "pond-id/creature-42", "inputs": {"food": 1, "danger": 0.5, "drive": 0},
        })
        self.assertEqual(session, "pond-id/creature-42")
        self.assertEqual(inputs["danger"], 0.5)
        self.assertFalse(reset)
        for changes in (
            {"session": "../etc/passwd?"}, {"session": "x" * 97},
            {"reset": 1}, {"path": "other.py"},
            {"inputs": {"food": True, "danger": 0, "drive": 0}},
            {"inputs": {"food": math.nan, "danger": 0, "drive": 0}},
            {"inputs": {"food": math.inf, "danger": 0, "drive": 0}},
            {"inputs": {"food": -0.1, "danger": 0, "drive": 0}},
            {"inputs": {"food": 1.01, "danger": 0, "drive": 0}},
            {"inputs": {"food": 0, "danger": 0, "drive": 0, "code": "run()"}},
            {"inputs": {"food": 0, "danger": 0}},
        ):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                validate_input({"session": "pond", "inputs": {"food": 0, "danger": 0, "drive": 0}, **changes})

    def test_silent_model_produces_no_fabricated_activity(self):
        motor = decode_motor({name: 0.0 for name in READOUT_IDS})
        self.assertEqual(motor, {"drive": 0.0, "turn": 0.0, "feeding": False,
                                 "escape": False, "reverse": False, "grooming": False})

    def test_motor_limits_and_direction_preserve_measured_readouts(self):
        activity = {"forward": 1000.0, "left": 0.0, "right": 1000.0,
                    "feeding": 20.0, "escape": 40.0, "reverse": 10.0, "grooming": 20.0}
        motor = decode_motor(activity)
        self.assertGreater(motor["drive"], 0)
        self.assertLessEqual(motor["drive"], 1)
        self.assertGreater(motor["turn"], 0)
        self.assertLess(motor["turn"], 1)
        self.assertTrue(all(motor[key] for key in ("feeding", "escape", "reverse")))
        with self.assertRaises(RuntimeError):
            decode_motor({**activity, "forward": math.nan})

    def test_extended_senses_keep_legacy_inputs_and_bound_direction(self):
        values = {"food": .5, "danger": .1, "drive": .4, "bitter": 1, "odor": .2, "touch": .9, "turn": -1}
        _, clean, _ = validate_input({"session": "pond/123", "inputs": values})
        self.assertEqual(clean, values)
        for key, value in (("turn", -1.01), ("turn", True), ("odor", -1), ("touch", math.nan)):
            with self.assertRaises(InvalidInput):
                validate_input({"session": "pond/123", "inputs": {**values, key: value}})

    def test_rolling_activity_uses_real_counts_and_expires_them(self):
        from collections import deque
        history = deque()
        zeros = [0.0] * sum(map(len, READOUT_IDS.values()))
        fired = zeros.copy()
        fired[0] = 2.0  # Two actual spikes in one of the forward pair.
        activity, window = readout_activity(history, fired, 25)
        self.assertEqual(window, 25)
        self.assertEqual(activity["forward"], 40.0)
        activity, window = readout_activity(history, zeros, 25)
        self.assertEqual(window, 50)
        self.assertEqual(activity["forward"], 20.0)
        activity, window = readout_activity(history, zeros, 25)
        self.assertEqual(window, 50)
        self.assertEqual(activity["forward"], 0.0)
        self.assertEqual(len(history), 2)
        self.assertFalse(decode_motor(activity)["drive"])


class GeneratorFixture:
    def __init__(self, device):
        self.device = device

    def manual_seed(self, seed):
        self.seed = seed


class StateTests(unittest.TestCase):
    def brain_fixture(self):
        from collections import OrderedDict
        from types import SimpleNamespace
        brain = FlyBrain.__new__(FlyBrain)
        now = [1.0]
        brain.clock = lambda: now[0]
        brain.ttl = 120
        brain.max_sessions = 2
        brain.sessions = OrderedDict()
        brain.torch = SimpleNamespace(Generator=GeneratorFixture)
        brain.device = "cpu"
        brain.model = SimpleNamespace(state_init=lambda: [object()])
        brain.lock = threading.Lock()
        return brain, now

    def test_membrane_and_random_streams_are_separate_and_persist(self):
        brain, _ = self.brain_fixture()
        first, other = brain._session("pond/a", False), brain._session("pond/b", False)
        self.assertIs(brain._session("pond/a", False), first)
        self.assertIsNot(first.state, other.state)
        self.assertIsNot(first.history, other.history)
        first.history.append((10, [1.0]))
        self.assertNotEqual(first.generator.seed, other.generator.seed)
        reset = brain._session("pond/a", True)
        self.assertIsNot(reset.state, first.state)
        self.assertEqual(reset.generator.seed, first.generator.seed)
        self.assertEqual(len(reset.history), 0)

    def test_idle_sessions_expire_and_capacity_is_bounded(self):
        brain, now = self.brain_fixture()
        first = brain._session("pond/a", False)
        brain._session("pond/b", False)
        brain._session("pond/c", False)
        self.assertNotIn("pond/a", brain.sessions)
        self.assertEqual(len(brain.sessions), 2)
        now[0] += 120
        self.assertIsNot(brain._session("pond/a", False), first)
        self.assertEqual(list(brain.sessions), ["pond/a"])

    def test_competing_calls_do_not_mutate_neural_state(self):
        brain, _ = self.brain_fixture()
        brain.lock.acquire()
        try:
            with self.assertRaises(Busy):
                brain.step("pond/a", {"food": 1, "danger": 0, "drive": 0})
            self.assertEqual(len(brain.sessions), 0)
        finally:
            brain.lock.release()


class HttpTests(unittest.TestCase):
    def setUp(self):
        self.server = WorkerServer(("127.0.0.1", 0))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=1)

    def request(self, method, path, body=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=2)
        try:
            connection.request(method, path, body, {"Content-Type": "application/json"})
            response = connection.getresponse()
            return response.status, json.loads(response.read())
        finally:
            connection.close()

    def test_health_does_not_report_ready_before_model_load(self):
        status, body = self.request("GET", "/health")
        self.assertEqual(status, 503)
        self.assertFalse(body["ready"])
        from types import SimpleNamespace
        self.server.brain = SimpleNamespace(neuron_count=138639)
        status, body = self.request("GET", "/health")
        self.assertEqual(status, 200)
        self.assertTrue(body["ready"])
        self.assertEqual(body["neuronCount"], 138639)

    def test_rejected_requests_never_reach_the_model(self):
        from types import SimpleNamespace
        calls = []
        self.server.brain = SimpleNamespace(neuron_count=138639, step=lambda *args: calls.append(args))
        valid = json.dumps({"session": "pond/creature", "inputs": {"food": 0, "danger": 0, "drive": 0}})
        for invalid in ("{", valid.replace('"food": 0', '"food": NaN'), '"' + 'x' * 17000 + '"'):
            status, _ = self.request("POST", "/step", invalid)
            self.assertEqual(status, 400)
        self.server.request_slot.acquire()
        try:
            status, _ = self.request("POST", "/step", valid)
            self.assertEqual(status, 429)
        finally:
            self.server.request_slot.release()
        self.assertEqual(calls, [])


@unittest.skipUnless(os.environ.get("FLY_BRAIN_TEST_ROOT"), "Set FLY_BRAIN_TEST_ROOT for verified upstream parity")
class UpstreamParityTests(unittest.TestCase):
    def test_two_retained_windows_equal_direct_upstream_timesteps(self):
        # The real dataset and exact imported upstream TorchModel are required.
        # This checks state and spike counts, not a mocked motor response.
        from unittest.mock import patch
        with patch.dict(os.environ, {"FLY_BRAIN_STEP_MS": "10"}):
            brain = FlyBrain(Path(os.environ["FLY_BRAIN_TEST_ROOT"]),
                             device=os.environ.get("FLY_BRAIN_DEVICE", "cpu"))
        torch = brain.torch
        session = brain._session("parity/full-connectome", False)
        direct_state = tuple(tensor.clone() for tensor in session.state)
        direct_generator = torch.Generator(device=brain.device)
        direct_generator.set_state(session.generator.get_state().clone())
        inputs = {"food": 1.0, "danger": 0.5, "drive": 0.25, "bitter": .75, "odor": .6, "touch": .2, "turn": .5}
        total_counts = torch.zeros(len(brain.readout_flat), device=brain.device)
        total_ms = 0.0
        for _ in range(2):
            result = brain.step("parity/full-connectome", inputs)
            self.assertEqual(brain.rates[0, brain.input_indices["food"]].unique().tolist(), [200.0])
            self.assertEqual(brain.rates[0, brain.input_indices["danger"]].unique().tolist(), [100.0])
            self.assertEqual(brain.rates[0, brain.input_indices["drive"]].tolist(), [12.5, 25.0])
            for name, expected in (("bitter", 150.0), ("odor", 150.0), ("touch", 60.0)):
                self.assertEqual(brain.rates[0, brain.input_indices[name]].unique().tolist(), [expected])
            counts = torch.zeros(len(brain.readout_flat), device=brain.device)
            with torch.no_grad():
                for _ in range(round(result["simulatedMs"] / brain.dt)):
                    direct_state = brain.model(brain.rates, *direct_state, generator=direct_generator)
                    counts += direct_state[2][0, brain.readout_tensor]
            for actual, expected in zip(session.state, direct_state):
                self.assertTrue(torch.equal(actual, expected))
            total_counts += counts
            total_ms += result["simulatedMs"]
            self.assertEqual(result["activityWindowMs"], total_ms)
            spike_counts = total_counts.cpu().tolist()
            offset = 0
            for name, neurons in brain.readout_indices.items():
                expected_hz = sum(spike_counts[offset:offset + len(neurons)]) / len(neurons) / (total_ms / 1000)
                self.assertEqual(result["activity"][name], expected_hz)
                offset += len(neurons)


if __name__ == "__main__":
    unittest.main()
