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

## Deep water without the haze; islands in terraces; tabs clear of the menu
- The first sky reflection mixed a smooth cloud tile toward the sky colour everywhere. Over the dark deep that read as a gray smear (the user: "gray/void space"). Now:
  - Calm water shows the sky only as short ripple dashes on 4 px bands, each on its own line within the band. They drift, twinkle (reroll every ~2.5 s per segment) and crowd and brighten under bright cloud.
  - The deep's darkening over the floor is quantized to dithered 12-level steps with a slow murk (cloud tile at half scale, drifting). Wave faces are quantized to four dithered steps. Nothing smooth is left to read as haze.
- Islands go to 10 levels (`ISLAND_MAX`). Radius grows `islandGrow` = +16% per level to 5, then +12%, and the cost is ×1.35 pearls and ×1.25 essence per level.
- Each level is a terrace: a low plate, 0.55 high, off-centre by hash, with a soil rim (`islandTerraces`, cached on the structure). They stay low so basking animals still show. Everything on the island stands on the terrace under it (`islandTopAt`): tufts, rocks, palms (up to 8), flowers, the stone and the lanterns.
- The branch level caps at `min(6, stack − 2)` (so level 5 still allows 3, as before) and costs ×1.3 per level. The dark island's reach grows more slowly past branch level 3.
- Links: the old stack field is 3 bits (max 8), so a new trailer block after the artifacts carries every structure's full stack.
- The west edge tab (beach across the screen) sat over the open menu. `placeEdgeTabs` moves any tab that overlaps `#hud` beside it, or below it for a vertical beach, and runs from `edgeHints`, `setHud` and a ResizeObserver on `#hud`.

## Depth cues, light, the narrator, light vs madness, super spawns, keep safe (js/story.js, js/lineage.js, js/depths.js)
- **Light pools.** A 4 px light map is rebuilt each frame over the visible rect plus 90 px (`buildLights`). Sources are creatures (per-species radius and optional beam along the heading), the glow gene, paragons, transcendents, glowing and deep plants, and neon structures. Compose samples it bilinearly after the tint, quantized to 5 dithered steps. It shows by `max(darkness, depth/280, 0.1)`, and lights under 10 px are spread to 10, since smaller ones showed the grid. Palettes: salt cyan/blue/magenta, fresh foxfire green/amber/violet. Render went from about 12 to 13 ms.
- **Deep look.**
  - `deepColor2` blends in with depth² per tier from 5 on (`TIER_DARK`).
  - Creature pixels lose up to 78% of the depth darkening as z nears the surface, so rising and sinking show.
  - Dry land (`shore > tide`) is never depth-darkened or trenched. Islands in deep water used to go dark.
  - Glowing marine snow appears from tier 2 over the deep.
- **Trenches.** From tier 5, `carveTrenches` in buildDepth marks up to 4 meandering chasms in `world.trench` (derived, not stored). Compose draws them black with sparse rim glints; their depth is 255.
- **Vertical movement.**
  - `deepZ` (called from `Fish.wander`, school wander and the cave school): over the deep (d >= 0.25) the target z rises at night (45-100% toward the surface) and sinks by day (0-30%). Big deep predators and mythics surge to the top 18% of the time.
  - Fresh day fish still rest low at night; that's their activity rule.
  - `updateVertical`: the kraken and squids lift off the floor now and then.
- **Waves.** A shallow chop train (10 px wavelength) scaled by gust and surf fades out by depth 160. Spindrift streaks over depth 110 appear when swell exceeds 0.75.
- **Scour and sturdiness.** Scour matures in 12 days (was 25), is stronger (150, was 110) and wider (20 + 30k). Each source keeps a plinth (the footprint shallows to 25%) with a moat. Islands no longer scour.
- **Deep islands.** `islandDeepCost = 1 + 5*d^2` applies to both the build and the raise; `s.deep` is stored at build. The profile exponent is `2 + 8*deep` (a cliff), and the bake adds a basalt ring when deep > 0.15.
- **Narrator (story.js).**
  - `madnessNow` = 0.32*tier/8 + 0.3*corruption + 0.23*marked share + 0.15*darkAvg. `S.m` ratchets up quickly and ebbs very slowly, more slowly in the dark. Stage = floor(m*5.2), with 5 voices.
  - Lines per kind: arrive, deep, mythic, tier, fossil, relic, unlock, mark, super, island, build, dusk, dawn, worse, better.
  - Rate limit 25 s except for important kinds. Journal category `story`; the strip sits under the banner. Firsts are keyed in `story.said`.
- **Light vs madness.** `lightMadness` = 0.4 + 1.3*(0.45*dark now + 0.55*darkAvg), range 0.4-1.7; `darkAvg` is an EMA over 1.5 days. It scales:
  - `eldRate` (x1.3*lm, replacing 1 + 1.2*dark);
  - dreams;
  - quirk chance;
  - madness infection;
  - the dawn madness cure (x(2.2 - lm));
  - how fast fits clear (x(1.6 - 0.6*lm));
  - corruption yield (x(0.7 + 0.3*lm)).
- **Super spawns (lineage.js).** Line milestones at 3/8/20/50 (from `scoreRare`, deferred a tick) and species points at 150*4^i (from `award`) push `{k, traits}` to `G.supers`. `claimSuper` spawns the species: the first is a paragon (meetGrade 5; the line's ancient traits and gifts re-applied after grading; one extra gift; curses cleared; trait `paragon`, rarity 4, gold outline, buffs); the rest are graded Superb. No wild species.
- **Keep safe.** `life.safe`: `recycle` refuses; `recycleAll` skips and keeps the target count. There's a card button and a census lock.
- **Links.** A new trailer after the stacks: flagged animals (safe bit 1, paragon bit 2); super spawns (kind code, trait indices into `Object.keys(TRAIT_RARITY)`, append-only); each structure's `deep * 100`.
- **UI.**
  - The ticker wraps up to 3 lines, and pri-3 news gets a banner. `placeNews` keeps the banner and narrator below a vertical west tab.
  - The ticker keeps its 360 px width. Widening it squeezed the dock, and in a mixed pond the dock squeezed the ticker to 130 px, so wrapping is the fix, not width.

## The deep, second pass (the user: "squiggly lines", "glowing too much in one spot", "waves still look like shit at depths")
- Reproduced on the user's own pond (a tier-8 fresh pond, 1160×1920, about 700 animals, including a horde of about 570 koi, many transcendent). The save was read from the DB read-only, POSTed to the local mock, and opened there, so no view was counted.
- **Trenches** zigzagged because value-noise meanders were ±35% of the deep band with sharp V corners. Now there's 1 canyon (2 from tier 7), meandering by two sines (±5% and ±1.2% of the band), 9–14 px wide. Encoding: 0..127 how far in, +128 on the lit side. Drawn as a black floor (v > 0.62), walls in two dithered steps, a lit lip with sparse glints, and a shadowed far lip.
- **Light** was a flat colour fog, strongest where hundreds of transcendent koi each cast violet. Changes:
  - The creature lights get one per 12 px patch.
  - The transcendent light is smaller and fainter (radius 9–15, 0.35).
  - Radii and strengths are cut for plants and structures.
  - Compose now brightens the floor (`c·L·1.6`) plus a small tint (`L·46`), with soft saturation `L/(1+L)` and 4 dithered steps.
  - Visibility is `max(darkness, depth·0.45, 0.06)`, so it's faint by day even over the deep.
- **Deep waves.** Crest strokes were tried and dropped: straight ones looked like ruled paper, and phase-warped ones scattered into noise. Now wave marks: level arcs on a staggered 18×11 grid, drifting with the swell, each with its own life cycle (swell, break, gone), density and strength by swell and depth (depth > 50). Ripple glints thin out over the deep (×(1 − 0.65·depth)); murk is halved; the tier tint goes halfway.
- **Culling.** Plants, pads, structures and creatures well outside the visible rect aren't drawn (margins 30–220 px). On the user's pond at 2× in a 1400×900 window: about 72 → 68 ms in the horde view (it's mostly the ~500 koi on screen), and off-screen plants are free now. Compose is about 28 ms for 280k px (bare 9 ms).

## Cheaper crowds, pixel tooltips, hunger-driven hunting
- **Crowds, measured on the user's pond** (a 570-koi horde, about 470 on screen at 2×):
  - Drawing the koi took 22 ms, about 90% of it the spine: 9 tubes each, with each pixel tested by up to three overlapping capsules.
  - `Raster.strip` draws a whole spine in one pass: each pixel takes the link it's deepest inside (the highest point, as the z-test would), with a per-row active list. Buffers compared pixel for pixel against the tube-per-link version: 0 depth or id differences, 35 colour differences out of 122k painted pixels (texture seams at link joins), and shadow-caster differences where overlaps used to over-cast. At 10× the two are visually identical.
  - Crowd LOD: `r.lod` is 1 over 140 animals on screen and 2 over 280. It drops small fins (koi, wild fish), then the tail joint and eyes; the eldritch extras lose lumps and rune rings and keep 1–3 short tentacles. What you follow, hover or hold, and mythics, stay whole.
  - `Raster.begin` clears only the clip (a 1160×1920 pond was wiping 2.2M pixels a frame).
  - The light lookup is a single dithered cell instead of bilinear.
  - Adaptive `QUALITY`: an EMA of render ms. Above 38 ms it steps down (1 drops clouds, chop and spindrift; 2 also drops lights and caustics). Below 18 ms it steps back up, with 2 s and 5 s hysteresis.
  - Horde view: 68 → about 55 ms in the 1400×900 test window (compose, the per-pixel surface work, is still about 25 ms of it).
- **Tooltips (js/tips.js).** The `HTMLElement.prototype.title` setter is rerouted to `data-tip` (and existing title attributes are converted on load), so every title in the codebase, including ones set later, becomes the pixel tooltip, with no native ones left.
  - Format: "Head\nbody", or a short "Head: body".
  - It shows after 280 ms, follows the pointer and flips at the edges.
  - Icon buttons fall back to their aria-label.
  - Tools, builds and plants get written descriptions (`PLANT_TIPS`, `toolTip`).
  - In the pond, `worldTipAt` covers fossils, litter, remains, structures, eggs, plants, rocks and trenches (not animals: they have the hover card).
- **Hunger.**
  - Eating an animal gives energy 0.2–0.8 by the prey-to-hunter width ratio (was a flat 0.55), and sets `satedUntil` = t + 18–88 s (×0.4 if ravenous). Sated predators don't hunt.
  - Search radius ×(0.55 + 1.1·hunger); pursuit is kept up to 60 + 110·hunger px; chase speed ×(1.05 + 0.4·hunger) (was 1.25).
  - Starving (hunger > 0.75): `desperateFor` also allows prey under 0.6× its width that isn't a deep predator or mythic, including its own kind's young.
  - Moods "starving, hunting" and "sated after a kill".

## Tabs clear of every panel; the walk without bounce; sand; a river that moves; reshape cost
- **Tabs.** `placeEdgeTabs` avoids every open panel in `TAB_AVOID`, not just #hud, stepping beside, below or above it, or hiding if there's no room. It's re-run by MutationObserver and ResizeObserver on those panels. The bug behind the user's screenshot: fixed panels have no `offsetParent`, so the first version skipped them all.
- **Walk model** (replaces free/glide/spring-back):
  - `beachRange` clamps the view along the beach to the pond's own range. It extends past an end by the neighbour's length only if `view.reach[side]` (set from `viewAtEnds()` at pointerdown or key press) or the view is already past that end (`view.lastTx`/`lastTy`). Ordinary panning runs into the edge; a drag from the end runs on over the neighbour; letting go leaves it there.
  - `checkCross` crosses once the screen middle is past the seam by `CROSS_MARGIN` (24 px). `crossTo` swaps in place (the pond is placed at its picture's rect, BEACH updated first, `lastTx`/`lastTy` set), so nothing moves. The only easing is across the beach when the new pond is shorter than the screen needs (`glide.perp`).
  - Go (tab) and Return use `walkTo(side)`: a glide that crosses on the way.
  - `canvas.beyond` now takes pointer events (a pan-only press), so you can drag the neighbour's picture.
  - Observed ponds keep their save (`world.observe.save`) so they can be walked back into after leaving them.
- **River.** Courses are indexed `k = floor(day/period)`, with period 9–18 pond days from the seed; course 0 uses the old seed string so existing ponds keep their first course.
  - Over the last 18% of a course the next one breaks through (a shallow narrow cut); over the first 35% the old one silts up (its bed rises to 0.4).
  - Bends grow ×(1 + 0.7·age/60 days) and creep with day-based phase drift.
  - Width grows faster (`RIVER_GROW` fresh 1.5, mixed 1, salt 0.55; age by /90 days) with a ±14% season.
  - Everything uses `riverDay` (floor(days) + 0.5), so it's stable within a day, derived, and link-exact.
- **Sand (js/sand.js).** `applySand` runs before the river (the river cuts through it) and writes `world.sand` (tint amount) plus raises the shore up to a cap, so crests reach about the low-tide line (bars 0.42, delta 0.37, spits 0.45).
  - Sandbars: 2 lines at band×1.05/1.43, shoals by fbm along the beach, creeping `days·(1.3 + 0.8k)`, built up over 28 days, ×surf by habitat.
  - Delta: a fan with a noise-modulated edge that fades in from the mouth (no hard edge); the old course's delta wears away.
  - Spits: curved, waisted, ragged, low in the middle, growing from both ends (islands over 14 days, others 24).
  - Plant beds: 24 px cells with at least 3 aged plants tint the floor only (the shore isn't raised, so fish can still swim there).
  - `sandOver` draws a paler floor with ripple marks.
- **Reshape cost.** Dawn used to reshape only on changes; now the beach changes daily. On the user's 1160×1920 pond:
  - The bare beach (`shoreBase`) is cached by size, side and band; its per-pixel fbm cost about 150 ms.
  - `buildDepth` is cached by key (size, expand, side, seed, tier, `scourKey`).
  - Scour sources update every 5 days, rocks group per 28 px cell, plants no longer scour, the noise comes from a tile, and it's computed on a half-resolution grid. Hollows are capped (R ≤ 52, depth ≤ 120) and trail toward the deep instead of forming a moat ring: at tier 8 the old version made 110 px crater rings.
  - A daily beach change does `makeShore` plus a partial bake of `beachRect` (band×2.9 + 40) plus `applyStains` on that rect: 2.7 s → about 0.25 s. The partial bake matches a full bake pixel for pixel except at most 8 edge pixels.
  - A full rebuild (islands or scour changed) is about 1.3 s on that pond, every 5 days at most.
- **Review of all 40 user messages.** Every request was checked against the code and tests. Two gaps turned up: the scour craters (fixed above), and the lineage fix (`canSuper` referenced the global `world`, which broke in the Node harness and was a latent bug).

## The deep past, rage and the dice, the heavens, oil, icons and the quick bar, stutter and flicker
- **Stutter (every minute).** The once-a-second O(n²) neighbour loops (eldritch absorb/psychic/keep-away, quirks) now use a shared 48 px grid (`nearGrid`/`forNear` in life.js, rebuilt at most once per frame). Quirks only scan neighbours for creatures that have a spreading quirk. Dawn work is sliced into a frame job queue (`queueJob`/`runJobs`, 12 ms a frame): partial bakes in about 110k px bands, stains per rect at half resolution, island change rects instead of a full `structuresChanged`, and depth rebuilt incrementally over the rects the scour changed (verified equal to a full rebuild). The worst dawn frame on the user's pond went from 1.6 s to about 90 ms (about 230 ms on a scour day).
- **Night stalls from rage.** Once the enraged joined the hunt, a marked horde (the user's pond: hundreds of transcendent koi) meant hundreds of hunters each scanning every animal four times a second: `assignHunts` took 45–70 ms a call at night. Hunters now look only within reach through the neighbour grid (`forNear`, R×1.5, prey and predators stamped per pass), the threat pass is grid-based too, the merely enraged re-target every fourth pass on their own beat, and body widths are worked out once per pass (`widthOf`). Long frames over 150 s on that pond went from 71 to 10; `assignHunts` no longer shows among the slow jobs.
- **Tooltip flicker.** Panels that re-render replace the element under the pointer. tips.js now carries the tip over to the element now under the pointer (same text: no flip), with a `pointerout` guard. 0 flips in 241 frames on the census.
- **Notices stack.** `placeNews` stacks the observe bar, follow chip, banner and narrator below the pond bar and the vertical west tab, re-run by MutationObserver, so they never overlap.
- **Look-only lock.** A pond meta flag `lock` (server `cleanMeta` keeps it as a boolean). A locked pond's short link opens in observe mode (`observe.locked`), never as a copy. Set from *Your ponds*.
- **Rocks and ships don't glow.** `NO_STAIN` (ship, island, gate, cradle, spire, ossuary, aerator, lantern) have no ground stain; rocks never did light, and now leave no stain either.
- **Heavens (js/heavens.js).** Clear spells run 150–420 s (rain 20–50 s). A glass day at 9% of dawns: no gusts, still tide and surf, the swell nearly flat, fog ×0.3, sky reflection ×1.4. An eclipse at 2.5% of the other dawns (dark at midday). At dusk, with `dark` = 1 − 1/(1 + corruption earned/500): the stars come right at 0.4% + 3%·dark·(darkAvg + 0.3); else a blood moon at full moon (30% + 30%·dark, at most every 12 days); else 16% of nights a weighted meteors 5 / aurora 3 / comet 2 (a comet stays 3 nights). Blood rain is decided when rain starts: always when the stars are right, half the time under a blood moon, and 12%·dark otherwise. `heavensMadness` multiplies into `lightMadness` (cap 3). The aurora tints both the calm-water sky and the night light (it was invisible under big waves).
- **Rage and the dice (js/nature.js).** `rageOf` = 1 + 0.35·darkness·sky, plus eld stage, plus feral. Enraged = feral, or marked at stage ≥ 1 with darkness > 0.45: they join the hunt whatever their hunger and take anything under 0.8× their width (not mythic, not other changed marked). Brawls with equals (±35% width) at 8%/s × rage; the loser bleeds and can die. Warps come from 2d6 (withered 2, nocturnal 3–4, darkloving 5–6, feral 7, vast 8, predatory 9, manyeyed 10, tireless 11, abomination 12), rolled on stage change, 35% on absorb, and 0.4%/s on red nights. They're saved and linked (a trailer with a 16-bit warp field and size ×100) and shown as traits. Darkloving swaps `likesOf` to the dark things; nocturnal and tireless change `activity`.
- **Blood and the chase.** `Blood` effects (capped with the other effects), `bloodSpots` for 20 s; idle hunters under 85% energy head for blood within 180 px (plus senses). A hunter within 60 px of its prey leaves bubbles; the prey jinks.
- **Oil (js/pollution.js).** Wrecks: `wreckScale` = 1 + 1.3·depth (size, footprint, dawn salvage ×big²); `wreckCost` = 1 + 4·depth² (so up to ×5). The oil rig (tier 3, deepMin 0.35, 3500 pearls and 200 essence) leaks into slicks (at most 14, radius ≤ 46) that drift, thin, sour animals and wither plants, count as pollution and litter for comfort, and are skimmed by clicking them. Past 2600 total oil the tar wakes: it crawls toward oil or plants, grows by eating slicks, withers plants, rots or marks animals, and starves below size 4.
- **The deep past (js/prehistoric.js).** Tiers 9–11 are fixed names (Cambrian/Carboniferous, Devonian, Permian/primordial) at erosion 300/450/680 (200·1.5^(i−8)); `ensureTiers(40)` makes the rest at load with made-up names (tier 40 needs erosion around 10⁷, so no pond will reach the end). The evolution tree lists up to one tier past the pond's own. Each tier adds 0.3 (the deep past) or 0.2 of the base size, capped at `MAX_DEEP_PX` = 2800 px of expansion in all. `deepTint` goes a further 25% toward black per tier past 8 (up to 80%). Twelve species (7 salt, 5 fresh, the coelacanth in both) with their own classes, `KIND_CODES` 39 → 51 (room to 64), server `SPECIES` updated, and the server's erosion cap raised from 500 to 10⁷ (the user's pond was at 300.9 and would have been clipped). They breed in the brood chamber and each casts a faint light so they can be made out in the dark.
- **Icons and the quick bar.** `drawnIcon` renders any drawable with the pond's own renderer into a 192 px raster, measures it, and redraws it scaled so its longer side is 14 px (structures shrink, pellets grow). Icons are drawn a few at a time after start (6 ms slices) so the first frame isn't held up. Usage (a pick and each use) is counted in localStorage (a per-browser convenience; it's fine if it's lost). With the menu hidden, `#quickbar` shows the 8 most used tools that this pond can use, filled up from defaults, and always including the tool in hand.

## Accounts (Discord), wanderers between ponds, investments that pay
- **Sign-in is optional and off by default.** The API turns it on only when `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` are in its environment; otherwise `/api/auth/discord` is a 404 and `/api/me` says `auth: false`, and the page shows nothing. Scope `identify` only.
- **OAuth flow.** A random `state` is kept in memory for 10 minutes and bound to the browser by an HttpOnly cookie on `/api/auth`; the callback needs both to match and uses each state once. The way back is limited to `/` or a pond path. Errors are logged without the query (it can hold a code).
- **Sessions.** A 24-byte random token in an HttpOnly, SameSite=Lax cookie on `/api` (Secure when `PUBLIC_URL` is https), stored only as its SHA-256, for 60 days, pruned daily. Writes made on the session (claim, owner updates, logout, wanderers) also check that any `Origin` header matches the host.
- **Ownership.** `ponds.owner` (Discord id) and `show_owner`. A pond is claimed with its key (409 if someone else owns it). Its signed-in owner can PUT without the key, from any browser, and opening it returns `mine: true` and counts no view. Owned ponds are never pruned.
- **Names.** `meta.by` is written by the server from the account's name, only when the owner ticks *Show my name* (`meta.showName`, per pond), and it is refreshed on sign-in. The page never supplies a name: `cleanMeta` drops `by`, and `publicMeta` drops `showName`. Names are NFC, control characters and `<>` stripped, 32 characters max, and shown with textContent. Avatars are stored but not shown (the CSP's img-src is self only).
- **Sync between browsers.** `/api/me` lists the account's ponds with their `days`. On boot, a local save of an owned pond is replaced by the server copy when the server is further on in pond time (`days`, not wall clock, so clock skew doesn't matter). A pond opened from the account on a new browser gets `link: { id, key: null }` and syncs by session. If that browser signs out, a failed PUT doesn't fork the pond into a new link (`pushPond` rethrows 403 for keyless links) and the page asks once to sign in again. Signing in claims every local pond that has a key.
- **Wanderers.** Fierce = predator by nature (`DEEP_PREDATORS`) or woken or built up in the hunt (hunt levels ≥ 4), feral/predatory/abomination warps, eld stage ≥ 2, or already a wanderer; never mythic or wild. A fierce animal leaving (not dying of age) joins the pool 70% of the time, if the pond has a link. POST needs the pond's key or its owner's session, 8 per pond per hour. The pool keeps 400 for 14 days. `take` picks at random from those of the kinds the page lists (fits its habitat and depth, not mythic) and not from its own pond, deletes it, and returns it with its origin and the origin's shown name; 20 per address per hour. Dawn odds 6%, needing at least 6 animals. The server rebuilds a wanderer from known shapes only: kind in `SPECIES`, a flat genome of numbers and flags (keys `^[a-z][a-zA-Z0-9]{0,23}$`), plain-word lists, clamped numbers. On arrival it's enraged (`enraged`, rage +0.6), red-edged (`WANDER_OUTLINE`, kept through saves), counts its kills (eaten and torn apart), and after 0.7–1.6 pond days it leaves as "wandered on" (and so may go back into the pool).
- **Investments.** `spend`/`spendEssence`/`spendCorruption` take a category; everything lasting passes one (food passes none). `invest` adds pearls' worth (essence ×5, corruption ×8) to `G.inv[cat]` and awards a tenth as points straight away. The dawn dividend is Σ ledger × rate (build 4%, plants 5%, life 3%, evolve 5%, deepen 4%, dark 4.5%) as points, and a 25th of that as essence; then life decays ×0.97, evolve ×0.98 and plants ×0.99 a day. Structures carry `worth` (cost plus upgrades, saved as `w`), which comes off the ledger when they're taken down. A new depth tier pays 150·tier² points. Points go through `award`, so the habitat multiplier and size fairness apply, and the server's point-rate cap still bounds what the leaderboard accepts.


## Calmer surface; crowds that don't heap or stretch plants
- **Stretched plants.** `pushFrom` summed a push from every animal in reach with no cap, and eelgrass/weed bend by 6× that per segment, so a heap of a few hundred animals (the user's transcendent koi) bent blades hundreds of pixels across the pond. The push is now capped at one animal's worth (unit length) and looks only at neighbours through `forNear` (it used to scan every animal for every plant, every frame). The anemone's "something near" check uses the grid too. Worst case in a 200-koi heap: blade tips move about 9 px.
- **Personal space.** Only schooling fish had separation; koi and the rest had none, so a horde heading for one spot stacked on it. `Fish.personalSpace` eases each swimmer away from others within min(16, 2.2·w0 + 5) px (up to 14 neighbours, within 8 in z, not its prey), recomputed every 0.25 s on its own beat, strength up to 1.4 against a unit goal, and ×0.3 while it's going for food or prey (so feeding and hunting still close in). Schools keep their own boids. A 200-koi heap aimed at one point spreads from 0.2 to about 3 px nearest-neighbour. Four 300 s sims each way: catches 18.5 vs 17.3 on average, births 62 vs 64, same render time.
- **Spawns spread.** `openSpot` takes the least crowded of a dozen open, wet, rock-free spots (count within 40 px); groups of 3+ fan out around it (`spreadGroup`).
- **Slower surface.** Measured as pixels changed per frame on the user's pond with animals frozen: shallows 0.47% → 0.15%, deep 0.07% → 0.03%. Caustic scroll ×0.4, swell ×0.45, chop 14 → 4, wave marks drift ×0.4 and live about twice as long, sky glints drift 1.5 → 0.45 and re-roll 0.4 → 0.08 per second, sparkle hash 2 → 0.4 Hz, refraction wobble ×0.37, clouds ×0.5, the surf ×0.65. Sun glints: fewer (×0.43) and each lasts 0.9 s instead of 0.35.

## The hatchery: pens, turns, rests and lines bred forward; fights capped
- **What went wrong.** The user's 574 koi were all generation 1 from one pair: the hatchery bred from its single stocked pair every few seconds at their levels (a brood of 8 about every 8 s), stopping only at maxPop + 40, and hatched every brood within 14 px of itself. That horde was the "heap" and, marked and enraged at night, it fed the fight die-off below.
- **Pens and turns.** The stock is a list of records; pairs are the first two of each breeding key in stocking order (`hatchPairs`), and a lone record waits for its mate (`hatchSingle`). Slots are 2 × (1 + pens), pens up to 4 (essence, 40 × 2.2^level). Broods rotate over pairs (`H.turn`), skipping resting ones. A stocking that doesn't fit is refused with a reason (it used to push the oldest out silently).
- **Rests.** A pair rests while its species (frogs counting tadpoles) has at least `hatchCap` = max(10, 8% of maxPop) in the pond, and a brood never takes it past the cap. When every pair rests, the food keeps (up to three broods' worth).
- **Slower, more tiers.** Feeder 0.1 food/s a level (was 0.25), up to 12 levels; scoop +0.5 a level, up to 12; tank +1 young every other level, up to 10 (2 to 7 a brood; was 2 + level); incubator cost 60 × 0.93^level, up to 10 (was 40 × 0.85^level); lamp and filter up to 8. Growth factors are 1.4 to 1.6 a level. At the user's saved levels a brood is now about every 50 s and 5 young (was about 8 every 8 s).
- **Bred forward.** After each brood, the young that scores best on the focus (gene value, or rarity tier, or the mark) replaces the weaker parent in the pen if it beats it (by 0.02 on a gene); the parent is released to the pond. Generations climb (gen 4 after a few minutes in the test, size 1.0 → 1.49).
- **Fights capped.** Brawls among the enraged were 8%/s × rage per animal with no pond-wide limit; hundreds of enraged marked koi meant dozens a second, and "torn apart" deaths took a copy of the user's pond from 656 to 557 in a quarter of a night. Now 1%/s × rage, at most 16 fights a pond day and 3 of them to the death (after that a loser's energy doesn't fall below 0.1), and red-night warps at most 4 a night. The same quarter night now loses 21 (mostly ordinary predation and hunger).
- **Crowds spread.** Liked spots draw less where it's crowded (the chance of heading for one is 0.55 / (1 + crowd/6); each spot's weight is divided by 1 + its crowd/4), random destinations are the least crowded of the first four good ones, and an animal in a crowded cell commits to its destination for 12–20 s at near full cruise. `crowdAt` counts the animals in the 48 px neighbour-grid cell.

## A new pond starts clean; the tar can't feed itself
- **Carry-over.** `buildPond` reset the older per-pond fields but not the ones added since: `slicks`, `tar`, `heavens`, `bloodSpots`, `natureDay`, `story`, `darkAvg`, `meta` and `weather`. A pond started in the same page (New pond) inherited the last one's oil, tar, sky event, narrator stage and blood rain. They're all reset now; restoring a save sets its own right after.
- **The tar.** It bled a new slick at 0.6 oil (spillOil's floor of 0.4 plus 0.2) and ate slicks at +6 size per unit of oil, so it grew several times faster than it starved and never died. Its bleed now starts at 0.25, is marked `fromTar` (saved as `t`), merges only with its own, and the tar neither eats nor heads for it. With no rig, a size-12 tar starves in about 4.5 minutes, or about 11 with two old slicks to eat.

## The constant bubbling
- **Found by measurement.** The user heard near-constant bubbling they couldn't place. With the sound engine instrumented, copies of all three live ponds played the splash plop about 7.5 times a second (its cap of 8) and the bubble blip about 1.4 a second (its cap of 1.5), day and night. The plops were almost all duck wakes: every swimming duck and duckling made a wake ripple every 0.35 s, and every non-silent ripple plays a plop (about 10 a second requested, in a pond with 6 ducks). The bubbles were fish breathing (each fish at 0.04/s).
- **Fix.** Wake ripples are silent. Only a burst of 3+ bubbles is heard (one blip for the burst: feeding, hatching, an octopus jet, an arrival, building), and single bubbles (breathing, chase wakes, aerators, vents, springs, the ship) surface silently. Caps lowered: plops 8 → 3 a second (bank 4), bubbles 1.5 → 0.6 (bank 2). The same pond now plays about 1 plop a second (frogs hopping in and out, fish taking food at the surface) and a bubble every 20 s; the deep pond plays none.

## The rail, the actions panel, pins; one window at a time; sticky titles
- **The rail.** A fixed column down the left: ☰ (the menu; `#show-hud` now toggles it and stays), the pinned actions (`#quickbar`), and ▸ (`#rail-more`), which opens `#actions`. The menu moved right (left 64px) to sit beside it. The menu and the actions panel take turns (opening one closes the other).
- **The actions panel.** Tools and builds left the menu. Five kinds, each foldable and remembered in localStorage (`pond.actCats`): Food (`t.food`), Tools (the net), Plants & rocks (the plant tools and rock), Build (`#builds`), Creatures (`#act-life`, the dock's species, built the first time the panel opens, spawned through the spawn card). Tiles are icon and price only; the name is in the tooltip and aria-label (a visually hidden `.lbl`). `#tools` now wraps the three tool kinds, so selectors use `#tools [data-tool]`.
- **Pins.** Hovering a tile shows a + (a span inside the button, so a click on it doesn't pick the tool); on the rail it shows −. Pins are tool names or `life:<kind>`, kept in localStorage (`pond.pins`). Until anything is pinned, the rail shows the most used (as before). The first pin starts from what the rail showed. Pins the pond can't use (wrong habitat, too shallow, not unlocked) are left off the rail, not forgotten.
- **One window at a time.** `WINDOWS` in hud.js lists the cards and panels; each one's opener calls `closeWindows(itself)`. A click in the pond (not a pan or drag) calls `closeWindows()` before doing what it does, so clicking another thing opens its card in place of the last. An automatic card (following, touring) doesn't close the others. The actions panel and the menu aren't windows and stay.
- **Sticky titles.** `.pop > header` and the spawn card's head are sticky at top −10px (the scroll box's padding; 0 stuck 10 px low) with an opaque background (the panel colour is 86% opaque, so scrolled text showed through).
- **Spawn card placement.** Opened from the rail or the panel, it sits beside them rather than above the dock.

## NEW badges, built one-of-a-kinds; the alien: artifacts, parasites, contagions, the evolved
- **NEW.** `G.seenAct` (saved with the pond) lists the tool keys and `life:<kind>` keys the pond has shown you. A pond's first look (no `seenAct` yet) marks everything available as seen, so nothing is flagged on an existing pond. `markNew` runs at the end of `refreshSpeciesButtons` (so on tier changes, unlocks and habitat changes). A tile is seen on pointer-out after hovering it, or when clicked (delegated on `#actions` and `#animals`). ▸ shows the count for the panel (not the dock).
- **Built.** `markBuilt` greys `button[data-tool^="build-"]` for `unique` structures already in the pond (hatchery, idol, gate, cradle). A capture-phase document click listener stops them being picked and says why. It runs on build, demolish, the rail's redraw and every refresh.
- **Deeper.** Tier names 12–14 are real (Starfall trench / Fallen-star mire, Glass garden / Grey fen, Other sea / Other water); made-up names start at tier 15. `MAX_DEEP_PX` is 4200 (was 2800).
- **Artifacts** (`world.xeno`, saved): from tier 9 a dawn roll of min(0.35, 0.04 + 0.05·(tier − 9)), up to 6, and 30% of meteor star-stone falls at tier ≥ 9. Gen +1 on 40% of dawns (to 9). They release at 0.0025·(1 + 0.25·gen)/s (×2 at night) once 0.3 days old. The Net breaks one (60 + 20·gen points, 10 + 5·gen essence); 45% leave a shard (`world.xenoShards`) that regrows in 2–4 days at gen + 1. Drawn live (culled), with their own emissive ids, lit via `xenoLights` in `buildLights`.
- **Parasites.** Larvae (`world.parasites`, at most 30, saved) seek the nearest hostable animal within 90 px (not mythic, not already ridden, not immune through its own evolved trait) while ridden hosts are under 25% of the pond (eaten hosts can push it a little past that: 32% in the sim), and die after 120 s or in a quarantine lamp. On a host (`L.para = { k, gen, since }`, saved) they drain 0.0015 energy/s, add their trait (`latched`/`coiled`/`sporing`, via `eldTraits`), breed at 0.0008·(1 + 0.2·gen)/s (×1.5 at night, gen + 1 half the time), and infect their host with their contagion at 0.004/s. They jump off a dying or leaving host as a larva, and into a predator that eats their host (`paraEaten` in `eat`).
- **Contagions.** Three new `ILLS` (glassing, xenofever, spore) with names; `infect` messages use the name, and dawn clears them at 0.25 + 0.4·resilience. Spread (alien.js, per second): spore to any kind within 8 px at 0.0015 (not to spore-bearing), fever and glassing to their own kind at 0.0012 and 0.0008. Fever makes 0.1%/s leave; spore kills a weak host (vitality buff < 0.8) at 0.04%/s. Neither acts on the last few of a kind.
- **The evolved.** One roll a dawn for the pond: min(0.08, 0.02·(top gen − 2)) among hosts carrying gen ≥ 3 for 0.8+ days (not mythic, not tadpoles). The young is its host's kind, with a genome from `childGenomeFor(seed, host, host)` and `genome.xeno` = the trait's index + 1 (append-only list). It has a thick outline in the trait's colour, is scored through `scoreRare` (the traits have rarity 8, so one alone is Mythic, and the server knows them for finds), and gets a narrator line. Inheritance is a sixth stream (`genome6/<seed>`, `childXeno`): both parents with it, 85%; one, 50%. It isn't in pond links (the JSON save and server copy keep it). In a 20-minute sim with three gen-3+ artifacts: hosts plateau at about 25%, larvae at the cap, contagions come and go, no collapse, and no evolved (one forced one passed its trait to young).
- **The quarantine lamp.** Tier 10, 1800 pearls and 150 essence, radius 70 (more with reach).

## The bestiary (58 more species) and the guide
- **Designed species** (`js/bestiary.js`): one catalogue (`DESIGN_LIST`) of kinds on three bodies: `DesignedFish` (a `WildFish` with a hand-set `sp` and drawn extras: snouts, barbels, fangs, horns, crests, spines, stilts, wings, plates, a tooth whorl, a see-through dome, a lure, glow spots, many eyes), `DesignedCrawler` (a `Walker`: segments, leg pairs, claws, shells, antennae, gills, a proboscis, five eyes) and `DesignedDrifter` (a `Jelly` with lobed bells). Each registers in every species table (DEEP with branch/tier/unlock/deepMin, stats, habitat, likes, rhythm, light, predators, KIND_CODES, SCHOOL_KINDS, the server's list). Stages 0–1 (the reef and the pond, and their pools) are unlockable for 20–120 essence, breed anywhere and arrive "new to the pond"; deeper ones breed only in the brood chamber (drifters don't breed). Append-only: links carry each kind's code.
- **Links**: kind codes now use two extra-byte bits (16 and 32) for bits 5 and 6, so up to 128 kinds; old links decode unchanged. Schools are recorded for every schooling kind (`SCHOOL_KINDS`).
- **Deep-draw unlocks** (`dawnDeep`) skip the designed shallow kinds (their need came out near zero at stage 0, so they all unlocked free at once); several unlocks on one dawn share one journal line. `plural` now gives -ches/-xes/-sses/-uses (clown loaches, octopuses), leaves -is names alone, and keeps nudibranchs.
- **Prehistoric breeding fix**: the brood chamber's breeders get their BREED entries after every species file has loaded (the prehistoric ones had none, so they never bred).
- **The dock** keeps to two rows and scrolls (NEW badges keep their room), since a pond with most species unlocked would otherwise stack five or more rows.
- **The guide** (`js/guide.js`): a window (`#guide`, in `WINDOWS`, so one at a time) opened from the rail's `?`, the menu's Guide button, or G (Esc closes it). Sixteen chapters, each built once, lazily, from the game's own tables (SPECIES/DEEP/SPECIES_STATS/BREED/LIKES/STRUCT_LIKES/RHYTHM/LIGHT_SPECIES, TOOLS, STRUCTURES, PLANT_TRAITS, STRUCT_TRAITS, ISLAND_BRANCH, HATCH_FOCUS/UPGRADES, GRADES, TIERS, GIFTS/CURSES/QUIRKS/ILLS/WARPS, ENHANCE, ANCIENT_GENES, DEPTH_TIERS, HEAVENS, ARTIFACTS, ELD_STAGES/PATHS/TRAITS, PARASITES, XENO, HUNT, INVEST, DIFFICULTY), so new content shows up without editing it; what the tables can't say is written there (`SPECIES_NOTES`, one line per species; `LOOK_NOTES`; `GENE_NOTES`; the basics). Live bits (how many are in the pond, in the dock or ready to unlock, "Find one", built, reached) are worked out when drawn. The search matches names, text, facts and tags across every chapter (up to about 120 results); *This pond* filters entries that have a `here` test (species, plants, food, builds) by the pond's water and depth.

## Opt-in music cued by events; readable trait lists
- **The cut** (`tools/music_chop.py`, run on the two FLACs the user supplied, which stay out of git via `*.flac`): tempo from the onset autocorrelation, refined over the whole track (both are exactly 90.00 bpm), the downbeat from low-end attack plus chord change, 4-bar atoms (10.67 s), each measured (mean dB, spectral centroid, flux) and tagged: `deep` (< −19 dB and dark), `glow` (soft and bright), `drift` (mid), `rise` (full and bright), `surge` (full), `gap` (near-silent: left out). Files hold two atoms (8 bars) plus a 3 s tail, LAME VBR q6 at 44.1 kHz: 25 files, 7.8 MB, in `audio/music/`, listed in `audio/music.json` (atoms with their offset, length, dB and mood). Both keys estimate to D (major and minor), so phrases of either can follow each other; they never overlap except a short crossfade when a big cue cuts in.
- **Playback** (`js/music.js`, its own AudioContext so Sound can be off): off by default (`opts.music`, `opts.musicLevel` 0–100, default 40 → gain 0.5·(level)^1.5 ≈ 0.13). Nothing is fetched until it's turned on; files are fetched as phrases need them, and four decoded files are kept (LRU). A phrase is 2 bars (strength < 0.3), 4 bars, or 8 bars (≥ 0.75, choosing a piece that starts a file), faded in over 1.2–4.5 s and out over up to 6 s into the tail, at a level normalised part way (0.6 of the dB gap to −15 dB, clamped 0.55–2). After a phrase, a rest of 55–115 s (30–90 s after a big one). During a phrase, only a big cue (≥ 0.8, against a phrase under 0.6) cuts in; others wait up to 15–20 s as a pending cue. Small cues are also dropped at random (kept with probability 0.35 + strength). Choosing: 70% of the time within 4 minutes it carries on to the next piece of the same track if the mood fits; otherwise a fitting mood (with fallbacks) not among the last eight, decoded ones preferred. A lowpass follows the depth at the centre of the view and the darkness (7 kHz down to about 1.4 kHz). After 5–7 quiet minutes it plays a phrase on its own. It stops (and suspends) when the tab is hidden, and does nothing for bots, while paused, or while looking at a neighbour's pond.
- **Cues** come from `logEvent` (new entries only, pri ≥ 1), by text and category: deepening, the mythic, the stars, ascension → surge 0.9; the mark, madness, the alien, blood moons and eclipses, the tar → deep; auroras, meteors, comets, glass days, new species, firsts, Epic and better → glow; other rare news → rise; dawn → glow, dusk and night → deep; hunts → surge (weak); arrivals → drift (deep ones deep); the rest → drift, weak.
- **Trait lists** (hud.js `byRarity`, `traitText`, `traitChips`, `traitColor`, `traitName`): rarest first; the hatchery's pens and pair picker show chips (six and four) and "+N more", the family tree's list two, the census three, the hover card five; the card lists every trait's meaning one to a line. Dark trait colours are lifted toward white for text. `darkloving`, `manyeyed`, `longcoiled` and `sporebearing` read as hyphenated words. The hatchery picker's overlapping rows were a CSS bug: `.slot button { grid-area: b }` and `.slot b { grid-area: nm }` also hit the pair buttons and names inside the picker (no named areas there), stacking them in one cell; the rules now apply only to a pen's direct children.

