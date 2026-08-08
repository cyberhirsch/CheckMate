import { Chess } from "../vendor/chess.js";
import { makeGridView, pieceHTML } from "./grid-view.js";

export const meta = {
  id: "chess",
  title: "Chess",
  glyph: "♞",
  players: { w: "White", b: "Black" },
  rotatable: true,
  moveRe: /^[a-h][1-8][a-h][1-8][qrbn]?$/,
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const GLYPHS = { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" };

export function createEngine(tokens = []) {
  const game = new Chess();
  const applied = [];
  const labels = new Map();

  function applyToken(token) {
    const from = token.slice(0, 2);
    const to = token.slice(2, 4);
    const promotion = token.length > 4 ? token[4] : undefined;
    let result;
    try {
      result = game.move({ from, to, promotion });
    } catch {
      result = null;
    }
    if (!result) return false;
    applied.push(token);
    labels.set(token + "#" + applied.length, result.san);
    return true;
  }

  for (const t of tokens) {
    if (!applyToken(t)) return null;
  }

  return {
    tokens: applied,
    game, // exposed for the view/reducer
    turn: () => game.turn(),
    apply: applyToken,
    legalMoves() {
      return game.moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion || ""));
    },
    describe(token) {
      // labels keyed by token+position; fall back to raw token
      for (const [k, v] of labels) if (k.startsWith(token + "#")) return v;
      return token;
    },
    status() {
      if (game.isCheckmate()) return { result: "win", winner: game.turn() === "w" ? "b" : "w", note: "Checkmate" };
      if (game.isStalemate()) return { result: "draw", note: "Stalemate" };
      if (game.isThreefoldRepetition()) return { result: "draw", note: "Threefold repetition" };
      if (game.isInsufficientMaterial()) return { result: "draw", note: "Insufficient material" };
      if (game.isDraw()) return { result: "draw", note: "Fifty-move rule" };
      if (game.isCheck()) return { result: "active", note: "Check!" };
      return { result: "active" };
    },
  };
}

export function createView(container) {
  const cellIds = [];
  for (let rank = 8; rank >= 1; rank--) for (const f of FILES) cellIds.push(f + rank);
  const grid = makeGridView(container, {
    cols: 8,
    rows: 8,
    cellIds,
    boardClass: "chess-board",
    cellClass: (id) => ((FILES.indexOf(id[0]) + Number(id[1])) % 2 === 0 ? "dark" : "light"),
  });

  return {
    onTap: grid.onTap,
    render(engine, { selection, lastMove, orientation } = {}) {
      const game = engine.game;
      const inCheckColor = game.inCheck() ? game.turn() : null;
      const targets = selection ? new Set(selection.targets.map((m) => m.to)) : new Set();
      grid.renderCells((id, cellEl) => {
        const piece = game.get(id);
        cellEl.classList.toggle("selected", !!selection && selection.from === id);
        cellEl.classList.toggle("last-move", !!lastMove && (lastMove.slice(0, 2) === id || lastMove.slice(2, 4) === id));
        const isTarget = targets.has(id);
        cellEl.classList.toggle("legal-target", isTarget);
        cellEl.classList.toggle("has-piece", isTarget && !!piece);
        cellEl.classList.toggle("in-check", !!inCheckColor && !!piece && piece.type === "k" && piece.color === inCheckColor);
        let html = piece ? pieceHTML(piece.color, GLYPHS[piece.type]) : "";
        if (isTarget) html += `<span class="dot"></span>`;
        cellEl.innerHTML = html;
      });
      grid.setFlipped(orientation === "b");
    },
  };
}

export function tapReducer(engine, selection, cellId) {
  const game = engine.game;
  const piece = game.get(cellId);
  if (selection) {
    if (selection.from === cellId) return { kind: "select", selection: null };
    const match = selection.targets.filter((m) => m.to === cellId);
    if (match.length) {
      if (match[0].promotion) {
        return {
          kind: "choose",
          options: [
            { value: "q", label: "Queen", glyph: "♛" },
            { value: "r", label: "Rook", glyph: "♜" },
            { value: "b", label: "Bishop", glyph: "♝" },
            { value: "n", label: "Knight", glyph: "♞" },
          ],
          build: (v) => selection.from + cellId + v,
        };
      }
      return { kind: "move", token: selection.from + cellId };
    }
    if (piece && piece.color === game.turn()) {
      return { kind: "select", selection: { from: cellId, targets: game.moves({ square: cellId, verbose: true }) } };
    }
    return { kind: "select", selection: null };
  }
  if (piece && piece.color === game.turn()) {
    return { kind: "select", selection: { from: cellId, targets: game.moves({ square: cellId, verbose: true }) } };
  }
  return { kind: "none" };
}
