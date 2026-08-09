import { makeGridView, pieceHTML } from "./grid-view.js";
import { lineWinner } from "./tictactoe.js";

export const meta = {
  id: "uttt",
  titleKey: "game.uttt",
  glyph: "⬚",
  players: { w: "player.x", b: "player.o" },
  rotatable: false,
  moveRe: /^[0-8][0-8]$/,
};

// Token "MN" = macro board M, micro cell N. You must play in the macro board
// matching your opponent's last micro cell, unless that board is decided/full.

export function createEngine(tokens = []) {
  const boards = Array.from({ length: 9 }, () => Array(9).fill(null)); // micro cells
  const macro = Array(9).fill(null); // "w" | "b" | "full" | null
  const applied = [];

  function refreshMacro(m) {
    const w = lineWinner(boards[m]);
    if (w) macro[m] = w;
    else if (boards[m].every(Boolean)) macro[m] = "full";
  }

  function forcedBoard() {
    if (!applied.length) return null;
    const target = Number(applied[applied.length - 1][1]);
    return macro[target] ? null : target; // decided/full board frees the move
  }

  const engine = {
    tokens: applied,
    boards,
    macro,
    forcedBoard,
    turn: () => (applied.length % 2 === 0 ? "w" : "b"),
    apply(token) {
      if (engine.status().result !== "active") return false;
      const m = Number(token[0]);
      const c = Number(token[1]);
      if (macro[m]) return false;
      const forced = forcedBoard();
      if (forced !== null && forced !== m) return false;
      if (boards[m][c]) return false;
      boards[m][c] = engine.turn();
      applied.push(token);
      refreshMacro(m);
      return true;
    },
    legalMoves() {
      if (engine.status().result !== "active") return [];
      const forced = forcedBoard();
      const out = [];
      for (let m = 0; m < 9; m++) {
        if (macro[m]) continue;
        if (forced !== null && forced !== m) continue;
        for (let c = 0; c < 9; c++) if (!boards[m][c]) out.push(`${m}${c}`);
      }
      return out;
    },
    describe: (t) => `${Number(t[0]) + 1}→${Number(t[1]) + 1}`,
    status() {
      const macroCells = macro.map((v) => (v === "full" ? null : v));
      const w = lineWinner(macroCells);
      if (w) return { result: "win", winner: w, note: { k: "note.threeBoards" } };
      if (macro.every(Boolean)) {
        const ws = macro.filter((v) => v === "w").length;
        const bs = macro.filter((v) => v === "b").length;
        if (ws !== bs) return { result: "win", winner: ws > bs ? "w" : "b", note: { k: "note.mostBoards" } };
        return { result: "draw", note: { k: "note.equalBoards" } };
      }
      return { result: "active" };
    },
  };

  for (const t of tokens) if (!engine.apply(t)) return null;
  return engine;
}

export function createView(container) {
  // 9x9 grid; cell id "MN". Row-major: macro row = Math.floor(M/3) etc.
  const cellIds = [];
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const m = Math.floor(row / 3) * 3 + Math.floor(col / 3);
      const c = (row % 3) * 3 + (col % 3);
      cellIds.push(`${m}${c}`);
    }
  }
  const grid = makeGridView(container, {
    cols: 9,
    rows: 9,
    cellIds,
    boardClass: "uttt-board",
    cellClass: (id) => {
      const m = Number(id[0]);
      const edges = [];
      if (m % 3 !== 2 && Number(id[1]) % 3 === 2) edges.push("uttt-right");
      if (Math.floor(m / 3) !== 2 && Math.floor(Number(id[1]) / 3) === 2) edges.push("uttt-bottom");
      return edges.join(" ");
    },
  });
  return {
    onTap: grid.onTap,
    render(engine, { lastMove } = {}) {
      const forced = engine.forcedBoard();
      const legal = new Set(engine.legalMoves());
      grid.renderCells((id, cellEl) => {
        const m = Number(id[0]);
        const side = engine.boards[m][Number(id[1])];
        cellEl.innerHTML = side ? pieceHTML(side, side === "w" ? "✕" : "◯") : "";
        cellEl.classList.toggle("last-move", lastMove === id);
        cellEl.classList.toggle("uttt-active", legal.has(id));
        cellEl.classList.toggle("uttt-won-w", engine.macro[m] === "w");
        cellEl.classList.toggle("uttt-won-b", engine.macro[m] === "b");
      });
    },
  };
}

export function tapReducer(engine, _sel, cellId) {
  if (engine.legalMoves().includes(cellId)) return { kind: "move", token: cellId };
  return { kind: "none" };
}
