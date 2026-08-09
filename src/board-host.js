// Mounts the active game's view into the board container and runs the
// tap → reducer → move pipeline shared by every game.

import { showChoices } from "./ui.js";

export class BoardHost {
  constructor(container, { onMoveToken }) {
    this.container = container;
    this.onMoveToken = onMoveToken;
    this.module = null;
    this.view = null;
    this.engine = null;
    this.selection = null;
    this.interactive = true;
    this.lastMove = null;
    this.orientation = "w";
  }

  setGame(module, engine) {
    this.module = module;
    this.engine = engine;
    this.selection = null;
    this.lastMove = null;
    this.container.classList.toggle("free-aspect", !!module.meta.freeAspect);
    // Boards that aren't square declare their own ratio, so cells stay square.
    if (module.meta.aspect) this.container.style.setProperty("--board-aspect", module.meta.aspect);
    else this.container.style.removeProperty("--board-aspect");
    this.view = module.createView(this.container);
    this.view.onTap((cellId) => this._handleTap(cellId));
    this.render();
  }

  setEngine(engine, lastMove) {
    this.engine = engine;
    this.selection = null;
    this.lastMove = lastMove !== undefined ? lastMove : engine.tokens[engine.tokens.length - 1] || null;
    this.render();
  }

  setInteractive(flag) {
    this.interactive = flag;
    this.render();
  }

  setOrientation(o) {
    this.orientation = o;
    this.render();
  }

  async _handleTap(cellId) {
    if (!this.interactive || !this.engine || !this.module) return;
    const result = this.module.tapReducer(this.engine, this.selection, cellId);
    if (!result || result.kind === "none") return;
    if (result.kind === "select") {
      this.selection = result.selection;
      this.render();
      return;
    }
    if (result.kind === "choose") {
      this.selection = null;
      this.render();
      const value = await showChoices(result.options);
      if (value === null) return;
      this.onMoveToken(result.build(value));
      return;
    }
    if (result.kind === "move") {
      this.selection = null;
      this.onMoveToken(result.token);
    }
  }

  render() {
    if (!this.view || !this.engine) return;
    this.view.render(this.engine, {
      selection: this.selection,
      lastMove: this.lastMove,
      orientation: this.orientation,
      interactive: this.interactive,
    });
  }
}
