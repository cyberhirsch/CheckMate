import { state, setState } from "./state.js";
import { BoardHost } from "./board-host.js";
import { GameController } from "./game-controller.js";
import { HotseatController } from "./hotseat-controller.js";
import { OnlineController } from "./online-controller.js";
import { NostrTransport } from "./nostr.js";
import { wireModeSwitch } from "./mode-controller.js";
import { renderQR } from "./qr.js";
import {
  getProfile,
  saveProfile,
  hasProfileName,
  getGame,
  deleteGame,
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

migrateLegacy();

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
  onPersist: () => renderGamesList(),
});

const hotseat = new HotseatController(gameController);
const transport = new NostrTransport();

const online = new OnlineController(gameController, {
  transport,
  onLinkReady: (link) => {
    el("link-output").value = link;
    el("send-panel").classList.remove("hidden");
    el("link-qr").classList.add("hidden");
  },
  onIncomingApplied: () => el("send-panel").classList.add("hidden"),
  onRelayStatus: (status) => {
    const line = el("relay-status");
    line.textContent = status ? t("relay." + status) : "";
    line.dataset.state = status || "";
  },
  onGamesChanged: () => renderGamesList(),
});

transport.setHandlers({
  onGameState: (gameId, pubkey, payload) => online.handleRemoteState(gameId, pubkey, payload),
  onInvite: (pubkey, payload) => online.handleInvite(pubkey, payload),
});

/* ---------- Game picker ---------- */

function buildGamePicker() {
  const wrap = el("game-picker");
  wrap.innerHTML = "";
  for (const id of GAME_ORDER) {
    const meta = GAMES[id].meta;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "game-card";
    btn.dataset.game = id;
    btn.setAttribute("aria-pressed", String(id === state.gameType));
    btn.innerHTML = `<span class="game-glyph">${meta.glyph}</span><span class="game-name">${t(meta.titleKey)}</span>`;
    btn.addEventListener("click", () => {
      if (state.gameType === id) return;
      setState({ gameType: id });
      saveProfile({ gameType: id });
    });
    wrap.appendChild(btn);
  }
}

/* ---------- Lists ---------- */

function openGame(gameId) {
  const rec = getGame(gameId);
  if (!rec) return;
  if (rec.mode === "hotseat") {
    const mod = gameModule(rec.gameType);
    const engine = mod && mod.createEngine(rec.moves || [], { gameId: rec.gameId });
    if (!engine) return;
    hotseat.openStored(rec, engine);
  } else {
    online.openStored(gameId);
  }
}

setListHandlers(
  {
    open: openGame,
    remove: (gameId) => {
      if (!window.confirm(t("games.confirmDelete"))) return;
      deleteGame(gameId);
      renderGamesList();
    },
  },
  {
    invite: async (pubkey) => {
      await online.inviteFriend(pubkey, state.gameType);
    },
    remove: (pubkey) => {
      if (!window.confirm(t("friends.confirmRemove"))) return;
      import("./storage.js").then((m) => {
        m.removeFriend(pubkey);
        renderFriendsList();
      });
    },
  }
);

/* ---------- Mode switch ---------- */

wireModeSwitch({
  onSwitch: () => {
    el("send-panel").classList.add("hidden");
    setState({ status: { result: "active", winner: null } });
  },
});

/* ---------- Setup controls ---------- */

el("start-hotseat-btn").addEventListener("click", () => hotseat.start());
el("start-online-btn").addEventListener("click", () => online.startNewGame());

el("rotate-toggle").addEventListener("change", (e) => {
  setState({ rotateAfterMove: e.target.checked });
  saveProfile({ rotateAfterMove: e.target.checked });
});
el("handoff-toggle").addEventListener("change", (e) => {
  setState({ showHandoffScreen: e.target.checked });
  saveProfile({ showHandoffScreen: e.target.checked });
});

/* ---------- Game controls ---------- */

el("back-btn").addEventListener("click", () => {
  el("send-panel").classList.add("hidden");
  history.replaceState(null, "", location.pathname);
  setState({ phase: "setup" });
  renderAll();
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

/* ---------- Share / copy / QR ---------- */

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

el("copy-link-btn").addEventListener("click", () => copyText(el("link-output").value));
el("share-link-btn").addEventListener("click", async () => {
  const link = el("link-output").value;
  if (navigator.share) {
    try {
      await navigator.share({ title: t("share.title"), url: link });
      return;
    } catch { /* cancelled */ }
  }
  await copyText(link);
});
el("qr-link-btn").addEventListener("click", async () => {
  const canvas = el("link-qr");
  if (!canvas.classList.contains("hidden")) {
    canvas.classList.add("hidden");
    return;
  }
  const ok = await renderQR(canvas, el("link-output").value);
  if (!ok) announce(t("msg.qrFailed"));
});

/* ---------- Settings + welcome ---------- */

function openSettings() {
  el("settings-name").value = getProfile().name;
  el("settings-pubkey").textContent = transport.pubkey || t("settings.identityPending");
  el("settings-modal").classList.remove("hidden");
}

el("settings-btn").addEventListener("click", openSettings);
el("settings-close-btn").addEventListener("click", () => {
  const name = el("settings-name").value.trim().slice(0, 24);
  saveProfile({ name });
  el("settings-modal").classList.add("hidden");
  renderAll();
});

el("welcome-start-btn").addEventListener("click", () => {
  const name = el("welcome-name").value.trim().slice(0, 24);
  saveProfile({ name: name || t("welcome.defaultName") });
  el("welcome-modal").classList.add("hidden");
  renderAll();
});

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
    buildGamePicker();
    if (gameController.engine) gameController.refreshInteractivity();
  });
}

/* ---------- Incoming links ---------- */

function consumeHash() {
  if (!location.hash || location.hash.length < 2) return false;
  const consumed = online.handleIncoming(location.hash);
  history.replaceState(null, "", location.pathname);
  return consumed;
}
window.addEventListener("hashchange", () => consumeHash());

/* ---------- Boot ---------- */

setLanguage(detectLanguage());
buildLanguagePicker();
buildGamePicker();

const profile = getProfile();
setState({ gameType: GAMES[profile.gameType] ? profile.gameType : "chess" });
const rotateDefault =
  profile.rotateAfterMove === null ? window.matchMedia("(max-width: 767px)").matches : profile.rotateAfterMove;
setState({ rotateAfterMove: rotateDefault, showHandoffScreen: profile.showHandoffScreen });
el("rotate-toggle").checked = rotateDefault;
el("handoff-toggle").checked = profile.showHandoffScreen;

initReactiveUI();

if (!hasProfileName()) {
  el("welcome-modal").classList.remove("hidden");
  el("welcome-name").focus();
}

// Reconnect to relays for every game that could still receive a move.
transport.init().then((ok) => {
  if (!ok) return;
  transport.syncSubscriptions(activeGameIds());
});

consumeHash();
renderAll();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
