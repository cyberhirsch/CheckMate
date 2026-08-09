import { pieceHTML } from "./grid-view.js";
import { t } from "../i18n.js";

export const meta = {
  id: "ur",
  titleKey: "game.ur",
  glyph: "𒀭",
  players: { w: "player.sun", b: "player.moon" },
  rotatable: false,
  freeAspect: true,
  // Shown beside the board in place of a move list. Any game can declare one.
  tutorial: ["tut.ur.1", "tut.ur.2", "tut.ur.3", "tut.ur.4", "tut.ur.5", "tut.ur.6"],
  moveRe: /^(1[0-4]|[0-9]|x)$/,
};

// 7 pieces each race along a 14-square path; 4 binary dice give rolls 0-4.
// Rolls are derived deterministically from hash(gameId + roll index + history):
// both clients compute identical dice, so links/events stay history-only.
// (A player choosing between moves can peek at the next roll — documented as
// casual-fair in the PRD.)
//
// Path positions 1-14 per player; 5-12 are the shared middle row. Rosettes at
// 4, 8, 14: extra roll, and 8 is safe from capture. Bear off with an exact
// roll to position 15. Token = current position of the piece to move
// (0 = enter a new piece from the pool), or "x" = no legal move, pass.

const ROSETTES = new Set([4, 8, 14]);
const PIECES = 7;

// Deterministic dice: FNV-1a over seed string -> mulberry32 -> 4 bits.
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function rollAt(gameId, rollIndex, history) {
  const seed = fnv1a(`${gameId}|${rollIndex}|${history.join(",")}`);
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const r = (t ^ (t >>> 14)) >>> 0;
  return ((r >> 0) & 1) + ((r >> 1) & 1) + ((r >> 2) & 1) + ((r >> 3) & 1);
}

// Grid mapping (3 rows x 8 cols, cols 4-5 of top/bottom rows are gaps):
// w path: 1-4 = (0,3)..(0,0), 5-12 = (1,0)..(1,7), 13-14 = (0,7),(0,6)
// b path mirrors on row 2.
export function pathCell(side, pos) {
  const r = side === "w" ? 0 : 2;
  if (pos <= 4) return [r, 4 - pos];
  if (pos <= 12) return [1, pos - 5];
  return [r, 20 - pos]; // 13 -> col 7, 14 -> col 6
}

export function createEngine(tokens = [], { gameId = "" } = {}) {
  // state per side: array of piece positions (0 = pool, 15 = borne off)
  const pieces = { w: Array(PIECES).fill(0), b: Array(PIECES).fill(0) };
  const applied = [];
  let turnSide = "w";

  function occupant(side, pos) {
    // Who sits on this side's path square? Shared squares (5-12) are common.
    const shared = pos >= 5 && pos <= 12;
    for (const s of ["w", "b"]) {
      if (!shared && s !== side) continue;
      if (pieces[s].includes(pos)) {
        if (shared || s === side) return s;
      }
    }
    return null;
  }

  function currentRoll() {
    return rollAt(gameId, applied.length, applied);
  }

  function movesForRoll(side, roll) {
    if (roll === 0) return [];
    const out = new Set();
    for (const pos of pieces[side]) {
      if (pos === 15) continue;
      const dest = pos + roll;
      if (dest > 15) continue;
      if (dest === 15) { out.add(String(pos)); continue; }
      const occ = occupant(side, dest);
      if (occ === side) continue;
      if (occ && dest === 8) continue; // centre rosette is safe
      out.add(String(pos));
    }
    return [...out];
  }

  const engine = {
    tokens: applied,
    pieces,
    turn: () => turnSide,
    roll: () => (engine.status().result === "active" ? currentRoll() : null),
    apply(token) {
      if (engine.status().result !== "active") return false;
      const roll = currentRoll();
      const legal = movesForRoll(turnSide, roll);
      if (token === "x") {
        if (legal.length) return false;
        applied.push(token);
        turnSide = turnSide === "w" ? "b" : "w";
        return true;
      }
      if (!legal.includes(token)) return false;
      const pos = Number(token);
      const dest = pos + roll;
      const idx = pieces[turnSide].indexOf(pos);
      if (dest >= 5 && dest <= 12) {
        const opp = turnSide === "w" ? "b" : "w";
        const oppIdx = pieces[opp].indexOf(dest);
        if (oppIdx !== -1) pieces[opp][oppIdx] = 0; // captured, back to pool
      }
      pieces[turnSide][idx] = dest;
      applied.push(token);
      if (!(dest !== 15 && ROSETTES.has(dest))) {
        turnSide = turnSide === "w" ? "b" : "w";
      } // rosette: same player rolls again
      return true;
    },
    legalMoves() {
      if (engine.status().result !== "active") return [];
      const legal = movesForRoll(turnSide, currentRoll());
      return legal.length ? legal : ["x"];
    },
    describe(token) {
      return token === "x" ? "–" : token === "0" ? "▸" : token;
    },
    status() {
      if (pieces.w.every((p) => p === 15)) return { result: "win", winner: "w", note: { k: "note.allHome" } };
      if (pieces.b.every((p) => p === 15)) return { result: "win", winner: "b", note: { k: "note.allHome" } };
      return { result: "active", note: { k: "note.roll", p: { n: currentRoll() } } };
    },
  };

  for (const t of tokens) if (!engine.apply(t)) return null;
  return engine;
}

export function createView(container) {
  container.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "ur-wrap";

  const poolTop = document.createElement("div");
  poolTop.className = "ur-pool";
  poolTop.dataset.side = "w";
  const board = document.createElement("div");
  board.className = "ur-board";
  const poolBottom = document.createElement("div");
  poolBottom.className = "ur-pool";
  poolBottom.dataset.side = "b";

  const cellEls = new Map();
  let tapCb = null;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = document.createElement("div");
      const isGap = (r === 0 || r === 2) && (c === 4 || c === 5);
      cell.className = isGap ? "ur-cell gap" : "ur-cell";
      if (!isGap) {
        const id = `${r},${c}`;
        cell.dataset.cell = id;
        cell.setAttribute("tabindex", "0");
        cell.addEventListener("click", () => tapCb && tapCb(id));
        cell.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tapCb && tapCb(id); }
        });
        cellEls.set(id, cell);
        // rosette marks
        const isRosette =
          (r === 1 && c === 3) || ((r === 0 || r === 2) && (c === 0 || c === 6));
        if (isRosette) cell.classList.add("rosette");
      }
      board.appendChild(cell);
    }
  }
  wrap.appendChild(poolTop);
  wrap.appendChild(board);
  wrap.appendChild(poolBottom);
  container.appendChild(wrap);

  return {
    onTap(cb) { tapCb = cb; },
    render(engine, { selection } = {}) {
      const legal = new Set(engine.legalMoves());
      for (const [, cellEl] of cellEls) {
        cellEl.innerHTML = "";
        cellEl.classList.remove("legal-target", "selected");
      }
      for (const side of ["w", "b"]) {
        for (const pos of engine.pieces[side]) {
          if (pos === 0 || pos === 15) continue;
          const [r, c] = pathCell(side, pos);
          const cellEl = cellEls.get(`${r},${c}`);
          if (cellEl) cellEl.innerHTML = pieceHTML(side, "●");
        }
      }
      // highlight movable pieces of the side to move
      if (engine.status().result === "active") {
        for (const t of legal) {
          if (t === "x" || t === "0") continue;
          const [r, c] = pathCell(engine.turn(), Number(t));
          const cellEl = cellEls.get(`${r},${c}`);
          if (cellEl) cellEl.classList.add("legal-target");
        }
      }
      // pools
      const poolCount = (side) => engine.pieces[side].filter((p) => p === 0).length;
      const homeCount = (side) => engine.pieces[side].filter((p) => p === 15).length;
      const canEnter = legal.has("0");
      const passOnly = legal.has("x");
      const poolHTML = (side) =>
        `<span class="ur-pool-label">${t(meta.players[side])}</span>` +
        `<span class="ur-pool-pieces gpiece-${side}">${"●".repeat(poolCount(side))}</span>` +
        `<span class="ur-pool-home">${t("ur.home")} ${homeCount(side)}</span>` +
        (engine.turn() === side && canEnter
          ? `<button type="button" class="btn ur-enter" data-act="enter">${t("ur.enterPiece")}</button>`
          : "") +
        (engine.turn() === side && passOnly
          ? `<button type="button" class="btn ur-enter" data-act="pass">${t("ur.pass")}</button>`
          : "");
      poolTop.innerHTML = poolHTML("w");
      poolBottom.innerHTML = poolHTML("b");
      for (const pool of [poolTop, poolBottom]) {
        const btn = pool.querySelector(".ur-enter");
        if (btn) btn.addEventListener("click", () => tapCb && tapCb(btn.dataset.act));
      }
    },
  };
}

export function tapReducer(engine, _sel, cellId) {
  if (cellId === "enter") {
    if (engine.legalMoves().includes("0")) return { kind: "move", token: "0" };
    return { kind: "none" };
  }
  if (cellId === "pass") {
    if (engine.legalMoves().includes("x")) return { kind: "move", token: "x" };
    return { kind: "none" };
  }
  const [r, c] = cellId.split(",").map(Number);
  const side = engine.turn();
  // find which of the mover's positions maps to this cell
  for (const t of engine.legalMoves()) {
    if (t === "x" || t === "0") continue;
    const [pr, pc] = pathCell(side, Number(t));
    if (pr === r && pc === c) return { kind: "move", token: t };
  }
  return { kind: "none" };
}
