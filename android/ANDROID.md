# Android packaging (Capacitor)

The Android app is a [Capacitor](https://capacitorjs.com) wrapper: the game
code (HTML/CSS/JS) is copied into the app at build time and loads from disk
in an embedded WebView, not from the internet. There's no address bar —
Capacitor apps are native WebView containers, not browser tabs, so unlike a
Trusted Web Activity there's no Digital Asset Links step to hide one.

Online multiplayer is unaffected: the app still opens WebSocket connections
to the public Nostr relays over the internet, exactly like the website. Only
the *code* is now bundled instead of fetched — offline hotseat play needs
zero network access, online async play needs internet to reach relays either
way.

**Trade-off**: site deploys no longer reach the app instantly. A code change
needs a rebuild + reinstall (or a Play Store update once published) to reach
users on Android. The website itself still updates live for everyone using it
in a browser.

## What lives here

| Path | Purpose |
|---|---|
| `capacitor.config.json` (repo root) | App id, name, web asset dir |
| `scripts/build-www.js` (repo root) | Stages the site into `www/` before sync |
| `android/app/checkmate.keystore` | Signing key (**not in git** — back it up privately) |
| `android/app/src/main/java/.../MainActivity.java` | Grants the WebView camera access for the QR scanner |
| `android/app/build/outputs/apk/release/app-release.apk` | Build output |

`android-twa-old/` at the repo root is the previous Trusted Web Activity
project, kept locally for reference only (not in git, not needed anymore).

## Build

```bash
npm run build:www        # stage index.html, styles/, src/, assets/ into www/
npx cap sync android      # copy www/ into the Android project, sync plugins
```

Then build the signed release APK with Gradle. On Windows, `gradlew.bat`
needs `JAVA_HOME` pointed at a **JDK 21** (Capacitor 8 requires it — JDK 17
fails with `invalid source release: 21`) and `ANDROID_HOME` at the SDK:

```powershell
$env:JAVA_HOME = "<path to a JDK 21>"
$env:ANDROID_HOME = "C:\Users\<you>\AppData\Local\Android\Sdk"
$env:CHECKMATE_KEYSTORE_PASS = "<keystore password>"
cd android
.\gradlew.bat assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`, already
signed (the `signingConfigs.release` block in `android/app/build.gradle`
reads the password from `CHECKMATE_KEYSTORE_PASS`). Verify with:

```bash
apksigner verify --print-certs app-release.apk
```

## Icons and splash screens

Generated from `resources/icon.png` and `resources/icon-foreground.png` via
`npx capacitor-assets generate --android`. Re-run that after changing either
source image.

## Keystore rules

Same as before — **same key forever**. A lost key means a new package id.
`android/app/checkmate.keystore` is gitignored; keep a private backup (see
`android-keystore-backup/` alongside the repo, also gitignored).

## Publishing to Play Store (not done yet)

Same checklist as any Android app: developer registration, `.aab` upload
(`.\gradlew.bat bundleRelease`), store listing assets, content rating,
data-safety form (truthfully: no accounts, no data collected — game state in
localStorage, signed moves via public Nostr relays). Not pursued so far,
Android-only distribution (sideload) is the current target.
