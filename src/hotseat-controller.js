import { state, setState } from "./state.js";
import { showHandoffScreen, playerName, el } from "./ui.js";
import { generateGameId } from "./link-codec.js";
import { gameModule } from "./games/registry.js";

export class HotseatController {
  constructor(gameController) {
    this.gc = gameController;
  }

  start() {
    setState({
      mode: "hotseat",
      localColor: null,
      connectionState: "not-applicable",
      boardOrientation: "white",
    });
    this.gc.newGame(state.gameType, generateGameId());
  }

  afterLocalMove() {
    if (state.phase !== "active") return;
    const rotatable = gameModule(state.gameType).meta.rotatable;
    const nextColor = this.gc.engine.turn() === "w" ? "white" : "black";
    if (rotatable && state.rotateAfterMove) {
      const boardEl = el("board");
      boardEl.classList.add("rotating");
      this.gc.setOrientation(nextColor);
      window.setTimeout(() => boardEl.classList.remove("rotating"), 220);
    }
    if (state.showHandoffScreen) {
      this.gc.setInteractive(false);
      showHandoffScreen(playerName(nextColor), () => {
        this.gc.setInteractive(true);
      });
    }
  }

  undo() {
    this.gc.undo();
  }

  resignActiveColor() {
    this.gc.resign(state.turn);
  }

  endAsDraw() {
    this.gc.endAsDraw();
  }

  manualRotate() {
    const next = state.boardOrientation === "white" ? "black" : "white";
    this.gc.setOrientation(next);
  }
}
