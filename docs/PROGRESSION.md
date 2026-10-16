# What drives progression

This describes the current implementation, including local expansion work.
There is no single player XP level. Pond depth, habitat succession, species
discoveries, bloodlines and individual growth advance alongside one another.

## The main loops

| What you do / what changes | What it drives | Where to look |
| --- | --- | --- |
| Grow living plants | Plant biomass / pond area sets maturity (0–1). Maturity admits later succession species and contributes to erosion. | `js/structures.js` plant update; `js/main.js` succession |
| Feed animals and provide liked habitat | Energy, comfort, survival, development and breeding conditions. Better care slows biological aging and reduces departures. | `js/life.js`, `js/game.js` |
| Maintain a diverse, comfortable population | Dawn awards points/pearls from species count and average comfort. Dawn essence also benefits from diversity and deep animals. | `dawnIncome` in `js/game.js` |
| Breed, find rare traits, reach milestones | Points, matching pearl awards, species points, rare-line breeding counts and small direct erosion contributions. | `award` / `scoreRare` in `js/game.js`, `js/lineage.js` |
| Wait through tides, build and develop plant life | Accumulated erosion, which opens depth tiers and more habitats/species/foods/builds. | `updateErosion` in `js/erosion.js` |
| Spend essence to deepen | Adds erosion directly; repeated purchases get more expensive. | `deepenPond` in `js/erosion.js` |
| Discover a species | Adds it to the known list and starts a delay before the next new discovery. Eligible shallow species become spawnable; deep species can still require an essence unlock. | `js/arrivals.js`, `js/deep.js` |
| Breed the same rare line repeatedly / earn points with a species | Free Paragons, claimed from Animals. | `js/lineage.js` |
| Let an individual eat and hunt | Permanent meal growth and growth milestone rewards. Kills can transfer stronger working genes, subject to the absorption rules. | `js/growth.js` |
| Buy individual traits / breed genetics | Buffs and inherited traits; completed upgrades gain mastery visuals. Grades are derived from genes, rather than being an XP level. | Creature Grow/Genes tabs; `js/life.js`, `js/mastery.js` |
| Build deeper/darker systems | Additional habitat, creature attraction, resources such as corruption, and the existing eldritch upgrade branches. | `js/abyss.js`, `js/eldritch.js`, `js/quirks.js` |

## Depth and content gates

`erosion.e` is monotonic. It combines accumulated erosion (`erosion.acc`) with
the current points contribution `2 * log10(1 + points / 1000)`.
The accumulated part records tides, time, structures, plant maturity, evolution
events and purchased deepening in `erosion.parts`.

The first erosion thresholds are 0, 2, 5, 11 and 22. Later thresholds are defined
in the tier tables. Salt/fresh branches name the reaches differently. The local
expansion adds named habitats through tier 23 and appends species without moving
older kind IDs. Tier changes open eligible content and queue physical expansion;
at the memory/pixel limit, new frontier habitat changes the furthest rim instead
of allocating a larger pond.

Depth is necessary for deep species, but habitat branch, discovery, mythic arrival
odds and species unlocks can also apply. Structure and plant placement may need a
minimum local water depth. Advancing a tier does not immediately spawn everything
it makes eligible.

The later horizon expansion names tiers 24–29 without changing their existing
erosion thresholds. Twelve additional species use the same depth/discovery/essence
gates. Natural island settlements appear in the new sea bands; at the pixel cap,
the existing outer rim can carry the current habitat. Attuning a relay costs 20
essence once, with at most 24 recorded signals. Relays yield 2 essence each per
observed new pond day, capped at 12; missed days do not accumulate payouts.

The extended forest has independent progress in `game.wilds`. Once the old jungle
reaches its edge, the new reach starts at 440 world pixels and advances 0.42 pixels
per pond day, plus a small bounded trust contribution, to 820. Five concealed
places appear along the river only as the haze reaches them. Bell responses and
trades build trust at most once per pond day. Trading spends 12 pearls for 18
essence; it does not reduce points. Three completed imp outings reveal shore
objects. Their cards show one action, an explicit cost and live visitor status.
Chimes invite two imps for free once per pond day; they walk down, dance and
build one forest trust if they dance at the chimes. Fill & invite at the bowl
costs 4 essence with no investment credit; visible glowing food stays until a
gift is delivered, and interrupted visits can resume without paying twice.
Chimes prefer a filled bowl or tribute when present. A lantern brightens and
opens a firefly path for 20 pond seconds, protecting imps within 60 world pixels
from pointer fright. Invited imps always allow watching. Swaying chimes, glowing
food, animated trails, actual visitors and gift sparks show each outcome in place.
Natural outings retain their curse/forest requirements and random timing;
invitations require established contact and the visible forest. Native saves and the optional bounded p4
exploration trailer preserve reveal, contact and transaction state; observed
ponds do not advance these records or allow purchases.

Discovery odds vary by pond seed and season. A fresh pond's first discovery is
scheduled after 1.2 pond days; subsequent discoveries set a randomized gap based
on the number already known. Lures increase arrival odds and shorten the wait;
summons bring an eligible unknown species at dawn. Hard mode restricts buying and
summoning. See `FIND_GAP`, `canDiscover`, `kindOdds` and `dawnArrivals`.

## Population, breeding and rewards

Natural breeding needs eligible adult partners nearby, enough fullness (over
65%), a completed breeding cooldown, suitable habitat and population room.
Local tension must be below 0.75. Species caps, egg sites, genes and other habitat
conditions also apply. Young inherit genes; rare births advance the relevant line.

Paragon line milestones are 3, 8, 20 and 50 rare births. Species-point milestones
are 150, 600, 2,400, 9,600 and so on (four times the previous threshold).
Only awards attributed to an animal advance its species points. Pond-level awards
such as reaching a depth tier do not credit every species.

Points are cumulative achievement; pearls and essence are spendable balances.
`award` increases both points and pearls (with the existing difficulty/size and
artifact modifiers). Spending pearls does not reduce the accumulated score.
The save records the game state, erosion, known/unlocked species, succession,
lineage and individual life/genetics; UI icons derive their values from that state.

## Wealth and offerings

Offerings appear in Score and the sun panel at 5,000 banked pearls, or at
25,000 accumulated points with at least 1,000 pearls and lifetime investment
worth below 25% of points. Discovery persists after the balance falls. Points
remain cumulative; a large point total unlocks options but is never spent.

| Offering | Pearl cost (rounded up, minimum) | Result | Void anger |
| --- | --- | --- | --- |
| Hasten the sun | 15% of current balance, at least 750 | Entire simulation ×2 for 3 pond days; cannot stack | +28 |
| Call the deep | 20%, at least 1,000 | 8% of the full current tier gap, capped at the next edge; once per pond day | +26 |
| Still the void | 10%, at least 500 | Remove up to 25 anger; available while anger remains | −25 |

Anger is a separate 0–100 index, not spendable corruption. It fades by 3 per
simulated pond day. At anger `a`, investment point/essence dividends are multiplied
by `1 − .35a/100`. Local water tension gains `(a/100) × (.06 + .24 × depth)`;
this flows through the existing comfort, breeding and departure rules. The dialog
shows the live income reduction, surface/deep tension range, anger after purchase,
price, remaining pearls, active duration and cooldowns.

Ritual spending uses `spend` without an investment category: no immediate point
refund, dividend principal, essence or corruption reward. Existing depth milestone
rewards still apply when a tier is actually reached. Deep offerings cannot cross
an unsettled next tier; living ecology must be enabled. Hastened time multiplies
the existing Speed/hard-mode pace and uses bounded simulation steps, including
aging, hunger, breeding, tides and dawn. Pause/host pause stop advancement; there
is no offline catch-up. Observers cannot offer or mutate ritual progress.

State lives in `game.offerings` (unlock, anger, expiry, cooldown, count and lifetime
pearl sacrifice). Native saves retain it; the existing bounded optional p4
exploration trailer carries validated fields. Earlier links still load.
Implementation: `js/offerings.js`, `dividendOf`, `updateZones`, and the frame loop.

## Animal status metrics

The old strip mixed an action fallback, environment readings and temperament.
In particular, `content` meant no special action label was selected, so it could
appear beside `uneasy` and `hostile water` without a simulation contradiction.

| Icon / metric | Source and units | What it affects |
| --- | --- | --- |
| Fish / Behavior | Current action flags; Routine replaces the generic content fallback. | Reports current behavior; does not add a mood mechanic. |
| Leaf / Comfort | `life.comfort`, displayed 0–100%. | Aging, restless departures, dawn income. |
| Crossed spines / Tension | `aggressionAt`, displayed 0–100 index. | Comfort, departures, arrivals, breeding and local ecological pressure. It is not an attack probability. |
| Droplet / Water match | `100 * (1 - mismatch)`. | Fresh/salt mismatch penalties in mixed ponds, softened by tolerance. It is not a salinity measurement. |
| Heart / Vigor | `life.vigor`, normally 0.80–1.25×. | Aging uses its inverse, combined with longevity, comfort, feeding and auras. Tooltip shows the actual combined `ageRate`. |
| Compass / Roaming | `life.wander`, displayed 0–100 index. | Amplifies restless departure risk when comfort is poor. Tooltip separately reports `leaveChance` per six simulation seconds. |
| Food jar / Well-fed bonus | `life.fed`, remaining simulation seconds. | Multiplies aging by 0.85 and halves departure risk. Fullness remains a separate energy meter. |

Departure checks skip young animals (scale below 0.9), tadpoles, animals being
held and animals already leaving. A low roaming index can coexist with real
departure risk from hostile or mismatched water. Vigor is distinct from health,
quality grade and the vitality gene; the tooltip identifies its aging role.

Full condition metrics appear on the animal inspector. The Animals list uses a
compact behavior/comfort/tension set, and the hover card uses named numeric values.
Hover, keyboard focus, tap or press-and-hold opens each metric's explanation.
These changes do not alter the simulation's growth, breeding or balance rules.
