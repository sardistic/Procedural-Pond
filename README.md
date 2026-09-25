# Procedural Pond

A live top-down aquarium of procedurally animated animals, drawn in a chunky
voxel / pixel-art style. It is inspired by
[argonautcode/animal-proc-anim](https://github.com/argonautcode/animal-proc-anim).

**Live at [pond.sardistic.com](https://pond.sardistic.com/).**

To run it locally, open `index.html` in a browser. There is no build step and no server needed.
The pixel font loads from Google Fonts and falls back to monospace when offline.

## Using it

- **Animals:** koi, tetra schools, eels, axolotls, turtles, crabs, stingrays, frogs, water snakes, snails, jellyfish, clownfish (each pair adopts an anemone and chases off intruders), pufferfish (inflate when threatened), octopus (FABRIK arms, camouflage, jets away in ink), duck families (ducklings follow in a line), shrimp (flick backwards when startled) and dragonflies. Fireflies come out on their own after dark. Each button adds one at a random spot.
- **Tools:** *Feed* drops food pellets. *Net* removes whatever animal, plant or rock you click. Every other tool places that plant or object where you click: weed, eelgrass, anemone, marimo moss ball, duckweed, lily pad or rock. Dragging an animal always leads it by the head.
- **World and view:** by default the pond is sized from your screen at 2× pixels (half the window in each direction), so at 2× the whole pond exactly fills the window. You start one step closer (3×), so animals swim in and out of view. You can't zoom out past a full screen, so there is never an empty border. Scene → World also offers fixed Small (720×405), Medium (960×540) and Large (1280×720) ponds. Share links carry the pond size, so a friend gets the identical pond. Pan by dragging empty water, with the arrow keys or WASD, or by clicking the minimap in the bottom-right. Only the visible part is rendered each frame.
- **Habitat:** *Fresh*, *Both* or *Salt*, under the pond name. Each habitat has its own species, plants, and default floor and water.
  - Fresh: koi, tetras, frogs, ducks, axolotls, turtles, lily pads, duckweed, marimo.
  - Salt: reef wild fish, clownfish in anemones, corals, urchins, starfish, jellies, octopus, rays.
  - Both: everything together.
- **Scene:**
  - floor: sand, coral sand, pebble bed, river stones, leaf litter or pool tiles. The pebbles, stones, leaves, shells and twigs are small 3D objects drawn by the same renderer as the animals.
  - water: teal, pond green, clear lagoon, tropical reef, deep blue or murky swamp. Water is more than a tint: depth fog makes the floor fade into the water colour while things near the surface stay crisp, the floor shimmers with refraction, particles drift in the current, and sun glints flash on the surface. Each preset has its own clarity.
  - light: a day/night cycle by default, or fixed day, dusk or night. At night, jellyfish and green anemones stay a little brighter than their surroundings, and fireflies light up fully. The clock at the top of the panel shows the time of day; click it or press **L** to switch modes. A day-length slider sets the cycle speed.
  - world size
  - current strength and sim speed
  - caustics, shadows and outlines on or off

  Settings are saved in localStorage.
- **Zoom:** scroll wheel or pinch, the +/− buttons, or the **+**, **−** and **0** keys. The zoom level is a whole number of screen pixels per pond pixel (the label shows 2×, 3× and so on), so the art stays crisp.
- **Share:** every pond has a seed name such as `misty-reed-42`, shown under the title. *Share* copies a link (`?pond=misty-reed-42`, plus the floor and water if changed). Anyone who opens it gets the same layout and starting animals. *New pond* rolls a new seed.
- **Journal:** a running story of the pond: hatchings, arrivals, new species, who caught whom, dawn and dusk, rain. The newest entry pops up at the bottom-left. Click an entry to follow the animal it mentions.
- **Follow and Tour:** double-click an animal (or hover it and press **F**) to ride along with it. *Tour* (**T**) lets the camera wander between whatever is interesting. Esc or dragging stops it.
- **Sound:** *Sound* (**M**) turns on a generative soundscape: a water bed that swells with the current, rain hiss, plops panned to where ripples land, birdsong by day, frogs at night and the odd duck. It is synthesized live, with no audio files.
- **Keys:** **B** shows the bones (spine chains, joint radii, leg IK), **Space** pauses, **L** switches light modes, **F** follows, **T** tours, **M** toggles sound, **H** hides the panel. *Photo* saves a PNG.

## The living pond

With **Life** on (Scene section), the pond runs itself:

- **Genes:** every animal has its own size, body length and girth, hue, saturation, brightness and speed. Babies blend their parents' genes with a small mutation, so lineages drift over generations. Occasionally a giant appears.
- **Rare morphs:** albino (white with red eyes), melanistic (near-black) and piebald (white patches) are recessive. An animal can carry one hidden copy and pass it on, so two carriers can produce a rare baby. Shiny is a rare mutation with a swapped palette and sparkles. Rare animals get a thick outline in their trait's colour (gold shiny, pink albino, purple melanistic, mint piebald). The journal announces them, and the hover card shows their traits and what they carry.
- **Hunger and growth:** animals burn energy and forage. Plants shed drifting plankton, and your pellets are a treat. Babies hatch small and grow.
- **Breeding:** well-fed adults near a mate lay eggs. Fish eggs stick to plants, snail eggs go on rocks, and frog spawn floats at the surface. Frog eggs hatch into tadpoles that turn into froglets.
- **Predators and prey:** hungry eels, snakes, octopuses and predatory wild fish hunt small fish, shrimp, tadpoles and babies, and prey flee. Frogs snap gnats and fireflies with their tongues.
- **Coming and going:** old or starving animals swim off the edge, and newcomers fade in from the edges to keep each species near its starting population.
- **Wild species:** a generator invents new fish species, each with its own body shape, tail and fin style, colour scheme, pattern, behaviour (schooling, depth, predator or not) and name, such as "Barred Azure Discus". New ones turn up now and then, or you can add one with the *Wild fish* button.
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
- `js/sound.js`: the Web Audio soundscape.
- Starfish live in `js/wildlife.js`; corals and urchins live in `js/plants.js`.

## Hosting

The `Dockerfile` builds a small nginx image that serves the site files. Configuration is in
`deploy/nginx.conf`: caching, gzip, security headers and a Content-Security-Policy.

```sh
docker build -t procedural-pond .
docker run --rm -p 8080:80 procedural-pond   # then open http://localhost:8080
```

When you change a script or the stylesheet, bump the `?v=N` on its tag in `index.html`. When you
add a new top-level asset, list it in the `Dockerfile`.

`node tools/make-icons.js` regenerates the favicon and app icons by rendering a koi with the pond's
own renderer. SEO lives in `index.html` (description, canonical, Open Graph and Twitter cards,
JSON-LD) plus `robots.txt`, `sitemap.xml` and `manifest.webmanifest`.
