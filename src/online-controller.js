// Play-by-link ("online") mode: asynchronous correspondence play for any game
// in the registry. Primary transport: signed Nostr events through public
// relays. Fallback: the move link itself, sent over any messenger. Both carry
// the complete move history and go through the same validation.
//
// Several games can be live at once; this controller drives the one on screen
// and keeps the rest up to date in storage as their moves arrive.

import { state, setState } from "./state.js";
import { saveGame, getGame, addFriend, friendName, getProfile, activeGameIds } from "./storage.js";
import { generateGameId, encodeLink, parseHash, replayMoves, extendsHistory } from "./link-codec.js";
import { announce, gameTitle } from "./ui.js";
import { t } from "./i18n.js";
import { notify } from "./notify.js";

function notifyOpponentEvent(gameId, gameType, opponentName, action) {
  const name = opponentName || t("friends.unnamed");
  const game = gameTitle(gameType);
  let title, body;
  if (action === "res") {
    title = t("notify.resignedTitle", { name });
    body = game;
  } else if (action === "da") {
    title = t("notify.drawAcceptedTitle");
    body = game;
  } else if (action === "do") {
    title = t("notify.drawOfferedTitle", { name });
    body = game;
  } else {
    title = t("notify.moveTitle", { name });
    body = game;
  }
  notify({ title, body, gameId, tag: gameId });
}

export class OnlineController {
  constructor(gameController, { transport, onLinkReady, onIncomingApplied, onRelayStatus, onGamesChanged }) {
    this.gc = gameController;
    this.transport = transport || null;
    this.moves = [];
    this.pendingAction = null;
    this.opponentPubkey = null;
    this.opponentName = "";
    this.onLinkReady = onLinkReady || (() => {});
    this.onIncomingApplied = onIncomingApplied || (() => {});
    this.onRelayStatus = onRelayStatus || (() => {});
    this.onGamesChanged = onGamesChanged || (() => {});
  }

  myName() {
    return getProfile().name || "";
  }

  /* ---------- Starting and resuming ---------- */

  startNewGame(gameType) {
    this.moves = [];
    this.pendingAction = null;
    this.opponentPubkey = null;
    this.opponentName = "";
    setState({
      mode: "online",
      gameType: gameType || state.gameType,
      gameId: generateGameId(),
      localColor: "white",
      boardOrientation: "white",
      pendingDrawOffer: false,
    });
    this.gc.newGame(state.gameType, state.gameId);
    this._persist();
    this._ensureSubscriptions();
    announce(t("msg.newGameStarted"));
  }

  // Opens a stored game (from the active-games list).
  openStored(gameId) {
    const rec = getGame(gameId);
    if (!rec || rec.mode !== "online") return false;
    const replay = replayMoves(rec.gameType, rec.moves || [], rec.gameId);
    if (!replay.ok) return false;
    this.moves = (rec.moves || []).slice();
    this.pendingAction = rec.pendingAction || null;
    this.opponentPubkey = rec.opponentPubkey || null;
    this.opponentName = rec.opponentName || "";
    setState({
      mode: "online",
      gameType: rec.gameType,
      gameId: rec.gameId,
      localColor: rec.localColor,
      boardOrientation: rec.localColor || "white",
      pendingDrawOffer: false,
    });
    this.gc.loadEngine(rec.gameType, replay.engine, rec.gameId);
    if (rec.phase === "finished" && rec.status) {
      setState({ phase: "finished", status: rec.status });
    }
    const theirTurn = (replay.engine.turn() === "w" ? "white" : "black") !== rec.localColor;
    if (rec.phase !== "finished" && theirTurn && this.moves.length) {
      this.onLinkReady(this.currentLink(), { needsShare: this.needsShare() });
    }
    this._ensureSubscriptions();
    return true;
  }

  /* ---------- Local play ---------- */

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
      name: this.myName(),
    });
  }

  // Sharing is required until the opponent is paired (they have no other way
  // to receive the game) and whenever the relays refuse the move.
  needsShare() {
    return !this.opponentPubkey;
  }

  async _broadcast() {
    // The link must carry our pubkey, otherwise whoever opens it cannot pair
    // and will think they have to keep sharing links back. Wait for the key
    // before publishing the link anywhere.
    if (this.transport && !this.transport.available) await this.transport.init();
    this.onLinkReady(this.currentLink(), { needsShare: this.needsShare() });
    this._publishToRelays();
  }

  async _publishToRelays() {
    if (!this.transport || !this.transport.available) {
      const ok = this.transport && (await this.transport.init());
      if (!ok) {
        this.onRelayStatus("offline");
        return;
      }
    }
    this.onRelayStatus("sending");
    const ok = await this.transport.publishState(state.gameId, {
      gameType: state.gameType,
      moves: this.moves,
      action: this.pendingAction,
      name: this.myName(),
    });
    this.onRelayStatus(ok ? "synced" : "offline");
    if (!ok) {
      announce(t("msg.relaysUnreachable"));
      this.onLinkReady(this.currentLink(), { needsShare: true });
    }
  }

  async _ensureSubscriptions() {
    if (!this.transport) return;
    if (!this.transport.available) {
      const ok = await this.transport.init();
      if (!ok) {
        this.onRelayStatus("offline");
        return;
      }
    }
    this.onRelayStatus("listening");
    await this.transport.syncSubscriptions(activeGameIds());
  }

  /* ---------- Friends and invites ---------- */

  // Starts a game and pushes the invite straight to a friend's relay inbox.
  // We addressed it to a known friend, so they count as paired from the outset:
  // their client can already receive our moves and no link is needed.
  async inviteFriend(pubkey, gameType) {
    this.startNewGame(gameType);
    this.opponentPubkey = pubkey;
    this.opponentName = friendName(pubkey);
    this._persist();
    if (!this.transport || !this.transport.available) {
      const ok = this.transport && (await this.transport.init());
      if (!ok) return false;
    }
    const sent = await this.transport.publishInvite(pubkey, {
      gameId: state.gameId,
      gameType: state.gameType,
      moves: [],
      name: this.myName(),
    });
    if (sent) announce(t("msg.inviteSent"));
    else announce(t("msg.relaysUnreachable"));
    return sent;
  }

  // Hands the current (unpaired) game to a friend: pins them as the opponent
  // and drops the invite — moves included — straight into their relay inbox.
  async sendCurrentGameToFriend(pubkey) {
    if (this.opponentPubkey) return false; // already paired, nothing to hand over
    this.opponentPubkey = pubkey;
    this.opponentName = friendName(pubkey);
    this._persist();
    if (!this.transport.available) {
      const ok = await this.transport.init();
      if (!ok) return false;
    }
    const sent = await this.transport.publishInvite(pubkey, {
      gameId: state.gameId,
      gameType: state.gameType,
      moves: this.moves,
      name: this.myName(),
    });
    if (sent) announce(t("msg.inviteSent"));
    else announce(t("msg.relaysUnreachable"));
    return sent;
  }

  // An invite landed in our inbox: record it as a game we can open, but do not
  // yank the player out of whatever they are doing.
  handleInvite(senderPubkey, payload) {
    if (getGame(payload.gameId)) return;
    const replay = replayMoves(payload.gameType, payload.moves || [], payload.gameId);
    if (!replay.ok) return;
    addFriend(senderPubkey, payload.name);
    saveGame({
      gameId: payload.gameId,
      gameType: payload.gameType,
      mode: "online",
      localColor: "black", // the inviter opened as first player
      moves: payload.moves || [],
      pendingAction: null,
      opponentPubkey: senderPubkey,
      opponentName: (payload.name || "").trim(),
      status: { result: "active", winner: null },
      phase: "active",
    });
    const inviterName = (payload.name || "").trim() || t("friends.unnamed");
    announce(t("msg.inviteReceived", { name: inviterName }));
    notify({
      title: t("notify.inviteTitle", { name: inviterName }),
      body: gameTitle(payload.gameType),
      gameId: payload.gameId,
      tag: payload.gameId,
    });
    this.onGamesChanged();
    this._ensureSubscriptions();
  }

  /* ---------- Remote state ---------- */

  // Any game's state may arrive, not just the one on screen.
  handleRemoteState(gameId, pubkey, payload) {
    const isCurrent = gameId === state.gameId && state.mode === "online";
    const rec = getGame(gameId);
    if (!rec && !isCurrent) return;

    const known = isCurrent
      ? {
          moves: this.moves,
          opponentPubkey: this.opponentPubkey,
          gameType: state.gameType,
          localColor: state.localColor,
        }
      : rec;

    if (known.opponentPubkey && pubkey !== known.opponentPubkey) return;
    if (payload.gameType && payload.gameType !== known.gameType) return;
    const incoming = payload.moves;
    if (!Array.isArray(incoming)) return;
    if (!extendsHistory(known.moves || [], incoming)) return;

    const replay = replayMoves(known.gameType, incoming, gameId);
    if (!replay.ok) {
      if (isCurrent) announce(t("msg.stateIllegal"));
      return;
    }

    addFriend(pubkey, payload.name);
    const senderName = (payload.name || "").trim();
    const isNews =
      incoming.length > (known.moves || []).length ||
      (payload.action && payload.action !== (known.pendingAction || null));

    if (isCurrent) {
      if (!this.opponentPubkey) {
        this.opponentPubkey = pubkey;
        this.opponentName = senderName;
        this._persist();
        if (!isNews) announce(t("msg.opponentJoined"));
      }
      if (senderName) this.opponentName = senderName;
      if (!isNews) return;
      if (this._applyState({ moves: incoming, action: payload.action || null })) {
        this.onIncomingApplied();
        notifyOpponentEvent(gameId, known.gameType, this.opponentName, payload.action || null);
      }
      return;
    }

    // A background game moved: update storage so the list shows "your turn".
    if (!isNews) return;
    const status = replay.engine.status();
    saveGame({
      gameId,
      gameType: known.gameType,
      mode: "online",
      localColor: known.localColor,
      moves: incoming,
      pendingAction: payload.action || null,
      opponentPubkey: known.opponentPubkey || pubkey,
      opponentName: senderName || known.opponentName || "",
      status: {
        result: status.result,
        winner: status.winner ? (status.winner === "w" ? "white" : "black") : null,
        note: status.note || null,
      },
      phase: status.result === "win" || status.result === "draw" ? "finished" : "active",
    });
    this.onGamesChanged();
    notifyOpponentEvent(gameId, known.gameType, senderName || known.opponentName, payload.action || null);
  }

  /* ---------- Actions ---------- */

  resign() {
    this.pendingAction = "res";
    const winner = state.localColor === "white" ? "black" : "white";
    setState({ phase: "finished", status: { result: "resignation", winner } });
    this._persist();
    this._broadcast();
    announce(t("msg.youResigned"));
  }

  offerDraw() {
    this.pendingAction = "do";
    this._persist();
    this._broadcast();
    announce(t("msg.drawSent"));
  }

  acceptDraw() {
    this.pendingAction = "da";
    setState({ phase: "finished", status: { result: "draw-agreement", winner: null }, pendingDrawOffer: false });
    this._persist();
    this._broadcast();
    announce(t("msg.drawAgreed"));
  }

  declineDraw() {
    setState({ pendingDrawOffer: false });
    announce(t("msg.drawDeclined"));
  }

  /* ---------- Links ---------- */

  handleIncoming(hash) {
    const parsed = parseHash(hash);
    if (!parsed) return false;
    if (!parsed.ok) {
      announce(t("msg.linkInvalid"));
      return false;
    }

    const known = getGame(parsed.gameId);
    if (known && !extendsHistory(known.moves || [], parsed.moves)) {
      announce(t("msg.linkMismatch"));
      return false;
    }

    let localColor;
    if (known) {
      localColor = known.localColor;
    } else {
      const probe = replayMoves(parsed.gameType, parsed.moves, parsed.gameId);
      if (!probe.ok) {
        announce(t("msg.linkIllegal"));
        return false;
      }
      localColor = parsed.moves.length === 0 ? "black" : probe.engine.turn() === "w" ? "white" : "black";
    }

    this.opponentPubkey = parsed.pubkey || (known && known.opponentPubkey) || null;
    this.opponentName = (parsed.name || (known && known.opponentName) || "").trim();
    if (this.opponentPubkey) addFriend(this.opponentPubkey, this.opponentName);

    setState({
      mode: "online",
      gameType: parsed.gameType,
      gameId: parsed.gameId,
      localColor,
      boardOrientation: localColor,
      pendingDrawOffer: false,
    });

    if (!this._applyState(parsed, true)) return false;

    this._ensureSubscriptions().then(() => this._publishToRelays());
    this.onIncomingApplied();
    this.onGamesChanged();
    return true;
  }

  // Validates and applies a full-history state from either transport.
  _applyState({ moves, action }, fresh = false) {
    const replay = replayMoves(state.gameType, moves, state.gameId);
    if (!replay.ok) {
      announce(t("msg.stateIllegal"));
      return false;
    }
    this.moves = moves.slice();
    this.pendingAction = null;
    if (fresh) this.gc.loadEngine(state.gameType, replay.engine, state.gameId);
    else this.gc.applyRemoteTokens(moves);

    const localColor = state.localColor;
    if (action === "res") {
      setState({ phase: "finished", status: { result: "resignation", winner: localColor } });
      announce(t("msg.oppResigned"));
    } else if (action === "da") {
      setState({ phase: "finished", status: { result: "draw-agreement", winner: null } });
      announce(t("msg.oppAcceptedDraw"));
    } else if (action === "do") {
      setState({ pendingDrawOffer: true });
      announce(t("msg.oppOffersDraw"));
    } else {
      const myTurn = (replay.engine.turn() === "w" ? "white" : "black") === localColor;
      announce(myTurn ? t("msg.moveReceived") : t("msg.gameLoaded"));
    }
    this._persist();
    return true;
  }

  _persist() {
    saveGame({
      gameId: state.gameId,
      gameType: state.gameType,
      mode: "online",
      localColor: state.localColor,
      moves: this.moves,
      pendingAction: this.pendingAction,
      opponentPubkey: this.opponentPubkey,
      opponentName: this.opponentName,
      status: state.status,
      phase: state.phase,
    });
    this.onGamesChanged();
  }
}
