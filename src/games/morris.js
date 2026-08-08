import { pieceHTML } from "./grid-view.js";

export const meta = {
  id: "morris",
  title: "Nine Men's Morris",
  glyph: "◈",
  players: { w: "White", b: "Black" },
  rotatable: false,
  moveRe: /^(P(1\d|2[0-3]|\d)|M(1\d|2[0-3]|\d)-(1\d|2[0-3]|\d))(X(1\d|2[0-3]|\d))?$/,
};

// 24 points, indices 0-23. Phase 1: place 9 men each ("P<pt>"). Phase 2: move
// along lines ("M<a>-<b>"); with 3 men left you may fly anywhere. Forming a
// mill requires removing an opponent man ("...X<pt>") — not from an opponent
// mill unless all their men are in mills.

// Point layout (grid 7x7 coordinates for rendering):
const POINTS = [
  [0, 0], [3, 0], [6, 0],
  [1, 1], [3, 1], [5, 1],
  [2, 2], [3, 2], [4, 2],
  [0, 3], [1, 3], [2, 3], [4, 3], [5, 3], [6, 3],
  [2, 4], [3, 4], [4, 4],
  [1, 5], [3, 5], [5, 5],
  [0, 6], [3, 6], [6, 6],
];

const MILLS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 13, 14], [15, 16, 17], [18, 19, 20], [21, 22, 23],
  [0, 9, 21], [3, 10, 18], [6, 11, 15], [1, 4, 7], [16, 19, 22], [8, 12, 17], [5, 13, 20], [2, 14, 23],
];

const ADJ = Array.from({ length: 24 }, () => new Set());
for (const [a, b, c] of MILLS.slice(0, 8)) { ADJ[a].add(b); ADJ[b].add(a); ADJ[b].add(c); ADJ[c].add(b); }
for (const [a, b, c] of MILLS.slice(8)) { ADJ[a].add(b); ADJ[b].add(a); ADJ[b].add(c); ADJ[c].add(b); }

export function createEngine(tokens = []) {
  const points = Array(24).fill(null);
  const placed = { w: 0, b: 0 };
  const applied = [];

  function inMill(pt, side) {
    return MILLS.some((m) => m.includes(pt) && m.every((p) => points[p] === side));
  }
  function allInMills(side) {
    return points.every((v, p) => v !== side || inMill(p, side));
  }
  function menCount(side) {
    return points.filter((v) => v === side).length;
  }
  function phase(side) {
    return placed[side] < 9 ? "place" : menCount(side) === 3 ? "fly" : "move";
  }

  function removalTargets(side) {
    const opp = side === "w" ? "b" : "w";
    const all = [];
    for (let p = 0; p < 24; p++) if (points[p] === opp) all.push(p);
    const outsideMills = all.filter((p) => !inMill(p, opp));
    return outsideMills.length ? outsideMills : all;
  }

  function baseMoves(side) {
    const out = [];
    if (phase(side) === "place") {
      for (let p = 0; p < 24; p++) if (!points[p]) out.push({ base: `P${p}`, place: p, from: null });
    } else {
      const fly = phase(side) === "fly";
      for (let p = 0; p < 24; p++) {
        if (points[p] !== side) continue;
        const dests = fly
          ? Array.from({ length: 24 }, (_, i) => i).filter((d) => !points[d])
          : [...ADJ[p]].filter((d) => !points[d]);
        for (const d of dests) out.push({ base: `M${p}-${d}`, place: d, from: p });
      }
    }
    return out;
  }

  function expandMoves(side) {
    const out = [];
    for (const mv of baseMoves(side)) {
      // simulate to see if a mill forms
      const prev = mv.from !== null ? points[mv.from] : null;
      if (mv.from !== null) points[mv.from] = null;
      points[mv.place] = side;
      const mill = inMill(mv.place, side);
      points[mv.place] = null;
      if (mv.from !== null) points[mv.from] = prev;
      if (mill) {
        for (const t of removalTargets(side)) out.push(mv.base + "X" + t);
      } else {
        out.push(mv.base);
      }
    }
    return out;
  }

  const engine = {
    tokens: applied,
    points,
    placed,
    phase,
    turn: () => (applied.length % 2 === 0 ? "w" : "b"),
    apply(token) {
      if (engine.status().result !== "active") return false;
      const side = engine.turn();
      if (!expandMoves(side).includes(token)) return false;
      const removal = token.includes("X") ? Number(token.split("X")[1]) : null;
      const base = token.split("X")[0];
      if (base[0] === "P") {
        points[Number(base.slice(1))] = side;
        placed[side]++;
      } else {
        const [a, b] = base.slice(1).split("-").map(Number);
        points[a] = null;
        points[b] = side;
      }
      if (removal !== null) points[removal] = null;
      applied.push(token);
      return true;
    },
    legalMoves() {
      if (engine.status().result !== "active") return [];
      return expandMoves(engine.turn());
    },
    describe: (t) => t,
    status() {
      const side = engine.turn();
      if (placed[side] >= 9 && menCount(side) < 3) {
        return { result: "win", winner: side === "w" ? "b" : "w", note: "Fewer than three men" };
      }
      if (expandMoves(side).length === 0) {
        return { result: "win", winner: side === "w" ? "b" : "w", note: "No moves" };
      }
      return { result: "active", note: phase(side) === "place" ? `Placing (${9 - placed[side]} left)` : undefined };
    },
  };

  for (const t of tokens) if (!engine.apply(t)) return null;
  return engine;
}

export function createView(container) {
  container.innerHTML = "";
  const board = document.createElement("div");
  board.className = "morris-board";
  // grid lines via SVG background
  const svgLines = MILLS.map((m) => {
    const [x1, y1] = POINTS[m[0]];
    const [x2, y2] = POINTS[m[2]];
    return `<line x1="${x1 * 100 / 6}" y1="${y1 * 100 / 6}" x2="${x2 * 100 / 6}" y2="${y2 * 100 / 6}"/>`;
  }).join("");
  board.innerHTML = `<svg class="morris-lines" viewBox="-8 -8 116 116" preserveAspectRatio="none">${svgLines}</svg>`;
  const cellEls = new Map();
  let tapCb = null;
  POINTS.forEach(([x, y], p) => {
    const c = document.createElement("div");
    c.className = "morris-point";
    c.style.left = `${x * 100 / 6}%`;
    c.style.top = `${y * 100 / 6}%`;
    c.dataset.cell = String(p);
    c.setAttribute("tabindex", "0");
    c.addEventListener("click", () => tapCb && tapCb(String(p)));
    c.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tapCb && tapCb(String(p)); }
    });
    cellEls.set(String(p), c);
    board.appendChild(c);
  });
  container.appendChild(board);
  return {
    onTap(cb) { tapCb = cb; },
    render(engine, { selection } = {}) {
      const sel = selection || {};
      for (const [id, cellEl] of cellEls) {
        const p = Number(id);
        const side = engine.points[p];
        cellEl.innerHTML = side ? pieceHTML(side, "●") : "";
        cellEl.classList.toggle("selected", sel.from === p || sel.pendingBase !== undefined && sel.place === p);
        cellEl.classList.toggle("legal-target", !!sel.targets && sel.targets.has(p));
        cellEl.classList.toggle("removal-target", !!sel.removals && sel.removals.has(p));
      }
    },
  };
}

export function tapReducer(engine, selection, cellId) {
  const p = Number(cellId);
  const side = engine.turn();
  const moves = engine.legalMoves();

  // Removal sub-step: a mill formed, waiting for which opponent man to take.
  if (selection && selection.pendingBase) {
    const token = selection.pendingBase + "X" + p;
    if (moves.includes(token)) return { kind: "move", token };
    return { kind: "none" };
  }

  const placing = engine.phase(side) === "place";
  if (placing) {
    const plain = `P${p}`;
    if (moves.includes(plain)) return { kind: "move", token: plain };
    const withRemoval = moves.filter((t) => t.startsWith(plain + "X"));
    if (withRemoval.length) {
      const removals = new Set(withRemoval.map((t) => Number(t.split("X")[1])));
      return { kind: "select", selection: { pendingBase: plain, place: p, removals } };
    }
    return { kind: "none" };
  }

  if (selection && selection.from !== undefined) {
    if (selection.from === p) return { kind: "select", selection: null };
    const base = `M${selection.from}-${p}`;
    if (moves.includes(base)) return { kind: "move", token: base };
    const withRemoval = moves.filter((t) => t.startsWith(base + "X"));
    if (withRemoval.length) {
      const removals = new Set(withRemoval.map((t) => Number(t.split("X")[1])));
      return { kind: "select", selection: { pendingBase: base, place: p, removals } };
    }
  }
  if (engine.points[p] === side) {
    const targets = new Set(
      moves.filter((t) => t.startsWith(`M${p}-`)).map((t) => Number(t.split("X")[0].split("-")[1]))
    );
    if (targets.size) return { kind: "select", selection: { from: p, targets } };
  }
  return selection ? { kind: "select", selection: null } : { kind: "none" };
}
