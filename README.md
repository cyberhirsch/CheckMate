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

Every game supports both modes, full rules validation, move history, undo (hotseat), resignation, and draws.

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

## Getting around

The app opens on a main menu: **New offline game**, **New online game**, **Continue** (with a badge counting games waiting on you), and **Friends**. Either "new game" leads to a game-selection screen; picking a game starts it straight away.

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

Adding a language means adding one block to `STRINGS` in `src/i18n.js` (122 keys) and one entry to `LANGUAGES`. Missing keys fall back to English rather than breaking.

## Tech

- Plain ES modules, no build step, no framework.
- [chess.js](https://github.com/jhlywa/chess.js) vendored locally; the other 12 engines are self-contained.
- [nostr-tools](https://github.com/nbd-wtf/nostr-tools) for relay transport, [qrcode](https://github.com/soldair/node-qrcode) for QR links.
- Service worker + web app manifest: installable, offline-capable.
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

Any static host with HTTPS — GitHub Pages, Netlify, Cloudflare Pages. Links automatically point at wherever the app is hosted.

## Project structure

```
index.html              app shell
manifest.webmanifest    PWA manifest
service-worker.js       offline cache (bump CACHE_NAME on deploy)
PRD.md                  product requirements
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
  vendor/chess.js       vendored dependency
  games/
    registry.js         game registration
    grid-view.js        shared square-grid renderer
    <13 game modules>
```
