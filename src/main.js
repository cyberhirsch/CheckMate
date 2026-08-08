import { state, setState } from "./state.js";
import { BoardHost } from "./board-host.js";
import { GameController } from "./game-controller.js";
import { HotseatController } from "./hotseat-controller.js";
import { OnlineController } from "./online-controller.js";
import { NostrTransport } from "./nostr.js";
import { wireModeSwitch } from "./mode-controller.js";
import { renderQR } from "./qr.js";
import { loadStored, saveStored, clearStored } from "./storage.js";
import { GAMES, GAME_ORDER, gameModule } from "./games/registry.js";
import { el, announce, initReactiveUI, renderStatusBar, renderModeUI } from "./ui.js";

const boardHost = new BoardHost(el("board"), {
  onMoveToken: (token) => gameController.attemptToken(token),
});

const gameController = new GameController({
  boardHost,
  announce,
  onAfterLocalMove: (record) => {
    if (state.mode === "hotseat") {
      hotseat.afterLocalMove(record);
    } else if (state.mode === "online") {
      online.afterLocalMove(record);
    }
  },
  onGameOver: () => {
    renderStatusBar();
  },
});

const hotseat = new HotseatController(gameController);

const transport = new NostrTransport();
transport.init();

const RELAY_STATUS_TEXT = {
  listening: "Relay sync active — moves arrive automatically",
  sending: "Sending move to relays…",
  synced: "Move delivered via relay — link below is a backup",
  offline: "Relays unreachable — send the link to your opponent",
};

const online = new OnlineController(gameController, {
  transport,
  onLinkReady: (link) => {
    el("link-output").value = link;
    el("send-panel").classList.remove("hidden");
    el("link-qr").classList.add("hidden");
  },
  onIncomingApplied: () => {
    el("send-panel").classList.add("hidden");
  },
  onRelayStatus: (status) => {
    const line = el("relay-status");
    line.textContent = RELAY_STATUS_TEXT[status] || "";
    line.dataset.state = status;
  },
});

// --- Game picker ---
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
    btn.innerHTML = `<span class="game-glyph">${meta.glyph}</span><span class="game-name">${meta.title}</span>`;
    btn.addEventListener("click", () => {
      if (state.gameType === id) return;
      setState({ gameType: id });
      saveStored({ gameType: id });
    });
    wrap.appendChild(btn);
  }
}

// --- Mode switch ---
wireModeSwitch({
  onSwitch: () => {
    el("send-panel").classList.add("hidden");
    setState({ status: { result: "active", winner: null } });
  },
});

// --- Hotseat setup controls ---
el("rotate-toggle").addEventListener("change", (e) => {
  setState({ rotateAfterMove: e.target.checked });
  saveStored({ rotateAfterMove: e.target.checked });
});
el("handoff-toggle").addEventListener("change", (e) => {
  setState({ showHandoffScreen: e.target.checked });
  saveStored({ showHandoffScreen: e.target.checked });
});
el("start-hotseat-btn").addEventListener("click", () => {
  hotseat.start();
});

// --- Online setup ---
el("start-online-btn").addEventListener("click", () => {
  online.startNewGame();
});

// --- Game controls ---
el("new-game-btn").addEventListener("click", () => {
  if (state.phase === "active") {
    const ok = window.confirm("Start a new game? Current progress will be lost.");
    if (!ok) return;
  }
  clearStored();
  saveStored({ gameType: state.gameType, rotateAfterMove: state.rotateAfterMove, showHandoffScreen: state.showHandoffScreen });
  el("send-panel").classList.add("hidden");
  history.replaceState(null, "", location.pathname);
  setState({ phase: "setup" });
});

el("rotate-btn").addEventListener("click", () => hotseat.manualRotate());
el("undo-btn").addEventListener("click", () => hotseat.undo());
el("draw-btn").addEventListener("click", () => hotseat.endAsDraw());
el("resign-btn").addEventListener("click", () => {
  const ok = window.confirm("Resign the current game?");
  if (!ok) return;
  if (state.mode === "hotseat") {
    hotseat.resignActiveColor();
  } else {
    online.resign();
  }
});
el("offer-draw-btn").addEventListener("click", () => online.offerDraw());
el("accept-draw-btn").addEventListener("click", () => {
  if (state.mode === "hotseat") return;
  online.acceptDraw();
});
el("reject-draw-btn").addEventListener("click", () => online.declineDraw());

// --- Share / copy / QR for the move link ---
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    announce("Link copied");
    return true;
  } catch {
    const ta = el("link-output");
    ta.focus();
    ta.select();
    announce("Copy blocked — the link is selected, copy it manually");
    return false;
  }
}

el("copy-link-btn").addEventListener("click", () => copyText(el("link-output").value));

el("share-link-btn").addEventListener("click", async () => {
  const link = el("link-output").value;
  if (navigator.share) {
    try {
      await navigator.share({ title: "Checkmate — your move", url: link });
      return;
    } catch {
      /* user cancelled; fall through */
    }
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
  if (!ok) announce("Could not render QR code — use Copy instead");
});

// --- Incoming links ---
function consumeHash() {
  if (!location.hash || location.hash.length < 2) return false;
  const consumed = online.handleIncoming(location.hash, loadStored());
  history.replaceState(null, "", location.pathname);
  return consumed;
}

window.addEventListener("hashchange", () => consumeHash());

// --- Restore persisted settings/state ---
function restore() {
  const stored = loadStored();
  if (stored) {
    if (stored.gameType && GAMES[stored.gameType]) setState({ gameType: stored.gameType });
    if (typeof stored.rotateAfterMove === "boolean") {
      setState({ rotateAfterMove: stored.rotateAfterMove });
      el("rotate-toggle").checked = stored.rotateAfterMove;
    } else {
      el("rotate-toggle").checked = state.rotateAfterMove;
    }
    if (typeof stored.showHandoffScreen === "boolean") {
      setState({ showHandoffScreen: stored.showHandoffScreen });
      el("handoff-toggle").checked = stored.showHandoffScreen;
    }
  }

  if (consumeHash()) return;

  if (!stored) return;
  if (stored.mode === "hotseat" && stored.linkMoves && stored.phase === "active") {
    const mod = gameModule(stored.gameType || "chess");
    const engine = mod && mod.createEngine(stored.linkMoves, { gameId: stored.gameId });
    if (!engine) return;
    setState({
      mode: "hotseat",
      gameId: stored.gameId || "",
      localColor: null,
      connectionState: "not-applicable",
    });
    gameController.loadEngine(stored.gameType || "chess", engine, stored.gameId);
    announce("Restored your previous hotseat game");
  } else if (stored.mode === "online" && stored.linkMoves) {
    if (online.restore(stored)) {
      announce("Restored your online game");
    }
  }
}

// --- Boot ---
buildGamePicker();
initReactiveUI();
el("rotate-toggle").checked = window.matchMedia("(max-width: 767px)").matches;
setState({ rotateAfterMove: el("rotate-toggle").checked });
restore();
renderModeUI();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
