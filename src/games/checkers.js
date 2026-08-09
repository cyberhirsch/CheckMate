import { makeGridView, pieceHTML } from "./grid-view.js";

export const meta = {
  id: "checkers",
  titleKey: "game.checkers",
  glyph: "⛃",
  players: { w: "player.white", b: "player.black" },
  rotatable: true,
  moveRe: /^[a-h][1-8](-[a-h][1-8]|(x[a-h][1-8])+)$/,
};

// American checkers: 8x8 dark squares, men move diagonally forward, captures
// mandatory, multi-jumps continue with the same piece, kings move both ways.
// Token: "c3-d4" for a step, "c3xe5xg7" for a jump chain (landing squares).

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

function sq(f, r) { return FILES[f] + (r + 1); }
function coords(s) { return [FILES.indexOf(s[0]), Number(s[1]) - 1]; }
function dark(f, r) { return (f + r) % 2 === 0; }

export function createEngine(tokens = []) {
  const cells = new Map(); // square -> {side, king}
  for (let r = 0; r < 3; r++) for (let f = 0; f < 8; f++) if (dark(f, r)) cells.set(sq(f, r), { side: "w", king: false });
  for (let r = 5; r < 8; r++) for (let f = 0; f < 8; f++) if (dark(f, r)) cells.set(sq(f, r), { side: "b", king: false });
  const applied = [];

  function dirsFor(piece) {
    if (piece.king) return [[1, 1], [-1, 1], [1, -1], [-1, -1]];
    return piece.side === "w" ? [[1, 1], [-1, 1]] : [[1, -1], [-1, -1]];
  }

  function jumpChains(from, piece, taken) {
    const [f, r] = coords(from);
    const chains = [];
    for (const [df, dr] of dirsFor(piece)) {
      const mf = f + df, mr = r + dr, tf = f + 2 * df, tr = r + 2 * dr;
      if (tf < 0 || tf > 7 || tr < 0 || tr > 7) continue;
      const midSq = sq(mf, mr), toSq = sq(tf, tr);
      const mid = cells.get(midSq);
      if (!mid || mid.side === piece.side || taken.has(midSq)) continue;
      if (cells.get(toSq)) continue;
      const nextTaken = new Set(taken); nextTaken.add(midSq);
      // A man that reaches the crown row mid-jump stops there (standard rule).
      const crowns = !piece.king && ((piece.side === "w" && tr === 7) || (piece.side === "b" && tr === 0));
      const sub = crowns ? [] : jumpChains(toSq, piece, nextTaken);
      if (sub.length) {
        for (const chain of sub) chains.push([toSq, ...chain]);
      } else {
        chains.push([toSq]);
      }
    }
    return chains;
  }

  function movesFor(side) {
    const jumps = [];
    const steps = [];
    for (const [from, piece] of cells) {
      if (piece.side !== side) continue;
      const chains = jumpChains(from, piece, new Set());
      for (const chain of chains) jumps.push(from + "x" + chain.join("x"));
      if (!jumps.length) {
        const [f, r] = coords(from);
        for (const [df, dr] of dirsFor(piece)) {
          const nf = f + df, nr = r + dr;
          if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
          if (!cells.get(sq(nf, nr))) steps.push(from + "-" + sq(nf, nr));
        }
      }
    }
    return jumps.length ? jumps : steps;
  }

  const engine = {
    tokens: applied,
    cells,
    turn: () => (applied.length % 2 === 0 ? "w" : "b"),
    apply(token) {
      if (engine.status().result !== "active") return false;
      if (!movesFor(engine.turn()).includes(token)) return false;
      const isJump = token.includes("x");
      const parts = token.split(/[-x]/);
      const from = parts[0];
      const piece = cells.get(from);
      cells.delete(from);
      let cur = from;
      for (let i = 1; i < parts.length; i++) {
        const to = parts[i];
        if (isJump) {
          const [cf, cr] = coords(cur);
          const [tf, tr] = coords(to);
          cells.delete(sq((cf + tf) / 2, (cr + tr) / 2));
        }
        cur = to;
      }
      const [, endR] = coords(cur);
      if (!piece.king && ((piece.side === "w" && endR === 7) || (piece.side === "b" && endR === 0))) piece.king = true;
      cells.set(cur, piece);
      applied.push(token);
      return true;
    },
    legalMoves() {
      if (engine.status().result !== "active") return [];
      return movesFor(engine.turn());
    },
    describe: (t) => t,
    status() {
      const side = engine.turn();
      const hasPiece = [...cells.values()].some((p) => p.side === side);
      if (!hasPiece || movesFor(side).length === 0) {
        return { result: "win", winner: side === "w" ? "b" : "w", note: hasPiece ? "No moves" : "All pieces captured" };
      }
      return { result: "active" };
    },
  };

  for (const t of tokens) if (!engine.apply(t)) return null;
  return engine;
}

export function createView(container) {
  const cellIds = [];
  for (let r = 7; r >= 0; r--) for (let f = 0; f < 8; f++) cellIds.push(sq(f, r));
  const grid = makeGridView(container, {
    cols: 8, rows: 8, cellIds, boardClass: "chess-board",
    cellClass: (id) => {
      const [f, r] = coords(id);
      return dark(f, r) ? "dark" : "light";
    },
  });
  return {
    onTap: grid.onTap,
    render(engine, { selection, lastMove, orientation } = {}) {
      const targets = selection ? new Set(selection.targets) : new Set();
      const lastSquares = lastMove ? new Set(lastMove.split(/[-x]/)) : new Set();
      grid.renderCells((id, cellEl) => {
        const piece = engine.cells.get(id);
        cellEl.classList.toggle("selected", !!selection && selection.from === id);
        cellEl.classList.toggle("last-move", lastSquares.has(id));
        const isTarget = targets.has(id);
        cellEl.classList.toggle("legal-target", isTarget);
        let html = piece ? pieceHTML(piece.side, piece.king ? "⛁" : "⛂") : "";
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
    // Match a move whose FIRST landing square is the tapped cell. For chains we
    // pick the chain (longest first) — stepwise chain building would allow
    // ambiguity; tapping the first landing square commits to a full chain.
    const candidates = moves
      .filter((t) => t.split(/[-x]/)[0] === selection.from)
      .filter((t) => t.split(/[-x]/).slice(1).includes(cellId))
      .sort((a, b) => b.length - a.length);
    if (candidates.length) return { kind: "move", token: candidates[0] };
  }
  const mine = moves.filter((t) => t.split(/[-x]/)[0] === cellId);
  if (mine.length) {
    const targets = mine.flatMap((t) => t.split(/[-x]/).slice(1));
    return { kind: "select", selection: { from: cellId, targets } };
  }
  return selection ? { kind: "select", selection: null } : { kind: "none" };
}
