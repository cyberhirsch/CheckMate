# Checkmate — Games by Link

A serverless two-player game bundle. **13 turn-based games**, one static web app, no backend, no accounts, no database.

**Play offline** on one device, or **play online** where moves sync automatically through public relays — with a shareable link as the universal fallback.

Available in **English, Deutsch, Türkçe, Romeika, Italiano and 中文**.

## The games

| | Game | | Game |
|---|---|---|---|
| ♞ | Chess | ⛃ | Checkers |
| ◍ | Connect Four | ✻ | Gomoku |
| ◯ | Tic-Tac-Toe | ⬡ | Hex |
| ⬚ | Ultimate Tic-Tac-Toe | ◈ | Nine Men's Morris |
| ◐ | Reversi | ⊞ | Dots & Boxes |
| ♙ | Breakthrough | ◔ | Mancala |
| 𒀭 | Royal Game of Ur | | |

Every game supports both modes, full rules validation, undo (hotseat), resignation, and draws.

The board is strictly monochrome — black, white and greys, no colour anywhere. Pieces aren't told apart by hue but by a heavy contrasting outline, so a black stone reads clearly on a dark board and a white one on a light square.

## Two modes

### Hotseat (offline)
Two players share one device. Works fully offline once loaded. Optional board rotation after each turn and a handoff screen to hide the board between turns.

### Online (async, serverless)
Correspondence play where **neither player needs to be online at the same time**:

1. Start a game, make your move.
2. Send the invite link once — over any messenger, or as a QR code.
3. Your first move presents a QR code and a share/copy link immediately — that one exchange is all the pairing needs.
4. From then on, moves sync **automatically through public [Nostr](https://nostr.com) relays**, and the share panel disappears. Open the app whenever you like; your opponent's moves are waiting.
5. If relays are unreachable, the share panel returns — the link still carries the entire game, so sending it keeps things moving.

No server, no accounts, no matchmaking. The relays are free public infrastructure; the link is the fallback that always works.

## Notifications

An opt-in toggle in Settings turns on move notifications: an in-app toast while you're looking at the app, or a real OS notification banner if the tab is open but in the background (another app in front, or another browser tab). Tapping either jumps straight to that game.

There is deliberately no push notification when the app or browser is fully closed — that would need something running online around the clock to watch relays and forward to Apple/Google's push services, which is exactly the kind of infrastructure this project has none of. See the PRD for the full reasoning.

## Getting around

The app opens on a main menu: **New offline game**, **New online game**, **Continue** (with a badge counting games waiting on you), and **Friends**. Either "new game" leads to a game-selection screen; picking a game starts it straight away.

## Catching up, and learning the rules

There's no move list. Coming back to a correspondence game, what you actually want is *what just happened* — so a **Last move** button loops a pulse over the squares your opponent touched, in any game, until you tap it again.

The space that would have held a move list shows a short **How to play** instead, for games that carry one. A game opts in by listing translation keys:

```js
export const meta = { …, tutorial: ["tut.ur.1", "tut.ur.2", …] };
```

Games without a tutorial hide the panel rather than showing an empty box. The Royal Game of Ur has one so far.

## Players, games and friends

Set a display name the first time you open the app (changeable any time from the settings panel). Your identity is a keypair generated on your device — no account, nothing sent anywhere but your public key.

- **Your games** — every game you're in, hotseat or online, with whose turn it is and how long ago it moved. Tap to resume, and games update themselves in the background as opponents' moves arrive.
- **Friends** — anyone you play is remembered by their public key. Once you've played someone, you can invite them to a new game **straight through the relays, with no link at all** — the invite lands in their app and appears in their games list.

## How it stays honest without a server

- Every link and relay event carries the **complete move history**, not a diff. Both clients replay and validate the whole game locally.
- Moves published to relays are **cryptographically signed** (secp256k1); your opponent's key is pinned at pairing.
- Your copy of each game lives in `localStorage`. An incoming state must **extend your known history** — stale, forked, or tampered states are rejected.
- Game IDs and keys come from `crypto.getRandomValues()`.
- The Royal Game of Ur derives its dice deterministically from `hash(gameId + move history)`, so both clients compute identical rolls with no extra messages. (Casual-fair — see the PRD for the caveat.)

## Languages

The interface, game names, player names and every status message are translated into six languages, picked from the selector in the header (auto-detected from the browser on first visit, then remembered).

**Romeika** deserves a note: it's the Pontic Greek variety still spoken around Trabzon and Of in north-east Türkiye — endangered, overwhelmingly oral, and without a standardized written form. Its speakers are literate in Turkish, so it's written here in Turkish orthography rather than Greek script, which is how speakers themselves write it when they write it at all. The strings in `src/i18n.js` are a best effort and **corrections from native speakers are very welcome** — open an issue or a PR.

Adding a language means adding one block to `STRINGS` in `src/i18n.js` (200 keys) and one entry to `LANGUAGES`. Missing keys fall back to English rather than breaking.

## Tech

- Plain ES modules, no build step, no framework.
- [chess.js](https://github.com/jhlywa/chess.js) vendored locally; the other 12 engines are self-contained.
- [nostr-tools](https://github.com/nbd-wtf/nostr-tools) for relay transport, [qrcode](https://github.com/soldair/node-qrcode) for QR links — all vendored locally in `src/vendor/`, no CDN fetches at runtime.
- Service worker + web app manifest: installable, offline-capable.
- Android app via [Capacitor](https://capacitorjs.com) — bundles the same code locally, no address bar. See `android/ANDROID.md`.
- Design: dark monochrome instrument panel — Inter / Outfit / JetBrains Mono, pure black surfaces, hairline borders, no accent color.

## Adding a game

Games plug into a shared shell (modes, transports, persistence, history). A game module exports:

```js
export const meta = { id, titleKey, glyph, players, rotatable, moveRe };
export function createEngine(tokens, { gameId }) { … }   // null if any token is illegal
export function createView(container) { … }              // render + onTap
export function tapReducer(engine, selection, cellId) { … }  // tap → move | select | choose
```

Register it in `src/games/registry.js` and it inherits both modes, link/relay sync, validation, and persistence automatically.

## Run locally

```bash
npx http-server -p 8080 -c-1
```

Then open `http://localhost:8080`. (ES modules don't run from `file://`.)

## Deploy

Any static host with HTTPS — GitHub Pages, Netlify, Cloudflare Pages. Links automatically point at wherever the app is hosted. Bump `CACHE_NAME` in `service-worker.js` on every deploy, or returning visitors keep the cached shell.

## Android app

Packaged with [Capacitor](https://capacitorjs.com): the site is copied into the APK and loads from disk, so there's no address bar and no server round-trip to start a game. Online play still reaches the public relays over the internet exactly as the website does — only the code is local.

```bash
npm run cap:sync     # stage the site into www/ and copy it into the project
npm run icons        # regenerate launcher icons + splash from Graphics/Logo2.png
npm run screenshots  # Play Store captures at 1080x1350 (needs Chrome)
```

Then build the signed release APK with Gradle — see `android/ANDROID.md` for the JDK/SDK setup and the Windows quirks.

The trade-off versus the old Trusted Web Activity: app updates now need a rebuild and reinstall instead of arriving with a site deploy.

## Project structure

```
index.html              app shell
manifest.webmanifest    PWA manifest
service-worker.js       offline cache (bump CACHE_NAME on deploy)
PRD.md                  product requirements
capacitor.config.json   Android wrapper config
android/                Capacitor Android project (+ ANDROID.md)
resources/              icon / splash sources for capacitor-assets
scripts/
  build-www.js          stages the site into www/ for Capacitor
  gen-icons.js          icons + splash from Graphics/Logo2.png
  screenshots.js        Play Store captures via headless Chrome
  genqr.mjs             QR to the sideload APK on this LAN
styles/                 base / board / games / mobile / desktop CSS
src/
  main.js               bootstrap and wiring
  state.js              central app state
  board-host.js         mounts the active game's view, tap pipeline
  game-controller.js    shared move pipeline (both modes)
  hotseat-controller.js rotation, handoff, undo
  online-controller.js  link + relay transport
  link-codec.js         URL hash encode / decode / validate
  nostr.js              signed relay transport
  ui.js, mode-controller.js, storage.js, qr.js
  vendor/               vendored deps: chess.js, nostr-tools, qrcode
  games/
    registry.js         game registration
    grid-view.js        shared square-grid renderer
    <13 game modules>
```
