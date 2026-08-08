# Checkmate — Product Requirements

**Serverless two-player games.** Chess first; a bundle of turn-based games over time. One static web app, two modes: same-device play that works offline, and remote play that needs no server, no account, and — after a one-time pairing link — no leaving the app.

*Status: v1 (chess) shipped at [github.com/cyberhirsch/CheckMate](https://github.com/cyberhirsch/CheckMate), live on GitHub Pages.*

---

## 1. Vision

Board games between two people should not require infrastructure. No matchmaking servers, no accounts, no databases, nothing that costs money to run or can be shut down. The app is a static site; the players' own devices and public store-and-forward infrastructure do all the work. If the host vanishes, any copy of the files anywhere revives the whole product.

## 2. Goals and non-goals

**Goals**

- Complete, legal two-player chess on phones — portrait-first, tap-to-move, no hover or drag required.
- Zero backend: deployable to any static host, forever free to operate.
- Same-device play fully offline (installable PWA).
- Remote play that is *asynchronous* — players never need to be online simultaneously.
- Remote play without leaving the app once paired.
- Every remote input treated as untrusted and validated locally.
- A shell and protocol generic enough that new games plug in without touching transport code.

**Non-goals**

- Real-time play (no clocks, no blitz). Correspondence rhythm is the product.
- Accounts, profiles, ratings, matchmaking with strangers.
- Server-dependent features (push notifications, server-side history). Explicitly traded away for zero infrastructure.
- Engine opponents / AI play (may revisit; not core).

## 3. Users and core use cases

1. **Two people, one phone** — chess at a café table. Hotseat mode, offline, board rotation or handoff screen.
2. **Two friends, different cities, different schedules** — one sends an invite link over any messenger; from then on moves sync automatically whenever either opens the app. Days may pass between moves.
3. **Restricted networks / no reachable relays** — the move link itself carries the entire game; any channel that can deliver ~100 characters of text keeps the game alive.

## 4. Modes

### 4.1 Hotseat (offline)

- Both players use one device; same rules engine, same board.
- Optional **rotation toggle** (default on for mobile) — board flips to the mover each turn. Manual rotate button when off.
- Optional **handoff screen** hiding the board between turns.
- **Undo** (hotseat only), resign, end-as-draw, new game.
- Survives refresh via localStorage. Works with no network after first load.

### 4.2 Online (play by link + relay)

- **Creator plays White; the opener of the invite becomes Black.** Board is always oriented to the local player's color — not configurable.
- **Pairing:** the first link carries game ID, move history, and the sender's Nostr public key. Sent once, over any channel (share sheet, copy, QR).
- **After pairing:** each move is published as a signed event to public Nostr relays; the opponent's client subscribes and applies it. No further manual sharing. Relays store events, so delivery is async.
- **Fallback:** the send-move panel (Share / Copy / QR) stays available after every move. A relay-status line tells the player which path is working. A link can always resynchronize a game the relays lost.
- Resign, draw offer, draw accept travel as flags on both transports.
- No Undo in online mode.

## 5. Architecture requirements

- **Static files only.** Plain ES modules, no build step, no framework. Anything that breaks `npx http-server` + GitHub Pages is out.
- **State in the URL hash** for links — the fragment never reaches any server.
- **Full-history transport.** Every link and every relay event carries the complete move list, never a diff. Receivers replay the whole game through the rules engine.
- **Validation on every remote input:** structural checks, game-ID match, history-extension check against localStorage (fork/staleness detection), full legality replay, and — on the relay path — secp256k1 signature verification and pinned opponent pubkey.
- **Keys and IDs** from `crypto.getRandomValues()`. Keypair generated locally, stored in localStorage, never leaves the device except as a public key.
- **PWA:** manifest, service worker with versioned cache (`CACHE_NAME` bump on every deploy — stale caches have bitten us twice), offline hotseat.
- **Current external dependencies** (esm.sh CDN): chess.js, qrcode, nostr-tools. *Open item: vendor these for full self-containment (also an App Store requirement).*

## 6. Transport protocol

### Link format

```
https://<host>/<path>#t=<game>&g=<gameId>&m=<mv1-mv2-…>&a=<action>&p=<pubkey>
```

- `t` game type, omitted for chess (default) · `g` hex game ID (crypto-random)
- `m` dash-separated move tokens (chess: `e2e4`, promotion `e7e8q`)
- `a` action flag: `res` resign · `do` draw offer · `da` draw accept
- `p` sender's Nostr pubkey (64-hex), enables relay pairing

### Relay events

- Kind **30078** (NIP-78 addressable app data), tag `d = checkmate:<gameId>` — replaceable, so relays keep only each player's latest state.
- Content: `{ moves: [...], action: null | "res" | "do" | "da" }`.
- Published to 4 public relays (damus, nos.lol, nostr.band, snort); one acceptance counts as delivered.
- Opponent seat claimed by the first pubkey publishing a valid extending state (same trust model as possessing the invite link); pinned thereafter.

## 7. Design language

Dark monochrome instrument panel (Typegrid system): pure black ground, `#050505–#111` surface ladder, `#222` hairline borders, sharp corners, no accent color — active states invert to white. Type: **Outfit** for controls and labels (uppercase, letter-spaced), **Inter** for prose, **JetBrains Mono** for links and move history. Grayscale board (`#8b8b8b` / `#3c3c3c`), solid glyphs colored per side. All touch targets ≥ 44px.

## 8. The bundle (roadmap)

The shell (modes, transports, persistence, send panel) is game-agnostic; a game contributes a rules engine, a move-token grammar, and a board renderer. Fit criteria: 2-player, turn-based, deterministic, perfect information — extendable with the tricks noted below.

### Tier 1 — perfect fits, build order

| # | Game | Why / notes |
|---|---|---|
| 1 | **Chess** | ✓ shipped (v1) |
| 2 | **Connect Four** | trivial engine, 1-char move tokens, instantly understood by anyone |
| 3 | **Reversi / Othello** | real strategic depth, dead-simple renderer, short games |
| 4 | **Ultimate Tic-Tac-Toe** | the 9-board version — novel, genuinely deep, very mobile-friendly |
| 5 | **Tic-Tac-Toe** | near-free once Ultimate exists; the "explain the app in 5 seconds" game |

### Tier 2 — straightforward fits

| Game | Notes |
|---|---|
| **Checkers / Draughts** | forced-capture rules need care; otherwise simple |
| **Gomoku** (five in a row) | 15×15 grid, one move token type |
| **Hex** (11×11) | elegant, no draws possible; hexagonal renderer is the only work |
| **Nine Men's Morris** | three phases (place / move / fly) in one small engine |
| **Dots and Boxes** | extra-turn-on-completed-box rule; edge-based move tokens |
| **Mancala / Kalah** | deterministic and perfect-information despite the "sowing" feel |
| **Breakthrough** | pawn-race game, tiny ruleset, fast on mobile |

### Tier 3 — solved randomness (deterministic dice)

| Game | Notes |
|---|---|
| **Royal Game of Ur** | dice derived from `hash(gameId + move history)`, weighted 1-4-6-4-1; both clients compute identical rolls, links stay history-only. Mild look-ahead manipulation possible — documented as casual-fair. Oldest known board game; great thematic anchor for the bundle. |

### Tier 4 — bigger boards / end-game negotiation

| Game | Notes |
|---|---|
| **Go** (9×9, 13×13) | scoring and dead-stone agreement need a negotiation exchange, same mechanism as draw offers |
| **Amazons** (Game of the Amazons) | 10×10, move + arrow per turn; excellent and little-known |
| **Lines of Action** | connection goal, checker-like movement |

### Tier 5 — hidden information via commit-reveal

Hash commitment: publish `sha256(secret + salt)` up front, reveal at game end; cheating is provable after the fact.

| Game | Notes |
|---|---|
| **Battleship** | each player commits fleet layout in the first exchange |
| **Hangman / word-duel** | setter commits the word |
| **Stratego-likes** | per-piece commitments; heaviest of the group |

### Out of scope

| Game class | Why |
|---|---|
| **Backgammon** and dice gambling games | fair per-roll randomness between mutually untrusting async players needs commit-reveal *per roll* — doubles messages per turn, ruins the one-link-per-move rhythm |
| **Card games** (shuffled decks) | same problem plus hidden-hand state; the trust machinery outweighs the game |
| **Real-time games** | violates the async premise entirely |

**Non-game roadmap:** vendor CDN libs → auto-open share sheet after move (toggle) + auto-copy fallback → game picker on start screen → store wrappers (TWA for Google Play; Capacitor for iOS, $25 one-time / $99-yr fees; all licenses BSD/MIT/Apache, commercial-safe).

## 9. Acceptance criteria (v1 — all currently met)

1. Deploys to static hosting; no backend, DB, or accounts.
2. Complete legal chess: castling, en passant, promotion (all four pieces), check/checkmate/stalemate, threefold, fifty-move, insufficient material, resignation, draws.
3. Hotseat: full game on one device; rotation toggle; handoff screen; undo; refresh-restore; works offline.
4. Online: invite link pairs two devices; afterwards a move made on one appears on the other with no manual sharing (relay path), verified two-directionally.
5. Link fallback playable end-to-end with relays unreachable.
6. Tampered, stale, forked, or illegal remote states rejected on both transports.
7. Board always oriented to the local player in online mode.
8. No horizontal scroll ≥ 320px width; touch-only interaction; promotion dialog thumb-reachable.
9. Attribution: commits and published artifacts carry no AI authorship.

## 10. Risks

| Risk | Exposure | Mitigation |
|---|---|---|
| Public relays disappear or prune events | Moves stop arriving | 4-relay redundancy; link fallback is a full resync; relay list is one array in `nostr.js` |
| No push notifications | Players must open the app to see moves | Accepted trade-off; messenger notification of the invite/fallback link fills the gap; store wrapper could add native push later (requires infra — deliberate non-goal for web) |
| CDN (esm.sh) outage breaks first load | App unusable until reachable | Vendor dependencies (planned); SW caches after first load |
| Stale service-worker cache ships old code | Users see fixed bugs | Version bump discipline on every deploy (twice bitten) |
| Apple 4.2 "minimum functionality" rejection | iOS store plan | Capacitor shell, vendored assets, native share/haptics polish |
| localStorage cleared mid-game | Local game copy lost | Any opponent link or relay event fully restores state |
