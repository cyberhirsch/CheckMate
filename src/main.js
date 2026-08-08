import { state, setState } from "./state.js";
import { BoardView } from "./board.js";
import { GameController } from "./game-controller.js";
import { HotseatController } from "./hotseat-controller.js";
import { OnlineController } from "./online-controller.js";
import { wireModeSwitch } from "./mode-controller.js";
import { renderQR } from "./qr.js";
import { loadStored, saveStored, clearStored } from "./storage.js";
import {
  el,
  announce,
  initReactiveUI,
  showPromotionModal,
  renderStatusBar,
} from "./ui.js";

const boardEl = el("board");
const boardView = new BoardView(boardEl, {
  onMoveAttempt: (attempt) => handleBoardMoveAttempt(attempt),
});

const gameController = new GameController({
  boardView,
  announce,
  onAfterLocalMove: (record) => {
    if (state.mode === "hotseat") {
      hotseat.afterLocalMove(record);
    } else if (state.mode === "online") {
      online.afterLocalMove(record);
    }
  },
  onGameOver: (status) => {
    renderStatusBar();
    announce("Game over: " + status.result);
  },
});

const hotseat = new HotseatController(gameController);

const online = new OnlineController(gameController, {
  onLinkReady: (link) => {
    el("link-output").value = link;
    el("send-panel").classList.remove("hidden");
    el("link-qr").classList.add("hidden");
  },
  onIncomingApplied: () => {
    el("send-panel").classList.add("hidden");
  },
});

async function handleBoardMoveAttempt(attempt) {
  if (attempt.needsPromotion) {
    const piece = await showPromotionModal();
    if (!piece) {
      boardView.render();
      return;
    }
    gameController.attemptMove({ from: attempt.from, to: attempt.to, promotion: piece });
    return;
  }
  gameController.attemptMove({ from: attempt.from, to: attempt.to });
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
el("accept-draw-btn").addEventListener("click", () => online.acceptDraw());
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
  // Keep the URL clean either way; the game is persisted to localStorage.
  history.replaceState(null, "", location.pathname);
  return consumed;
}

window.addEventListener("hashchange", () => consumeHash());

// --- Restore persisted settings/state ---
function restore() {
  const stored = loadStored();
  if (stored) {
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
  if (stored.mode === "hotseat" && stored.fen && stored.phase === "active") {
    setState({
      mode: "hotseat",
      gameId: stored.gameId || "",
      localColor: null,
      connectionState: "not-applicable",
    });
    gameController.loadFromState(stored.fen, stored.moveHistory || []);
    setState({
      fen: stored.fen,
      moveHistory: stored.moveHistory || [],
      status: stored.status || { result: "active", winner: null },
      phase: "active",
      turn: gameController.game.turn() === "w" ? "white" : "black",
    });
    announce("Restored your previous hotseat game");
  } else if (stored.mode === "online" && stored.linkMoves) {
    if (online.restore(stored)) {
      announce("Restored your online game");
    }
  }
}

// --- Boot ---
initReactiveUI();
el("rotate-toggle").checked = window.matchMedia("(max-width: 767px)").matches;
setState({ rotateAfterMove: el("rotate-toggle").checked });
restore();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
