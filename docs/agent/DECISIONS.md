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

## Fixed-size world, integer zoom, clipped rendering
The world is a fixed buffer (`WORLD_SIZES`: 720x405, 960x540 or 1280x720) that
does not depend on the window size. The canvas is shown with a CSS transform at
a whole number `view.k` of screen pixels per world pixel. The default is one
step past fitting the whole pond, so the world extends beyond the view. Each
frame only the visible rectangle is rasterized (`Raster.setClip`, with a
30px margin for shadows from off-screen things), composed, and uploaded with a
dirty-rect `putImageData`. Window resizes only re-apply the view. A seed
therefore reproduces the same pond on every device.

## Seeded ponds
`buildPond()` generates scenery and the starting population under
`withSeed(seed/habitat)`, and floor decor under `withSeed(seed/floor/<key>)`.
Only the starting state is deterministic; the running simulation is not.

## Water is rendered, not baked
The floor is baked in true colour. `Raster.compose` applies depth fog, where
water colour increases with depth below `SURFACE_Z`, plus a one-pixel
row/column refraction offset on floor pixels and a per-water caustic
threshold. Sun glints are drawn into the output afterwards; motes are
rasterized as outline-less dots.

## Habitats
`SPECIES_HABITAT` and `fitsHabitat()` in `js/scene.js` decide which animals and
plants a pond gets and which buttons are shown. Wild species carry their own
habitat. Switching habitat applies `HABITAT_DEFAULTS` for water and floor, and
regrows the pond.

## Genetics
Recessive morphs (albino, melanistic, piebald) are allele counts from 0 to 2
per animal, and each parent passes one copy on. Shiny is a mutation
(inherited 20% of the time). `dyeCreature` recolours the individual, paints
piebald patches into baked shader tables (`shader.dims`), and marks rare ids in
`THICK` with a coloured `OUTLINE`. Compose draws the second outline ring only
when a thick id is on screen.

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
