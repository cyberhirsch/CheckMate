import { gameModule } from "./games/registry.js";
import { setState, state } from "./state.js";
import { saveStored } from "./storage.js";
import { t } from "./i18n.js";

export class GameController {
  constructor({ boardHost, onAfterLocalMove, onGameOver, announce }) {
    this.boardHost = boardHost;
    this.onAfterLocalMove = onAfterLocalMove;
    this.onGameOver = onGameOver;
    this.announce = announce || (() => {});
    this.module = null;
    this.engine = null;
  }

  get tokens() {
    return this.engine ? this.engine.tokens : [];
  }

  newGame(gameType, gameId, phase) {
    this.module = gameModule(gameType);
    this.engine = this.module.createEngine([], { gameId });
    setState({
      gameType,
      fen: null,
      turn: "white",
      moveHistory: [],
      status: this._shellStatus(),
      phase: phase || "active",
      pendingDrawOffer: false,
    });
    this.boardHost.setGame(this.module, this.engine);
    this._syncBoard();
    this._persist();
  }

  // Adopt an engine already replayed from a token list (link/relay/restore).
  loadEngine(gameType, engine, gameId) {
    this.module = gameModule(gameType);
    this.engine = engine;
    setState({
      gameType,
      turn: engine.turn() === "w" ? "white" : "black",
      moveHistory: engine.tokens.map((t) => ({ token: t, label: engine.describe(t) })),
      status: this._shellStatus(),
      phase: "active",
    });
    this._checkGameOver();
    this.boardHost.setGame(this.module, this.engine);
    this._syncBoard();
    this._persist();
  }

  attemptToken(token) {
    if (!this.engine) return false;
    const ok = this.engine.apply(token);
    if (!ok) {
      this.announce(t("msg.invalidMove"));
      return false;
    }
    const label = this.engine.describe(token);
    setState({
      turn: this.engine.turn() === "w" ? "white" : "black",
      moveHistory: [...state.moveHistory, { token, label }],
      status: this._shellStatus(),
    });
    this._syncBoard();
    this._persist();
    this.announce(t("msg.played", { move: label }));
    this._checkGameOver();
    this.onAfterLocalMove && this.onAfterLocalMove({ token, label });
    return true;
  }

  applyRemoteTokens(tokens) {
    // Rebuild from full history (guaranteed superset by caller's validation).
    const engine = this.module.createEngine(tokens, { gameId: state.gameId });
    if (!engine) return false;
    this.engine = engine;
    setState({
      turn: engine.turn() === "w" ? "white" : "black",
      moveHistory: engine.tokens.map((t) => ({ token: t, label: engine.describe(t) })),
      status: this._shellStatus(),
    });
    this.boardHost.setEngine(engine);
    this._syncBoard();
    this._persist();
    this._checkGameOver();
    return true;
  }

  undo() {
    if (state.mode !== "hotseat" || !this.engine || !this.engine.tokens.length) return;
    const tokens = this.engine.tokens.slice(0, -1);
    this.engine = this.module.createEngine(tokens, { gameId: state.gameId });
    setState({
      turn: this.engine.turn() === "w" ? "white" : "black",
      moveHistory: state.moveHistory.slice(0, -1),
      status: this._shellStatus(),
      phase: "active",
    });
    this.boardHost.setEngine(this.engine);
    this._syncBoard();
    this._persist();
    this.announce(t("msg.undone"));
  }

  resign(color) {
    const winner = color === "white" ? "black" : "white";
    setState({ phase: "finished", status: { result: "resignation", winner } });
    this._persist();
    this.onGameOver && this.onGameOver(state.status);
  }

  endAsDraw() {
    setState({ phase: "finished", status: { result: "draw-agreement", winner: null } });
    this._persist();
    this.onGameOver && this.onGameOver(state.status);
  }

  setOrientation(color) {
    setState({ boardOrientation: color });
    this._syncBoard();
  }

  refreshInteractivity() {
    this._syncBoard();
  }

  _shellStatus() {
    const s = this.engine.status();
    return {
      result: s.result,
      winner: s.winner ? (s.winner === "w" ? "white" : "black") : null,
      note: s.note || null,
    };
  }

  _checkGameOver() {
    const s = state.status;
    if (s.result === "win" || s.result === "draw") {
      setState({ phase: "finished" });
      this.onGameOver && this.onGameOver(s);
    }
  }

  _syncBoard() {
    // Online mode: your color is always at the bottom (rotatable games only).
    // Hotseat: orientation follows the rotation toggle / manual rotate.
    const rotatable = this.module && this.module.meta.rotatable;
    let orientation = "w";
    if (rotatable) {
      const color = state.mode !== "hotseat" && state.localColor ? state.localColor : state.boardOrientation;
      orientation = color === "black" ? "b" : "w";
    }
    this.boardHost.orientation = orientation;
    this.boardHost.interactive = this._isLocalTurnInteractive();
    this.boardHost.lastMove = this.engine.tokens[this.engine.tokens.length - 1] || null;
    this.boardHost.render();
  }

  _isLocalTurnInteractive() {
    if (state.phase !== "active") return false;
    if (state.mode !== "hotseat") {
      const turnColor = this.engine.turn() === "w" ? "white" : "black";
      return state.localColor === turnColor;
    }
    return true;
  }

  setInteractive(flag) {
    this.boardHost.setInteractive(flag);
  }

  _persist() {
    saveStored({
      mode: state.mode,
      gameType: state.gameType,
      linkMoves: this.tokens,
      moveHistory: state.moveHistory,
      status: state.status,
      gameId: state.gameId,
      localColor: state.localColor,
      phase: state.phase,
      rotateAfterMove: state.rotateAfterMove,
      showHandoffScreen: state.showHandoffScreen,
    });
  }
}
