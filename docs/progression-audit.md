# Progression audit — 22 October 2026

The first pass found no reason to change prices or rewards. Twelve fresh-pond
runs reached the first depth without spending essence on depth, and every minute sample retained
living residents. Tending improved final average comfort in every paired run.
These are controlled simulation observations, not a claim that the whole game
is balanced or a timetable for every player.

## Method

Run `python tools/audit_progression.py --seed misty-reed-42 --habitat fresh --policy tend --minutes 30`.
Repeat with `amber-heron-17`, habitats `fresh`, `mixed`, `salt`, and policies
`idle`, `tend`. Reports and minute samples are written to ignored
`dist/progression/`. Each run uses a new small pond, normal mode, speed 1 and
180-second days. Seeds control terrain and the audit random stream.

The harness runs actual simulation updates in 50 ms steps. It grants no money,
forces no depths and does not purchase direct deepening. The tending policy
offers free food to up to four hungry residents and attempts one affordable
liked habitat object every 20 seconds. Each minute it also attempts an affordable
new structure and eligible animal. Purchases use ordinary placement, prices,
unlock gates and currency deductions. Idle runs take no player actions.

All remote API calls are intercepted, and saving is disabled. Rendering and
remote brain responses are excluded; simulation runs faster than wall time.
Initial browser scheduling and growth-job cost vary, so these are not byte-for-byte
replays or FPS measurements. Two seeds and half an hour cover early progression
only; human care patterns, larger worlds, fresh Hard mode, offline catch-up and
long-term economy still need separate study.

## Fresh ponds

Each range below spans the two seeds. Time is modeled time at normal speed.
Comfort is the final mean among living residents; pearls are remaining balances
after ordinary purchases, starting from 30.

| Habitat | Care | First depth, minutes | Final residents | Final known kinds | Final comfort | Final pearls |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Fresh | Idle | 17.0–18.5 | 57–92 | 8 | 64–84% | 1,143–1,448 |
| Fresh | Tended | 14.9–16.3 | 79–112 | 8 | 89–99% | 420–499 |
| Mixed | Idle | 11.7–16.3 | 62 | 9 | 47–55% | 2,434–4,440 |
| Mixed | Tended | 12.9–13.7 | 41–60 | 9–10 | 73–88% | 2,581–2,879 |
| Salt | Idle | 11.5–12.5 | 38–50 | 9 | 75–85% | 3,308–3,547 |
| Salt | Tended | 11.4–13.8 | 66 | 9–10 | 90–91% | 1,560–1,668 |

Every run had births and discovered new kinds. Final mean fullness ranged from
76% to 87%. Tending did not consistently accelerate discovery or depth, so it
should remain optional care rather than a promised shortcut. Mixed idle ponds
had the lowest comfort; investigate cover distribution and species needs with
more seeds before changing those rules. The old fixed 30-minute/three-times-longer
guide claims do not describe this sample and have been replaced with guidance
to use the current pond's estimate.

## Saved mature pond

A separate local copy of an established mixed-water Hard-mode pond was advanced
for three modeled minutes at speed 1 without care. It stayed at tier 10, with
326 → 313 living residents and 14 births. Pearls increased by 1,245,235 and essence
by 28,346; this pond already held approximately 532 million pearls and substantial
investments. Final mean comfort was 23%, and fullness 70%.

This confirms continued activity and substantial income in that save. The short
window and accumulated investments do not justify a global reward reduction.
Lower comfort and resident turnover warrant a longer mature-pond observation;
this is not a late-game stability result. The private save is not included.

## Changes supported by this pass

- Fix the next-depth estimate to use Hard mode's slower clock, selected speed
  and the remaining duration of a sun offering. A temporary boost applies only
  until it expires. Hide a ticking estimate when paused or ecology is disabled.
- Refresh the evolution panel when the displayed estimate or pause state changes,
  even when erosion and balances have not changed enough to refresh other fields.
- Keep progression thresholds, costs and rewards unchanged.

`node --test tools/progression.test.js tools/offerings.test.js` checks the estimate
against the actual clock, including expiring boosts and observer restrictions.
`python tools/test_progression_browser.py` checks live display refresh on desktop
and phone without changing economy or erosion through rendering.

Next: extend normal-play observations through the second depth and repeat fresh
Hard-mode and mature care comparisons. Measure affordability of specific unlocks
and comfort blockers before proposing any numerical balance change.
