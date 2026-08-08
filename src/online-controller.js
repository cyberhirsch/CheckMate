// Play-by-link ("online") mode: asynchronous correspondence chess where each
// player's move travels as a URL to the opponent over any messaging channel.
// No server, no live connection — the link carries the whole game.

import { state, setState } from "./state.js";
import { saveStored } from "./storage.js";
import {
  generateGameId,
  moveToken,
  encodeLink,
  parseHash,
  replayMoves,
  extendsHistory,
} from "./link-codec.js";
import { announce } from "./ui.js";

export class OnlineController {
  constructor(gameController, { onLinkReady, onIncomingApplied, onGameOver }) {
    this.gc = gameController;
    this.moves = []; // move tokens, the canonical shared history
    this.pendingAction = null; // action to attach to the next outgoing link
    this.onLinkReady = onLinkReady || (() => {});
    this.onIncomingApplied = onIncomingApplied || (() => {});
    this.onGameOver = onGameOver || (() => {});
  }

  // Start a fresh game as White. The first shared link makes the opener Black.
  startNewGame() {
    this.moves = [];
    this.pendingAction = null;
    setState({
      mode: "online",
      gameId: generateGameId(),
      localColor: "white",
      boardOrientation: "white",
      connectionState: "not-applicable",
      pendingDrawOffer: false,
    });
    this.gc.startNewGame();
    this._persist();
    announce("New game started. You play White — make your move, then send the link.");
  }

  // Called by main.js after every local move in online mode.
  afterLocalMove(record) {
    this.moves.push(moveToken(record));
    this._persist();
    this._publishLink();
  }

  currentLink() {
    return encodeLink({ gameId: state.gameId, moves: this.moves, action: this.pendingAction });
  }

  _publishLink() {
    this.onLinkReady(this.currentLink());
  }

  resign() {
    this.pendingAction = "res";
    const winner = state.localColor === "white" ? "black" : "white";
    setState({ phase: "finished", status: { result: "resignation", winner } });
    this._persist();
    this._publishLink();
    announce("You resigned. Send the link so your opponent sees the result.");
  }

  offerDraw() {
    this.pendingAction = "do";
    this._persist();
    this._publishLink();
    announce("Draw offer attached. Send the link to your opponent.");
  }

  acceptDraw() {
    this.pendingAction = "da";
    setState({ phase: "finished", status: { result: "draw-agreement", winner: null }, pendingDrawOffer: false });
    this._persist();
    this._publishLink();
    announce("Draw agreed. Send the link so your opponent sees the result.");
  }

  declineDraw() {
    setState({ pendingDrawOffer: false });
    announce("Draw offer declined. Make your move.");
  }

  // Handles an incoming link hash. Returns true when it was consumed.
  handleIncoming(hash, stored) {
    const parsed = parseHash(hash);
    if (!parsed) return false;
    if (!parsed.ok) {
      announce("That game link is invalid.");
      return false;
    }

    const known = stored && stored.mode === "online" && stored.gameId === parsed.gameId ? stored : null;

    if (known && !extendsHistory(known.linkMoves || [], parsed.moves)) {
      announce("This link does not match your game history — it may be old or altered. Ignoring it.");
      return false;
    }
    if (!known && state.mode === "online" && state.phase === "active" && state.gameId && state.gameId !== parsed.gameId) {
      const ok = window.confirm("This link is for a different game. Open it and leave your current game?");
      if (!ok) return false;
    }

    const replay = replayMoves(parsed.moves);
    if (!replay.ok) {
      announce("That game link contains an illegal move. Ignoring it.");
      return false;
    }

    // Determine local color: known game keeps it; a fresh link makes you the side to move.
    let localColor = known ? known.localColor : replay.game.turn() === "w" ? "white" : "black";
    if (!known && parsed.moves.length === 0) localColor = "black"; // bare invite: creator is White

    this.moves = parsed.moves.slice();
    this.pendingAction = null;

    setState({
      mode: "online",
      gameId: parsed.gameId,
      localColor,
      boardOrientation: localColor,
      connectionState: "not-applicable",
      pendingDrawOffer: false,
    });
    this.gc.loadReplayedGame(replay.game, replay.records);

    if (parsed.action === "res") {
      const winner = localColor; // the sender resigned
      setState({ phase: "finished", status: { result: "resignation", winner } });
      announce("Your opponent resigned. You win.");
    } else if (parsed.action === "da") {
      setState({ phase: "finished", status: { result: "draw-agreement", winner: null } });
      announce("Your opponent accepted the draw.");
    } else if (parsed.action === "do") {
      setState({ pendingDrawOffer: true });
      announce("Your opponent offers a draw. Accept, or just make your move to decline.");
    } else {
      const myTurn = (replay.game.turn() === "w" ? "white" : "black") === localColor;
      announce(myTurn ? "Move received — your turn." : "Game loaded. Waiting for your opponent.");
    }

    this._persist();
    this.onIncomingApplied();
    return true;
  }

  restore(stored) {
    if (!stored || stored.mode !== "online" || !stored.linkMoves) return false;
    const replay = replayMoves(stored.linkMoves);
    if (!replay.ok) return false;
    this.moves = stored.linkMoves.slice();
    this.pendingAction = stored.pendingAction || null;
    setState({
      mode: "online",
      gameId: stored.gameId,
      localColor: stored.localColor,
      boardOrientation: stored.localColor || "white",
      connectionState: "not-applicable",
    });
    this.gc.loadReplayedGame(replay.game, replay.records);
    if (stored.status && stored.status.result && stored.phase === "finished") {
      setState({ phase: "finished", status: stored.status });
    }
    // Re-show the share panel when the opponent still needs our last link.
    const theirTurn = (replay.game.turn() === "w" ? "white" : "black") !== stored.localColor;
    if ((theirTurn && this.moves.length > 0) || this.pendingAction) this._publishLink();
    return true;
  }

  isLocalTurn() {
    return (this.gc.game.turn() === "w" ? "white" : "black") === state.localColor;
  }

  _persist() {
    saveStored({
      mode: "online",
      gameId: state.gameId,
      localColor: state.localColor,
      linkMoves: this.moves,
      pendingAction: this.pendingAction,
      fen: state.fen,
      moveHistory: state.moveHistory,
      status: state.status,
      phase: state.phase,
    });
  }
}
