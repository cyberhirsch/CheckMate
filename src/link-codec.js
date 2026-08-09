// Encodes a full game into the URL hash and decodes/validates incoming links.
// Format: #t=<gameType>&g=<gameId>&m=<mv1-mv2-…>&a=<action>&p=<pubkey>
// The hash fragment never leaves the browser, and every link carries the
// complete move history so both players re-validate the whole game locally.
// `t` selects the rules engine from the registry; move-token syntax is
// validated per game before any engine sees it.

import { GAMES, gameModule } from "./games/registry.js";

const GAME_ID_RE = /^[0-9a-f]{6,32}$/;
const ACTIONS = new Set(["res", "do", "da"]); // resign, draw offer, draw accept
export const MAX_LINK_MOVES = 1024;

// Where shared links should point. Inside the Capacitor app the page is served
// from https://localhost, so location.origin would produce links that resolve
// to the *recipient's* own device — useless once sent. Native builds therefore
// fall back to the canonical public URL. Update this when the site moves.
const PUBLIC_BASE = "https://cyberhirsch.github.io/CheckMate/";

// True for the Capacitor WebView and for a plain `file://` open — anywhere the
// current origin is meaningless to anyone else.
function originIsPrivate() {
  const h = location.hostname;
  return (
    !!window.Capacitor ||
    location.protocol === "file:" ||
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "" ||
    h === "[::1]"
  );
}

// The base every shareable link is built on, with a trailing-slash-safe path.
export function linkBase() {
  if (originIsPrivate()) return PUBLIC_BASE;
  return location.origin + location.pathname;
}

export function generateGameId() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function encodeLink({ gameType = "chess", gameId, moves, action, pubkey, name }) {
  const params = new URLSearchParams();
  if (gameType !== "chess") params.set("t", gameType); // chess is the default, keeps links short
  params.set("g", gameId);
  // "." separator: some games' tokens legitimately contain "-" (checkers chains,
  // morris moves), so "-" can't delimit. "." appears in no token grammar.
  if (moves.length) params.set("m", moves.join("."));
  if (action) params.set("a", action);
  if (pubkey) params.set("p", pubkey); // sender's Nostr pubkey, lets the opener pair for relay sync
  if (name) params.set("n", name.slice(0, 32)); // display name, capped so links stay short
  const base = linkBase();
  return `${base}#${params.toString()}`;
}

export function parseHash(hash) {
  const raw = (hash || "").replace(/^#/, "");
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const gameType = params.get("t") || "chess";
  const mod = GAMES[gameType];
  if (!mod) return { ok: false, reason: "unknown-game-type" };
  const gameId = params.get("g");
  if (!gameId || !GAME_ID_RE.test(gameId)) return { ok: false, reason: "bad-game-id" };
  const action = params.get("a") || null;
  if (action && !ACTIONS.has(action)) return { ok: false, reason: "bad-action" };
  const movesRaw = params.get("m") || "";
  // Legacy chess links (pre-bundle) used "-" as the separator; chess tokens
  // themselves never contain "-", so that split stays unambiguous.
  const sep = movesRaw.includes(".") ? "." : gameType === "chess" ? "-" : ".";
  const moves = movesRaw ? movesRaw.split(sep) : [];
  if (moves.length > MAX_LINK_MOVES) return { ok: false, reason: "too-many-moves" };
  for (const m of moves) {
    if (!mod.meta.moveRe.test(m)) return { ok: false, reason: "bad-move-token" };
  }
  const pubkeyRaw = params.get("p");
  const pubkey = pubkeyRaw && /^[0-9a-f]{64}$/.test(pubkeyRaw) ? pubkeyRaw : null;
  // Names come from a stranger's link, so treat them as untrusted text: cap the
  // length and let the DOM escape them (we only ever set textContent).
  const name = (params.get("n") || "").slice(0, 32);
  return { ok: true, gameType, gameId, moves, action, pubkey, name };
}

// Replays a token list through the game's engine.
export function replayMoves(gameType, moves, gameId) {
  const mod = gameModule(gameType);
  if (!mod) return { ok: false, reason: "unknown-game-type" };
  const engine = mod.createEngine(moves, { gameId });
  if (!engine) return { ok: false, reason: "illegal-move" };
  return { ok: true, engine };
}

// Friend links carry no game — just an identity to add. Kept structurally
// separate from game links (different params, no gameId) so the two can
// never be confused when parsing an incoming hash.
export function encodeFriendLink({ pubkey, name }) {
  const params = new URLSearchParams();
  params.set("f", pubkey);
  if (name) params.set("n", name.slice(0, 32));
  const base = linkBase();
  return `${base}#${params.toString()}`;
}

export function parseFriendHash(hash) {
  const raw = (hash || "").replace(/^#/, "");
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const pubkey = params.get("f");
  if (!pubkey) return null; // not a friend link
  if (!/^[0-9a-f]{64}$/.test(pubkey)) return { ok: false, reason: "bad-pubkey" };
  const name = (params.get("n") || "").slice(0, 32);
  return { ok: true, pubkey, name };
}

// An incoming link is valid against local history when it is the same game
// extended by zero or more moves (zero = reopening an already-seen link).
export function extendsHistory(localMoves, incomingMoves) {
  if (incomingMoves.length < localMoves.length) return false;
  for (let i = 0; i < localMoves.length; i++) {
    if (localMoves[i] !== incomingMoves[i]) return false;
  }
  return true;
}
