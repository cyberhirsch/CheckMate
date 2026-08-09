# Checkmate — Product Requirements

**Serverless two-player games.** A bundle of turn-based games in one static web app, two modes: same-device play that works offline, and remote play that needs no server, no account, and — after a one-time pairing link — no leaving the app.

*Status: v2 — 13 games shipped (Tiers 1–3 complete). Repo: [github.com/cyberhirsch/CheckMate](https://github.com/cyberhirsch/CheckMate), live on GitHub Pages.*

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
- **Dependencies:** chess.js is **vendored** (`src/vendor/chess.js`); the other 12 engines are self-contained with no dependencies. qrcode and nostr-tools still load from esm.sh on demand — *open item: vendor both for full self-containment (also an App Store requirement).*

## 6. Transport protocol

### Link format

```
https://<host>/<path>#t=<game>&g=<gameId>&m=<mv1-mv2-…>&a=<action>&p=<pubkey>
```

- `t` game type, omitted for chess (default) · `g` hex game ID (crypto-random)
- `m` **dot**-separated move tokens — `.` appears in no token grammar, while `-` does (checkers chains, morris moves). Legacy chess links using `-` still parse.
- `a` action flag: `res` resign · `do` draw offer · `da` draw accept
- `p` sender's Nostr pubkey (64-hex), enables relay pairing

### Relay events

- Kind **30078** (NIP-78 addressable app data), tag `d = checkmate:<gameId>` — replaceable, so relays keep only each player's latest state.
- Content: `{ moves: [...], action: null | "res" | "do" | "da" }`.
- Published to 4 public relays (damus, nos.lol, nostr.band, snort); one acceptance counts as delivered.
- Opponent seat claimed by the first pubkey publishing a valid extending state (same trust model as possessing the invite link); pinned thereafter.

## 6a. Localization

Six languages ship: English, German, Turkish, Romeika, Italian, Chinese (Simplified). All user-facing text is keyed — UI chrome, game titles, per-game player names (White/Black, Red/Yellow, Sun/Moon…), status lines, end-of-game notes, screen-reader announcements and `window.confirm` prompts. Engines return note **keys** (`{k, p}`) rather than English strings, so rules text is translated at render time; language-neutral values like scores pass through untouched.

Language is auto-detected from `navigator.languages` on first visit, then persisted. `<html lang>` is updated so screen readers switch voice; Chinese drops the Latin micro-label letter-spacing, and the font stacks carry CJK fallbacks since Inter/Outfit have no Han glyphs.

**Romeika** (`rom`, tagged `pnt-Latn`) is the Pontic Greek of Trabzon/Of — endangered, oral, with no standard orthography. It is written in **Turkish orthography**, matching how its speakers actually write it. These strings are a best effort pending native-speaker review; the file says so, and so does the README.

## 6b. Identity, games list and friends

**Identity** is a secp256k1 keypair generated on first run and kept in `localStorage`; the public key is the player's durable handle. A display name is collected on first launch and editable in settings; it travels in relay payloads and as `n=` on links, capped at 32 chars and only ever rendered via `textContent` since it arrives from strangers.

**Storage is three stores** (`checkmate:profile:v2`, `:games:v2`, `:friends:v2`) with a one-time migration from the v1 single-game blob. The games map holds every game — hotseat and online — so several can run at once; finished games are pruned past 60.

**One relay subscription** covers every unfinished online game plus a personal inbox tag `checkmate:inbox:<pubkey>`. Background games update in storage as their moves arrive, so the list shows "your turn" without opening them.

**Friends** are auto-recorded from any paired opponent (link or relay), and can also be added directly: the friends screen has an Add Friend sheet showing your own friend link as QR + Share/Copy, and a paste field accepting a friend link or bare pubkey. Friend links use a separate `#f=<pubkey>&n=<name>` format — structurally distinct from game links so the two can't be confused — and opening one adds the sender and lands on the friends screen. Self-add and duplicates are rejected. A friend invite is published to their inbox tag, so repeat opponents never exchange a link again — the remaining uses of links are meeting someone new, plus recovery.

## 6c. Navigation

The app is a small screen stack rather than one page hiding parts of itself: **menu** → **select** → **game**, with **continue** and **friends** hanging off the menu. Back always means one step toward the menu. Mode (offline/online) is chosen by which "new game" the player picks, not a persistent tab, so the game-selection screen knows its own intent — including "choose a game for {friend}" when arriving from a friend invite.

**Sharing is surfaced only when the opponent genuinely needs it**: before pairing (the first move of an online game) and whenever a relay publish fails. It appears as a **modal sheet**, never as a panel in the page flow — the game screen must never grow taller than the viewport. The QR renders immediately alongside Share/Copy rather than sitting behind a button. Once paired the sheet stays away and moves flow over relays; a Share button in the game controls reopens it on demand.

"Paired" means we hold the opponent's pubkey, which is true as soon as we open their link *or* address an invite to a friend — an invited friend is reachable from the outset, so the inviter is never asked to share a link. Links always carry `p=`; the transport keypair is awaited before a link is emitted so this can't race.

**No scrolling during play.** On phones the game screen is locked to `100svh` (small viewport units, so it holds as browser chrome shows and hides). The board is capped to the height actually left after header, status and controls; move history scrolls inside itself rather than scrolling the page. Verified at 375×812 and 320×568 across square, tall and wide boards.

## 6d. Notifications

Opt-in, two tiers, both achievable with zero infrastructure because they only fire while the tab's own JS is alive to receive relay events:

- **In-app toast** — shown whenever the tab is visible and focused. Bottom-sheet style, auto-dismisses after 5s, tap opens the game.
- **OS notification banner** — shown instead of a toast when the tab is open but backgrounded (`document.visibilityState === "hidden"` or unfocused) and `Notification` permission is granted. Tap focuses the tab and opens the game via a `checkmate:open-game` custom event, keeping `notify.js` decoupled from screen routing.

Triggers: opponent moves (current game and any background game), resign, draw offer/accept, and game invites. Permission is requested only from an explicit settings-toggle tap (never on load) since browsers penalize or auto-deny ungestured requests.

**Deliberately excluded: push notifications when the app/browser is fully closed.** No client-side code runs in that state, so waking the OS requires a server watching relays continuously and forwarding to APNs/FCM — infrastructure this project has none of by design (see Non-goals, §2). Considered and explicitly declined in favor of staying serverless; revisit only if that non-goal changes.

## 7. Design language

Dark monochrome instrument panel (Typegrid system): pure black ground, `#050505–#111` surface ladder, `#222` hairline borders, sharp corners, no accent color — active states invert to white. Type: **Outfit** for controls and labels (uppercase, letter-spaced), **Inter** for prose, **JetBrains Mono** for links and move history. Grayscale board (`#8b8b8b` / `#3c3c3c`), solid glyphs colored per side. All touch targets ≥ 44px.

## 8. The bundle (roadmap)

The shell (modes, transports, persistence, send panel) is game-agnostic; a game contributes a rules engine, a move-token grammar, and a board renderer. Fit criteria: 2-player, turn-based, deterministic, perfect information — extendable with the tricks noted below.

**Engine contract** (`src/games/registry.js` documents it in full): a module exports `meta` (id, title, glyph, player names, `rotatable`, `moveRe`), `createEngine(tokens, {gameId})` returning `null` if any token is illegal, `createView(container)` with `render`/`onTap`, and `tapReducer(engine, selection, cellId)` returning `move` / `select` / `choose` / `none`. Registering a module grants it both modes, link + relay sync, validation, and persistence with no transport code.

### Tier 1 — perfect fits ✓ shipped

| # | Game | Token grammar | Notes |
|---|---|---|---|
| 1 | **Chess** | `e2e4`, `e7e8q` | vendored chess.js; full rules incl. promotion dialog |
| 2 | **Connect Four** | `0`–`6` | 1-char tokens, the shortest links in the bundle |
| 3 | **Reversi / Othello** | `d3` | explicit turn tracking (passes break move parity) |
| 4 | **Ultimate Tic-Tac-Toe** | `MN` | forced-board rule; decided boards free the move |
| 5 | **Tic-Tac-Toe** | `0`–`8` | shares the line-winner helper with Ultimate |

### Tier 2 — straightforward fits ✓ shipped

| Game | Token grammar | Notes |
|---|---|---|
| **Checkers / Draughts** | `c3-d4`, `c3xe5xg7` | mandatory captures, multi-jump chains, kings |
| **Gomoku** | `h8` | 15×15, five-in-a-row detection from the placed stone |
| **Hex** | `a1` | 11×11 rhombus, flood-fill connection test, no draws possible |
| **Nine Men's Morris** | `P0`, `M0-1`, `…X5` | three phases (place/move/fly), mills trigger a removal sub-step |
| **Dots and Boxes** | `h0,0`, `v0,0` | completing a box grants another turn |
| **Mancala / Kalah** | `0`–`5` | sowing, extra turn on own store, capture, end-sweep |
| **Breakthrough** | `a2a3` | diagonal captures only, race to the last rank |

### Tier 3 — solved randomness ✓ shipped

| Game | Token grammar | Notes |
|---|---|---|
| **Royal Game of Ur** | `0`–`14`, `x` (pass) | Dice derived from FNV-1a over `gameId + roll index + history`, 4 binary dice (1-4-6-4-1 weighting). Both clients compute identical rolls — verified across independent engine instances — so links stay history-only. Rosettes grant extra rolls; centre rosette is capture-safe. Mild look-ahead manipulation possible: documented as casual-fair, not tournament-fair. |

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

**Non-game roadmap:** vendor remaining CDN libs (qrcode, nostr-tools) → auto-open share sheet after move (toggle) + auto-copy fallback → per-game rules blurb in setup → store wrappers (TWA for Google Play; Capacitor for iOS, $25 one-time / $99-yr fees; all licenses BSD/MIT/Apache, commercial-safe).

## 9. Acceptance criteria (v2 — all currently met)

1. Deploys to static hosting; no backend, DB, or accounts.
2. Complete legal chess: castling, en passant, promotion (all four pieces), check/checkmate/stalemate, threefold, fifty-move, insufficient material, resignation, draws.
3. All 13 games (Tiers 1–3) playable in both modes with correct win/draw detection.
4. Hotseat: full game on one device; rotation toggle (rotatable games only); handoff screen; undo; refresh-restore; works offline.
5. Online: invite link pairs two devices; afterwards a move made on one appears on the other with no manual sharing (relay path), verified two-directionally for chess and Connect Four.
6. Link fallback playable end-to-end with relays unreachable; token grammars with `-` round-trip correctly.
7. Tampered, stale, forked, or illegal remote states rejected on both transports.
8. Board always oriented to the local player in online mode (rotatable games).
9. Ur dice identical across independent engine instances given the same game ID and history.
10. No horizontal scroll ≥ 320px width; touch-only interaction; choice dialogs thumb-reachable.
11. Six languages complete (122 keys each, no gaps); switching relabels the live board without restarting a game.
12. Attribution: commits and published artifacts carry no AI authorship.

## 10. Risks

| Risk | Exposure | Mitigation |
|---|---|---|
| Public relays disappear or prune events | Moves stop arriving | 4-relay redundancy; link fallback is a full resync; relay list is one array in `nostr.js` |
| No push notifications | Players must open the app to see moves | Accepted trade-off; messenger notification of the invite/fallback link fills the gap; store wrapper could add native push later (requires infra — deliberate non-goal for web) |
| CDN (esm.sh) outage breaks first load | App unusable until reachable | Vendor dependencies (planned); SW caches after first load |
| Stale service-worker cache ships old code | Users see fixed bugs | Version bump discipline on every deploy (twice bitten) |
| Apple 4.2 "minimum functionality" rejection | iOS store plan | Capacitor shell, vendored assets, native share/haptics polish |
| localStorage cleared mid-game | Local game copy lost | Any opponent link or relay event fully restores state |
