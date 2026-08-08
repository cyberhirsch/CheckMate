import { makeGridView, pieceHTML } from "./grid-view.js";

export const meta = {
  id: "breakthrough",
  title: "Breakthrough",
  glyph: "♙",
  players: { w: "White", b: "Black" },
  rotatable: true,
  moveRe: /^[a-h][1-8][a-h][1-8]$/,
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

export function createEngine(tokens = []) {
  // cells[r*8+f]; white starts rows 1-2 moving up, black rows 7-8 moving down.
  const cells = Array(64).fill(null);
  for (let f = 0; f < 8; f++) {
    cells[0 * 8 + f] = "w"; cells[1 * 8 + f] = "w";
    cells[6 * 8 + f] = "b"; cells[7 * 8 + f] = "b";
  }
  const applied = [];

  function movesFor(side) {
    const dr = side === "w" ? 1 : -1;
    const out = [];
    for (let i = 0; i < 64; i++) {
      if (cells[i] !== side) continue;
      const f = i % 8, r = Math.floor(i / 8);
      const nr = r + dr;
      if (nr < 0 || nr > 7) continue;
      for (const df of [-1, 0, 1]) {
        const nf = f + df;
        if (nf < 0 || nf > 7) continue;
        const target = cells[nr * 8 + nf];
        if (df === 0 && target) continue; // straight only into empty
        if (target === side) continue;    // never onto own piece
        out.push(FILES[f] + (r + 1) + FILES[nf] + (nr + 1));
      }
    }
    return out;
  }

  const engine = {
    tokens: applied,
    cells,
    turn: () => (applied.length % 2 === 0 ? "w" : "b"),
    apply(token) {
      if (engine.status().result !== "active") return false;
      if (!movesFor(engine.turn()).includes(token)) return false;
      const ff = FILES.indexOf(token[0]), fr = Number(token[1]) - 1;
      const tf = FILES.indexOf(token[2]), tr = Number(token[3]) - 1;
      cells[tr * 8 + tf] = cells[fr * 8 + ff];
      cells[fr * 8 + ff] = null;
      applied.push(token);
      return true;
    },
    legalMoves() {
      if (engine.status().result !== "active") return [];
      return movesFor(engine.turn());
    },
    describe: (t) => `${t.slice(0, 2)}→${t.slice(2)}`,
    status() {
      for (let f = 0; f < 8; f++) {
        if (cells[7 * 8 + f] === "w") return { result: "win", winner: "w", note: "Reached the last rank" };
        if (cells[0 * 8 + f] === "b") return { result: "win", winner: "b", note: "Reached the last rank" };
      }
      if (!cells.includes("w")) return { result: "win", winner: "b", note: "All pieces captured" };
      if (!cells.includes("b")) return { result: "win", winner: "w", note: "All pieces captured" };
      return { result: "active" };
    },
  };

  for (const t of tokens) if (!engine.apply(t)) return null;
  return engine;
}

export function createView(container) {
  const cellIds = [];
  for (let r = 7; r >= 0; r--) for (let f = 0; f < 8; f++) cellIds.push(FILES[f] + (r + 1));
  const grid = makeGridView(container, {
    cols: 8, rows: 8, cellIds, boardClass: "chess-board",
    cellClass: (id) => ((FILES.indexOf(id[0]) + Number(id[1])) % 2 === 0 ? "dark" : "light"),
  });
  return {
    onTap: grid.onTap,
    render(engine, { selection, lastMove, orientation } = {}) {
      const targets = selection ? new Set(selection.targets.map((t) => t.slice(2))) : new Set();
      grid.renderCells((id, cellEl) => {
        const f = FILES.indexOf(id[0]), r = Number(id[1]) - 1;
        const side = engine.cells[r * 8 + f];
        cellEl.classList.toggle("selected", !!selection && selection.from === id);
        cellEl.classList.toggle("last-move", !!lastMove && (lastMove.slice(0, 2) === id || lastMove.slice(2) === id));
        const isTarget = targets.has(id);
        cellEl.classList.toggle("legal-target", isTarget);
        cellEl.classList.toggle("has-piece", isTarget && !!side);
        let html = side ? pieceHTML(side, "♟") : "";
        if (isTarget) html += `<span class="dot"></span>`;
        cellEl.innerHTML = html;
      });
      grid.setFlipped(orientation === "b");
    },
  };
}

export function tapReducer(engine, selection, cellId) {
  const moves = engine.legalMoves();
  if (selection) {
    if (selection.from === cellId) return { kind: "select", selection: null };
    const token = selection.from + cellId;
    if (moves.includes(token)) return { kind: "move", token };
  }
  const mine = moves.filter((t) => t.slice(0, 2) === cellId);
  if (mine.length) return { kind: "select", selection: { from: cellId, targets: mine } };
  return selection ? { kind: "select", selection: null } : { kind: "none" };
}
