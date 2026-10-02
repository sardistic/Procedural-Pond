# Fish Brain

A compact **biologically inspired**, hand-designed recurrent sensorimotor network.
It is not a full real zebrafish brain, a zebrafish connectome implementation, or a
trained model. It has no reinforcement learning. The pure Python standard-library
worker needs no model download, GPU or third-party dependencies.

Sixteen leaky attraction and aversion populations form recurrent angular rings.
Bilateral motor populations combine these signals with mutual inhibition; separate
leaky units supply locomotor drive, feeding and a refractory startle response.
Each sample advances ten 20 ms neural steps. State persists between samples;
parameters and synapses remain fixed. This is a starting point for observing game
behavior, not a claim of biological fidelity or learned intelligence.

## Run

```sh
python server/fishbrain/worker.py
# Or build with this directory as the context:
docker build -t pond-fishbrain server/fishbrain
```

The worker listens on port 8091 (`FISH_BRAIN_PORT` overrides it;
`FISH_BRAIN_HOST` overrides the bind address). `/health` returns `ready: true`,
`source: fish-brain`, `model: biologically-inspired-recurrent-v1` and `sectors: 16`.
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
existing local/server saves; goals and neural membrane state do not.

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
HTTP interface, recurrent behavior, independent sessions, expiry and capacity.
