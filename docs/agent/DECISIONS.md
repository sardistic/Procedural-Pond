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
The world is a buffer that does not change with window resizes. The default,
`auto`, is half the window in each direction at load or at New pond, clamped to
between 360x300 and 1400x900; share links carry it as `size=WxH`. Fixed
presets are 720x405, 960x540 and 1280x720. The minimum zoom is `coverK`, where
the pond covers the window, so there is never an empty border and every
wheel or pinch lands on the pond. The canvas is shown with a CSS transform at
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

## HUD split out of the menu
The menu (`#hud`) only holds habitat, tools, scene, about and action buttons.
`js/hud.js` owns the animal dock and census (bottom-centre), the journal
line and log (bottom-left), and the sky tracker (top-right). It is loaded
before `main.js` and uses main's globals only at call time: main calls
`initHud()` once, then `hudTick()` and `updateSkyHud()` every frame. Dock and
census icons are rendered by the game renderer into data URLs, cached per
species or wild species, shrunk to about 20 native pixels and shown at an
integer scale.

## Time, moon and tides
`world.days` always advances (dayLength seconds per day); the clock is
`days % 1`. Fixed light modes only freeze the tint, not time. The moon age is
`moon0 + days / 8`. Tide level is `0.5 + 0.32 * range * sin(2π(2·days + tide0))`,
where the range scales with the spring factor |cos(2π·age)| and the habitat
(fresh 0.08, mixed 0.75, salt 1). `world.shore` is a per-pixel beach
elevation (0..255) along one seeded edge; water covers a pixel while its
elevation is below the tide level. Compose renders the dry/wet sand, the
foam line and the surf crests, and scales fog down in the shallows. Animals
not in `AMPHIBIOUS` are pushed seaward by `Creature.avoid`, pick targets
below the waterline, and never arrive or leave across the beach edge. Pool
tiles have no shore.

## Journal merging
`logEvent(world, text, subject, { cat, key, data, merge })`: an entry with the
same key newer than `MERGE_WINDOW` (40 sim-seconds) is updated in place. Its
count grows, `data` accumulates, `merge(entry)` rewrites the text, and it
moves back to the top. Rare births, new species and sky events use no key,
so they are never merged.

## pond.nz is the canonical domain
The canonical URL, Open Graph and Twitter tags, JSON-LD, sitemap and robots all
point at `https://pond.nz/`. nginx serves pond.nz (and any other host, so the
127.0.0.1 health check works) and permanently redirects `www.pond.nz` and the
legacy `pond.sardistic.com` to `https://pond.nz$request_uri`, so seed links keep
working. Keep the legacy hostname routed in the tunnel so old links still
redirect.

## Saved ponds
Each browser keeps its ponds in localStorage: `procedural-pond.save.<seed>` holds
the full save, and `procedural-pond.saves` is an index. At most 12 ponds are
kept; the least recently played are dropped first, including when storage is
full. Autosave runs a few seconds after load, then every 15s, on
`visibilitychange` to hidden, and on `pagehide`.

On load: a `?pond=` seed you have saved resumes; with no seed, the last pond
played resumes; a seed you don't have starts fresh from the seed. Links
therefore share a pond's origin, and Export or Import (a JSON file) shares its
current state.

Reproducibility: every animal and plant is constructed through
`makeCreature` / `makePlant` (kind, args, seed) under `withSeed`, so its
variety, pattern and proportions rebuild exactly. A save stores only the seed,
the args (schools, wild species and duck leaders as indexes) and the mutable
state. Anything that creates animals or plants must go through these
factories, or it won't survive a save. Fireflies, gnats, plankton and effects
are ambient and not saved.

Changing habitat or world size regrows the pond from day 1, and asks first if
the pond has history.

## Pond links replace export/import
The address bar keeps `?pond=<seed>&habitat…&size=WxH#s=p1z.<data>`.
`link.js` packs the living pond (format v1, append-only code tables) into
bytes. The bytes hold the settings, time, moon0/tide0, weather, counters and
targets, `inst`, wild species as (habitat, seed), schools, the scenery diff
against the seed (removed generated indexes `oi`, added plants and rocks), and
the animals. Each animal is kind, 21-bit seed, x/y quantized to 1/255 of the
world, flags, args, age, energy, gen, scale if growing, 7 genes quantized to
1/255 of `GENE_LIMITS`, trait bits, shinyHue if shiny, and genome.seed if
piebald. The last 10 journal lines are included too. The bytes are deflated
(CompressionStream deflate-raw, raw fallback) and written as base64url.
`linkToSave` regrows the scenery with `generateScenery` under
`withSeed(seed/habitat)`, which is the same stream `buildPond` uses. It then
applies the diff and regenerates wild species with `genWildSpecies(hab, seed)`
(the generator is now seeded, `species/<seed>`). The result is a normal save
for `restorePond`.

Names and lifespans are derived from the animal seed (`nameFor`,
`lifespanFor`), so links only store them for legacy animals whose values
differ. A typical pond of about 100 animals makes a link of about 3,000
characters.

`inst` identifies a browser's copy of a pond. When a link's inst matches your
save, the newer copy wins silently. A different inst for a seed you already
have prompts before replacing it. An adopted link gets a new inst.
Eggs, plankton and effects are not in links.

## Pond links v2: store only what can't be recomputed
- **Animal seeds:** `seedFor(hashString(pondSeed), sn)`, where `sn` is `world.spawnCount++` at creation (`makeCreature` when no seed is given and `world.seedBase` is set). Links store the zigzag delta of `sn` from the previous animal.
- **Genes:** `genomeFor(seed)` for founders and newcomers (`initLife` default), and `childGenomeFor(seed, parentA, parentB)` for babies (`makeBaby`, which also records `life.parents` as parent seeds). The encoder checks each derivation with `sameGenome` and falls back to quantized gene bytes. Babies whose parents are gone still store their genes.
- **Per animal:** kind+flags, sn delta, a 16x16 position cell, age/4s, a byte holding energy (4 bits) and growth (4 bits), args, then parent back-references (generation derived) or the generation.
- **Header:** the pond name packs into 2 bytes when it matches the generator's word lists. Population targets are no longer stored; they are recomputed from the animals.
- **Comparing copies:** the same `inst` compares by `days` (pond time), not wall-clock time.

A typical pond is about 10 bytes per animal after the header, and 120 animals come to about 1.2k characters. v1 links still decode through `unpackV1`.

## Ticker pacing
The ticker (`feedTicker` in hud.js) holds a queue of at most 4 entries, sorted
by priority (`CAT_PRI` defaults, overridden per call with `pri`). Priority 0
entries are dropped from the ticker when anything is queued or showing. Each
entry shows for max(priority dwell, 1.6s + 55ms per character), shortened by 20%
when the backlog is long. `showTicker()` toasts jump the queue at priority 4.

## Short links and the pond API
Share links are four words (`pond.nz/amber-heron-moss-lantern`, 256^4 ids) that point at a full save stored by a small API (`server/`, Node 24 built-in SQLite, no npm packages). It runs as a second Compose service; nginx proxies `/api/` to it with a per-request DNS lookup, so the static site starts and serves without it.
- **Ownership:** creating a link returns a random key. Only its SHA-256 is stored, and the key lives only in the owner's local save (`save.link`, stripped before upload and by the server). Updates need the key. Anyone else who opens a link adopts a copy with a new `inst`, no link and a fresh score.
- **Syncing:** a linked pond uploads every 90 s and when the tab is hidden. A pond joins the board, and gets a link, on its own at 50 points unless the player opts out. The address bar shows `/<id>` for linked ponds and falls back to the `#s=` fragment link otherwise, or when there is no server (file://).
- **Limits:** nginx allows 60 requests a minute per `CF-Connecting-IP` with a burst of 30, and bodies up to 2 MB (the API takes 1.5 MB). There are 40 new links per address per day. Ponds neither opened nor updated for 180 days are deleted. The feed keeps the latest 300 finds.
- **Scores are plausibility-checked, not proven:** an update's points are capped at the previous points + 15/s since the last update + 2000, and a new pond at 20,000. Finds are rebuilt server-side from whitelisted species and trait names, and their tier is recomputed. No free text from players is shown to others; the board shows the server-made ids.

## Game layer: points, pearls, tiers
`game.js` keeps `world.game` (points, pearls, per-reason totals, rare line counts, first-of-kind keys, pending finds, best find, dawn day, board opt-in). Points never decrease and every point also pays a pearl. Calibrated with the headless sim, a 480×270 pond earns about 2,700 points an hour; bigger ponds earn more.
- **Tiers:** trait rarity sums to Common … Mythic. Rare births pay `TIER_VALUE[tier] × (1 + 0.25 × min(bred, 8))`, arrivals half, and the first of a kind +20.
- **Prices:** animals 4-30, plants 2-15, spirulina 3, brine 5. Pellets and the founding population are free.
- **Fireflies:** the yellow count is `full × sqrt(points / high)`, where `high = max(10000, 10th place)`. Blue fireflies appear past `high`: 2 + 2 per doubling, or 75% / 40% of the swarm for ranks 1 / 2-3 (only once inside the range).

## New genes use their own random stream
Xanthic and axanthic (recessive), glow and ghost (mutations, 15% / 40% inheritance from one / two carriers) and the dwarf roll come from `genome2/<seed>`, merged over `genome/<seed>`. Every existing seed keeps its original genes. `fillGenome` defaults missing keys, and `sameGenome` treats missing as 0/false. Links carry the new genes in an optional byte flagged by bit 7 of the trait byte, and the score after the journal (read only if bytes remain). Older links still decode.

## Temperament, comfort and food
`vigor` (0.8-1.25) and `wander` (skewed low) are rolled from `temper/<seed>`, so links don't store them. Comfort (0-1) eases toward the count of liked plants and rocks within 56 px (3 saturates), updated every 2 s. Ageing runs at `(1/vigor) × (1.1 - 0.4 × comfort) × (fed ? 0.85 : 1)`. Every 6 s a grown animal leaves with probability `0.004 × wander × (1 - comfort)² × (fed ? 0.4 : 1)`. Food sets `L.fed` seconds: pellet and spawn 45, brine 90 (and resets the breeding cooldown), spirulina 240.

## Family trees
`world.lineage` is a Map from seed to `{k, w, n, g, p, t, c, b, how, d, why, pts}`. It covers every animal that lived here (founder, bought, arrived or born), keeps up to 600 records, and prunes the oldest departed first. It is saved in full saves and short links, but not in `#s=` links, which rebuild it from the animals present. A tadpole's record is re-keyed to the frog it becomes, and the frog now keeps the tadpole's parents.

## Frogs on the beach
A frog swimming onto dry sand drops to ground height (z 2.4) and hops. Before, it stayed at swimming height (40), so its shadow landed about 17 px away.
