// Shared square-grid view used by most games. A game supplies callbacks that
// map its engine state onto cells; this handles DOM, taps, and orientation.

export function makeGridView(container, {
  cols,
  rows,
  cellIds,          // array of cellId strings, row-major top-to-bottom; null entries render gaps
  cellClass,        // (cellId, index) -> extra class string (checkerboard shading etc.)
  boardClass = "",  // extra class on the grid element
}) {
  container.innerHTML = "";
  const el = document.createElement("div");
  el.className = `ggrid ${boardClass}`;
  el.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  el.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
  const cellEls = new Map();
  let tapCb = null;

  cellIds.forEach((id, i) => {
    const c = document.createElement("div");
    if (id === null) {
      c.className = "gcell gap";
    } else {
      c.className = "gcell " + (cellClass ? cellClass(id, i) : "");
      c.dataset.cell = id;
      c.setAttribute("role", "gridcell");
      c.setAttribute("tabindex", "0");
      c.addEventListener("click", () => tapCb && tapCb(id));
      c.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          tapCb && tapCb(id);
        }
      });
      cellEls.set(id, c);
    }
    el.appendChild(c);
  });
  container.appendChild(el);

  return {
    el,
    cellEls,
    onTap(cb) { tapCb = cb; },
    // renderCells(fn): fn(cellId, cellEl) fills content/classes per cell
    renderCells(fn) {
      for (const [id, cellEl] of cellEls) fn(id, cellEl);
    },
    setFlipped(flag) {
      el.classList.toggle("flipped", !!flag);
    },
  };
}

// Helper for piece-glyph content used by several games.
export function pieceHTML(side, glyph) {
  return `<span class="gpiece gpiece-${side}">${glyph}</span>`;
}
