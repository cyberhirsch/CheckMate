import { makeGridView, pieceHTML } from "./grid-view.js";

export const meta = {
  id: "c4",
  titleKey: "game.c4",
  glyph: "◍",
  players: { w: "player.red", b: "player.yellow" },
  rotatable: false,
  moveRe: /^[0-6]$/,
};

const COLS = 7, ROWS = 6;

export function createEngine(tokens = []) {
  // board[col] = array of "w"/"b" from bottom up
  const board = Array.from({ length: COLS }, () => []);
  const applied = [];

  function winner() {
    const at = (c, r) => (c >= 0 && c < COLS && r >= 0 && r < ROWS ? board[c][r] || null : null);
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const side = at(c, r);
        if (!side) continue;
        for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
          let n = 1;
          while (at(c + dc * n, r + dr * n) === side) n++;
          if (n >= 4) return side;
        }
      }
    }
    return null;
  }

  const engine = {
    tokens: applied,
    board,
    turn: () => (applied.length % 2 === 0 ? "w" : "b"),
    apply(token) {
      const col = Number(token);
      if (!(col >= 0 && col < COLS) || board[col].length >= ROWS) return false;
      if (engine.status().result !== "active") return false;
      board[col].push(engine.turn());
      applied.push(token);
      return true;
    },
    legalMoves() {
      if (engine.status().result !== "active") return [];
      const out = [];
      for (let c = 0; c < COLS; c++) if (board[c].length < ROWS) out.push(String(c));
      return out;
    },
    describe: (t) => `#${Number(t) + 1}`,
    status() {
      const w = winner();
      if (w) return { result: "win", winner: w, note: { k: "note.fourInRow" } };
      if (board.every((c) => c.length >= ROWS)) return { result: "draw", note: { k: "note.boardFull" } };
      return { result: "active" };
    },
  };

  for (const t of tokens) {
    // apply() checks status; temporarily bypass ordering issue by calling directly
    if (!engine.apply(t)) return null;
  }
  return engine;
}

export function createView(container) {
  const cellIds = [];
  for (let r = ROWS - 1; r >= 0; r--) for (let c = 0; c < COLS; c++) cellIds.push(`${c},${r}`);
  const grid = makeGridView(container, { cols: COLS, rows: ROWS, cellIds, boardClass: "c4-board" });
  return {
    onTap: grid.onTap,
    render(engine, { lastMove } = {}) {
      const lastCol = lastMove !== undefined && lastMove !== null ? Number(lastMove) : -1;
      const lastRow = lastCol >= 0 ? engine.board[lastCol].length - 1 : -1;
      grid.renderCells((id, cellEl) => {
        const [c, r] = id.split(",").map(Number);
        const side = engine.board[c][r] || null;
        cellEl.innerHTML = side ? pieceHTML(side, "●") : `<span class="c4-hole"></span>`;
        cellEl.classList.toggle("last-move", c === lastCol && r === lastRow);
      });
    },
  };
}

export function tapReducer(engine, _sel, cellId) {
  const col = cellId.split(",")[0];
  if (engine.legalMoves().includes(col)) return { kind: "move", token: col };
  return { kind: "none" };
}
