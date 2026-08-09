import { state, setState } from "./state.js";
import { BoardHost } from "./board-host.js";
import { GameController } from "./game-controller.js";
import { HotseatController } from "./hotseat-controller.js";
import { OnlineController } from "./online-controller.js";
import { NostrTransport } from "./nostr.js";
import { renderQR } from "./qr.js";
import {
  getProfile,
  saveProfile,
  hasProfileName,
  getGame,
  deleteGame,
  addFriend,
  removeFriend,
  listGames,
  listFriends,
  migrateLegacy,
  activeGameIds,
} from "./storage.js";
import { GAMES, GAME_ORDER, gameModule } from "./games/registry.js";
import {
  el,
  announce,
  initReactiveUI,
  renderStatusBar,
  renderAll,
  renderGamesList,
  renderFriendsList,
  setListHandlers,
} from "./ui.js";
import { LANGUAGES, detectLanguage, setLanguage, getLanguage, t } from "./i18n.js";
import { notificationsSupported, requestPermission, setEnabled as setNotifyEnabled, onOpenGame } from "./notify.js";
import { showScreen, getScreen } from "./screens.js";
import { encodeFriendLink, parseFriendHash } from "./link-codec.js";

migrateLegacy();

// Running inside the Capacitor shell rather than a browser tab. Android draws
// the WebView edge-to-edge, so the header needs guaranteed status-bar clearance.
if (window.Capacitor) document.body.classList.add("native-app");

/* ---------- Core wiring ---------- */

const boardHost = new BoardHost(el("board"), {
  onMoveToken: (token) => gameController.attemptToken(token),
});

const gameController = new GameController({
  boardHost,
  announce,
  onAfterLocalMove: (record) => {
    if (state.mode === "hotseat") hotseat.afterLocalMove(record);
    else if (state.mode === "online") online.afterLocalMove(record);
  },
  onGameOver: () => renderStatusBar(),
  onPersist: () => refreshMenu(),
});

const hotseat = new HotseatController(gameController);
const transport = new NostrTransport();

const online = new OnlineController(gameController, {
  transport,
  // Sharing is only surfaced when the opponent genuinely needs it: before
  // pairing, or when the relays could not take the move.
  onLinkReady: (link, { needsShare }) => {
    el("link-output").value = link;
    if (needsShare) openSendModal(link);
  },
  onIncomingApplied: () => closeSendModal(),
  onRelayStatus: (status) => {
    const line = el("relay-status");
    line.textContent = status ? t("relay." + status) : "";
    line.dataset.state = status || "";
  },
  onGamesChanged: () => refreshMenu(),
});

transport.setHandlers({
  onGameState: (gameId, pubkey, payload) => online.handleRemoteState(gameId, pubkey, payload),
  onInvite: (pubkey, payload) => online.handleInvite(pubkey, payload),
  // Someone we added by their link/QR just learned our pubkey and told us so;
  // complete the friendship on our end too, with no action required from us.
  onFriendRequest: (pubkey, payload) => {
    const wasKnown = listFriends().some((f) => f.pubkey === pubkey);
    addFriend(pubkey, payload.name);
    if (!wasKnown) announce(t("addFriend.added", { name: (payload.name || "").trim() || t("friends.unnamed") }));
    refreshMenu();
  },
});

// After we add someone by their link/QR, tell their inbox so they add us
// back automatically — friending should only ever take one side's action.
async function notifyFriendAdded(pubkey) {
  if (!transport.available) {
    const ok = await transport.init();
    if (!ok) return;
  }
  await transport.publishFriendRequest(pubkey, { name: getProfile().name || "" });
}

async function openSendModal(link) {
  el("link-output").value = link;
  renderSendFriends();
  el("send-modal").classList.remove("hidden");
  const canvas = el("link-qr");
  const ok = await renderQR(canvas, link);
  canvas.classList.toggle("hidden", !ok);
}

// Friends inside the send sheet: one tap hands the game straight to them.
// Only offered while the game is unpaired — once an opponent holds the game,
// it cannot be redirected to someone else.
function renderSendFriends() {
  const block = el("send-friends-block");
  const list = el("send-friends-list");
  const friends = listFriends().sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
  const show = state.mode === "online" && online.needsShare() && friends.length > 0;
  block.classList.toggle("hidden", !show);
  list.innerHTML = "";
  if (!show) return;
  for (const f of friends) {
    const li = document.createElement("li");
    li.className = "entry";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "entry-open";
    const text = document.createElement("span");
    text.className = "entry-text";
    const title = document.createElement("span");
    title.className = "entry-title";
    title.textContent = (f.name || "").trim() || t("friends.unnamed");
    text.appendChild(title);
    btn.appendChild(text);
    btn.addEventListener("click", async () => {
      closeSendModal();
      await online.sendCurrentGameToFriend(f.pubkey);
      renderStatusBar();
    });
    li.appendChild(btn);
    list.appendChild(li);
  }
}

function closeSendModal() {
  el("send-modal").classList.add("hidden");
}

/* ---------- Game selection ---------- */

// What the select screen will do with the chosen game.
let selectIntent = { mode: "hotseat", invitePubkey: null };

function openSelect(mode, invitePubkey = null, friendName = "") {
  selectIntent = { mode, invitePubkey };
  el("select-title").textContent = invitePubkey
    ? t("select.inviteTitle", { name: friendName || t("friends.unnamed") })
    : mode === "hotseat"
    ? t("select.titleOffline")
    : t("select.titleOnline");
  buildGamePicker();
  showScreen("select");
}

function buildGamePicker() {
  const wrap = el("game-picker");
  wrap.innerHTML = "";
  for (const id of GAME_ORDER) {
    const meta = GAMES[id].meta;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "game-card";
    btn.dataset.game = id;
    const glyph = document.createElement("span");
    glyph.className = "game-glyph";
    glyph.textContent = meta.glyph;
    const name = document.createElement("span");
    name.className = "game-name";
    name.textContent = t(meta.titleKey);
    btn.append(glyph, name);
    btn.addEventListener("click", () => startChosenGame(id));
    wrap.appendChild(btn);
  }
}

async function startChosenGame(gameType) {
  saveProfile({ gameType });
  setState({ gameType });
  if (selectIntent.invitePubkey) {
    showScreen("game");
    await online.inviteFriend(selectIntent.invitePubkey, gameType);
    return;
  }
  if (selectIntent.mode === "hotseat") hotseat.start(gameType);
  else online.startNewGame(gameType);
  showScreen("game");
}

/* ---------- Menu ---------- */

function refreshMenu() {
  const games = listGames();
  const live = games.filter((g) => g.phase !== "finished");
  const yourTurn = live.filter((g) => {
    if (g.mode === "hotseat") return false;
    const mod = gameModule(g.gameType);
    const engine = mod && mod.createEngine(g.moves || [], { gameId: g.gameId });
    if (!engine) return false;
    return (engine.turn() === "w" ? "white" : "black") === g.localColor;
  }).length;

  el("menu-continue-sub").textContent = games.length
    ? t("menu.continueSub", { n: live.length })
    : t("menu.continueEmpty");
  const badge = el("menu-badge");
  badge.textContent = String(yourTurn);
  badge.classList.toggle("hidden", yourTurn === 0);

  const friends = listFriends();
  el("menu-friends-sub").textContent = friends.length
    ? t("menu.friendsSub", { n: friends.length })
    : t("menu.friendsEmpty");

  renderGamesList();
  renderFriendsList();
}

el("menu-offline").addEventListener("click", () => openSelect("hotseat"));
el("menu-online").addEventListener("click", () => openSelect("online"));
el("menu-continue").addEventListener("click", () => {
  renderGamesList();
  showScreen("continue");
});
el("menu-friends").addEventListener("click", () => {
  renderFriendsList();
  showScreen("friends");
});

el("back-btn").addEventListener("click", () => {
  closeSendModal();
  history.replaceState(null, "", location.pathname);
  refreshMenu();
  showScreen("menu");
});

/* ---------- Lists ---------- */

function openGame(gameId) {
  const rec = getGame(gameId);
  if (!rec) return;
  if (rec.mode === "hotseat") {
    const mod = gameModule(rec.gameType);
    const engine = mod && mod.createEngine(rec.moves || [], { gameId: rec.gameId });
    if (!engine) return;
    hotseat.openStored(rec, engine);
  } else if (!online.openStored(gameId)) {
    return;
  }
  showScreen("game");
}

setListHandlers(
  {
    open: openGame,
    remove: (gameId) => {
      if (!window.confirm(t("games.confirmDelete"))) return;
      deleteGame(gameId);
      refreshMenu();
    },
  },
  {
    invite: (pubkey, name) => openSelect("online", pubkey, name),
    remove: (pubkey) => {
      if (!window.confirm(t("friends.confirmRemove"))) return;
      removeFriend(pubkey);
      refreshMenu();
    },
  }
);

/* ---------- Game controls ---------- */

// Toggles a looping pulse on whatever the board marked as the last move — the
// move list is gone, so this is how you catch up on what the opponent did.
el("last-move-btn").addEventListener("click", () => {
  const on = document.body.classList.toggle("highlight-last-move");
  el("last-move-btn").setAttribute("aria-pressed", String(on));
});

el("rotate-btn").addEventListener("click", () => hotseat.manualRotate());
el("undo-btn").addEventListener("click", () => hotseat.undo());
el("draw-btn").addEventListener("click", () => hotseat.endAsDraw());
el("resign-btn").addEventListener("click", () => {
  if (!window.confirm(t("confirm.resign"))) return;
  if (state.mode === "hotseat") hotseat.resignActiveColor();
  else online.resign();
});
el("offer-draw-btn").addEventListener("click", () => online.offerDraw());
el("accept-draw-btn").addEventListener("click", () => {
  if (state.mode === "hotseat") return;
  online.acceptDraw();
});
el("reject-draw-btn").addEventListener("click", () => online.declineDraw());
el("share-btn").addEventListener("click", () => openSendModal(online.currentLink()));
el("send-close-btn").addEventListener("click", closeSendModal);

/* ---------- Share / copy ---------- */

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    announce(t("msg.copied"));
    return true;
  } catch {
    const ta = el("link-output");
    ta.focus();
    ta.select();
    announce(t("msg.copyBlocked"));
    return false;
  }
}

// Android WebView has no navigator.share, so inside the Capacitor app the
// native Share plugin is used instead. Browsers keep the Web Share API, and
// anything without either falls back to copying the link.
async function shareLink(title, link) {
  const nativeShare = window.Capacitor?.Plugins?.Share;
  if (nativeShare) {
    try {
      await nativeShare.share({ title, url: link, dialogTitle: title });
      return;
    } catch { /* cancelled */ }
    return;
  }
  if (navigator.share) {
    try {
      await navigator.share({ title, url: link });
      return;
    } catch { /* cancelled */ }
    return;
  }
  await copyText(link);
}

el("copy-link-btn").addEventListener("click", () => copyText(el("link-output").value));
el("share-link-btn").addEventListener("click", () => shareLink(t("share.title"), el("link-output").value));

/* ---------- Settings + welcome ---------- */

el("settings-btn").addEventListener("click", () => {
  el("settings-name").value = getProfile().name;
  el("settings-pubkey").textContent = transport.pubkey || t("settings.identityPending");
  const notifyToggle = el("notify-toggle");
  const notifyHint = el("notify-hint");
  const supported = notificationsSupported();
  notifyToggle.disabled = !supported;
  notifyToggle.checked = supported && getProfile().notificationsEnabled && Notification.permission === "granted";
  notifyHint.textContent = !supported
    ? t("settings.notifyUnsupported")
    : Notification.permission === "denied"
    ? t("settings.notifyBlocked")
    : t("settings.notifyHint");
  el("settings-modal").classList.remove("hidden");
});

el("notify-toggle").addEventListener("change", async (e) => {
  if (!e.target.checked) {
    setNotifyEnabled(false);
    return;
  }
  const result = await requestPermission();
  if (result === "granted") {
    setNotifyEnabled(true);
  } else {
    e.target.checked = false;
    setNotifyEnabled(false);
    el("notify-hint").textContent = t("settings.notifyBlocked");
  }
});

// A toast or OS notification was tapped: bring the tab forward and open the game.
onOpenGame((gameId) => openGame(gameId));

el("settings-close-btn").addEventListener("click", () => {
  saveProfile({ name: el("settings-name").value.trim().slice(0, 24) });
  el("settings-modal").classList.add("hidden");
  renderAll();
  refreshMenu();
});

el("welcome-start-btn").addEventListener("click", () => {
  const name = el("welcome-name").value.trim().slice(0, 24);
  saveProfile({ name: name || t("welcome.defaultName") });
  el("welcome-modal").classList.add("hidden");
  renderAll();
  refreshMenu();
});

el("rotate-toggle").addEventListener("change", (e) => {
  setState({ rotateAfterMove: e.target.checked });
  saveProfile({ rotateAfterMove: e.target.checked });
});
el("handoff-toggle").addEventListener("change", (e) => {
  setState({ showHandoffScreen: e.target.checked });
  saveProfile({ showHandoffScreen: e.target.checked });
});

/* ---------- Add friend ---------- */

function myFriendLink() {
  return encodeFriendLink({ pubkey: transport.pubkey, name: getProfile().name });
}

async function openAddFriendModal() {
  el("friend-paste-input").value = "";
  el("add-friend-modal").classList.remove("hidden");
  if (!transport.available) await transport.init();
  const link = myFriendLink();
  const canvas = el("friend-qr");
  const ok = await renderQR(canvas, link);
  canvas.classList.toggle("hidden", !ok);
  canvas.dataset.link = link;
}

function closeAddFriendModal() {
  el("add-friend-modal").classList.add("hidden");
}

function addFriendFromText(raw) {
  const text = raw.trim();
  if (!text) return;
  // Accept a full link or a bare pubkey pasted straight from someone's ID.
  const hash = text.includes("#") ? text.slice(text.indexOf("#")) : `#f=${text}`;
  const parsed = parseFriendHash(hash);
  if (!parsed || !parsed.ok) {
    announce(t("addFriend.invalid"));
    return;
  }
  if (transport.pubkey && parsed.pubkey === transport.pubkey) {
    announce(t("addFriend.self"));
    return;
  }
  addFriend(parsed.pubkey, parsed.name);
  announce(t("addFriend.added", { name: parsed.name || t("friends.unnamed") }));
  el("friend-paste-input").value = "";
  refreshMenu();
  notifyFriendAdded(parsed.pubkey);
}

el("add-friend-btn").addEventListener("click", openAddFriendModal);
el("friend-close-btn").addEventListener("click", closeAddFriendModal);
el("friend-add-btn").addEventListener("click", () => addFriendFromText(el("friend-paste-input").value));
el("friend-copy-btn").addEventListener("click", () => copyText(el("friend-qr").dataset.link || myFriendLink()));
el("friend-share-btn").addEventListener("click", () =>
  shareLink(t("addFriend.shareTitle"), el("friend-qr").dataset.link || myFriendLink())
);

function buildLanguagePicker() {
  const sel = el("lang-select");
  sel.innerHTML = "";
  for (const lang of LANGUAGES) {
    const opt = document.createElement("option");
    opt.value = lang.code;
    opt.textContent = lang.label;
    sel.appendChild(opt);
  }
  sel.value = getLanguage();
  sel.addEventListener("change", () => {
    setLanguage(sel.value);
    if (getScreen() === "select") buildGamePicker();
    refreshMenu();
    if (gameController.engine) gameController.refreshInteractivity();
  });
}

/* ---------- Incoming links ---------- */

function consumeHash() {
  if (!location.hash || location.hash.length < 2) return false;
  const friendLink = parseFriendHash(location.hash);
  if (friendLink) {
    history.replaceState(null, "", location.pathname);
    if (!friendLink.ok) {
      announce(t("addFriend.invalid"));
      return false;
    }
    if (transport.pubkey && friendLink.pubkey === transport.pubkey) return false;
    addFriend(friendLink.pubkey, friendLink.name);
    announce(t("addFriend.added", { name: friendLink.name || t("friends.unnamed") }));
    refreshMenu();
    renderFriendsList();
    showScreen("friends");
    notifyFriendAdded(friendLink.pubkey);
    return true;
  }
  const consumed = online.handleIncoming(location.hash);
  history.replaceState(null, "", location.pathname);
  if (consumed) showScreen("game");
  return consumed;
}
window.addEventListener("hashchange", () => consumeHash());

/* ---------- Boot ---------- */

setLanguage(detectLanguage());
buildLanguagePicker();

const profile = getProfile();
const rotateDefault =
  profile.rotateAfterMove === null ? window.matchMedia("(max-width: 767px)").matches : profile.rotateAfterMove;
setState({
  gameType: GAMES[profile.gameType] ? profile.gameType : "chess",
  rotateAfterMove: rotateDefault,
  showHandoffScreen: profile.showHandoffScreen,
});
el("rotate-toggle").checked = rotateDefault;
el("handoff-toggle").checked = profile.showHandoffScreen;

initReactiveUI();
refreshMenu();
showScreen("menu");

if (!hasProfileName()) {
  el("welcome-modal").classList.remove("hidden");
  el("welcome-name").focus();
}

transport.init().then((ok) => {
  if (ok) transport.syncSubscriptions(activeGameIds());
});

consumeHash();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
