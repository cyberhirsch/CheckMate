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

export function generateGameId() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function encodeLink({ gameType = "chess", gameId, moves, action, pubkey }) {
  const params = new URLSearchParams();
  if (gameType !== "chess") params.set("t", gameType); // chess is the default, keeps links short
  params.set("g", gameId);
  // "." separator: some games' tokens legitimately contain "-" (checkers chains,
  // morris moves), so "-" can't delimit. "." appears in no token grammar.
  if (moves.length) params.set("m", moves.join("."));
  if (action) params.set("a", action);
  if (pubkey) params.set("p", pubkey); // sender's Nostr pubkey, lets the opener pair for relay sync
  const base = location.origin + location.pathname;
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
  return { ok: true, gameType, gameId, moves, action, pubkey };
}

// Replays a token list through the game's engine.
export function replayMoves(gameType, moves, gameId) {
  const mod = gameModule(gameType);
  if (!mod) return { ok: false, reason: "unknown-game-type" };
  const engine = mod.createEngine(moves, { gameId });
  if (!engine) return { ok: false, reason: "illegal-move" };
  return { ok: true, engine };
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
