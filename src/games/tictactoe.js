import { makeGridView, pieceHTML } from "./grid-view.js";

export const meta = {
  id: "ttt",
  titleKey: "game.ttt",
  glyph: "◯",
  players: { w: "player.x", b: "player.o" },
  rotatable: false,
  moveRe: /^[0-8]$/,
};

export const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export function lineWinner(cells) {
  for (const [a, b, c] of LINES) {
    if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) return cells[a];
  }
  return null;
}

export function createEngine(tokens = []) {
  const cells = Array(9).fill(null);
  const applied = [];

  const engine = {
    tokens: applied,
    cells,
    turn: () => (applied.length % 2 === 0 ? "w" : "b"),
    apply(token) {
      const i = Number(token);
      if (!(i >= 0 && i < 9) || cells[i] || engine.status().result !== "active") return false;
      cells[i] = engine.turn();
      applied.push(token);
      return true;
    },
    legalMoves() {
      if (engine.status().result !== "active") return [];
      return cells.map((v, i) => (v ? null : String(i))).filter(Boolean);
    },
    describe: (t) => "abc"[Number(t) % 3] + (3 - Math.floor(Number(t) / 3)),
    status() {
      const w = lineWinner(cells);
      if (w) return { result: "win", winner: w, note: { k: "note.threeInRow" } };
      if (cells.every(Boolean)) return { result: "draw", note: { k: "note.boardFull" } };
      return { result: "active" };
    },
  };

  for (const t of tokens) if (!engine.apply(t)) return null;
  return engine;
}

export function createView(container) {
  const cellIds = Array.from({ length: 9 }, (_, i) => String(i));
  const grid = makeGridView(container, { cols: 3, rows: 3, cellIds, boardClass: "ttt-board" });
  return {
    onTap: grid.onTap,
    render(engine, { lastMove } = {}) {
      grid.renderCells((id, cellEl) => {
        const side = engine.cells[Number(id)];
        cellEl.innerHTML = side ? pieceHTML(side, side === "w" ? "✕" : "◯") : "";
        cellEl.classList.toggle("last-move", lastMove === id);
      });
    },
  };
}

export function tapReducer(engine, _sel, cellId) {
  if (engine.legalMoves().includes(cellId)) return { kind: "move", token: cellId };
  return { kind: "none" };
}
