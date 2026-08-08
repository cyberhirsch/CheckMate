// Play-by-link ("online") mode: asynchronous correspondence play for any game
// in the registry. Primary transport: signed Nostr events through public
// relays. Fallback: the move link itself, sent over any messenger. Both carry
// the complete move history and go through the same validation.

import { state, setState } from "./state.js";
import { saveStored } from "./storage.js";
import {
  generateGameId,
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
    this.pendingAction = null;
    this.opponentPubkey = null;
    this.onLinkReady = onLinkReady || (() => {});
    this.onIncomingApplied = onIncomingApplied || (() => {});
    this.onRelayStatus = onRelayStatus || (() => {});
  }

  // Start a fresh game as the first player. The shared link makes the opener player two.
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
    this.gc.newGame(state.gameType, state.gameId);
    this._persist();
    this._startRelaySync();
    announce("New game started. You move first — then send the link.");
  }

  afterLocalMove(record) {
    this.moves.push(record.token);
    this._persist();
    this._broadcast();
  }

  currentLink() {
    const pubkey = this.transport && this.transport.available ? this.transport.pubkey : null;
    return encodeLink({
      gameType: state.gameType,
      gameId: state.gameId,
      moves: this.moves,
      action: this.pendingAction,
      pubkey,
    });
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
      gameType: state.gameType,
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

  _handleRemoteState(pubkey, payload) {
    if (this.opponentPubkey && pubkey !== this.opponentPubkey) return;
    if (payload.gameType && payload.gameType !== state.gameType) return;
    const incoming = payload.moves;
    if (!Array.isArray(incoming)) return;
    if (!extendsHistory(this.moves, incoming)) return;
    const isNews = incoming.length > this.moves.length || (payload.action && payload.action !== this.pendingAction);
    if (!this.opponentPubkey) {
      this.opponentPubkey = pubkey;
      this._persist();
      if (!isNews) announce("Opponent joined — relay sync active.");
    }
    if (!isNews) return;
    const applied = this._applyState({ moves: incoming, action: payload.action || null });
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

    let localColor;
    if (known) {
      localColor = known.localColor;
    } else {
      const probe = replayMoves(parsed.gameType, parsed.moves, parsed.gameId);
      if (!probe.ok) {
        announce("That game link contains an illegal move. Ignoring it.");
        return false;
      }
      localColor = parsed.moves.length === 0 ? "black" : probe.engine.turn() === "w" ? "white" : "black";
    }

    if (parsed.pubkey) this.opponentPubkey = parsed.pubkey;
    else if (known && known.opponentPubkey) this.opponentPubkey = known.opponentPubkey;

    setState({
      mode: "online",
      gameType: parsed.gameType,
      gameId: parsed.gameId,
      localColor,
      boardOrientation: localColor,
      connectionState: "not-applicable",
      pendingDrawOffer: false,
    });

    const applied = this._applyState(parsed, true);
    if (!applied) return false;

    this._startRelaySync().then(() => {
      this._publishToRelays();
    });
    this.onIncomingApplied();
    return true;
  }

  // Validates and applies a full-history state from either transport.
  // fresh = true mounts the game view from scratch (link open / game switch).
  _applyState({ moves, action }, fresh = false) {
    const replay = replayMoves(state.gameType, moves, state.gameId);
    if (!replay.ok) {
      announce("Received an illegal game state. Ignoring it.");
      return false;
    }
    this.moves = moves.slice();
    this.pendingAction = null;
    if (fresh) {
      this.gc.loadEngine(state.gameType, replay.engine, state.gameId);
    } else {
      this.gc.applyRemoteTokens(moves);
    }

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
      const myTurn = (replay.engine.turn() === "w" ? "white" : "black") === localColor;
      announce(myTurn ? "Move received — your turn." : "Game loaded. Waiting for your opponent.");
    }
    this._persist();
    return true;
  }

  restore(stored) {
    if (!stored || stored.mode !== "online" || !stored.linkMoves) return false;
    const gameType = stored.gameType || "chess";
    const replay = replayMoves(gameType, stored.linkMoves, stored.gameId);
    if (!replay.ok) return false;
    this.moves = stored.linkMoves.slice();
    this.pendingAction = stored.pendingAction || null;
    this.opponentPubkey = stored.opponentPubkey || null;
    setState({
      mode: "online",
      gameType,
      gameId: stored.gameId,
      localColor: stored.localColor,
      boardOrientation: stored.localColor || "white",
      connectionState: "not-applicable",
    });
    this.gc.loadEngine(gameType, replay.engine, stored.gameId);
    if (stored.status && stored.status.result && stored.phase === "finished") {
      setState({ phase: "finished", status: stored.status });
    }
    const theirTurn = (replay.engine.turn() === "w" ? "white" : "black") !== stored.localColor;
    if ((theirTurn && this.moves.length > 0) || this.pendingAction) this.onLinkReady(this.currentLink());
    this._startRelaySync();
    return true;
  }

  _persist() {
    saveStored({
      mode: "online",
      gameType: state.gameType,
      gameId: state.gameId,
      localColor: state.localColor,
      linkMoves: this.moves,
      pendingAction: this.pendingAction,
      opponentPubkey: this.opponentPubkey,
      moveHistory: state.moveHistory,
      status: state.status,
      phase: state.phase,
    });
  }
}
