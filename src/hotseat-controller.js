import { state, setState } from "./state.js";
import { showHandoffScreen, playerName, el } from "./ui.js";
import { generateGameId } from "./link-codec.js";
import { gameModule } from "./games/registry.js";

export class HotseatController {
  constructor(gameController) {
    this.gc = gameController;
  }

  start(gameType) {
    setState({
      mode: "hotseat",
      gameType: gameType || state.gameType,
      localColor: null,
      boardOrientation: "white",
    });
    this.gc.newGame(state.gameType, generateGameId());
  }

  // Reopens a stored hotseat game from the active-games list.
  openStored(rec, engine) {
    setState({
      mode: "hotseat",
      gameType: rec.gameType,
      gameId: rec.gameId,
      localColor: null,
      boardOrientation: "white",
    });
    this.gc.loadEngine(rec.gameType, engine, rec.gameId);
    if (rec.phase === "finished" && rec.status) {
      setState({ phase: "finished", status: rec.status });
    }
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
