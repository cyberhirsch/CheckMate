# Android packaging (Trusted Web Activity)

The Play Store build wraps the deployed PWA in a Trusted Web Activity —
Google's supported way to ship a web app on Play. The app *is* the website;
updates ship by deploying the site, with no store review needed unless the
wrapper itself changes.

## What lives here

| File | Purpose |
|---|---|
| `twa-manifest.json` | Bubblewrap config — package id, colors, icons, signing settings |
| `assetlinks.json` | Digital Asset Links — proves the app and site belong together |
| `checkmate.keystore` | Signing key (**not in git** — back it up privately) |
| `keystore-secrets.txt` | Keystore passwords (**not in git**) |
| `app/`, `gradle*` | Generated Android project (regenerate any time with `bubblewrap update`) |

## Build

```bash
cd android
npx @bubblewrap/cli update --skipVersionUpgrade   # regenerate project from twa-manifest.json
npx @bubblewrap/cli build                          # produces app-release-signed.apk + .aab
```

Bubblewrap reads JDK/SDK paths from `~/.bubblewrap/config.json` and asks for
the keystore passwords (in `keystore-secrets.txt`). For a non-interactive
build, export them first:

```bash
export BUBBLEWRAP_KEYSTORE_PASSWORD=... BUBBLEWRAP_KEY_PASSWORD=...
```

Output: `app-release-signed.apk` (sideload/test) and `app-release-bundle.aab`
(what Play Console wants).

## Digital Asset Links — the one manual step

Without this, the app opens with a browser URL bar. The file must be served
from the **origin root**, and GitHub Pages project sites can't do that from
this repo:

- Required URL: `https://cyberhirsch.github.io/.well-known/assetlinks.json`
- That path belongs to the **`cyberhirsch.github.io` repo** (the user site),
  not to `CheckMate`. Create that repo if needed, add
  `.well-known/assetlinks.json` with the contents of `assetlinks.json` here.
- Verify with: `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://cyberhirsch.github.io&relation=delegate_permission/common.handle_all_urls`

If you later add more apps/keys, the file is a JSON array — append entries.

## Play Console checklist

1. One-time developer registration: $25 at play.google.com/console.
2. Create app → upload `app-release-bundle.aab` to a closed test track first.
3. Store listing needs: title, short + full description, at least 2 phone
   screenshots, a 512×512 icon (use `assets/icon-512.png`), a 1024×500
   feature graphic, privacy policy URL, content rating questionnaire,
   data-safety form (truthfully: no accounts, no data collected — game state
   in localStorage, signed moves via public Nostr relays).
4. Google requires ~20 testers for 14 days on new personal accounts before
   production release — plan for the closed-testing phase.

## Versioning

Bump `appVersionCode` (integer, must always increase) and `appVersionName`
in `twa-manifest.json`, then `update` + `build` again. Only needed when the
wrapper changes — site deploys reach the app instantly.

## Keystore rules

- **Same key forever**: Play identifies the app by signature. A lost key
  means a new package id and a fresh listing (or Play App Signing recovery,
  if enrolled — do enroll when uploading the first AAB).
- Never commit `checkmate.keystore` or the passwords.
