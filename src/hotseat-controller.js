import { state, setState } from "./state.js";
import { showHandoffScreen } from "./ui.js";
import { el } from "./ui.js";

export class HotseatController {
  constructor(gameController) {
    this.gc = gameController;
  }

  start() {
    setState({
      mode: "hotseat",
      localColor: null,
      connectionState: "not-applicable",
      boardOrientation: state.rotateAfterMove ? "white" : "white",
    });
    this.gc.startNewGame();
  }

  afterLocalMove(record, moveResult) {
    if (state.phase !== "active") return;
    const nextColor = this.gc.game.turn() === "w" ? "white" : "black";
    const boardEl = el("board");

    const doRotateOrShow = () => {
      if (state.rotateAfterMove) {
        boardEl.classList.add("rotating");
        this.gc.setOrientation(nextColor);
        window.setTimeout(() => boardEl.classList.remove("rotating"), 220);
      }
      if (state.showHandoffScreen) {
        this.gc.setInteractive(false);
        showHandoffScreen(nextColor, () => {
          this.gc.setInteractive(true);
        });
      }
    };

    doRotateOrShow();
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
