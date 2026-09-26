# Procedural Pond

A live top-down aquarium of procedurally animated animals, drawn in a chunky
voxel / pixel-art style. It is inspired by
[argonautcode/animal-proc-anim](https://github.com/argonautcode/animal-proc-anim).

**Live at [pond.nz](https://pond.nz/).**

To run it locally, open `index.html` in a browser. There is no build step and no server needed.
The pixel font loads from Google Fonts and falls back to monospace when offline. Short links and the
leaderboard need the small API in `server/`; without it the pond runs as before and shares long links.

## Using it

The screen has six parts. The **menu** (top-left) holds the habitat, tools, scene options and buttons.
The **animal dock** (bottom-centre) has a pixel icon per species; click one to buy that animal, and hover
it for the species' **family tree**: every generation that has lived here, with lines to the parents,
their colours and rarity, and the animals themselves (those here now first, by points). Its
counter opens the **census**: every species with young, adult and elder counts, hunger, rares and the
highest generation. Click a species to list its members, and click a member to follow it. The census
also lists the wild species discovered. The **journal** (bottom-left) shows the latest event on one
line; click it (or press **J**) for the full log with filters. The **sky tracker** (top-right) is an
icon for the time of day (sun, dawn, dusk, or the moon in its current phase at night). Click it for
the day, moon phase, tide and surf, plus the light mode, day length, current and speed. Under it, the
**score** shows your points (★) and pearls; click it (or press **P**) for your rank, what you earned
lately, the leaderboard, and rare finds from every pond.

- **Animals:** koi, tetra schools, eels, axolotls, turtles, crabs, stingrays, frogs, water snakes, snails, jellyfish, clownfish (each pair adopts an anemone and chases off intruders), pufferfish (inflate when threatened), octopus (FABRIK arms, camouflage, jets away in ink), duck families (ducklings follow in a line), shrimp (flick backwards when startled) and dragonflies. Fireflies come out on their own after dark. Each button adds one at a random spot.
- **Tools:** *Pellets* are free food. *Spirulina* (3 pearls) keeps animals well fed five times longer, and *Brine* shrimp (5) is a big meal that brings them into breeding condition. *Net* removes whatever animal, plant or rock you click. Every other tool places that plant or object where you click, for a few pearls: weed, eelgrass, anemone, coral, urchin, marimo moss ball, duckweed, lily pad or rock. Each is liked by certain species (the hint says which). Dragging an animal always leads it by the head.
- **World and view:** by default the pond is sized from your screen at 2× pixels (half the window in each direction), so at 2× the whole pond exactly fills the window. You start one step closer (3×), so animals swim in and out of view. You can't zoom out past a full screen, so there is never an empty border. Scene → World also offers fixed Small (720×405), Medium (960×540) and Large (1280×720) ponds. Share links carry the pond size, so a friend gets the identical pond. Pan by dragging empty water, with the arrow keys or WASD, or by clicking the minimap in the bottom-right. Only the visible part is rendered each frame.
- **Habitat:** *Fresh*, *Both* or *Salt*, under the pond name. Each habitat has its own species, plants, and default floor and water.
  - Fresh: koi, tetras, frogs, ducks, axolotls, turtles, lily pads, duckweed, marimo.
  - Salt: reef wild fish, clownfish in anemones, corals, urchins, starfish, jellies, octopus, rays.
  - Both: everything together.
- **Scene:**
  - floor: sand, coral sand, pebble bed, river stones, leaf litter or pool tiles. The pebbles, stones, leaves, shells and twigs are small 3D objects drawn by the same renderer as the animals.
  - water: teal, pond green, clear lagoon, tropical reef, deep blue or murky swamp. Water is more than a tint: depth fog makes the floor fade into the water colour while things near the surface stay crisp, the floor shimmers with refraction, particles drift in the current, and sun glints flash on the surface. Each preset has its own clarity.
  - light (in the sky tracker): a day/night cycle by default, or fixed day, dusk or night. **L** steps through the modes.
  - world size
  - current strength and sim speed
  - caustics, shadows and outlines on or off

  Settings are saved in localStorage.
- **Zoom:** scroll wheel or pinch, the +/− buttons (in a column beside the minimap), or the **+**, **−** and **0** keys. The zoom level is a whole number of screen pixels per pond pixel (the label shows 2×, 3× and so on), so the art stays crisp.
- **Your ponds:** every visitor gets their own pond, and it saves itself in the browser every few seconds (and when you leave). That covers the animals with their genes, names, ages and lineages, rares, eggs, discovered species, the journal, placed plants and rocks, and the day, moon and tide. Come back and it resumes where you left off. *Your ponds* in the menu lists your ponds (up to 12) to switch between or delete. *New pond* starts another pond while keeping this one.
- **Short links:** *Share* / *Copy link* gives your pond a link of four words, like `pond.nz/amber-heron-moss-lantern`. The whole pond is stored behind it (animals, genes, family trees, journal, score) and kept up to date every minute and a half while you play, so the link always shows your pond as it is. Only the browser that made the link can update it; whoever else opens it gets their own copy with a fresh score. Ponds join the leaderboard, and get a short link, on their own once they reach 50 points (untick *Show my pond on the leaderboard* to stay off it). Links nobody has opened or updated for half a year are cleared.
- **Long links:** without the server (opened from a file, or offline), the address bar holds a link with the pond packed into its `#fragment`, which never reaches a server. The seed and settings sit in the query (`?pond=…`), so a truncated link still opens that pond from day 1. If you open an older link to your own pond, your newer save wins. If you open someone else's copy of a pond you also have, you're asked before yours is replaced.
- **Seeds:** every pond has a seed name such as `misty-reed-42`, shown under the title. A plain `?pond=misty-reed-42` link (without the fragment) opens that pond from day 1, or resumes it if it's one of yours. *New pond* rolls a new seed.
- **Journal:** a running story of the pond: hatchings, arrivals, new species, who caught whom, dawn and dusk, rain. The newest entry pops up at the bottom-left. Click an entry to follow the animal it mentions.
- **Follow and Tour:** double-click an animal (or hover it and press **F**) to ride along with it. *Tour* (**T**) lets the camera wander between whatever is interesting. Esc or dragging stops it.
- **Sound:** *Sound* (**M**) turns on a generative soundscape: a water bed that swells with the current, rain hiss, plops panned to where ripples land, birdsong by day, frogs at night and the odd duck. It is synthesized live, with no audio files.
- **Keys:** **B** shows the bones (spine chains, joint radii, leg IK), **Space** pauses, **L** switches light modes, **F** follows, **T** tours, **M** toggles sound, **P** opens the score, **H** hides the panel. *Photo* saves a PNG.

## Points, pearls and the leaderboard

- **Points** are your score and never go down. Every point also pays a **pearl**, which you spend on animals (4 to 30), plants and rocks (2 to 15) and special food. A new pond starts with 60 pearls.
- **Earning:** every birth is a point. Rare births score by tier: Uncommon 3, Rare 8, Epic 20, Legendary 50, Mythic 150. Breeding the same rare again pays 25% more each time, up to 3×, and the first of a kind in your pond adds 20. Rares that arrive on their own score half. A new wild species is 10, a generation record 5 per generation, coral spawning 20, and an animal that lives out its life 1. Each dawn pays a pearl per species in the pond plus up to 5 for how comfortable everyone is.
- **Leaderboard:** the top twenty ponds by points, each with its best find; click one to visit (you get your own copy). *Rare finds in every pond* lists the latest Rare-or-better animals born or arriving anywhere. The server only takes scores that grow at a plausible rate.
- **Fireflies keep score:** at night the swarm shows how your points compare to the high-score range (tenth place on the leaderboard, or 10,000 points while that is lower): a few fireflies for a new pond, a full swarm in the high-score range. Past it, **blue fireflies** join, two more each time your score doubles, and many more for the top three.

## The living pond

With **Life** on (Scene section), the pond runs itself:

- **Genes:** every animal has its own size, body length and girth, hue, saturation, brightness and speed. Babies blend their parents' genes with a small mutation, so lineages drift over generations. Occasionally a giant or a dwarf appears.
- **Rare morphs:** albino (white with red eyes), axanthic (blue-grey), xanthic (golden), melanistic (near-black) and piebald (white patches) are recessive. An animal can carry one hidden copy and pass it on, so two carriers can produce a rare baby. Shiny (a swapped palette and sparkles), glow (bioluminescent, bright at night) and ghost (pale, see-through colours) are rare mutations that often pass on. Rare animals get a thick outline in their trait's colour. The journal announces them, and the hover card shows their traits and what they carry.
- **Rarity tiers:** each trait adds its rarity (piebald 1; giant, dwarf, melanistic and xanthic 2; albino and axanthic 3; shiny, glow and ghost 4), and the sum sets the tier: Uncommon, Rare (2-3), Epic (4-5), Legendary (6-7) or Mythic (8+).
- **Temperament and care:** each animal is born with a vigor (how slowly it ages) and a wanderlust (how readily it moves on). Every species likes certain plants or rocks nearby (clownfish anemones, frogs lily pads and duckweed, crabs rocks and coral, and so on). Comfortable animals age slower and rarely wander off, and so do well-fed ones. The hover card shows how comfortable an animal is and what it likes.
- **Hunger and growth:** animals burn energy and forage. Plants shed drifting plankton, and the food you drop is a treat that keeps them well fed for a while. Babies hatch small and grow.
- **Breeding:** well-fed adults near a mate lay eggs. Fish eggs stick to plants, snail eggs go on rocks, and frog spawn floats at the surface. Frog eggs hatch into tadpoles that turn into froglets.
- **Predators and prey:** hungry eels, snakes, octopuses and predatory wild fish hunt small fish, shrimp, tadpoles and babies, and prey flee. Frogs snap gnats and fireflies with their tongues.
- **Coming and going:** old, starving or restless animals swim off the edge, and newcomers fade in from the edges to keep each species near its starting population.
- **Wild species:** a generator invents new fish species, each with its own body shape, tail and fin style, colour scheme, pattern, behaviour (schooling, depth, predator or not) and name, such as "Barred Azure Discus". New ones turn up now and then, or you can add one with the *Wild fish* button.
- **Moon, tides and surf:** the moon goes round every 8 days. Its phase sets how bright the nights are. It also sets the tides: every pond (except a pool) has a beach along one edge, and the tide floods and bares it twice a day. Spring tides at new and full moon move the water furthest; neap tides at the quarters barely move it. Freshwater ponds hardly have tides at all. The surf grows with spring tides and wind. Waves roll in as foam lines, shallow water is clearer, and water animals turn back before the waterline, while crabs, turtles, snails, starfish and frogs can cross the sand. The tidal stream pushes the current toward the beach and back. On a full-moon night the corals spawn: pink clouds drift up and the fish feast.
- **Ticker:** the bottom-left line shows one entry at a time, for as long as it takes to read. Important news (rares, new species, records, big surf, coral spawning) stays longer and jumps the queue. Routine news (eggs laid, animals growing up or old, departures) skips the ticker when it's busy but is always in the journal. A small `+N` shows what's waiting.
- **Journal:** each entry has a category (life, rare, hunts, comings and goings, sky and tide). Repeat events within about 40 seconds fold into one line with a count and a breakdown, e.g. "4 Tetras moved on (3 of old age, 1 hungry)" or "3 clutches of Koi hatched: 8 young, up to gen 3". It covers hatchings, eggs laid, animals growing up and growing old, record generations, arrivals, departures with reasons, catches, rare births, new species, weather, dawn, dusk, moonrise, high and low tide, big surf and coral spawning.
- **Surface and weather:** ripples come from food, frogs, duck wakes, rising bubbles and rain showers. Wind gusts push the current around. **Weather** toggles rain and wind.
- **Hover card:** hover an animal to see its name, species, stage, generation, age, energy and mood (hunting, fleeing, hungry, growing, moving on).

## How it works

- `js/core.js`: math and noise. `Chain` is the core idea from the original sketch. The head is
  steered. Each following joint keeps a fixed distance from the one ahead and may only bend a limited
  angle from it. `solveLimb` is two-bone IK. `bakeShader` turns a pattern function into a lookup table.
- `js/raster.js`: a small software rasterizer. Bodies are tapered tubes and ellipsoids drawn into a
  low-res height buffer. Each pixel's normal gives banded, Bayer-dithered lighting. Its height sets
  its drop-shadow offset and decides what occludes what, and outlines appear wherever a shape meets
  something lower. `compose` also applies caustics, the light tint and the glow exemption.
- `js/creatures.js`: the base classes and the original species. `Fish` swimmers sway their head
  around the heading, and the chain turns that into a travelling wave. `Walker` plants its feet and
  steps in alternating groups. Leg layout is per leg (`ang`, `sAng`, `bend`), and a creature can
  override `legBase` (crabs face sideways).
- `js/critters.js`: crab, stingray, frog (states: sit on pad, hop, swim), water snake, snail, and
  jellyfish (its tentacles are trailing chains).
- `js/wildfish.js`: the procedural species generator (body profile, tail, fins, palette ramps, patterns, names) and `WildFish`.
- `js/life.js`: genes and dyes, growth, eggs, tadpoles, gnats, predators and prey, migration, plankton, ripples, bubbles, weather, and the hover-card text.
- `js/wildlife.js`: clownfish, pufferfish, octopus, ducks, shrimp, dragonfly and firefly.
- `js/plants.js`: weeds, eelgrass, anemones, marimo, duckweed and lily pads. They react to
  passing animals and the current.
- `js/scene.js`: floor textures, water tints, scenery layout, food, and the background bake.
  Rocks are z-tested against animals.
- `js/main.js`: the loop, the day/night cycle, fireflies, options, tools, zoom and pan, input and the HUD.
- `js/sound.js`: the Web Audio soundscape, including a surf wash that swells as each wave arrives.
- `js/save.js`: serializing and restoring whole ponds, and the localStorage save slots. Animals and plants are built by `makeCreature` and `makePlant` under their own seeds, so a save stores each one's seed plus its changing state (genes, name, age and so on) rather than its shapes and colours.
- `js/link.js`: packs a pond into a link and back. The format stores only what can't be recomputed:
  - scenery regrows from the pond seed, and only the player's edits are stored;
  - an animal's seed follows from the pond seed and its number;
  - genes follow from the seed, or from the parents plus the seed;
  - names and lifespans follow from the seed.

  That leaves about 6 bytes per animal, so a 120-animal pond fits in about 1,200 characters. The bytes are deflated and written as base64url; v1 links still open.
- `js/sky.js`: days, the moon, tides, surf and coral spawning, plus the sky events in the journal.
- `js/game.js`: points and pearls, rarity scoring, prices, comfort, the family-tree records, the dawn income, and how many fireflies the score earns.
- `js/net.js`: the client for the pond API: short links, syncing, the leaderboard.
- `js/hud.js`: the animal dock with its family trees, the census, the journal UI, the sky tracker, and the score panel. Icons are rendered at runtime by the pond's own renderer.
- `server/`: the pond API, plain Node 24 with its built-in SQLite and no packages. `POST /api/ponds` stores a pond under a new four-word id (from `words.js`) and returns a secret key; `PUT /api/ponds/:id` with that key updates it; `GET /api/ponds/:id` returns it; `GET /api/board` gives the top twenty, the high-score line and recent rare finds. Scores are capped by how fast they can plausibly grow, and finds are rebuilt from known species and trait names.
- Starfish live in `js/wildlife.js`; corals and urchins live in `js/plants.js`.

## Hosting

The `Dockerfile` builds a small nginx image that serves the site files. Configuration is in
`deploy/nginx.conf`: caching, gzip, security headers, a Content-Security-Policy, and 301 redirects from `www.pond.nz` and `pond.sardistic.com` to the canonical `pond.nz`. It serves four-word paths as `index.html` and proxies `/api/` (rate-limited) to the network alias `pond-api`, a service built from `server/Dockerfile` with a volume at `/data` for its SQLite file. The name is resolved per request, so the site keeps serving if the API is down.

```sh
docker build -t procedural-pond .
docker run --rm -p 8080:80 procedural-pond   # then open http://localhost:8080
```

When you change a script or the stylesheet, bump the `?v=N` on its tag in `index.html`. When you
add a new top-level asset, list it in the `Dockerfile`.

`node tools/make-icons.js` regenerates the favicon and app icons by rendering a koi with the pond's
own renderer. SEO lives in `index.html` (description, canonical, Open Graph and Twitter cards,
JSON-LD) plus `robots.txt`, `sitemap.xml` and `manifest.webmanifest`.
