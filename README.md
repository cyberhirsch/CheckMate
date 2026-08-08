# Checkmate — Games by Link

A serverless two-player game app. Chess today, a game bundle tomorrow. Fully static, mobile-first, installable as a PWA.

**Play it:** deploy to any static host — no backend, no accounts, no database.

## Two modes

### Hotseat (offline)
Two players share one device and pass it back and forth. Works fully offline once the app has loaded. Optional board rotation after each turn and a handoff screen to hide the board between moves.

### Online (play by link)
Correspondence-style play with **no server and no live connection**. The entire game travels inside the URL:

```
https://your-host/checkmate/#g=427cf203a1a9&m=e2e4-e7e5
```

1. Start a game, make your move as White.
2. Tap **Share** (or Copy / QR) and send the link over any messenger — WhatsApp, SMS, email, anything.
3. Your opponent opens the link whenever they like. The game loads automatically; they move and send a link back.
4. Repeat until mate. The link *is* the game.

Neither player ever needs to be online at the same time. The hash fragment never reaches any server, so even the static host sees no game data.

## How it stays honest without a server

- Every link carries the **complete move history**, not a diff. Both clients replay the whole game through [chess.js](https://github.com/jhlywa/chess.js) and reject links containing illegal moves.
- Your copy of each game is kept in `localStorage`. An incoming link must be **your known history extended by legal moves** — stale, forked, or tampered links are detected and ignored.
- Resignation and draw offers/acceptance travel as flags on the same links.
- Game IDs come from `crypto.getRandomValues()`.

## Tech

- Plain ES modules, no build step, no framework.
- [chess.js](https://github.com/jhlywa/chess.js) for rules: full legality, check/checkmate/stalemate, castling, en passant, promotion, threefold repetition, fifty-move rule, insufficient material.
- Web Share API / Clipboard API / QR code for sending links, with copy-paste fallbacks.
- Service worker + web app manifest: installable, offline-capable hotseat.
- Design: dark monochrome instrument-panel UI — Inter / Outfit / JetBrains Mono, pure black surfaces, hairline borders, no accent color.

## Run locally

Any static file server works (ES modules don't run from `file://`):

```bash
npx http-server -p 8080 -c-1
```

Then open `http://localhost:8080`.

## Deploy

Push to GitHub Pages, Netlify, Cloudflare Pages, or any static host with HTTPS (needed for the service worker and share/clipboard APIs). Links automatically point at wherever the app is hosted — nothing to configure.

## The bundle

The link protocol is game-agnostic: links carry a game-type field (`t=`, omitted for chess), and each game plugs a rules engine into the shared shell — mode switch, send-move panel, history, persistence. Planned next: Connect Four, Reversi, Ultimate Tic-Tac-Toe. Any 2-player, turn-based, perfect-information game fits.

## Project structure

```
index.html              app shell
manifest.webmanifest    PWA manifest
service-worker.js       offline cache
styles/                 base / board / mobile / desktop CSS
src/
  main.js               bootstrap and wiring
  state.js              central app state
  chess-engine.js       chess.js wrapper
  game-controller.js    shared move pipeline (both modes)
  hotseat-controller.js rotation, handoff, undo
  online-controller.js  play-by-link mode
  link-codec.js         URL hash encode / decode / validate
  board.js              tap-to-move board rendering
  ui.js                 status bar, history, dialogs
  mode-controller.js    mode switching
  storage.js            localStorage persistence
  qr.js                 QR rendering
```
