# Procedural Pond for YouTube Playables

Build the separate YouTube edition from the repository root:

```sh
python tools/build_playables.py
```

The upload artifact is `dist/pond-youtube-playable.zip`, with `index.html` at
the archive root. The extracted game is in `dist/youtube-playables/`; the size
report is `dist/youtube-playables-report.json`. Generated files are ignored by
Git and excluded from the website's Docker image. Rebuild after game changes.
The build uses Python's standard library and preserves the existing classic
JavaScript, Canvas and WebGL stack.

Preview with `python -m http.server 8123 --directory dist`, then open
`http://localhost:8123/youtube-playables/`. Google's SDK is a no-op outside
Playables, so the preview retains progress only during that page session.
Use YouTube's environment to test persistent cloud saves.

The packaged game loads the official SDK before its own scripts. Its loading
screen reports `firstFrameReady`; the interactive entry menu reports
`gameReady`. Cloud data loads before any game code reads preferences or saves.
A failed or unsupported cloud load shows Retry and cannot overwrite prior
progress. Saves contain the existing pond serialization and settings in a
versioned envelope. Writes run in order, coalescing intervening autosaves. The
SDK's 3 MiB limit is guarded conservatively in UTF-16 and UTF-8; oldest inactive
ponds are dropped if needed, and an oversized current pond leaves the last
valid save intact and shows a save failure. Up to twelve ponds are retained.
No browser storage is used by the YouTube edition.

Host pause cancels the game frame loop, freezes the entry animation, suspends
audio, blocks input and requests a save. Resume preserves the player's own
pause choice. All synthesized sound, recorded effects, land/water beds, music
and the entry sound go through the host mute gate. Confirmation dialogs render
inside the game because YouTube's sandbox disallows native modal dialogs.
Switching saved ponds stays on the same page. The best depth in whole fathoms
is stored across ponds and sent through `sendScore` after a successful save.

The YouTube edition has local simulation and progression, without server
accounts, public ponds, visiting, naming, sharing, photo downloads or remote
TypeSafe/Fly/Fish controllers. Creature instincts and the existing deterministic
simulation remain active. The font and audio ship in the bundle; the only
external script is Google's required SDK. Entry water uses the main-thread
fallback, avoiding workers. The world pixel budget is 1.2 million in this
edition, and automatic base sizes are capped at 960 × 540. These bounds reduce
allocation during growth; they do not certify device memory performance.

Validate locally:

```sh
node --check dist/youtube-playables/js/game.js
node --test tools/playables.test.js server/minds_client.test.js server/mindplay_client.test.js
python tools/test_playables_browser.py
```

The browser test requires Python Playwright and Chrome. It uses a mock SDK,
YouTube-style CSP and sandbox restrictions, disabled native storage, and muted
headless audio. It covers failed-load retry, save/reopen, scores, host and user
pause, every audio destination's mute gate, in-game confirmation, SPA pond
switching, touch entry, orientation changes and unexpected network requests.
Screenshots are written to `dist/playables-1280.png` and
`dist/playables-390.png`.

Before submission, run the [official SDK Test Suite](https://developers.google.com/youtube/gaming/playables/test_suite)
and validate the ingested game on real Android and iOS devices, including a
large, old pond with sound enabled. The local checks do not verify the 512 MB
peak heap limit, physical-device frame rates, accessibility or certification.
Autosaves run every fifteen seconds and on host pause; the SDK's final exit
flush is best effort and limited to 64 KiB, so larger ponds rely on regular
autosaves. Portal metadata and required thumbnails must also be provided.
Proposed title: **Procedural Pond**. Description: **Grow a living pond. Feed,
plant and build as its animals breed, evolve and discover stranger depths.**

Publishing needs YouTube developer access and review; the
[Playables overview](https://developers.google.com/youtube/gaming/playables)
links the interest form. This repository does not submit or publish the game.
The existing Seascape adaptation retains its CC BY-NC-SA 3.0 attribution and
license, as documented in the root README. Review third-party asset permissions
before submitting a monetized edition. The bundled Silkscreen font includes
its SIL Open Font License in `fonts/OFL.txt`.

References checked for this integration:

- [SDK setup](https://developers.google.com/youtube/gaming/playables/reference/getting_started)
- [SDK API](https://developers.google.com/youtube/gaming/playables/reference/sdk)
- [Integration requirements](https://developers.google.com/youtube/gaming/playables/certification/requirements_integration)
- [Privacy requirements](https://developers.google.com/youtube/gaming/playables/certification/requirements_privacydata)
- [Design requirements](https://developers.google.com/youtube/gaming/playables/certification/requirements_design)
- [Size and performance limits](https://developers.google.com/youtube/gaming/playables/certification/requirements_stability)
