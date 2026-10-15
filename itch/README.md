# Pond on itch.io

Build with `python tools/build_itch.py`. Upload **`dist/pond-itch.zip`**.
The ZIP has `index.html` at its root, bundled font/audio, native browser saves,
the Ko-fi link, 277 catalogue species and named frontiers through tier 23.
It runs independently of pond.nz: no account, leaderboard or remote brain service.
Progress stays in this browser on this device and is separate from the website.

## Upload

1. Sign in and open [Create a new project](https://itch.io/game/new).
2. Enter **Pond.nz** as the title and choose **HTML** as the project kind.
3. Upload `pond-itch.zip` and mark it **This file will be played in the browser**.
4. Choose **Embed in page**, start at **960 × 600**, enable fullscreen and Mobile Friendly.
5. Keep play free. Optional itch.io donations and the in-game Ko-fi link provide support.
6. Add a cover, screenshots, description and your [Ko-fi link](https://ko-fi.com/pondnz). Save as **Draft** and open the preview.
7. Test entering, feeding, saving/reopening, touch controls and Ko-fi before publishing.

[Official HTML5 upload guide](https://itch.io/docs/creators/html5).

## Suggested description

Cover artwork: `itch/assets/pond-cover-v1.png` (1408 × 1117 PNG, approximately
itch.io's 630:500 cover ratio). Upload it using **Upload Cover Image**. It was
generated with the built-in image tool using the native creature renderer as a
style reference; select **Graphics** alongside **Code** in the AI disclosure.
The prompt is recorded in `itch/assets/pond-cover-v1.prompt.txt`. This is listing
artwork, not a gameplay screenshot or part of the game ZIP.

A living pixel-art pond, full of procedurally animated creatures. Feed and breed
animals, grow reefs and islands, and follow the floor into stranger waters.
Brine labyrinths, bone plains, drowned observatories and the night nursery each
bring different life. Your pond saves as you play. Free to explore; optional
support helps keep it growing.

Genre: Simulation. Possible tags: aquarium, sandbox, procedural-animation,
pixel-art, atmospheric, incremental, creepy.

## Validate and rebuild

Run `python tools/test_expansion_browser.py`, `python tools/build_itch.py`,
`node --check dist/itch/js/game.js`, and `python tools/test_itch_browser.py`.
Run `python tools/test_animals_browser.py` for the unified Animals list:
species and individuals, inline spawn/animal details, Paragon claims and progress,
search/focus, discovery actions and observe/hard-mode restrictions. Animals (C)
replaces the separate census, creature-list expansion and Paragons buttons.
Run `python tools/test_animal_status_browser.py` for condition values and
hover/focus/touch tooltips. [Progression and condition reference](../docs/PROGRESSION.md).
Run `node --test tools/anims.test.js` and `python tools/test_long_animation_browser.py`
for continuous attacks/meals/reactions, including the Leviathan and other long swimmers.
The iframe check covers desktop and phone layouts, local saves, pond switching,
in-game confirmation, the support link and blocked external/API requests.
Screenshots are `dist/itch-1280.png` and `dist/itch-390.png`.

Only game assets ship. Backend code, credentials, tools and local agent files
are excluded. JavaScript is combined in the existing order for predictable
loading; the worker stays separate. Assets use relative URLs for itch's subfolder
hosting. The edition excludes Umami and the noncommercial Seascape adaptation;
Classic and 3D water remain. Silkscreen's OFL is bundled. Existing audio remains
included with its original provenance; review its distribution rights before
monetizing. The website retains its existing optional Seascape licensing.

This ZIP has been tested locally; itch.io processing and the actual hosted preview
still need the account owner's check. No itch.io account login is bundled.
