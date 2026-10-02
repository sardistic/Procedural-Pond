# Fish1 HMI provenance

Fish Brain uses **data only** from
[jamieswrld/zebrafishconnectome](https://github.com/jamieswrld/zebrafishconnectome),
pinned at `7d5b58a54dd314c70ee2ea550a896dbeed7f951f`.
`connectome.py` is an independent Python/NumPy implementation of a bounded rate network;
no upstream application code, Next.js runtime or trained model is included.

The unchanged scientific artifacts in `data/` are:

| File | Upstream path at the pinned revision | SHA-256 |
| --- | --- | --- |
| `hmi.bin` | `public/datasets/fish1-hmi/v1/hmi.bin` | `e222ea8c8c22bcc22644a30e58d91f035de92c5621ac6413f1c8da8af7c62291` |
| `populations.json` | `public/datasets/fish1-hmi/v1/populations.json` | `3961254e4fac2829cf88e05c22fdf8a60c252f6e36a325cc5708af9bed6a7a62` |

The runtime verifies both checksums before reporting ready. Updating the source
requires reviewing provenance and schema, replacing both artifacts as needed,
updating checksums/revision, and rerunning the pathway and behavior tests. No
runtime downloads or access token are required.

## Scientific source and attribution

The artifacts derive from the published
[Fish1 HMI analysis](https://fish1-release.storage.googleapis.com/paper_data/HMI_analysis.zip)
and published per-cell morphology/tracing labels, assembled by
jamieswrld/zebrafishconnectome. Credit that project's data extraction and circuit
documentation. The underlying scientific data's
[open-access data policy](https://fish1-release.storage.googleapis.com/data_policy.html)
allows independent analyses and requires citation of:

Petkova, M. D., Januszewski, M., et al. (2025). *A connectomic resource for neural
cataloguing and circuit dissection of the larval zebrafish brain.* bioRxiv.
[Paper and supporting data](https://fish1-release.storage.googleapis.com/paper.html).

At the pinned revision the upstream application repository supplies no LICENSE
file. We do not copy or redistribute its application source, or assign it an
invented license. The scientific artifacts are attributed under the published
data policy; this is not a claim that the upstream application is MIT or that the
dataset has a named Creative Commons license.

## What is measured and what is modeled

- Measured: 865 positioned neurons, 1,235 directed neuron pairs representing
  1,568 contacts; transmitter labels where known. Outgoing partners were traced
  for only 46 cells. Missing outgoing edges mean untraced, not biologically absent.
  The original reconstruction includes another 134 cells without soma positions,
  omitted from this artifact.
- Published morphology/tracing labels define populations: 246 Class I, 246 Class
  II, 76 traced input-layer cells, 28 turning and 19 forward spinal projection
  neurons. Input layer is a tracing designation, not an identified visual/food
  receptor population. Morphological class is not inferred transmitter identity.
- Derived: hemisphere assignment from the fitted midline. A mirrored copy of
  every node and edge supplies a bilateral simulation (1,730 nodes, 2,470 pairs);
  those copies are not additional measured neurons or contacts.
- Modeled: leaky rate dynamics, synapse-count weighting, normalization, sensory
  input strengths, noise, rate-to-motor scaling and opposite-side Class II mean
  inhibition of Class I. No individual Class II outgoing synapses are invented.
- Unknown transmitter produces zero signed weight: 208 of the measured pairs
  remain unsigned/silent; the other pairs are 929 excitatory and 98 inhibitory.
- Feeding and startle are supplementary game reflexes. This HMI artifact has no
  identified feeding or startle circuit, physiological recordings, fitted time
  constants, trained checkpoint or complete whole-brain network.

The scientific experiment is a **connectome-constrained partial hindbrain model**,
not a full zebrafish brain, biological neural recording or learned fish policy.
