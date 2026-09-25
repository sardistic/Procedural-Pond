# Decisions

Material architecture decisions for Procedural Pond, newest last.

## Static site, no build step
Plain HTML, CSS and classic `<script>` files that share globals in load order
(`index.html` lists them). The page works when opened straight from disk
(`file://`), which ES modules would break. There is no bundler or package.json.

## Software rasterizer for the look
Animals are chains of joints (the argonautcode idea) skinned by a small CPU
rasterizer in `js/raster.js`. It writes a low-res height/colour buffer with
banded Bayer-dithered lighting, outlines, height-offset shadows, dithered alpha
fades and an optional light tint. The canvas is upscaled with
`image-rendering: pixelated`. There is no WebGL.

## Seeded ponds are generated at a reference size
`buildPond()` in `js/main.js` generates scenery and the starting population at
480x270 under `withSeed(seed)`, then stretches positions to the window. This
lets a `?pond=<seed>` link reproduce the same pond on any screen size. Only the
starting state is deterministic; the running simulation is not.

## Ecosystem lives outside the creature classes
`js/life.js` attaches `c.life` (genes, age, energy, growth) with `initLife`. It
dyes individuals by rewriting their material arrays and baked shader tables,
and it drives breeding, predation and migration from outside. Creature classes
only expose small hooks: `eat()`, `prey`, `threat`, `leaving`, and `alpha`.

## Night glow halos were removed
A bloom/halo pass for emissive animals was tried and rejected by the user as
off-putting. `EMISSIVE` now means level 1 is half-dimmed at night and level 2
is not dimmed at all. There is no bloom.

## Hosting: nginx container serving an explicit file list
The `Dockerfile` copies named site files only, so docs, tools and deploy
config never become public. When adding a new top-level asset, add it to the
`Dockerfile`. `deploy/nginx.conf` serves HTML with `no-cache` and JS/CSS for a
week. Bump the `?v=N` query on script and style tags in `index.html` whenever
those files change. The Content-Security-Policy only allows self-hosted scripts, Google Fonts,
and Cloudflare's Web Analytics beacon, which Cloudflare injects at the edge.

## Icons come from the renderer
`tools/make-icons.js` renders a koi with the game's own code and writes
`favicon.ico` (16/32/48), `icon-192.png`, `icon-512.png` and
`apple-touch-icon.png` using only Node built-ins. `og.png` is a 1200x630
screenshot of seed `jade-cove-12` with a title card.
