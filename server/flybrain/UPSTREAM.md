The worker imports the full PyTorch `TorchModel` from
[eonsystemspbc/fly-brain](https://github.com/eonsystemspbc/fly-brain), pinned to
`a3db62f9436074e485c0278290c2164ed6150808`. `upstream.json` records SHA-256
checksums for its source, license and full FlyWire v783 connectivity data.
`setup.py` fetches and verifies these files; they are not copied into the pond's
JavaScript bundle. The worker image includes the upstream source and its
GPL-2.0-or-later license at `/opt/fly-brain/LICENSE`.

Sensory stimulation and readout population IDs come from the upstream
`code/benchmark.py` and
[example notebook](https://github.com/eonsystemspbc/fly-brain/blob/a3db62f9436074e485c0278290c2164ed6150808/code/paper-phil-drosophila/example.ipynb).
The simulation runs the upstream parameters and timestep with the full
connectome. Readouts aggregate actual spike counts over completed windows totaling
at most 50 ms of neural time. Pond food/danger intensities, explicit locomotion drive and motor-rate
normalization are game adapters. They are not a validated model of fish or other
pond animals, and do not provide semantic decisions or model confidence.

The existing TypeSafe controller supplies semantic judgments separately.

The extended adapter copies the notebook's 42 bitter GRNs, 209 Johnston's organ
C/E neurons and 39 Or56a neurons into `populations.py`. Its recorded notebook
SHA-256 is `1240eb0a452a145d4ef97f535ac755459d0f5213a1d1785fd82527bc60eecadb`.
Every ID must resolve in the verified complete dataset when the worker loads.
Notebook stimulation maxima remain 200 Hz (bitter), 300 Hz (JO C/E) and 250 Hz
(Or56a); absent extended inputs are zero for older clients. Water contamination
and salinity mismatch map to aversive taste/odor; blocked routes, close neighbors
and current map to mechanosensation. These are explicitly game analogies.

Bearing attenuates the opposite member of the published left/right P9 pair,
without increasing its 100 Hz maximum. No hemispheres are guessed for sensory
populations. Measured DNa activity remains the turning signal. The published aDN1
pair adds a grooming readout, mapped to rest/wait rather than an invented fish
grooming animation. Neural synaptic weights, simulator parameters and timestep
remain upstream values; creature traits weight the game adapter, without training
or reinforcement. Older saved six-population histories continue to display.
