// Encodes a full game into the URL hash and decodes/validates incoming links.
// Format: #t=<gameType>&g=<gameId>&m=<e2e4-e7e5-...>&a=<action>
// The hash fragment never leaves the browser, and every link carries the
// complete move history so both players re-validate the whole game locally.
// The bundle is game-agnostic: `t` selects the rules engine; move-token syntax
// is validated per game. Chess is the first engine.

import { createGame } from "./chess-engine.js";

export const GAME_TYPES = { chess: { moveRe: /^[a-h][1-8][a-h][1-8][qrbn]?$/ } };
const GAME_ID_RE = /^[0-9a-f]{6,32}$/;
const ACTIONS = new Set(["res", "do", "da"]); // resign, draw offer, draw accept
export const MAX_LINK_MOVES = 512;

export function generateGameId() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function moveToken(record) {
  return record.from + record.to + (record.promotion || "");
}

export function encodeLink({ gameType = "chess", gameId, moves, action }) {
  const params = new URLSearchParams();
  if (gameType !== "chess") params.set("t", gameType); // chess is the default, keeps links short
  params.set("g", gameId);
  if (moves.length) params.set("m", moves.join("-"));
  if (action) params.set("a", action);
  const base = location.origin + location.pathname;
  return `${base}#${params.toString()}`;
}

export function parseHash(hash) {
  const raw = (hash || "").replace(/^#/, "");
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const gameType = params.get("t") || "chess";
  const typeDef = GAME_TYPES[gameType];
  if (!typeDef) return { ok: false, reason: "unknown-game-type" };
  const gameId = params.get("g");
  if (!gameId || !GAME_ID_RE.test(gameId)) return { ok: false, reason: "bad-game-id" };
  const action = params.get("a") || null;
  if (action && !ACTIONS.has(action)) return { ok: false, reason: "bad-action" };
  const movesRaw = params.get("m") || "";
  const moves = movesRaw ? movesRaw.split("-") : [];
  if (moves.length > MAX_LINK_MOVES) return { ok: false, reason: "too-many-moves" };
  for (const m of moves) {
    if (!typeDef.moveRe.test(m)) return { ok: false, reason: "bad-move-token" };
  }
  return { ok: true, gameType, gameId, moves, action };
}

// Replays a token list through chess.js. Returns { ok, game, records } or { ok:false }.
export function replayMoves(moves) {
  const game = createGame();
  const records = [];
  for (const token of moves) {
    const from = token.slice(0, 2);
    const to = token.slice(2, 4);
    const promotion = token.length > 4 ? token[4] : undefined;
    let result;
    try {
      result = game.move({ from, to, promotion });
    } catch {
      result = null;
    }
    if (!result) return { ok: false, reason: "illegal-move", at: records.length };
    records.push({
      san: result.san,
      from: result.from,
      to: result.to,
      promotion: result.promotion || null,
      fenAfter: game.fen(),
    });
  }
  return { ok: true, game, records };
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
