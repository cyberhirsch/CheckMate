// Play-by-link ("online") mode: asynchronous correspondence chess.
// Primary transport: signed Nostr events through public relays — moves arrive
// without leaving the app. Fallback transport: the move link itself, sent over
// any messenger. Both carry the full move history and go through the same
// validation, so the game is consistent no matter which path a move took.

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
  constructor(gameController, { transport, onLinkReady, onIncomingApplied, onRelayStatus }) {
    this.gc = gameController;
    this.transport = transport || null;
    this.moves = []; // move tokens, the canonical shared history
    this.pendingAction = null; // action to attach to the next outgoing link/event
    this.opponentPubkey = null;
    this.onLinkReady = onLinkReady || (() => {});
    this.onIncomingApplied = onIncomingApplied || (() => {});
    this.onRelayStatus = onRelayStatus || (() => {});
  }

  // Start a fresh game as White. The first shared link makes the opener Black.
  startNewGame() {
    this.moves = [];
    this.pendingAction = null;
    this.opponentPubkey = null;
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
    this._startRelaySync();
    announce("New game started. You play White — make your move, then send the link.");
  }

  // Called by main.js after every local move in online mode.
  afterLocalMove(record) {
    this.moves.push(moveToken(record));
    this._persist();
    this._broadcast();
  }

  currentLink() {
    const pubkey = this.transport && this.transport.available ? this.transport.pubkey : null;
    return encodeLink({ gameId: state.gameId, moves: this.moves, action: this.pendingAction, pubkey });
  }

  _broadcast() {
    this.onLinkReady(this.currentLink());
    this._publishToRelays();
  }

  async _publishToRelays() {
    if (!this.transport || !this.transport.available) {
      this.onRelayStatus("offline");
      return;
    }
    this.onRelayStatus("sending");
    const ok = await this.transport.publishState(state.gameId, {
      moves: this.moves,
      action: this.pendingAction,
    });
    this.onRelayStatus(ok ? "synced" : "offline");
    if (!ok) announce("Relays unreachable — send the link instead.");
  }

  async _startRelaySync() {
    if (!this.transport) return;
    if (!this.transport.available) {
      const ok = await this.transport.init();
      if (!ok) {
        this.onRelayStatus("offline");
        return;
      }
    }
    this.onRelayStatus("listening");
    await this.transport.subscribe(state.gameId, (pubkey, payload) => {
      this._handleRemoteState(pubkey, payload);
    });
  }

  // A signed state event arrived from the relays.
  _handleRemoteState(pubkey, payload) {
    if (this.opponentPubkey && pubkey !== this.opponentPubkey) return; // not our opponent
    const incoming = payload.moves;
    if (!extendsHistory(this.moves, incoming)) return; // stale or forked
    const isNews = incoming.length > this.moves.length || (payload.action && payload.action !== this.pendingAction);
    if (!this.opponentPubkey) {
      // First valid extending state for this game claims the opponent seat —
      // same trust model as opening the invite link.
      this.opponentPubkey = pubkey;
      this._persist();
      if (!isNews) announce("Opponent joined — relay sync active.");
    }
    if (!isNews) return;
    const applied = this._applyState({ gameId: state.gameId, moves: incoming, action: payload.action || null });
    if (applied) this.onIncomingApplied();
  }

  resign() {
    this.pendingAction = "res";
    const winner = state.localColor === "white" ? "black" : "white";
    setState({ phase: "finished", status: { result: "resignation", winner } });
    this._persist();
    this._broadcast();
    announce("You resigned.");
  }

  offerDraw() {
    this.pendingAction = "do";
    this._persist();
    this._broadcast();
    announce("Draw offer sent.");
  }

  acceptDraw() {
    this.pendingAction = "da";
    setState({ phase: "finished", status: { result: "draw-agreement", winner: null }, pendingDrawOffer: false });
    this._persist();
    this._broadcast();
    announce("Draw agreed.");
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

    // Determine local color: known game keeps it; a fresh link makes you the side to move.
    let localColor;
    if (known) {
      localColor = known.localColor;
    } else {
      const probe = replayMoves(parsed.moves);
      if (!probe.ok) {
        announce("That game link contains an illegal move. Ignoring it.");
        return false;
      }
      localColor = parsed.moves.length === 0 ? "black" : probe.game.turn() === "w" ? "white" : "black";
    }

    if (parsed.pubkey) this.opponentPubkey = parsed.pubkey;
    else if (known && known.opponentPubkey) this.opponentPubkey = known.opponentPubkey;

    setState({
      mode: "online",
      gameId: parsed.gameId,
      localColor,
      boardOrientation: localColor,
      connectionState: "not-applicable",
      pendingDrawOffer: false,
    });

    const applied = this._applyState(parsed);
    if (!applied) return false;

    this._startRelaySync().then(() => {
      // Publish our (unchanged) state so the sender's client learns our pubkey
      // and future moves can flow through relays without links.
      this._publishToRelays();
    });
    this.onIncomingApplied();
    return true;
  }

  // Validates and applies a full-history state from either transport.
  _applyState({ moves, action }) {
    const replay = replayMoves(moves);
    if (!replay.ok) {
      announce("Received an illegal game state. Ignoring it.");
      return false;
    }
    this.moves = moves.slice();
    this.pendingAction = null;
    this.gc.loadReplayedGame(replay.game, replay.records);

    const localColor = state.localColor;
    if (action === "res") {
      setState({ phase: "finished", status: { result: "resignation", winner: localColor } });
      announce("Your opponent resigned. You win.");
    } else if (action === "da") {
      setState({ phase: "finished", status: { result: "draw-agreement", winner: null } });
      announce("Your opponent accepted the draw.");
    } else if (action === "do") {
      setState({ pendingDrawOffer: true });
      announce("Your opponent offers a draw. Accept, or just make your move to decline.");
    } else {
      const myTurn = (replay.game.turn() === "w" ? "white" : "black") === localColor;
      announce(myTurn ? "Move received — your turn." : "Game loaded. Waiting for your opponent.");
    }
    this._persist();
    return true;
  }

  restore(stored) {
    if (!stored || stored.mode !== "online" || !stored.linkMoves) return false;
    const replay = replayMoves(stored.linkMoves);
    if (!replay.ok) return false;
    this.moves = stored.linkMoves.slice();
    this.pendingAction = stored.pendingAction || null;
    this.opponentPubkey = stored.opponentPubkey || null;
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
    // Re-show the share panel when the opponent still needs our last state,
    // and reconnect to the relays to catch anything we missed while closed.
    const theirTurn = (replay.game.turn() === "w" ? "white" : "black") !== stored.localColor;
    if ((theirTurn && this.moves.length > 0) || this.pendingAction) this.onLinkReady(this.currentLink());
    this._startRelaySync();
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
      opponentPubkey: this.opponentPubkey,
      fen: state.fen,
      moveHistory: state.moveHistory,
      status: state.status,
      phase: state.phase,
    });
  }
}
