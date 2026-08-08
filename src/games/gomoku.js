import { makeGridView, pieceHTML } from "./grid-view.js";

export const meta = {
  id: "gomoku",
  title: "Gomoku",
  glyph: "✻",
  players: { w: "Black", b: "White" }, // black stones move first
  rotatable: false,
  moveRe: /^[a-o](1[0-5]|[1-9])$/,
};

const SIZE = 15;
const FILES = "abcdefghijklmno".split("");

export function createEngine(tokens = []) {
  const cells = Array(SIZE * SIZE).fill(null);
  const applied = [];

  function fiveFrom(i) {
    const side = cells[i];
    if (!side) return false;
    const f = i % SIZE, r = Math.floor(i / SIZE);
    for (const [df, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      let n = 1;
      for (const s of [1, -1]) {
        let nf = f + df * s, nr = r + dr * s;
        while (nf >= 0 && nf < SIZE && nr >= 0 && nr < SIZE && cells[nr * SIZE + nf] === side) {
          n++; nf += df * s; nr += dr * s;
        }
      }
      if (n >= 5) return true;
    }
    return false;
  }

  let won = null;

  const engine = {
    tokens: applied,
    cells,
    turn: () => (applied.length % 2 === 0 ? "w" : "b"),
    apply(token) {
      if (won || engine.status().result !== "active") return false;
      const f = FILES.indexOf(token[0]);
      const r = Number(token.slice(1)) - 1;
      if (f < 0 || r < 0 || r >= SIZE) return false;
      const i = r * SIZE + f;
      if (cells[i]) return false;
      cells[i] = engine.turn();
      applied.push(token);
      if (fiveFrom(i)) won = cells[i];
      return true;
    },
    legalMoves() {
      if (engine.status().result !== "active") return [];
      const out = [];
      for (let i = 0; i < SIZE * SIZE; i++) {
        if (!cells[i]) out.push(FILES[i % SIZE] + (Math.floor(i / SIZE) + 1));
      }
      return out;
    },
    describe: (t) => t,
    status() {
      if (won) return { result: "win", winner: won, note: "Five in a row" };
      if (cells.every(Boolean)) return { result: "draw", note: "Board full" };
      return { result: "active" };
    },
  };

  for (const t of tokens) if (!engine.apply(t)) return null;
  return engine;
}

export function createView(container) {
  const cellIds = [];
  for (let r = 0; r < SIZE; r++) for (let f = 0; f < SIZE; f++) cellIds.push(FILES[f] + (r + 1));
  const grid = makeGridView(container, { cols: SIZE, rows: SIZE, cellIds, boardClass: "gomoku-board" });
  return {
    onTap: grid.onTap,
    render(engine, { lastMove } = {}) {
      grid.renderCells((id, cellEl) => {
        const f = FILES.indexOf(id[0]);
        const r = Number(id.slice(1)) - 1;
        const side = engine.cells[r * SIZE + f];
        cellEl.innerHTML = side ? pieceHTML(side, "●") : "";
        cellEl.classList.toggle("last-move", lastMove === id);
      });
    },
  };
}

export function tapReducer(engine, _sel, cellId) {
  if (engine.legalMoves().includes(cellId)) return { kind: "move", token: cellId };
  return { kind: "none" };
}
