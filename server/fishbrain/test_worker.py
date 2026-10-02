import copy
import http.client
import json
import math
from pathlib import Path
import tempfile
import threading
import unittest
import numpy as np
from worker import Busy, CHANNELS, INTERNAL, FishBrain, WorkerServer, validate_input
from connectome import Connectome, ConnectomeError, MODEL, REVISION


def inputs():
    return {"sectors": [{key: 0 for key in CHANNELS} for _ in range(16)],
            "internal": {"hunger": .8, "energy": .8, "speed": 0, "depth": .5, "comfort": .7}}


class NetworkTests(unittest.TestCase):
    def test_contract_rejects_actions_bad_sectors_ranges_and_booleans(self):
        valid = {"session": "pond/123", "inputs": inputs()}
        self.assertEqual(validate_input(valid)[0], "pond/123")
        for mutate in (lambda b: b.update(session="../etc?"), lambda b: b["inputs"].update(goal="hunt"),
                       lambda b: b["inputs"]["sectors"].pop(), lambda b: b["inputs"]["sectors"][0].update(food=math.nan),
                       lambda b: b["inputs"]["sectors"][0].update(food=True), lambda b: b["inputs"]["internal"].update(energy=-1),
                       lambda b: b["inputs"].update(gains={"drive": 3})):
            bad = copy.deepcopy(valid)
            mutate(bad)
            with self.assertRaises(ValueError):
                validate_input(bad)

    def test_relative_food_turns_toward_it_and_threat_turns_away(self):
        food, threat = inputs(), inputs()
        food["sectors"][4]["food"] = 1
        threat["sectors"][4]["threat"] = 1
        brain = FishBrain()
        f, t = brain.step("pond/food", food)["motor"], brain.step("pond/threat", threat)["motor"]
        self.assertGreater(f["right"], f["left"])
        self.assertGreater(t["left"], t["right"])
        self.assertTrue(t["startle"])
        for motor in (f, t):
            self.assertTrue(all(0 <= motor[k] <= 1 for k in ("left", "right", "thrust")))

    def test_feeding_and_rest_gains_modulate_the_network_not_coordinates(self):
        stimulus = inputs()
        stimulus["sectors"][0]["food"] = 1
        brain = FishBrain(noise=0)
        self.assertTrue(brain.step("pond/forage", stimulus)["motor"]["feeding"])
        rest = copy.deepcopy(stimulus)
        rest["gains"] = {"drive": 0, "food": 0}
        self.assertLess(brain.step("pond/rest", rest)["motor"]["thrust"], .01)
        self.assertFalse(brain.step("pond/rest", rest)["motor"]["feeding"])

    def test_state_persists_between_samples_is_separate_and_expires(self):
        now = [0.0]
        brain = FishBrain(max_sessions=2, ttl=2, clock=lambda: now[0])
        stimulus = inputs()
        stimulus["sectors"][4]["food"] = 1
        first = brain.step("pond/a", stimulus)["motor"]
        state = brain.sessions["pond/a"]
        second = brain.step("pond/a", stimulus)["motor"]
        self.assertIs(state, brain.sessions["pond/a"])
        self.assertNotEqual(first, second)
        brain.step("pond/b", inputs())
        self.assertIsNot(state.neural.rates, brain.sessions["pond/b"].neural.rates)
        self.assertIsNot(state.neural.rng, brain.sessions["pond/b"].neural.rng)
        brain.step("pond/c", inputs())
        self.assertNotIn("pond/a", brain.sessions)
        now[0] = 3
        brain.step("pond/a", inputs())
        self.assertEqual(list(brain.sessions), ["pond/a"])
        brain.step("pond/a", inputs(), reset=True)
        self.assertIsNot(state, brain.sessions["pond/a"])

    def test_busy_step_does_not_mutate_state(self):
        brain = FishBrain()
        brain.lock.acquire()
        try:
            with self.assertRaises(Busy):
                brain.step("pond/a", inputs())
            self.assertFalse(brain.sessions)
        finally:
            brain.lock.release()


class ConnectomeTests(unittest.TestCase):
    def test_pinned_measured_graph_and_published_populations(self):
        network = Connectome()
        self.assertEqual(network.node_count, 1730)
        self.assertEqual(sum(len(row) for row in network.rows), 2470)
        self.assertEqual(network.descriptor["synapseCount"], 1568)
        self.assertEqual(tuple(map(len, network.populations["input-layer"])), (76, 76))
        self.assertEqual(tuple(map(len, network.populations["spn-turning"])), (28, 28))
        self.assertEqual(tuple(map(len, network.populations["spn-forward"])), (19, 19))
        self.assertFalse(set(sum(network.populations["input-layer"], ())) &
                         set(sum(network.populations["spn-turning"], ())))

    def test_dale_sign_unknown_silence_normalization_and_exact_mirror(self):
        network = Connectome()
        counts = [0, 0, 0]
        for post, row in enumerate(network.rows[:865]):
            self.assertLessEqual(sum(abs(w) for _, w in row), .9000000001)
            self.assertEqual(network.rows[post+865], tuple((pre+865, w) for pre, w in row))
            self.assertEqual(network.hemisphere[post+865], 1-network.hemisphere[post])
            for pre, weight in row:
                transmitter = network.transmitter[pre]
                counts[transmitter] += 1
                if transmitter == 0:
                    self.assertEqual(weight, 0)
                elif transmitter == 1:
                    self.assertGreater(weight, 0)
                else:
                    self.assertLess(weight, 0)
        self.assertEqual(counts, [208, 929, 98])

    def test_motor_readouts_depend_on_measured_paths(self):
        network = Connectome()
        intact = network.advance(network.new_state("p/1"), .1, .9, noise=0)
        disconnected = network.advance(network.new_state("p/1"), .1, .9, noise=0, measured_gain=0)
        for name in ("spn-turning", "spn-forward"):
            self.assertGreater(intact[name][1], intact[name][0])
            self.assertGreater(intact[name][1], .01)
            self.assertEqual(disconnected[name], (0., 0.))

    def test_recurrent_pathways_and_modeled_cross_inhibition_affect_activity(self):
        network = Connectome()
        ablated = copy.copy(network)
        # Silence only measured Class I -> Class I recurrence, retaining other
        # measured contacts and the separate modeled population projection.
        ablated.active_rows = tuple((post, tuple((pre, weight) for pre, weight in row
            if not (network.classes[pre] == 1 and network.classes[post] == 1)))
            for post, row in network.active_rows)
        intact_state, ablated_state, uncrossed_state = (network.new_state("p/1") for _ in range(3))
        for _ in range(3):
            intact = network.advance(intact_state, .1, .9, noise=0)
            no_recurrence = ablated.advance(ablated_state, .1, .9, noise=0)
            uncrossed = network.advance(uncrossed_state, .1, .9, noise=0, crossed=False)
        self.assertGreater(intact["spn-turning"][1], no_recurrence["spn-turning"][1])
        self.assertGreater(uncrossed["class-I"][0], intact["class-I"][0])

    def test_symmetric_input_and_mirrored_stimuli(self):
        network = Connectome()
        balanced = network.advance(network.new_state("p/1"), .5, .5, noise=0)
        right = network.advance(network.new_state("p/1"), .1, .9, noise=0)
        left = network.advance(network.new_state("p/1"), .9, .1, noise=0)
        for name in balanced:
            self.assertAlmostEqual(*balanced[name], places=12)
            self.assertAlmostEqual(left[name][0], right[name][1], places=12)
            self.assertAlmostEqual(left[name][1], right[name][0], places=12)

    def test_reproducible_seed_persistent_memory_and_bounded_rates(self):
        network = Connectome()
        first, replay, other = (network.new_state(name) for name in ("p/1", "p/1", "p/2"))
        network.advance(first, 1, 0)
        network.advance(replay, 1, 0)
        network.advance(other, 1, 0)
        np.testing.assert_array_equal(first.rates, replay.rates)
        self.assertFalse(np.array_equal(first.rates, other.rates))
        retained = network.advance(first, 0, 0, noise=0)
        fresh = network.advance(network.new_state("p/1"), 0, 0, noise=0)
        self.assertGreater(retained["spn-turning"][0], fresh["spn-turning"][0])
        for _ in range(20):
            network.advance(first, 1, 1)
        self.assertTrue(all(math.isfinite(r) and 0 <= r <= 1 for r in first.rates))

    def test_vectorized_steps_match_scalar_equations(self):
        network = Connectome()
        activation, rates = [0.] * network.node_count, [0.] * network.node_count
        drive = [0.] * network.node_count
        for side, strength in enumerate((.1, .9)):
            for i in network.populations["input-layer"][side]:
                drive[i] = network.sensory_gain * strength
        for _ in range(40):
            incoming = drive[:]
            for post, row in network.active_rows:
                incoming[post] += sum(weight * rates[pre] for pre, weight in row)
            for side in (0, 1):
                members = network.populations["class-II"][1-side]
                inhibition = network.crossed_gain * sum(rates[i] for i in members) / len(members)
                for i in network.populations["class-I"][side]:
                    incoming[i] -= inhibition
            for i, current in enumerate(activation):
                value = max(-2., min(2., current + network.dt/network.tau * (-current + incoming[i])))
                activation[i], rates[i] = value, max(0., min(1., value))
        state = network.new_state("p/1")
        network.advance(state, .1, .9, noise=0)
        np.testing.assert_allclose(state.activation, activation, rtol=0, atol=1e-12)
        np.testing.assert_allclose(state.rates, rates, rtol=0, atol=1e-12)

    def test_missing_truncated_corrupted_or_changed_population_data_fail_closed(self):
        original = Path(__file__).with_name("data")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaises(OSError):
                Connectome(root)
            binary = (original / "hmi.bin").read_bytes()
            populations = (original / "populations.json").read_bytes()
            (root / "populations.json").write_bytes(populations)
            for bad in (binary[:-1], b"BAD!"+binary[4:], binary[:4000]+b"\0"+binary[4001:]):
                (root / "hmi.bin").write_bytes(bad)
                with self.assertRaises(ConnectomeError):
                    Connectome(root)
            (root / "hmi.bin").write_bytes(binary)
            (root / "populations.json").write_bytes(populations.replace(b"63075", b"63076"))
            with self.assertRaises(ConnectomeError):
                Connectome(root)


class HttpTests(unittest.TestCase):
    def test_real_worker_health_and_stateful_steps_and_rejection(self):
        server = WorkerServer(("127.0.0.1", 0))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        def request(method, path, body=None):
            conn = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=2)
            try:
                conn.request(method, path, body, {"Content-Type": "application/json"})
                r = conn.getresponse()
                return r.status, json.loads(r.read())
            finally:
                conn.close()
        try:
            status, health = request("GET", "/health")
            self.assertEqual(status, 200)
            self.assertEqual(health["model"], MODEL)
            self.assertEqual(health["revision"], REVISION)
            self.assertFalse(health["fullBrain"])
            body = json.dumps({"session": "pond/1", "inputs": inputs()})
            self.assertEqual(request("POST", "/step", body)[1]["source"], "fish-brain")
            self.assertIn("pond/1", server.brain.sessions)
            self.assertEqual(request("POST", "/step", '{"inputs": NaN}')[0], 400)
            server.request_slot.acquire()
            try:
                self.assertEqual(request("POST", "/step", body)[0], 429)
            finally:
                server.request_slot.release()
        finally:
            server.shutdown()
            server.server_close()
            thread.join(2)

    def test_missing_data_reports_unavailable_instead_of_inventing_motors(self):
        with tempfile.TemporaryDirectory() as directory:
            server = WorkerServer(("127.0.0.1", 0), data_root=directory)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                for method, path in (("GET", "/health"), ("POST", "/step")):
                    conn = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=2)
                    try:
                        conn.request(method, path)
                        response = conn.getresponse()
                        self.assertEqual(response.status, 503)
                        body = json.loads(response.read())
                        self.assertNotIn("motor", body)
                        if method == "GET":
                            self.assertFalse(body["ready"])
                    finally:
                        conn.close()
            finally:
                server.shutdown()
                server.server_close()
                thread.join(2)


if __name__ == "__main__":
    unittest.main()
