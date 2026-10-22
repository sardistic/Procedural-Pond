# Pond for Google Play

The Android edition bundles the existing JavaScript game in a small native Java
host. It plays offline, saves ponds and albums on the device, and exports PNG
photos through Android's file picker. Website accounts, visiting, rankings,
remote minds, analytics, donation links and the Seascape adaptation are excluded.
No network or runtime permissions are requested. Clearing app data/uninstalling
removes saves; cloud backup and device transfer are disabled.

## Build

Requirements: JDK 17, Python 3, Android SDK platform 36 and Build Tools 36.1.0.
The pinned Gradle 8.13 wrapper and Android Gradle Plugin 8.13.0 download their
dependencies on first use. Set `ANDROID_HOME` to your SDK directory (the build
script discovers the normal Windows location). `POND_PYTHON` can select Python.

For a **new** app, generate an upload key and build:

```powershell
python tools/build_android.py --init-upload-key
```

Subsequent builds use `python tools/build_android.py`. Never generate a new key
for an existing Play app unless performing Google's upload-key reset procedure.
The script refuses to replace an existing key. On Windows, the key and its
properties are stored under `%LOCALAPPDATA%\Pond\signing\nz.pond.game`, with
inheritance removed and access granted to the current user. **Securely back up
this directory separately.** Neither passwords nor private keys belong in Git
or the upload ZIP. `POND_SIGNING_PROPERTIES` can point to an existing external
properties file with `storeFile`, `storePassword`, `keyAlias`, `keyPassword`.

Outputs in `dist/google-play/`:

- `pond-1.0.0.aab`: signed Google Play upload, package `nz.pond.game`, version code 1.
- `pond-1.0.0.apk`: signed direct-install test build; do not upload it instead of the AAB.
- `upload-certificate.pem`: public upload certificate, safe to provide to Play Console.
- `build-report.json`: sizes and SHA-256 digests of the artifacts.

The app targets API 36 and supports API 26+. It contains no native `.so` libraries;
the system supplies WebView. New releases must increment `versionCode` and
`versionName` in `app/build.gradle` and the output metadata/names in
`tools/build_android.py` before rebuilding. Use the same upload key.

The first edition uses system WebView with a secure local HTTPS asset origin.
All requests are intercepted; missing assets and remote resources are denied.
File/content URL access is disabled. Only the narrow, bounded PNG export bridge
is exposed to local scripts. Release WebView debugging is disabled. Android
insets protect controls from the status/navigation bars and keyboard. Back closes
game panels, then offers Save and leave. Backgrounding saves and mutes without
changing the player's chosen pause state.

## Test

```powershell
android/gradlew.bat -p android assembleDebug lintDebug
python -m pip install websocket-client
python tools/test_android_device.py
```

Connect one emulator/device with `adb`. The test installs only
`nz.pond.game.debug`, changes that test pond, backgrounds/restarts it, opens the
photo picker and temporarily rotates the display. It restores rotation settings.
It never clears release-app data. Reports/screenshots go to
`dist/google-play/testing/`. Use a dedicated emulator while it runs.

Additionally validate the release AAB with Google's `bundletool validate`, verify
the APK with SDK `apksigner verify`, and install the release APK. Play Console's
internal testing and pre-launch report should follow before a public rollout.
An emulator check is not a hardware performance guarantee.

## Upload

1. Create **Pond**, a game, in Play Console using package `nz.pond.game`. Set your
   developer identity, countries, pricing and intended audience deliberately.
2. In an internal testing release, enable Play App Signing and upload the `.aab`.
   Let Google manage the app-signing key; this local key signs uploads.
3. Use the listing draft and graphics in `dist/google-play/listing/`. Supply your
   public support email. Privacy URL: `https://pond.nz/android-privacy.html`.
4. Complete app access (no login), ads (none), and Data safety based on this
   offline edition: no developer collection/sharing. Review the questionnaire
   yourself; Google Play's own processing is separate.
5. Complete the content rating and audience forms truthfully. The game includes
   animal predation/death and later dark fantasy creatures; do not assume a
   children's rating. Confirm redistribution rights for the included audio.
6. Install through the internal test link on real phones, check startup/audio,
   pause/resume, saves after relaunch, portrait/landscape, long sessions and photos.
   Resolve Play's pre-launch findings, then request the desired rollout.

Some personal developer accounts need a closed test with at least 12 continuously
opted-in testers for 14 days before applying for production access. Account
verification and Google review cannot be completed by building an AAB.

References checked 22 October 2026:
[target API requirements](https://developer.android.com/google/play/requirements/target-sdk),
[upload signing](https://developer.android.com/studio/publish/app-signing),
[preview assets](https://support.google.com/googleplay/android-developer/answer/9866151),
[testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465).
