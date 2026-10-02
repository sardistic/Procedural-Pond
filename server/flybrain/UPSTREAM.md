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
