import { pieceHTML } from "./grid-view.js";

export const meta = {
  id: "dots",
  titleKey: "game.dots",
  glyph: "⊞",
  players: { w: "player.blue", b: "player.orange" },
  rotatable: false,
  moveRe: /^[hv][0-5],[0-5]$/,
};

// 5x5 boxes (6x6 dots). Token "h<row>,<col>" = horizontal edge above box row
// `row` (rows 0-5 of horizontal edges), "v<row>,<col>" similar for vertical.
// Completing a box grants another turn. Most boxes wins.

const N = 5; // boxes per side

export function createEngine(tokens = []) {
  const h = Array.from({ length: N + 1 }, () => Array(N).fill(false)); // h[r][c]: edge above box row r? h has N+1 rows, N cols
  const v = Array.from({ length: N }, () => Array(N + 1).fill(false)); // v[r][c]
  const boxes = Array.from({ length: N }, () => Array(N).fill(null));
  const applied = [];
  let turnSide = "w";

  function boxDone(r, c) {
    return h[r][c] && h[r + 1][c] && v[r][c] && v[r][c + 1];
  }

  const engine = {
    tokens: applied,
    h, v, boxes,
    turn: () => turnSide,
    apply(token) {
      if (engine.status().result !== "active") return false;
      const kind = token[0];
      const [r, c] = token.slice(1).split(",").map(Number);
      const arr = kind === "h" ? h : v;
      if (kind === "h" && (r > N || c >= N)) return false;
      if (kind === "v" && (r >= N || c > N)) return false;
      if (arr[r] === undefined || arr[r][c] === undefined || arr[r][c]) return false;
      arr[r][c] = true;
      let claimed = 0;
      for (let br = 0; br < N; br++) {
        for (let bc = 0; bc < N; bc++) {
          if (boxes[br][bc] === null && boxDone(br, bc)) {
            boxes[br][bc] = turnSide;
            claimed++;
          }
        }
      }
      applied.push(token);
      if (!claimed) turnSide = turnSide === "w" ? "b" : "w";
      return true;
    },
    legalMoves() {
      if (engine.status().result !== "active") return [];
      const out = [];
      for (let r = 0; r <= N; r++) for (let c = 0; c < N; c++) if (!h[r][c]) out.push(`h${r},${c}`);
      for (let r = 0; r < N; r++) for (let c = 0; c <= N; c++) if (!v[r][c]) out.push(`v${r},${c}`);
      return out;
    },
    describe: (t) => t,
    status() {
      const flat = boxes.flat();
      if (flat.every((b) => b !== null)) {
        const ws = flat.filter((b) => b === "w").length;
        const bs = flat.filter((b) => b === "b").length;
        if (ws > bs) return { result: "win", winner: "w", note: `${ws}–${bs}` };
        if (bs > ws) return { result: "win", winner: "b", note: `${bs}–${ws}` };
        return { result: "draw", note: `${ws}–${bs}` };
      }
      const ws = flat.filter((b) => b === "w").length;
      const bs = flat.filter((b) => b === "b").length;
      return { result: "active", note: `${ws}–${bs}` };
    },
  };

  for (const t of tokens) if (!engine.apply(t)) return null;
  return engine;
}

export function createView(container) {
  // Grid of (2N+1)x(2N+1): dots at even/even, h-edges at even row/odd col,
  // v-edges at odd row/even col, boxes at odd/odd.
  container.innerHTML = "";
  const board = document.createElement("div");
  board.className = "dots-board";
  board.style.gridTemplateColumns = `repeat(${2 * N + 1}, 1fr)`;
  const cellEls = new Map();
  let tapCb = null;
  for (let gr = 0; gr < 2 * N + 1; gr++) {
    for (let gc = 0; gc < 2 * N + 1; gc++) {
      const cell = document.createElement("div");
      const evenR = gr % 2 === 0, evenC = gc % 2 === 0;
      let id = null;
      if (evenR && evenC) cell.className = "dots-dot";
      else if (evenR && !evenC) { id = `h${gr / 2},${(gc - 1) / 2}`; cell.className = "dots-edge dots-h"; }
      else if (!evenR && evenC) { id = `v${(gr - 1) / 2},${gc / 2}`; cell.className = "dots-edge dots-v"; }
      else { id = `box${(gr - 1) / 2},${(gc - 1) / 2}`; cell.className = "dots-box"; }
      if (id && id[0] !== "b") {
        cell.dataset.cell = id;
        cell.setAttribute("tabindex", "0");
        cell.addEventListener("click", () => tapCb && tapCb(id));
        cell.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tapCb && tapCb(id); }
        });
      }
      if (id) cellEls.set(id, cell);
      board.appendChild(cell);
    }
  }
  container.appendChild(board);
  return {
    onTap(cb) { tapCb = cb; },
    render(engine, { lastMove } = {}) {
      for (const [id, cellEl] of cellEls) {
        if (id.startsWith("box")) {
          const [r, c] = id.slice(3).split(",").map(Number);
          const owner = engine.boxes[r][c];
          cellEl.innerHTML = owner ? pieceHTML(owner, "●") : "";
          cellEl.classList.toggle("owned", !!owner);
        } else {
          const kind = id[0];
          const [r, c] = id.slice(1).split(",").map(Number);
          const drawn = (kind === "h" ? engine.h : engine.v)[r][c];
          cellEl.classList.toggle("drawn", drawn);
          cellEl.classList.toggle("last-move", lastMove === id);
        }
      }
    },
  };
}

export function tapReducer(engine, _sel, cellId) {
  if (engine.legalMoves().includes(cellId)) return { kind: "move", token: cellId };
  return { kind: "none" };
}
