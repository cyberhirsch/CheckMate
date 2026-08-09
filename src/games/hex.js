import { pieceHTML } from "./grid-view.js";

export const meta = {
  id: "hex",
  titleKey: "game.hex",
  glyph: "⬡",
  players: { w: "player.red", b: "player.blue" },
  rotatable: false,
  freeAspect: true,
  moveRe: /^[a-k](1[0-1]|[1-9])$/,
};

// 11x11. Red (w, moves first) connects top edge to bottom edge; Blue (b)
// connects left edge to right edge. Neighbors on a hex rhombus:
// (f±1, r), (f, r±1), (f+1, r-1), (f-1, r+1).

const SIZE = 11;
const FILES = "abcdefghijk".split("");

function neighbors(f, r) {
  return [[f + 1, r], [f - 1, r], [f, r + 1], [f, r - 1], [f + 1, r - 1], [f - 1, r + 1]]
    .filter(([nf, nr]) => nf >= 0 && nf < SIZE && nr >= 0 && nr < SIZE);
}

export function createEngine(tokens = []) {
  const cells = Array(SIZE * SIZE).fill(null);
  const applied = [];

  function connected(side) {
    // w: r=0 to r=SIZE-1 ; b: f=0 to f=SIZE-1
    const seen = new Set();
    const stack = [];
    for (let i = 0; i < SIZE; i++) {
      const start = side === "w" ? 0 * SIZE + i : i * SIZE + 0;
      if (cells[start] === side) { stack.push(start); seen.add(start); }
    }
    while (stack.length) {
      const i = stack.pop();
      const f = i % SIZE, r = Math.floor(i / SIZE);
      if (side === "w" && r === SIZE - 1) return true;
      if (side === "b" && f === SIZE - 1) return true;
      for (const [nf, nr] of neighbors(f, r)) {
        const j = nr * SIZE + nf;
        if (!seen.has(j) && cells[j] === side) { seen.add(j); stack.push(j); }
      }
    }
    return false;
  }

  const engine = {
    tokens: applied,
    cells,
    turn: () => (applied.length % 2 === 0 ? "w" : "b"),
    apply(token) {
      if (engine.status().result !== "active") return false;
      const f = FILES.indexOf(token[0]);
      const r = Number(token.slice(1)) - 1;
      if (f < 0 || r < 0 || r >= SIZE) return false;
      const i = r * SIZE + f;
      if (cells[i]) return false;
      cells[i] = engine.turn();
      applied.push(token);
      return true;
    },
    legalMoves() {
      if (engine.status().result !== "active") return [];
      const out = [];
      for (let i = 0; i < SIZE * SIZE; i++) if (!cells[i]) out.push(FILES[i % SIZE] + (Math.floor(i / SIZE) + 1));
      return out;
    },
    describe: (t) => t,
    status() {
      if (connected("w")) return { result: "win", winner: "w", note: { k: "note.topBottom" } };
      if (connected("b")) return { result: "win", winner: "b", note: { k: "note.leftRight" } };
      return { result: "active" }; // hex can never draw
    },
  };

  for (const t of tokens) if (!engine.apply(t)) return null;
  return engine;
}

export function createView(container) {
  container.innerHTML = "";
  const board = document.createElement("div");
  board.className = "hex-board";
  const cellEls = new Map();
  let tapCb = null;
  for (let r = 0; r < SIZE; r++) {
    const row = document.createElement("div");
    row.className = "hex-row";
    row.style.marginLeft = `${r * 2.6}%`;
    for (let f = 0; f < SIZE; f++) {
      const id = FILES[f] + (r + 1);
      const c = document.createElement("div");
      c.className = "hex-cell";
      c.dataset.cell = id;
      c.setAttribute("tabindex", "0");
      c.addEventListener("click", () => tapCb && tapCb(id));
      c.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tapCb && tapCb(id); }
      });
      row.appendChild(c);
      cellEls.set(id, c);
    }
    board.appendChild(row);
  }
  container.appendChild(board);
  return {
    onTap(cb) { tapCb = cb; },
    render(engine, { lastMove } = {}) {
      for (const [id, cellEl] of cellEls) {
        const f = FILES.indexOf(id[0]);
        const r = Number(id.slice(1)) - 1;
        const side = engine.cells[r * SIZE + f];
        cellEl.innerHTML = side ? pieceHTML(side, "⬢") : "";
        cellEl.classList.toggle("last-move", lastMove === id);
      }
    },
  };
}

export function tapReducer(engine, _sel, cellId) {
  if (engine.legalMoves().includes(cellId)) return { kind: "move", token: cellId };
  return { kind: "none" };
}
