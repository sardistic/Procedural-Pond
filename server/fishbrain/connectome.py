"""Independent rate-model runtime for the published Fish1 HMI data.

Measured contacts constrain the graph; rates, sensory coupling, bilateral
mirroring and crossed population inhibition are modeling assumptions. No
upstream application code is imported. See UPSTREAM.md for provenance.
"""
from dataclasses import dataclass
import hashlib
import json
import math
from pathlib import Path
import struct
import numpy as np

REVISION = "7d5b58a54dd314c70ee2ea550a896dbeed7f951f"
MODEL = "fish1-hmi-rate-v1"
CHECKSUMS = {
    "hmi.bin": "e222ea8c8c22bcc22644a30e58d91f035de92c5621ac6413f1c8da8af7c62291",
    "populations.json": "3961254e4fac2829cf88e05c22fdf8a60c252f6e36a325cc5708af9bed6a7a62",
}
LANES = (
    ("loreId", "I", 865), ("rootId", "Q", 865), ("position", "i", 2595),
    ("hemisphere", "B", 865), ("classIndex", "B", 865),
    ("classConfidence", "f", 865), ("classProvenance", "B", 865),
    ("transmitter", "B", 865), ("transmitterProvenance", "B", 865),
    ("incomingSynapses", "I", 865), ("outgoingSynapses", "I", 865),
    ("edgePre", "I", 1235), ("edgePost", "I", 1235),
    ("edgeSynapses", "I", 1235), ("edgePosition", "i", 3705),
)
TYPES = {"I": "u32", "Q": "u64", "i": "i32", "B": "u8", "f": "f32"}


class ConnectomeError(RuntimeError):
    pass


def verified_file(root, name):
    # Bound reads as well as validating content; no network at runtime.
    with (Path(root) / name).open("rb") as stream:
        blob = stream.read(100001)
    if hashlib.sha256(blob).hexdigest() != CHECKSUMS[name]:
        raise ConnectomeError("Fish1 data checksum mismatch")
    return blob


@dataclass
class NeuralState:
    activation: np.ndarray
    rates: np.ndarray
    rng: np.random.Generator


class Connectome:
    measured_nodes = 865
    measured_edges = 1235
    node_count = 1730
    dt = .005
    tau = .1
    synaptic_gain = .9
    sensory_gain = .55
    crossed_gain = .9

    def __init__(self, root=None):
        root = root if root is not None else Path(__file__).with_name("data")
        blob = verified_file(root, "hmi.bin")
        if blob[:4] != b"HMI1":
            raise ConnectomeError("Invalid Fish1 format")
        length = struct.unpack_from("<I", blob, 4)[0]
        descriptor = json.loads(blob[8:8+length])
        expected = [{"name": name, "type": TYPES[kind], "count": count} for name, kind, count in LANES]
        if (descriptor.get("format"), descriptor.get("dataset"), descriptor.get("version"),
            descriptor.get("neuronCount"), descriptor.get("edgeCount")) != ("HMI1", "fish1-hmi", "v1", 865, 1235) or descriptor.get("lanes") != expected:
            raise ConnectomeError("Unsupported Fish1 schema")
        offset = (8 + length + 7) // 8 * 8
        data = {}
        for name, kind, count in LANES:
            size = struct.calcsize("<" + kind) * count
            if offset + size > len(blob):
                raise ConnectomeError("Truncated Fish1 data")
            data[name] = struct.unpack_from(f"<{count}{kind}", blob, offset)
            offset = (offset + size + 7) // 8 * 8
        if offset != len(blob) or len(set(data["loreId"])) != self.measured_nodes:
            raise ConnectomeError("Invalid Fish1 layout")
        if any(h not in (0, 1) for h in data["hemisphere"]) or any(t not in (0, 1, 2) for t in data["transmitter"]):
            raise ConnectomeError("Invalid Fish1 labels")
        self.descriptor = descriptor
        self.lore_ids = data["loreId"]
        self.hemisphere = data["hemisphere"] + tuple(1 - h for h in data["hemisphere"])
        self.transmitter = data["transmitter"] * 2
        self.classes = data["classIndex"] * 2
        self.populations = {}
        population_data = json.loads(verified_file(root, "populations.json"))
        if (population_data.get("dataset"), population_data.get("version")) != ("fish1-hmi", "v1"):
            raise ConnectomeError("Invalid Fish1 populations")
        indices = {value: i for i, value in enumerate(self.lore_ids)}
        for population in population_data["populations"]:
            ids = population["loreIds"]
            if len(set(ids)) != len(ids) or any(value not in indices for value in ids):
                raise ConnectomeError("Unknown Fish1 population member")
            members = tuple(indices[value] for value in ids)
            mirrored = members + tuple(i + self.measured_nodes for i in members)
            self.populations[population["id"]] = tuple(tuple(i for i in mirrored if self.hemisphere[i] == side) for side in (0, 1))
        if not {"input-layer", "class-I", "class-II", "spn-turning", "spn-forward"} <= self.populations.keys():
            raise ConnectomeError("Missing Fish1 population")
        totals = [0.] * self.measured_nodes
        edges = tuple(zip(data["edgePre"], data["edgePost"], data["edgeSynapses"]))
        if any(pre >= 865 or post >= 865 or contacts < 1 for pre, post, contacts in edges):
            raise ConnectomeError("Invalid Fish1 contact")
        for _, post, contacts in edges:
            totals[post] += math.log1p(contacts)
        rows = [[] for _ in range(self.node_count)]
        for pre, post, contacts in edges:
            # Unknown transmitter = zero, never infer sign from class or side.
            sign = (0, 1, -1)[self.transmitter[pre]]
            weight = sign * self.synaptic_gain * math.log1p(contacts) / totals[post]
            for shift in (0, self.measured_nodes):
                rows[post + shift].append((pre + shift, weight))
        self.rows = tuple(tuple(row) for row in rows)
        self.active_rows = tuple((i, row) for i, row in enumerate(self.rows) if any(w for _, w in row))
        self.population_indices = {name: tuple(np.asarray(members, dtype=np.intp) for members in sides)
                                   for name, sides in self.populations.items()}
        self._compiled_rows = None

    def _sparse_arrays(self):
        # Recompile only if local ablation controls replace the row tuple.
        if self._compiled_rows is not self.active_rows:
            edges = [(pre, post, weight) for post, row in self.active_rows for pre, weight in row]
            self._pre = np.asarray([pre for pre, _, _ in edges], dtype=np.intp)
            self._post = np.asarray([post for _, post, _ in edges], dtype=np.intp)
            self._weight = np.asarray([weight for _, _, weight in edges], dtype=np.float64)
            self._compiled_rows = self.active_rows
        return self._pre, self._post, self._weight

    def new_state(self, name):
        seed = int.from_bytes(hashlib.sha256(name.encode()).digest()[:8], "little")
        return NeuralState(np.zeros(self.node_count), np.zeros(self.node_count), np.random.default_rng(seed))

    @staticmethod
    def mean(rates, members):
        return float(np.mean(rates[np.asarray(members, dtype=np.intp)])) if len(members) else 0.

    def advance(self, state, left, right, noise=.25, measured_gain=1., crossed=True):
        """Advance 200 ms. Ablations are local research/test controls only.

        Drive reaches traced input-layer cells, never the descending readouts.
        No invented individual Class II edges: its missing crossed output is
        represented separately as a modeled population projection.
        """
        pre, post, weights = self._sparse_arrays()
        populations = self.population_indices
        drive = np.zeros(self.node_count)
        for side, strength in enumerate((left, right)):
            drive[populations["input-layer"][side]] = self.sensory_gain * strength
        alpha = self.dt / self.tau
        noise_scale = noise * math.sqrt(self.dt)
        for _ in range(40):
            rates = state.rates
            incoming = drive + measured_gain * np.bincount(post, weights=weights * rates[pre], minlength=self.node_count)
            if crossed:
                for side in (0, 1):
                    inhibition = self.crossed_gain * float(np.mean(rates[populations["class-II"][1-side]]))
                    incoming[populations["class-I"][side]] -= inhibition
            if noise:
                incoming += state.rng.normal(0, noise_scale, self.node_count)
            state.activation += alpha * (incoming - state.activation)
            # Bound activation and emitted rates, with synchronous updates.
            np.clip(state.activation, -2., 2., out=state.activation)
            np.clip(state.activation, 0., 1., out=rates)
        return {
            name: tuple(self.mean(state.rates, members) for members in self.populations[name])
            for name in ("spn-turning", "spn-forward", "class-I", "class-II")
        }
