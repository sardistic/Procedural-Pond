# Fish Brain

Fish Brain now runs the **Fish1 Hindbrain Motion Integrator (HMI)** data from
[jamieswrld/zebrafishconnectome](https://github.com/jamieswrld/zebrafishconnectome),
pinned at `7d5b58a54dd314c70ee2ea550a896dbeed7f951f`. It replaces the initial
hand-designed sector-ring network. This is a **connectome-constrained partial
hindbrain model**, not a full real zebrafish brain or recorded neural activity.
Connectivity is measured; dynamics and the game interface are modeled.

The 865 positioned neurons and 1,235 measured directed pairs (1,568 contacts)
are mirrored into a 1,730-neuron bilateral simulation with 2,470 pairs. Published
labels supply 76 input-layer cells, 246 Class I and 246 Class II cells, 28 turning
and 19 forward spinal projection neurons on each simulated side. The mirror
is derived, not additional biological measurement. Only 46 original cells have
traced outgoing contacts; missing edges do not imply biological absence.
See [data provenance and attribution](UPSTREAM.md).

The independent Python/NumPy runtime decodes the unchanged, packaged
HMI1 data after SHA-256 verification. NumPy 2.2.6 vectorizes the sparse rate
updates without a dense matrix; CPU/memory limits remain unchanged. It needs no
GPU, connectome download, CAVE token or training. No upstream application code
is included. Seeded Gaussian noise uses a per-session NumPy random generator.

## Neural dynamics and motor coupling

Each 200 ms control sample advances forty fixed 5 ms rate-network steps:

```text
tau dx_i/dt = -x_i + sum_j W_ij clamp(x_j, 0, 1) + P_i + I_i + noise
r_i = clamp(x_i, 0, 1)
tau = 0.1 s
```

Weights use `log1p(contact count)`, normalized by all measured incoming contact
weights per destination, then multiplied by 0.9 and the presynaptic transmitter
sign. Unknown transmitter remains zero; no signs are guessed from morphology.
The measured graph has 929 excitatory, 98 inhibitory and 208 unsigned pairs.

`P_i` is a separately modeled projection: the opposite-side Class II population
mean inhibits Class I with gain 0.9. No individual unmeasured outgoing synapses
are added. Noise has a per-session reproducible random stream (sigma 0.25,
scaled by the square root of the timestep inside the drive). Time constants,
normalization and all gains are model parameters, not fitted physiology.

Angular attraction/aversion evidence and bounded locomotor drive are projected
bilaterally **only into the published traced input-layer population** with
sensory gain 0.55. This population is a tracing layer, not a biological food or
vision receptor identification. Food, approved prey, companions and cover supply
attraction; threat, obstacles and threat-associated motion supply aversion.
Hunger, energy and comfort modulate this evidence. Goal/trait gains still come
from existing deterministic game code and the slow Jev goal adapter.

Mean descending `spn-turning` rates become left/right motor drive with scale 4;
mean bilateral `spn-forward` rate becomes thrust with scale 8, all clamped to
[0, 1]. Motor output is continuous, without the upstream demo's discrete choice
threshold. Neither readout receives direct sensory drive. Silencing measured
connections produces no evoked turning or thrust in the noise-free ablation;
silent descending activity stays zero. Rates carry history between samples.

**Feeding and startle remain supplementary modeled game reflexes**, computed
from frontal food/threat evidence with leaky state and a startle refractory
period. This dataset has no identified feeding or startle circuit. Existing
local movement, collision, protection and immediate survival reflexes remain
in ordinary game code. No training or reinforcement learning is included.

## Run

```sh
python -m pip install -r server/fishbrain/requirements.txt
python server/fishbrain/worker.py
# Or build with this directory as the context:
docker build -t pond-fishbrain server/fishbrain
```

The worker listens on port 8091 (`FISH_BRAIN_PORT` overrides it;
`FISH_BRAIN_HOST` overrides the bind address). `/health` returns `ready: true`,
`source: fish-brain`, `model: fish1-hmi-rate-v1`, the pinned revision, circuit
counts, `fullBrain: false` and `sectors: 16`. Missing/corrupt data makes health
return HTTP 503 with `ready: false` and steps return HTTP 503 without motor
commands; the API then reports Fish Brain unavailable and clients use instincts.
`FISH_BRAIN_DATA_DIR` can override the packaged data directory for local validation;
both pinned artifacts and their checksums are required.
Run it as a private service on the API network with **no published worker port**.
Set the API's `FISH_BRAIN_URL` to its internal HTTP address, for example
`http://fishbrain:8091`. The supplied Dockerfile runs as a non-root user and checks
readiness. Neural state is in memory; no credentials or pond saves enter the worker.

## Sensory interface

`POST /step` accepts `{ "session": "pond-id/creature-seed", "inputs": { ... } }`.
The API creates the session name after checking origin and pond ownership. The
worker never receives an ownership key. Inputs contain:

- `sectors`: exactly 16 objects, each containing `food`, `threat`, `same`, `other`,
  `obstacle`, `motion`, `prey` and `cover`, all finite numbers in `[0, 1]`.
- `internal`: `hunger`, `energy`, `speed`, `depth` and `comfort`, all in `[0, 1]`.
- `gains`: optional multipliers for the eight sensory channels and `drive`, in
  `[0, 2]`. Missing gains default to 1.

Sector 0 faces forward; sector 4 is right, 8 behind, and 12 left. Directions rotate
with the fish's heading. Local code computes proximity and relative motion,
samples shore/boundaries/blocked routes, and limits sensing by depth, stealth,
perception and feeding/hunting capabilities. Traits, working genes, hunting
upgrades, temperament, combat and protection tags determine allowed prey and
bounded baseline gains. Hunger and energy modulate drive and feeding; comfort
modulates cover attraction. Depth and speed are available observations for future
network extensions; the current network does not directly use those two channels.

No action, target coordinates or goal string enters the worker. It returns only:

```json
{
  "source": "fish-brain",
  "motor": {
    "left": 0.0,
    "right": 0.0,
    "thrust": 0.0,
    "startle": false,
    "feeding": false
  }
}
```

The three drives are continuous and normalized. `right - left` controls turning,
and `thrust` scales desired speed inside the existing `Fish.update()` system.
Startle recruits a speed burst. Feeding attempts only an already permitted,
physically reachable meal. Existing acceleration, body-chain integration,
collision/shore avoidance and immediate escape reflexes continue to apply.

## Hybrid and failure behavior

Higher Brain + Fish Brain uses independent slow Choice and fast motor request
lanes. Jev chooses an available goal at most every 30 seconds. The goal lasts at
most 45 seconds and is discarded if unavailable, stale or no longer permitted.
It only multiplies bounded gains: forage emphasizes food, hunt approved prey,
flee threat avoidance, shoal same-species attraction, shelter cover, and rest
reduces drive. Jev does not create a movement plan or directly steer the fish.

Both fish modes target a 200 ms interval, with one motor request in flight per
pond. Slow Jev requests cannot block fast Fish Brain requests. Motor outputs
expire 600 ms after their input sample; late results, controller changes, pause,
hidden pages and observers cannot apply them. Worker errors trigger a two-second
client backoff and ordinary instincts. Missing/failed Jev leaves hybrid running
autonomous Fish Brain with baseline gains; missing/failed Fish Brain leaves it
using ordinary local instincts. Controller and bounded history persist in the
existing local/server saves; goals, neural rate/activation state and random
streams do not.

The API times out worker steps at 800 ms, tolerates cooldown jitter down to 180 ms,
and permits up to 18,000 steps per pond/hour, 72,000 total/hour and eight API calls
in flight across ponds. Each pond has only one active step. The worker serializes
short computations, rejects busy requests, limits bodies to 16 KiB, and bounds
state to 32 sessions with LRU eviction and a two-minute idle TTL. Restart, expiry
or eviction starts fresh. Direct worker requests may pass `reset: true`; the
public API does not expose session reset or arbitrary session names.

```sh
node --test server/fishbrain.test.js server/minds_client.test.js server/minds_routes.test.js
python -m unittest discover -s server/fishbrain -p test_worker.py -v
```

Run the route tests on Node 24 (the API's existing runtime with built-in SQLite).
They use an isolated in-memory pond database and local mock upstream, including
authorization and timeouts; the Python suite also exercises the actual worker's
HTTP interface, signed measured connectivity, mirrored populations, pathway
ablations, scalar/vectorized equation parity, seeded neural history, independent
sessions, expiry, capacity and
missing/corrupt-data availability. These are simulation tests, not a validation
of biological cognition or learned performance.
