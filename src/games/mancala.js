import { pieceHTML } from "./grid-view.js";

export const meta = {
  id: "mancala",
  titleKey: "game.mancala",
  glyph: "◔",
  players: { w: "player.south", b: "player.north" },
  rotatable: false,
  freeAspect: true,
  moveRe: /^[0-5]$/,
};

// Kalah, 4 seeds per pit. Pits 0-5 = South (w) left-to-right, pit 6 = South
// store, pits 7-12 = North (b), pit 13 = North store. Token = the mover's own
// pit index 0-5 (relative to their side). Landing in your store = extra turn.
// Landing in your empty pit captures it plus the opposite pit.

export function createEngine(tokens = []) {
  const pits = Array(14).fill(4);
  pits[6] = 0; pits[13] = 0;
  const applied = [];
  let turnSide = "w";

  function sideHasSeeds(side) {
    const base = side === "w" ? 0 : 7;
    for (let i = 0; i < 6; i++) if (pits[base + i] > 0) return true;
    return false;
  }

  function sweepRemaining() {
    for (let i = 0; i < 6; i++) { pits[6] += pits[i]; pits[i] = 0; }
    for (let i = 7; i < 13; i++) { pits[13] += pits[i]; pits[i] = 0; }
  }

  let finished = false;

  const engine = {
    tokens: applied,
    pits,
    turn: () => turnSide,
    apply(token) {
      if (finished || engine.status().result !== "active") return false;
      const rel = Number(token);
      if (!(rel >= 0 && rel < 6)) return false;
      const base = turnSide === "w" ? 0 : 7;
      const pit = base + rel;
      let seeds = pits[pit];
      if (seeds === 0) return false;
      pits[pit] = 0;
      let i = pit;
      const ownStore = turnSide === "w" ? 6 : 13;
      const skipStore = turnSide === "w" ? 13 : 6;
      while (seeds > 0) {
        i = (i + 1) % 14;
        if (i === skipStore) continue;
        pits[i]++;
        seeds--;
      }
      // capture: last seed in own empty pit (now 1) with seeds opposite
      const ownRow = turnSide === "w" ? i >= 0 && i < 6 : i >= 7 && i < 13;
      if (ownRow && pits[i] === 1) {
        const opposite = 12 - i;
        if (pits[opposite] > 0) {
          pits[ownStore] += pits[opposite] + 1;
          pits[opposite] = 0;
          pits[i] = 0;
        }
      }
      applied.push(token);
      const extraTurn = i === ownStore;
      if (!extraTurn) turnSide = turnSide === "w" ? "b" : "w";
      if (!sideHasSeeds("w") || !sideHasSeeds("b")) {
        sweepRemaining();
        finished = true;
      } else if (!sideHasSeeds(turnSide)) {
        // mover to play has no seeds: game ends, remaining seeds swept
        sweepRemaining();
        finished = true;
      }
      return true;
    },
    legalMoves() {
      if (engine.status().result !== "active") return [];
      const base = turnSide === "w" ? 0 : 7;
      const out = [];
      for (let i = 0; i < 6; i++) if (pits[base + i] > 0) out.push(String(i));
      return out;
    },
    describe: (t) => `#${Number(t) + 1}`,
    status() {
      if (finished) {
        const ws = pits[6], bs = pits[13];
        if (ws > bs) return { result: "win", winner: "w", note: `${ws}–${bs}` };
        if (bs > ws) return { result: "win", winner: "b", note: `${bs}–${ws}` };
        return { result: "draw", note: `${ws}–${bs}` };
      }
      return { result: "active", note: `${pits[6]}–${pits[13]}` };
    },
  };

  for (const t of tokens) if (!engine.apply(t)) return null;
  return engine;
}

export function createView(container) {
  container.innerHTML = "";
  const board = document.createElement("div");
  board.className = "mancala-board";
  const cellEls = new Map();
  let tapCb = null;

  function makePit(id, cls) {
    const c = document.createElement("div");
    c.className = "mancala-pit " + cls;
    if (id !== null) {
      c.dataset.cell = id;
      c.setAttribute("tabindex", "0");
      c.addEventListener("click", () => tapCb && tapCb(id));
      c.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tapCb && tapCb(id); }
      });
    }
    cellEls.set(id === null ? cls : id, c);
    return c;
  }

  // North store | north pits (12..7 displayed L-to-R) | South store
  board.appendChild(makePit(null, "store store-b"));
  const mid = document.createElement("div");
  mid.className = "mancala-mid";
  const north = document.createElement("div");
  north.className = "mancala-row";
  for (let i = 12; i >= 7; i--) north.appendChild(makePit(`n${i}`, "pit-b"));
  const south = document.createElement("div");
  south.className = "mancala-row";
  for (let i = 0; i < 6; i++) south.appendChild(makePit(`s${i}`, "pit-w"));
  mid.appendChild(north);
  mid.appendChild(south);
  board.appendChild(mid);
  board.appendChild(makePit(null, "store store-w"));
  container.appendChild(board);

  return {
    onTap(cb) { tapCb = cb; },
    render(engine) {
      for (const [key, cellEl] of cellEls) {
        let count, side;
        if (key === "store store-b") { count = engine.pits[13]; side = "b"; }
        else if (key === "store store-w") { count = engine.pits[6]; side = "w"; }
        else if (key.startsWith("n")) { count = engine.pits[Number(key.slice(1))]; side = "b"; }
        else { count = engine.pits[Number(key.slice(1))]; side = "w"; }
        cellEl.innerHTML = `<span class="mancala-count gpiece-${side}">${count}</span>`;
      }
    },
  };
}

export function tapReducer(engine, _sel, cellId) {
  // Only the mover's own pits are tappable; ids s0-s5 (south/w), n7-n12 (north/b)
  const side = cellId[0] === "s" ? "w" : "b";
  if (side !== engine.turn()) return { kind: "none" };
  const abs = Number(cellId.slice(1));
  const rel = side === "w" ? abs : abs - 7;
  const token = String(rel);
  if (engine.legalMoves().includes(token)) return { kind: "move", token };
  return { kind: "none" };
}
