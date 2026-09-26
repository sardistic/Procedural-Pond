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

## The address bar is the share link
Every pond gets a short link 8 s after it opens (2 s for an adopted copy), not on Share or at 50 points. Crawlers are skipped by user agent. The address bar shows `/<id>` once the link exists. Before that, or with no reachable server, it shows only `/?pond=<seed>&…`. Share copies the address bar after an upload, and only without a server does it build the long `#s=` link, for the clipboard alone. `file://` keeps the fragment in the address bar. Opening your own `/<id>` loads the local save directly (the save index records `link`), with no fetch. Regrowing (habitat or world size) keeps the link. The leaderboard lists ponds from 50 points, and ranks are null below that. Ponds under 50 points expire after 45 idle days, the rest after 180.

## Pond bar
The top-centre bar shows the pond's seed name, points, pearls and leaderboard place, and opens the score panel. The follow chip moved to `top: 64px`. On phones the bar is placed with `left`/`right` rather than a transform, because a transformed ancestor would become the containing block of the fixed score panel.

## Essence, the third currency
Essence buys animals and gene boosts; pearls now buy only plants, food and (later) structures.
- **Spawn cost:** `0.5 × (1 + size^1.5 × 1.6) × (1 + 0.8 × rarity) × years^0.3 × (0.55 + 0.45 × settle) × group^0.55`, minimum 2, from `SPECIES_STATS` in life.js.
- **Settling:** each animal in a purchase settles with `settle × difficulty.settle`, +0.1 if hardy. The ones that don't fade out (`c.unsettled`) and refund half their share.
- **Boosts:** each nudges one working gene of every animal bought (the carrier boost adds a copy of a random rare colour gene). They cost `2 + 0.2 × base`, or `6 + 0.45 × base` for the carrier.
- **Recycling:** `recycleValue` is 40% of one animal's share, scaled by growth, plus `TIER_ESSENCE[tier]`. Natural deaths return `1 + TIER_ESSENCE / 2`, and dawn gives `2 + species / 4`.
- Starting essence is 30. The Net tool now recycles.

## Ecology grid (ecology.js)
The grid uses 32 px cells and is recomputed every second, easing toward its target.
- **Aggression:** the difficulty base (fresh 0.06, salt 0.2, mixed 0.26), plus predators (0.16, or 0.32 while hunting, × the aggression buff), clownfish and puffers, and decaying hunt heat (+0.5 per catch, ×0.9 each second). Crowds of more than 8 per cell add to it, and surf adds near the waterline. Plant cover and calming buffs lower it, and animals in the wrong water raise it.
- **Salt (mixed only):** `tanh((beach proximity × 2 − 1) × 1.1 + 0.3 × influence)`. Influence is creatures ±1 × territory, plus fresh plants (marimo, duckweed, lily) or salt plants (anemone, coral, urchin). It eases at 0.04 a second.
- **Effects:** breeding needs local aggression below 0.75. Eggs are lost at `min(0.6, aggression / 2)`. Arrivals are scaled by `1 − min(0.7, avg)` and come in by the calmer of two edges. `leaveChance = 0.004 × (wander × (1 − comfort)² + 0.75 × aggression × (1 − resilience) + 0.45 × mismatch × (1 − tolerance))`, halved when fed. Comfort also drops with aggression and with mismatch × (1 − tolerance).
- **Points multiplier:** fresh 1, salt 1.3, mixed 1.6, applied in `award`.

## Genetics 2.0
A third random stream (`genome3/<seed>`) adds:
- the working genes `fert lon vit iq lum agg tol ter res`, each 0–1 from a bell draw, blending with drift 0.06 × √(mutation factor);
- `leu` (incomplete dominance), `mar` (dominant; homozygous ×0.7 longevity), `mut` (recessive mutator), and `chi` (chimera, not inherited, 1/500).

The other rules:
- **Mutation factor:** `(1 + 1.5 × homozygous mutator parents) × (1.5 if a parent is shiny)` scales every mutation chance in all three streams. With a factor of 1 the draws are unchanged, so old seeds keep their genes.
- **Buffs:** `computeBuffs` turns genes into buffs, and `TRAIT_BUFFS` adds per-trait buffs (pleiotropy). Hybrid vigour is +3% per heterozygous locus.
- **Inbreeding:** `inbreedingOf` is Wright's F over the nearest common ancestors, up to 4 generations back through `world.lineage`. It is stored as `L.inbred`.
- **New traits:** chimera 5, leucistic 3, marbled 2, pale 1. Pale gets no thick outline.
- **Links v3:** explicit genomes write the later gene block and the loci before the pattern seed (used by piebald, marbled and chimera), and age is now a varint. v2 links decode as before. The link trailer also carries essence.

## Lifespans from real ones
`SPECIES_STATS.years` sets lifespans as `300 × years^0.55` seconds, ±15%, from `life/<seed>`. For example: tetra 5 y ≈ 12 min, koi 30 y ≈ 33 min, octopus 1.5 y ≈ 6 min. Maturity is 12% of lifespan (at least 30 s), and the breeding rest is `lifespan × 0.1 / fertility` (at least 40 s). Clutches scale with the parents' average fertility × (1 − 0.4 × aggression).

## Beach margin
Swimmers keep `SHORE_MARGIN` (0.2 beach elevation) of water below the tide, sampled here and 12 px ahead, with a force up to 4. Targets and school points need `tide − margin − 0.06`, or the lowest elevation tried. In a 20-minute mixed sim, swimmers were near the waterline 0.04% of the time.

## Structures (structures.js)
- **Drawing:** each structure has `BUILD` (its shape, under its seed), `BAKE` (solid parts drawn into the floor bake, outline ids 5000+, so animals are z-tested against them) and an optional `DRAW` for live parts (vent glow, shrine crystal, hatchery eggs; EMISSIVE on `s.id`).
- **Placement:** `canPlace` needs water deeper than tide − 0.1, clearance from the edges and from other structures, the right habitat, and one hatchery at most.
- **Auras:** `auraAt` returns comfort (added), fertility and ageing (multiplied), and light (added at night), fading linearly to the radius. `structureZones` adds aggression and fresh/salt pull to the ecology grid. Species favour structures through `STRUCT_LIKES`.
- **Islands:** `applyShoreEdits`, run at the end of `makeShore`, raises beach elevation in a noisy dome. `restorePond` builds structures before the shore. Swimmers and floating plants now push down the local slope of the beach rather than along the beach side, so islands work too.
- **Save and links:** saves hold `structures` and `hatchery` (stock packed with wild species by id). Links append a structure list (append-only `STRUCT_CODES`) after the score; a link doesn't carry the hatchery stock.
- **Refunds:** the Net takes a structure down for half its pearls.

## Hatchery
`world.hatchery` holds `{ nutrients, focus, stock[≤2], broods, levels }`.
- **Food and upgrades:** a brood costs `40 × 0.85^incubator` food. A click feeds `1 + 0.75 × paddle`, and the auto-feeder adds `0.25 × level` a second. Food caps at 3 broods, and the auto-feeder runs offline for up to 8 hours on restore. Upgrade cost is `base × grow^level`.
- **A brood:** `2 + tank` young, from the stocked pair's `childGenomeFor`. Then the chosen trait is pushed `(0.25 + 0.12 × filter) × (hi − v) × rand(0.5, 1)` toward its extreme; for rarity, or with the lamp, one extra rare allele or mutation roll.
- **Stock:** animals leave the pond while stocked (lineage `why: 'to the hatchery'`) and come back on release. Schooling fish get a new school.

## Stains and growth
- **Stains:** `bakeBackground` keeps unstained copies (`bgBase`, `bgLightBase`, `bgDryBase`). `applyStains`, run after each bake and at dawn, paints algae (fresh), coralline (salt) or lichen (dry) around structures, rocks and placed plants. The radius grows `~1.6 px/day` and the depth `0.035/day` (up to 0.5), noise-modulated and dithered into 1/8 steps. Generated rocks count as 8 days old.
- **Growth:** at dawn, `sproutAround` grows plants near sources older than 1 day (chance 0.3 × k: seed bed 3, other structures 1, rocks 0.35), in water deep enough, with at most 3 plants within 20 px, up to `area/2200` plants. The kind fits the local water.

## Erosion and the depths (erosion.js)
- **Rate:** `world.erosion.e` grows by `dt/dayLength × rate`. Fresh: `0.16 + 0.2 × surf`. Otherwise: `0.1 + 0.4 × surf × max(0.3, tide range)`.
- **Tiers:** erosion 0, 2 (tide pools), 5, 11 and 22. Tiers 2–4 each grow the world by 22% of the original size toward the side opposite the beach. `deepenPond` spends `12 + 10 × tier` essence for +1 erosion.
- **Tide pools:** a bowl carved into mid-beach elevation (0.35–0.62), `shore × d^4`. One arrives per 3 erosion after the first tier, 4 at most. `applyErosion` applies them at the end of `applyShoreEdits`, so every `makeShore` keeps them.
- **Growing the world:** `expandWorld` serializes the pond, shifts it (`shiftSave`) when growing left or up, adds to `expandPx`, and relayouts to rebuild at the new size. `worldDims` = the base size plus `expandPx` on the deep axis. Saves hold `base`, `expandPx` and `erosion`.
- **Keeping the original pond fixed:** the floor pattern, decor and shore noise are laid out in original-pond coordinates (`originOf`), so growing never moves the beach or the floor.
- **Links:** they carry erosion, the tier, `expandPx` and the tide pools. `linkToSave` regrows scenery on the original size (it probes the seeded shore side first), then shifts it.
- **Depth map:** `world.depth` (Uint8) is terraced shelves past a ragged lip, up to the current tier's depth. `compose` mixes pixels toward `DEEP_COLOR` by up to ~90% of the depth, skipping EMISSIVE-2 ids so lights stay bright. The deep floor bakes as `DEEP_SILT` with boulders and pale stalks.
- **Side view (`drawSlice`):** the pond cut along the deep axis, averaged over three lines, with animals at their depth and the erosion progress along the bottom.

## Deep species (deep.js)
- **The `DEEP` table:** branch, tier, essence to unlock, and `deepMin`. `deepPush` steers deep species toward water deep enough for them, and `keepIn` filters their targets.
- **Dock and arrivals:** the dock shows a deep species once its tier is reached and it's unlocked (`G.unlocked`). Natural deep arrivals happen at 2% per migration tick from tier 1, and mythics come only 6% of those times, one at a time.
- **Scores and extras:** deep sightings score 20 (150 for a mythic), +30 for a first. Dawn essence rises by 1 per deep animal. `updateDeep` writes eerie journal lines, and the Watcher lowers comfort within 90 px.
- **Starfish varieties:** sunflower, brittle and cushion are drawn last from the seed, so earlier draws are unchanged.
- **Link codes:** new `KIND_CODES` are appended, and cavefish carry a school index like tetras.

## Worth, the dock order and recycling all
- **Species summary:** `speciesSummary` gives, per species (tadpoles counted with frogs), the count, total worth (the sum of `recycleValue`), the best tier, the distinct trait sets, and diversity (average share of heterozygous loci).
- **Dock:** it re-sorts by worth every 3 s, but not under the pointer or with the spawn card open. `--val` sets the purple glow, and `--tier` the border and gem (tier 2 and up).
- **Lists:** census rows and their members sort by worth.
- **Recycle all:** `recycleAll` confirms and names the rare animals, recycles quietly, zeroes the species' target, and logs one line.

## The deep build-out
- **Structures:** `STRUCTURES` gains `tier` (the depth tier needed) and `deepMin` (depth at the spot), both checked in `canPlace`, plus `dawnEssence` and `lure`. The six:
  - kelp forest (salt, tier 2) and drowned forest (fresh, tier 2);
  - black smoker (salt, tier 3, 4◆/dawn) and crystal grotto (fresh, tier 3, 4◆/dawn);
  - whale fall (salt, tier 4, 7◆/dawn);
  - drowned idol (fresh, tier 4, 10◆/dawn, unique). Its lure multiplies the mythic chance by `1 + lure`.
- **Shape fix:** `BAKE` calls now run under `withSeed('bake/<seed>')`, so baked shapes that use `rand` are the same on every bake.
- **Foods:** krill and bloodworms (tier 2) condition animals like brine shrimp. Marine snow (tier 3) is 9 flakes over a wide patch, sinking slowly.
- **Plants:** black coral and glowcaps (tier 3) grow only where depth > 0.3, and dawn sprouts in deep water become them. Their `PLANT_CODES` are appended.
- **Menus:** the Build and tool menus hide items until their tier and water fit, and refresh when a tier is reached. The evolution tree lists each tier's extras (`DEEP_EXTRAS`). The menu gains Depths and Hatchery buttons (the side view is hidden on phones).

## Depth is the score (fathoms)
- **Fathoms:** `fathomsOf(e, branch)` interpolates geometrically between `FATHOM_KNOTS` per branch (salt: 2 fm at 0, 8 at tier 1, 110 at tier 2, 550 at tier 3, 2,200 at tier 4; fresh is shallower). The bar, the leaderboard, the index entry and the fireflies (`HIGH_FLOOR = 110`) all use it. The server duplicates the knots and computes depth from reported erosion.
- **What deepens:** `updateErosion` sets `E.e = max(E.e, E.acc + pointsDepth(points))`. `E.acc` gathers the tide (none without a shore; fresh `0.07 + 0.12·surf`, salt `0.05 + 0.26·surf·range`), time (0.05), structures (≤ 0.1) and plant growth (`0.05·maturity`), plus `deepenBy` steps (`E.parts` records each source for the score panel). `pointsDepth = 2·log10(1 + p/1000)`, so points help but can't feed a points→depth→points loop.
- **Evolution steps (tuned by 1-hour sims):** a generation record 0.1, a new wild species 0.1, a first deep sighting 0.1, a fossil 0.1, a brood 0.02. Rare births add `tier × 0.03` for a first, otherwise `tier × 0.002` (0.001 for arrivals) times `clamp(960·540/area, 0.4, 2.5)`, because repeats scale with population. Transcendence adds 0.3 the first time per species, then 0.02. A pioneer-start mixed pond reached twilight (~10) in an hour; a crowded one reached midnight (~14).
- **Server:** `erosion` and `depth` columns (ALTER TABLE on start); ranking is `depth DESC, points DESC`; `high` is tenth place's depth. Erosion is capped at 30 for a new pond and grows at most 0.02/s + 3 per update.

## Hatchery access
- **Picker:** while the pair isn't full, the stock list shows `hatchCandidates` (lines with two grown animals, or the stocked animal's own line) as buttons with icon, names, traits and worth. The panel signature includes a 4 s time bucket while a place is empty, so the list stays fresh.
- **Reopening:** clicking the hatchery works with any tool but the Net. The dock's `#hatch-btn` egg is a fixed 44 px square that fills from the bottom (`--p`) and pulses when a brood is ready; a conic wedge looked wrong when the dock wrapped and the button stretched.

## Behaviour
- **Rhythms:** `RHYTHM` (night, dusk, day, always) gives `activity(world, c)`, which scales cruising, walker pauses, octopus pauses and the hunting threshold. Out of hours, fish rest near a liked spot unless `alwaysSwims` (reef sharks).
- **Liked spots:** `likedSpot` picks from `world.likeSpots` (plants grown past 0.4, structures, remains), which `updateComfort` builds. `newTarget` heads there 55% of the time; schools 50%.
- **Specials:** turtles haul out to bask by day (`haulOut` to a dry spot just above the tide), crabs forage the bared beach at night.

## Remains and fossils (remains.js)
- **Dying:** old age and hunger set `c.dying`. `dieStep` stops, sinks and fades the animal over 3 s, then makes `Remains` (bones from the body joints). The main loop skips `c.update` for dying animals, and saves and links skip them.
- **Remains:** worth `0.6 × recycleValue + 1` essence plus `2 + TIER_VALUE` points when clicked; they last 150 s, less with scavengers nearby (who gain energy). Scavengers like 'remains' as a spot.
- **Fossils:** at dawn, `0.08 + 0.05·tier` chance, on the beach between elevations 0.42 and 0.9, at most 3, gone after 4 days. Clicking gives `15 + 5·tier` essence, 25 points and a weighted ancient gene into `G.fossilGenes`. `applyAncientGene` sets it so the animal shows it; the spawn card gives it to the first of a spawn (which always settles), and the hatchery infuses it into the next brood's first young.
- **Naming:** `REMAINS_BONE`, because main.js already declares `BONE` for the X-ray view. The Node sims don't load main.js; a concatenation of all scripts in page order is the check for top-level clashes.

## The eldritch branch (eldritch.js)
- **Genes:** `genome4/<seed>` holds `eld` (1/1500 × the mutation factor; 20% from one marked parent, 45% from two). Links carry it in bit 7 of the loci byte. `makeBaby` can also mark young by `eldBirthChance` (0.03 in the abyss, +0.08 near the idol). The hatchery's dream focus marks young at `0.18 + 0.06·lamp`.
- **Stages:** `L.corruption` grows at `1/(1.6·lifespan)` × (1 + 1.2·darkness) × (1 + 2·depth) × idol 3 / whale fall 1.6 / mythic within 160 px 2; bound animals stop. Thirds give touched → changed → eldritch (`eldTraits` swaps the trait; TRAIT_RARITY 4/5/7). The slower base rate means most marked animals in the shallows die before transcending.
- **Effects (per 1 s tick):** changed and transcendent animals lower neighbours' comfort (dread). A transcendent one draws at most 4 prey to circle it and maddens at most 3 within 30 px (jittered heading, 2.5× wiggle); caps came after a sim showed 72 maddened at once. At night it marks a neighbour at 0.4% per tick.
- **Player options:** feed the dream (`10 + 20·c` essence, +0.2) and bind (`15 + 30·c`, −0.3 and stops it).
- **Persistence:** saves store `corruption` and `bound`; links add a trailer block (saved index, corruption ×127, bound bit).

## Slow start and plant life
- **Bare start:** `barePond` runs after `generateScenery` inside the seeded stream and removes plants by `hash2(oi·7.3, 1.7, 404) < 0.6` (0.7 for pads). They go into `world.removed`, so links regrow the same pond. The rest become seedlings at growth 0.15–0.4. `generateScenery` itself is unchanged.
- **Succession:** `populate` spawns only kinds with `SUCCESSION[kind] === 0`, at 60%, and records the rest in `world.succession.want`. `succession()` (each migrate tick) brings a group once `world.maturity` reaches the kind's threshold, logs the first, and clears itself when done. Wild discoveries wait for `SUCCESSION.wild`. `world.maturity` starts at 0 and counts as 0 until measured; treating an undefined value as 1 let a frog in during the first second.
- **Plant life:** `PLANT_LIFE[kind] = [growth per day, min span, max span]` (weeds grow fully in about 3 days, corals about 9). Past its span a plant loses 0.4 growth a day and is removed below 0.12, and generated ones go into `removed`. `seedPlants` at dawn gives mature plants a `SEEDS[kind]` chance of a seedling 12–30 px away (≤ 10 a dawn, ≤ 3 within 20 px, total cap area/2200). `maturity = Σgrowth / (area/4500)`, clamped to 1.
- **Drawing:** `Raster.setScale(x, y, k, kz)` scales tube, ellipsoid and dot about a point; plants draw at `k = growth`, with lily pads and duckweed keeping `kz = 1` so they stay at the surface. Frogs only use pads grown past 0.5.
- **Persistence:** saves store `g`, `age` and `span`, and plants restored without them are mature and mid-life. Links add a growth trailer (u8 per plant: generated by `oi`, then added) and the succession `want` list.
- **Economy:** `START_PEARLS` 30 and `START_ESSENCE` 15.

## Sound follows the view
- `Sound.update(world, dt, visibleRect(), view.k)`. Every 0.25 s `measure` samples a 6×4 grid of the view: how much is beach or waterline (`mix.beach`), how deep (`mix.deep`), and the nearest transcendent in view (`mix.eld`).
- Beds (looped brown noise through filters): water, surf (swells per wave, scaled by beach share), lap, rain and wind. The drone is two low sines plus a triangle "third" raised near the transcendent.
- `place(x, y)` pans a voice by its screen position and fades it with distance beyond the view (null when out of earshot). Plops, bubbles, gulls, croaks, quacks, crickets, groans, whispers, omens and absorptions all use it.
- Bubbles no longer plop: aerator bubbles made about seven full plops a second. They now call `Sound.bubble`, which is rationed to 1.5/s, very quiet, and only in view.

## Gulls (gulls.js)
- Visitors with no genes (not saved or linked). `updateGulls` wants `clamp(beach area/9000 × habitat + prey out on the sand × 0.15, 1, 5)` by day, none at night or in rain over 0.7.
- Modes: soar (circles), land, walk (dry sand; takes off for the tide or the pointer), rise, hunt, dive, leave. Scavenging remains comes first.
- Hunger rises by dt/600, so a hunt comes every several minutes. Dive success: frog 0.25, crab 0.35, dragonfly 0.25, less for grown animals. A miss sets hunger to 0.25. The sim went from 38 frogs an hour to about 1 after these changes.
- A diving gull calls `startle` on its prey.

## The eldritch, extended
- **Look:** `VOID_SKIN[id]` (reset in `newId`) is set each frame from `eldLook`. `compose` turns marked pixels whose caustic-tile value is below `VOID_T[level]` into void black with hashed twinkling stars, with a violet rim, and tints the rest violet above level 2. The noise is screen-anchored and drifts, so the void crawls. Plants use it too (corrupted plants at level 4).
- **Distance and scatter:** `eldMarksNow` builds `world.eldMarks` every frame. Fish add `eldPush`; other animals are retargeted away once a second. `startle` (creatures.js) sets `o.dread` (fish steer from it like a threat) plus a target away. `scatterFrom` startles the whole pond on every stage change, on Swell and on Ascension.
- **Absorption:** stage 1 and up, `absorbCd` 40–90 s. The chance is 3% × stage per tick when the kind is over 1.15× its target or the pond is over 85% full, otherwise 0.2%; doubled by the Hunger. At most 6 per animal. The victim gets `absorbing` (the main loop and life tick skip it) and fades over 2 s. `absorbInto` gives size ×1.05, vit/lon +0.04, lifespan ×1.06, corruption +0.08 and 1 + stage ◈. Drawn as lumps plus a tendril while feeding.
- **Brakes (from stress sims):** without them, three seeded marks became 79 marked animals and ~2,700 ◈ in an hour. Now: dream spread × max(0, 1 − marked share / 0.08); inheritance 15%/35%; base rate 1/(2·lifespan); corruption income × 1/(1 + marked/12). Stress runs now end with 8–19 marked and ~300–450 ◈ an hour.
- **Corruption (◈):** per marked animal 0.003 × (1 + 2·stage)/s, +5 at Changed, +15 at Transcendent, 1 + stage per absorption, plus dark islands (0.03·blv/s) and corrupted plants (0.01/s). `G.corruption` and `G.corruptionEarned` are saved, and linked in a trailer.
- **Paths** (`ELD_PATHS`, 515 ◈ in all): veil 15, eyes 30, hunger 40, dream 50, chorus 70, tide 110, crown 200. Their effects are wired in `assignHunts` (veil stealth), `gainCorruption` (eyes), `tryAbsorb` (hunger), `makeBaby` and the dream spread (dream), the psychic radius (chorus), `deepenBy` and `arriveDeep` lure (tide), and Ascend (crown). Bits are in `ELD_PATH_CODES` (append-only).

## Trait trees (traits.js)
- **Animals:** `L.boosts[key]` is 0–3. Each level adds half the ENHANCE amount to the gene. Cost `(3 + spawnCost × 0.12) × (lv + 1)^1.4` essence. Links carry the genome but not the level counts (cost resets on a copy).
- **Plants:** `p.tr` holds lush, hardy and seeding (2 bits each), glow and eld. Lush draws ×(1 + 0.15·lush) and gives more cover. Hardy is span ×1.5 and less litter harm. Seeding is ×(1 + 0.8·seed). Glow and corrupt effects are ticked by `plantTraitTick`. Links pack it into one byte per plant, plus the day planted.
- **Structures:** `s.lv` holds reach (radius +20%) and strength (effect +25%), applied in `auraAt`, `structureZones` via `auraR`/`auraK`, and (for islands) stack. Islands: `s.stack` 1–5 (radius +16% and top +0.06 each), then `s.branch` life or dark with `s.blv` 1–3. Building an island within 1.2 radii of one raises it. The BAKE additions run after the original shape's random draws, so the first shape never changes.
- **Cards:** structures open on click (hatchery opens its panel), plants on right-click or a 550 ms long press (`openThingAt`). Right mouse button no longer triggers the tool.

## The coast (coast.js)
- **River:**
  - Seeded (`<seed>/river`) centerline in beach-local coordinates (`coastXY`), carved in `applyRiver`, called from `applyShoreEdits` before islands.
  - The bed is below the lowest tide. Width by habitat (fresh 8, mixed 5.5, salt 3) × (1 + growth × age), where age is from E.e/22 + days/120, quantized to 0.5 px and re-cut at dawn.
  - `generateScenery` sets `world.riverOff` so plant and rock placement sees the old beach (links regrow identical scenery), then cuts the river at the end.
  - `restorePond` sets `world.seed` so the river plan matches (linktest4: 0 shore pixels differ).
  - Effects: `riverZones` (calm, fresher water with both waters), plankton at the mouth, a sprouting source, and `LIKES` 'river'.
- **Islands:**
  - The profile is `top·(1 − (d/1.4)²)` with top 0.97 + 0.06 per stack (was 1.2), so much more of it floods.
  - Size is `R × stack × islandSand`, a deterministic cycle from the seed and `floor(days)` with no storage needed. Reshaped at dawn when the key changes.
- **Litter:**
  - Pressure is `0.2·log10(1 + pts/1000) + 0.6·log10(1 + views) + 0.08·tier`; per pond day it's `pressure × (0.3 + 0.5·surf)`, with at most 20 pieces.
  - Pieces land on the wrack line; the band is wider where tides barely move.
  - `pollutionAt` sums harm × 3 over each piece's radius; comfort drops by 0.8 × pollution and plant growth by up to 80%. Ghost nets snare small animals at 1.5%/s.
  - Hauling pays 1–4 pearls (flat). Drums take 3 clicks, nets and tyres 2.
- **Blights:**
  - Dawn risk is `clamp(0.02 + 0.06·pressure·(0.4 + 2·pollution), 0, 0.45) × 0.7^aerators`.
  - A bloom lowers comfort by 0.25 and weak animals die at 0.2%/s; the water fogs toward `BLOOM_TINT`. A sickness hits the most crowded species (≥ 6) at 0.15%/s.
- **Deep placement:** `deepPlacedAt(min)` sums structure depths (×1.5 for deep structures) and deep plants ×0.25. At dawn, `maxPop = base + 6 × placed`, and deep arrivals come at 2% × (1 + 0.4 × placed). A species unlocks free once placed at its `deepMin` reaches 0.8 + 0.7 × (tier − 1) (mythics 5).
- **Scour:** structures (1), placed rocks (0.5) and placed plants (0.3) in open water add depth around them. Strength is `clamp(age/25) × weight × (0.4 + 0.2·tier)` over a radius of 16 + 22k, stretched ×2 toward the deep, capped by the tier's depth. `buildDepth` applies it (even before any expansion), and it's rebuilt at dawn when `scourKey` changes.
- **Persistence:** saves carry litter, blight, structure `lv/stack/branch/blv`, plant `tr`, and life `absorbed/ascended/boosts`. Link trailer blocks, appended in this order, are all append-only:
  - absorbed and ascended per animal index;
  - litter (code | hp << 4, x, y) and blight (code, days left × 1000, species);
  - per-structure upgrade bytes (count first);
  - plant traits and the day planted (count first);
  - corruption, corruption earned, and path bits.

## Waves
- `compose` gets `swell` and `swellDir` (the shore normal). Two wave trains come from a 1024-entry sharp-crest table (46 px and 29 px wavelengths, 9 and 6 px/s).
- Amplitude is swell × (0.8 + 0.0045 × depth) × a patchy low-frequency caustic factor, so crests break up.
- It's applied after fog and depth darkening, so crests show over the deep. Highlights come above 0.6 (dithered below alpha 36) and a trough darkening below −0.3. Whitecaps (FOAM pixels) need crest > 2 over depth > 50 in caustic-noise patches.
- In render, `swell = 0.3 + 0.35·surf + 0.45·gust + 0.15·rain` (×0.7 in fresh water).

## Side view
- Rewritten. The beach keeps at least 25% of the strip, however far the pond expands (a piecewise map, `toA`/`toI`). The floor slopes from the beach toe to the drop-off lip, then descends the shelves.
- A yellow box marks the visible range along the axis. It's redrawn every 0.25 s and gets narrower as you zoom in (checked in cdp13). Marked animals show green.

## The shared beach and observe mode
- **Server:**
  - Adds a `views` column and `countView(ip, id)`, counted on GET once per address per pond per 6 h via an in-memory map. `views` is returned from POST, PUT and GET.
  - `GET /api/neighbours?id=` returns the ring of ponds updated within 30 days in `created` order (30 s cache). With no or unknown id, it returns the newest and oldest.
- **Client:**
  - Dragging past the beach-axis clamp accumulates `press.over`. At 150 px the edge tab is ready, and releasing navigates via `goNeighbour`. Beach along top/bottom means neighbours left/right; otherwise up/down.
  - Observing is a page load of `/<id>?observe=1&edge=<arrive>`. The home link is kept in sessionStorage `pond.home`. Walking back into your own id goes home with `?edge=`.
  - `world.observe` means `noSave` is set (no save, sync or link update) and the body gets class `observing` (the habitat buttons, your ponds, tools, build, hatchery and deepen are hidden).
  - Also: pointer pans only (a tap opens a card), no spawn card, hatchery, recycle, trait buttons or path buttons, and the save status says "look only".
  - `observeSync` re-fetches every 60 s and re-applies the owner's master save when it's 2 minutes newer, keeping the camera (`quietRestore` skips the welcome log).

## Walking the beach takes a choice; the drop-off slopes
- Walking to a neighbour was too easy at 150 px of overscroll: people went by accident. Now:
  - The pull only counts in a direction whose end the view was already at when the drag began (`press.ends` from `viewAtEnds`), so ordinary panning never counts.
  - It needs `max(320 px, 45% of the viewport along the beach)`.
  - A full pull, or a click on the end tab, opens the `#nb-ask` prompt; only Go navigates (Stay and Esc close it). cdp14 checks each case.
- The pond's old edge showed as a straight seam in the pond and the minimap. Past the lip the depth jumped to the first shelf at once, and the lip wandered only ±8 px. Now:
  - The lip wanders about ±40 px with two noise octaves.
  - Depth ramps in with `smoothstep(0, 0.2, t)` times noise, and shelf risers slope (`smoothstep(0.7, 1)` within each terrace). cdp14 checks the start is under 40 and varies more than 25 px.
  - The minimap shades wet cells toward `DEEP_COLOR` by average depth × 0.85, like compose.
- These are the same depths for every pond (derived, not stored), so links and saves are unchanged.

## Fair points for pond size
`award` multiplies by `sizeFairness = clamp(√(960×540 / original area), 0.6, 1.5)`. Deepening doesn't count toward the area.

## Past the abyss (js/abyss.js)
- Four more tiers push the world further out and down: 40 the hadal trench / flooded crypts, 70 the black below / roots of the world, 120 the drowned / sunken city, 200 the dreaming dark. Each adds `expand` 0.25 to 0.3, so the pond keeps growing seaward.
- Fathoms stretch to match (client `FATHOM_KNOTS` and the server's copy must agree): salt 6,000 / 20,000 / 80,000 / 400,000 fm at those erosion values, fresh 1,700 / 6,000 / 24,000 / 120,000, then a linear tail (salt +2,000, fresh +600 per erosion unit). A deep pond's score jumps; that's intended (the user asked for the depths to feel deep).
- New life registers into the existing tables (`DEEP`, `SPECIES_STATS`, `CREATE`, `SPECIES`, `DEEP_PREDATORS`, …) and link `KIND_CODES` (codes ≥ 32 set bit 16 of the extra byte; the 5-bit field was full).
- New sinks: structures from 600 pearls up to the unique Cyclopean gate (20k pearls, 2k essence) and the Sleeper's cradle (100k pearls, 10k essence, 1k corruption); five deep plants; chum and offerings; the deepen cost now grows ×1.15 per use; animal trait trees go to 10 levels (×1.75 each), structure traits to 10 (×1.8).

## Hunters (js/hunters.js)
- Any predator, or any swimmer woken to the hunt (50 essence + 25 corruption), can be levelled in eight ways, 10 levels each at base × 1.75^level: pearls (jaws, burst, senses), essence (hunger, maw, tenacity), corruption (contagion, devour). The hunt helpers feed `assignHunts`, `Fish.update` and `eat`; `onKill` handles devour (growth and corruption) and contagion (the mark if the hunter is marked, otherwise the rot).
- Stored per animal as `life.hunt` / `life.hunter`, in saves and in a link trailer.

## More genetics: gifts, curses, quality, quirks, ills (js/quirks.js)
- A fifth seeded stream (`genome5/<seed>`) so every existing animal keeps exactly its old genes. Its keys stay out of `GENOME_KEYS`; links carry them as one bit field per animal in a trailer.
- Gifts (1/500 to 1/2500) and curses (1/3000 base; 30% from one parent, 60% from two). Curses are the "evil permutations": `evilPressure = clamp((speed − 1) × 0.8 + max(0, 180 / dayLength − 1) × 0.6, 0, 4)` adds a 0.8% × pressure chance per birth, so a pond run fast or with short days breeds wrongness (appetite, barrenness, frailty, …).
- Quality grades (Poor … Pristine) come from the working genes, gifts and curses. Buying a grade costs ×1 / 1 / 1.6 / 3.5 / 9 / 30 and re-rolls the spawn's genome under derived seeds (`<seed>/grade/<i>`) until it meets it, so it stays reproducible from the seed.
- Madness quirks (30% × (1 + 0.3 × pressure) per stage change of a marked animal) and two ills (rot, madness). The madness spread was tuned down after a 60-animal epidemic in a sim: it needs 12 fits (4% then), spreads at night within 12 px at 0.0002, and dawn can cure both ills.
- Everything else was made rarer (carriers ×0.6, shiny 1/300, glow 1/800, ghost 1/1000, dwarf 1/160, giant 0.8%, the mark 1/3000, child mutations about halved).

## Habitats and population balance (js/habitats.js)
- Habitat structures give breeding to species that never bred before (eels, rays, pufferfish, turtles, crabs, starfish, jellies, octopus and the deep species: `BREED[k].needs`); the species that already bred still breed anywhere, and lay half as many again at their habitat.
- What stands within reach of a habitat nudges the young's genes (`habitatNudge`): glow, hardiness, size, longevity, luck, the mark, or curses from litter and carrion.
- `updateBalance` (every 3 s) keeps numbers in check without crashes: a kind over `max(10, 1.5 × target)` fights (the weaker can die) and breeds the rot; a kind down to its last three is spared blights and sickness, seeks out mates and breeds sooner.

## Fossils and artifacts (js/artifacts.js)
- Fossils have grades (ammonite 50 … relic 0.5 by weight, rarer ones more often in deeper tiers); rarer ones pay more and hold the rarest of 1 + grade ancient-gene draws. A relic holds an artifact not yet found.
- Artifacts are the "meta" controls from the sky tracker: storm glass (weather), moonstone (tidal range), tide bell (held high or low water), wind conch (surf), each for a day or half a day and then resting half a day; and passives (heart of pearl +25% pearls, lodestone ×1.5 erosion, eye of the deep ×2 deep arrivals). Hooks: `metaWeather` in `updateWeather`, `metaTide` in the sky. Links carry a bit field of the artifacts found.

## Waves and the sky
- Waves were redone for the deep: longer, faster wavelengths as the swell grows (`L1 = 40 + 50·swell`), each face lit or shadowed by its slope (`waveS`, up to about 50% toward white on the biggest), so big water reads as big. Whitecaps are sparse spray along the very tops of big crests (per-pixel hash with good bit mixing, gated by the patchy noise). The first try used the Worley tile as the gate and made solid blobs, and the old low-bit hash made stripes.
- Calm water shows a sky reflection: a 128² cloud tile drifting across, mixed toward a sky colour for the time of day (`skyReflection`), fading with swell and rain.

## Build animations
- `s.anim` on a new structure: an island rises from bubbles, a ship falls and settles, deep monuments rise with an omen. `applyIslands` and the bake skip it until it settles (about 3 to 9 s). Spawns get a burst (`spawnFx`).

## The seamless beach
- Replaces the page-load walk. The pond beyond each end is rendered from its save (`snapshotPond`, a temporary world) into a `canvas.beyond` placed beside yours, turned (`view.r`, quarter turns; `worldToScreen` and friends are rotation-aware) so its beach lines up with yours, at the same zoom.
- Dragging on past the end lets the camera run free into it. Letting go past `crossNeeded()` swaps the world in place (`crossTo` with `layout(true)`), keeping the zoom (`view.minK`) so the pixel density doesn't change; sooner, it glides back. The pond you left waits behind you as a captured snapshot. Clicking the tab still asks first.
- `updateGlide` moves at least a pixel a frame: `applyView` rounds the view, so a smaller step stalled and left `view.free` on forever.

## The side view
- The "two tone" the user saw was the side view: a flat tan block for the beach against charcoal rock. It now takes the floor's own colours (from `bg`) with depth shading and sediment.
- Drawing the neighbour past the end of the beach fetches its save with `GET /api/ponds/:id?peek=1`, which counts no view and doesn't refresh `opened`. Otherwise just standing at the end of your beach would add views, and so litter, to the ponds either side and keep them from expiring. Walking in still counts, through the observer's normal re-fetch.
