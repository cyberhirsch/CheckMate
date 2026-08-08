import { createGame, statusOf } from "./chess-engine.js";
import { setState, state } from "./state.js";
import { saveStored } from "./storage.js";

export class GameController {
  constructor({ boardView, onAfterLocalMove, onGameOver, announce }) {
    this.boardView = boardView;
    this.onAfterLocalMove = onAfterLocalMove;
    this.onGameOver = onGameOver;
    this.announce = announce || (() => {});
    this.game = createGame();
    this.pendingPromotion = null;
    this.sequence = 0;
  }

  startNewGame(fen, phase) {
    this.game = createGame(fen);
    this.sequence = 0;
    setState({
      fen: this.game.fen(),
      turn: this.game.turn() === "w" ? "white" : "black",
      moveHistory: [],
      status: statusOf(this.game),
      phase: phase || "active",
      pendingDrawOffer: false,
    });
    this._syncBoard();
    this._persist();
  }

  loadFromState(fen, moveHistory) {
    this.game = createGame(fen);
    this.sequence = moveHistory.length;
    this._syncBoard();
  }

  // Adopts an already-replayed chess.js instance (link-based online mode).
  loadReplayedGame(game, records) {
    this.game = game;
    this.sequence = records.length;
    const last = records[records.length - 1] || null;
    setState({
      fen: game.fen(),
      turn: game.turn() === "w" ? "white" : "black",
      moveHistory: records,
      status: statusOf(game),
      phase: "active",
    });
    const status = statusOf(game);
    if (["checkmate", "stalemate", "draw", "threefold-repetition", "insufficient-material"].includes(status.result)) {
      setState({ phase: "finished" });
      this.onGameOver && this.onGameOver(status);
    }
    this._syncBoard(last ? { from: last.from, to: last.to } : undefined);
    this._persist();
  }

  _syncBoard(lastMove) {
    // Online mode: your color is always at the bottom, unconditionally.
    // Hotseat mode: orientation follows the rotation toggle / manual rotate.
    const orientation =
      state.mode !== "hotseat" && state.localColor ? state.localColor : state.boardOrientation;
    const interactive = this._isLocalTurnInteractive();
    this.boardView.update({ game: this.game, orientation, lastMove, interactive });
  }

  _isLocalTurnInteractive() {
    if (state.phase !== "active") return false;
    if (state.mode !== "hotseat") {
      const turnColor = this.game.turn() === "w" ? "white" : "black";
      return state.localColor === turnColor;
    }
    return true;
  }

  setInteractive(flag) {
    this.boardView.setInteractive(flag);
  }

  // Requested by BoardView tap handler.
  requestMove({ from, to, needsPromotion }, resolvePromotion) {
    if (needsPromotion && !resolvePromotion) {
      return { needsPromotion: true, from, to };
    }
    return this.attemptMove({ from, to, promotion: resolvePromotion });
  }

  attemptMove({ from, to, promotion }) {
    const fenBefore = this.game.fen();
    let moveResult;
    try {
      moveResult = this.game.move({ from, to, promotion: promotion || undefined });
    } catch {
      moveResult = null;
    }
    if (!moveResult) {
      this.announce("Invalid move");
      return false;
    }
    const fenAfter = this.game.fen();
    this.sequence += 1;
    const record = {
      san: moveResult.san,
      from: moveResult.from,
      to: moveResult.to,
      promotion: moveResult.promotion || null,
      fenBefore,
      fenAfter,
      sequence: this.sequence,
    };
    const status = statusOf(this.game);
    setState({
      fen: fenAfter,
      turn: this.game.turn() === "w" ? "white" : "black",
      moveHistory: [...state.moveHistory, record],
      status,
    });
    this._syncBoard({ from: moveResult.from, to: moveResult.to });
    this._persist();
    this.announce(`${moveResult.color === "w" ? "White" : "Black"} played ${moveResult.san}`);

    if (status.result === "checkmate" || status.result === "stalemate" || status.result === "draw" ||
        status.result === "threefold-repetition" || status.result === "insufficient-material") {
      setState({ phase: "finished" });
      this.onGameOver && this.onGameOver(status);
    }

    this.onAfterLocalMove && this.onAfterLocalMove(record, moveResult);
    return true;
  }

  applyRemoteMove(record) {
    const moveResult = this.game.move({ from: record.from, to: record.to, promotion: record.promotion || undefined });
    if (!moveResult) return false;
    this.sequence = record.sequence;
    const status = statusOf(this.game);
    const fullRecord = { ...record, san: moveResult.san };
    setState({
      fen: this.game.fen(),
      turn: this.game.turn() === "w" ? "white" : "black",
      moveHistory: [...state.moveHistory, fullRecord],
      status,
    });
    this._syncBoard({ from: record.from, to: record.to });
    this._persist();
    this.announce(`Opponent played ${moveResult.san}`);
    if (status.result === "checkmate" || status.result === "stalemate" || status.result === "draw" ||
        status.result === "threefold-repetition" || status.result === "insufficient-material") {
      setState({ phase: "finished" });
      this.onGameOver && this.onGameOver(status);
    }
    return true;
  }

  undo() {
    if (state.mode !== "hotseat") return;
    this.game.undo();
    setState({
      fen: this.game.fen(),
      turn: this.game.turn() === "w" ? "white" : "black",
      moveHistory: state.moveHistory.slice(0, -1),
      status: statusOf(this.game),
    });
    this.sequence = Math.max(0, this.sequence - 1);
    this._syncBoard();
    this._persist();
    this.announce("Move undone");
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

  _persist() {
    saveStored({
      mode: state.mode,
      fen: state.fen,
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
