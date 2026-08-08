import { legalMovesFrom } from "./chess-engine.js";

// Solid glyphs for both colors; the piece's side comes from the piece-w / piece-b class,
// which lets CSS color them (white fill vs near-black fill) on the grayscale board.
const PIECE_GLYPHS = {
  p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚",
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

export class BoardView {
  constructor(el, { onMoveAttempt }) {
    this.el = el;
    this.onMoveAttempt = onMoveAttempt;
    this.selected = null;
    this.legalTargets = [];
    this.game = null;
    this.orientation = "white";
    this.interactive = true;
    this.lastMove = null;
    this.squareEls = new Map();
    this._buildGrid();
  }

  _buildGrid() {
    this.el.innerHTML = "";
    this.squareEls.clear();
    for (let rank = 8; rank >= 1; rank--) {
      for (const file of FILES) {
        const square = `${file}${rank}`;
        const btn = document.createElement("div");
        btn.className = "square " + ((FILES.indexOf(file) + rank) % 2 === 0 ? "dark" : "light");
        btn.dataset.square = square;
        btn.setAttribute("role", "gridcell");
        btn.setAttribute("tabindex", "0");
        btn.setAttribute("aria-label", square);
        btn.addEventListener("click", () => this._handleSquareTap(square));
        btn.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            this._handleSquareTap(square);
          }
        });
        this.el.appendChild(btn);
        this.squareEls.set(square, btn);
      }
    }
  }

  setInteractive(flag) {
    this.interactive = flag;
  }

  _handleSquareTap(square) {
    if (!this.interactive || !this.game) return;
    const piece = this.game.get(square);
    if (this.selected) {
      if (this.selected === square) {
        this._clearSelection();
        this.render();
        return;
      }
      const target = this.legalTargets.find((m) => m.to === square);
      if (target) {
        const needsPromotion = target.flags.includes("p");
        this.onMoveAttempt({ from: this.selected, to: square, needsPromotion });
        this._clearSelection();
        this.render();
        return;
      }
      if (piece && piece.color === this.game.turn()) {
        this._select(square);
        return;
      }
      this._clearSelection();
      this.render();
      return;
    }
    if (piece && piece.color === this.game.turn()) {
      this._select(square);
    }
  }

  _select(square) {
    this.selected = square;
    this.legalTargets = legalMovesFrom(this.game, square);
    this.render();
  }

  _clearSelection() {
    this.selected = null;
    this.legalTargets = [];
  }

  update({ game, orientation, lastMove, interactive }) {
    this.game = game;
    this.orientation = orientation;
    this.lastMove = lastMove || null;
    this.interactive = interactive;
    this._clearSelection();
    this.render();
  }

  render() {
    if (!this.game) return;
    const board = this.game.board();
    const inCheckColor = this.game.inCheck() ? this.game.turn() : null;
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const square = `${FILES[f]}${8 - r}`;
        const el = this.squareEls.get(square);
        const cell = board[r][f];
        el.classList.toggle("selected", this.selected === square);
        el.classList.toggle(
          "last-move",
          !!this.lastMove && (this.lastMove.from === square || this.lastMove.to === square)
        );
        const isTarget = this.legalTargets.some((m) => m.to === square);
        el.classList.toggle("legal-target", isTarget);
        el.classList.toggle("has-piece", isTarget && !!cell);
        el.classList.toggle(
          "in-check",
          !!inCheckColor && !!cell && cell.type === "k" && cell.color === inCheckColor
        );

        let html = "";
        if (cell) {
          const glyph = PIECE_GLYPHS[cell.type];
          html += `<span class="piece piece-${cell.color}">${glyph}</span>`;
        }
        if (isTarget) html += `<span class="dot"></span>`;
        el.innerHTML = html;
      }
    }
    this.el.classList.toggle("flipped", this.orientation === "black");
  }
}
