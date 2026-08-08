import { makeGridView, pieceHTML } from "./grid-view.js";

export const meta = {
  id: "reversi",
  title: "Reversi",
  glyph: "◐",
  players: { w: "White", b: "Black" },
  rotatable: false,
  moveRe: /^[a-h][1-8]$/,
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

function idx(file, rank) { return rank * 8 + file; }

export function createEngine(tokens = []) {
  // Shell convention: side "w" always moves first. In reversi dark moves first,
  // so side "w" plays the dark discs; meta.players carries the display names.
  const cells = Array(64).fill(null);
  cells[idx(3, 3)] = "b"; cells[idx(4, 4)] = "b";
  cells[idx(3, 4)] = "w"; cells[idx(4, 3)] = "w";
  const applied = [];

  function flipsFor(side, i) {
    const f = i % 8, r = Math.floor(i / 8);
    if (cells[i]) return [];
    const out = [];
    for (const [df, dr] of DIRS) {
      const line = [];
      let nf = f + df, nr = r + dr;
      while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
        const j = idx(nf, nr);
        if (cells[j] === null) break;
        if (cells[j] === side) { out.push(...line); break; }
        line.push(j);
        nf += df; nr += dr;
      }
    }
    return out;
  }

  function movesFor(side) {
    const out = [];
    for (let i = 0; i < 64; i++) if (flipsFor(side, i).length) out.push(FILES[i % 8] + (Math.floor(i / 8) + 1));
    return out;
  }

  // Passes break move parity, so the side to move is tracked explicitly:
  // after each move the turn goes to the opponent only if they have a reply.
  let turnSide = "w";

  const engine = {
    tokens: applied,
    cells,
    turn: () => turnSide,
    apply(token) {
      if (engine.status().result !== "active") return false;
      const f = FILES.indexOf(token[0]);
      const r = Number(token.slice(1)) - 1;
      if (f < 0 || r < 0 || r > 7) return false;
      const i = idx(f, r);
      const flips = flipsFor(turnSide, i);
      if (!flips.length) return false;
      cells[i] = turnSide;
      for (const j of flips) cells[j] = turnSide;
      applied.push(token);
      const other = turnSide === "w" ? "b" : "w";
      if (movesFor(other).length) turnSide = other;
      // else same player moves again (opponent passes automatically)
      return true;
    },
    legalMoves() {
      if (engine.status().result !== "active") return [];
      return movesFor(turnSide);
    },
    describe: (t) => t,
    status() {
      if (movesFor("w").length === 0 && movesFor("b").length === 0) {
        const ws = cells.filter((v) => v === "w").length;
        const bs = cells.filter((v) => v === "b").length;
        if (ws > bs) return { result: "win", winner: "w", note: `${ws}–${bs}` };
        if (bs > ws) return { result: "win", winner: "b", note: `${bs}–${ws}` };
        return { result: "draw", note: `${ws}–${bs}` };
      }
      const ws = cells.filter((v) => v === "w").length;
      const bs = cells.filter((v) => v === "b").length;
      return { result: "active", note: `${ws}–${bs}` };
    },
  };

  for (const t of tokens) if (!engine.apply(t)) return null;
  return engine;
}

export function createView(container) {
  const cellIds = [];
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) cellIds.push(FILES[f] + (r + 1));
  const grid = makeGridView(container, { cols: 8, rows: 8, cellIds, boardClass: "reversi-board" });
  return {
    onTap: grid.onTap,
    render(engine, { lastMove } = {}) {
      const legal = new Set(engine.legalMoves());
      grid.renderCells((id, cellEl) => {
        const f = FILES.indexOf(id[0]);
        const r = Number(id.slice(1)) - 1;
        const side = engine.cells[r * 8 + f];
        let html = side ? pieceHTML(side, "●") : "";
        if (legal.has(id)) html += `<span class="dot"></span>`;
        cellEl.innerHTML = html;
        cellEl.classList.toggle("last-move", lastMove === id);
        cellEl.classList.toggle("legal-target", legal.has(id));
      });
    },
  };
}

export function tapReducer(engine, _sel, cellId) {
  if (engine.legalMoves().includes(cellId)) return { kind: "move", token: cellId };
  return { kind: "none" };
}
