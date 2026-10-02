import copy
import http.client
import json
import math
import threading
import unittest
from worker import Busy, CHANNELS, INTERNAL, FishBrain, WorkerServer, validate_input


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
        brain = FishBrain()
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
        self.assertIsNot(state.attraction, brain.sessions["pond/b"].attraction)
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
            self.assertEqual(health["model"], "biologically-inspired-recurrent-v1")
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


if __name__ == "__main__":
    unittest.main()
