import { state, subscribe } from "./state.js";

const el = (id) => document.getElementById(id);
const liveRegion = () => el("live-region");

export function announce(text) {
  const lr = liveRegion();
  lr.textContent = "";
  window.requestAnimationFrame(() => {
    lr.textContent = text;
  });
}

function statusText() {
  const s = state.status;
  if (state.phase === "setup") return "Choose a mode and start a game.";
  if (s.result === "checkmate") return `Checkmate — ${s.winner === "white" ? "White" : "Black"} wins.`;
  if (s.result === "stalemate") return "Stalemate — draw.";
  if (s.result === "draw" || s.result === "draw-agreement") return "Game drawn.";
  if (s.result === "threefold-repetition") return "Draw by threefold repetition.";
  if (s.result === "insufficient-material") return "Draw — insufficient material.";
  if (s.result === "resignation") return `${s.winner === "white" ? "White" : "Black"} wins by resignation.`;
  const turn = state.turn === "black" ? "Black" : "White";
  if (state.mode === "online") {
    const check = s.result === "check" ? " — Check!" : "";
    return state.turn === state.localColor
      ? `Your move (${turn})${check}`
      : `Waiting for opponent${check} — send your move`;
  }
  if (s.result === "check") return `${turn} to move — Check!`;
  return `${turn} to move`;
}

function pieceName(code) {
  return { q: "Queen", r: "Rook", b: "Bishop", n: "Knight" }[code] || code;
}

export function renderStatusBar() {
  const bar = el("status-bar");
  bar.textContent = statusText();
  const s = state.status;
  bar.dataset.tone =
    s.result === "checkmate" || s.result === "resignation"
      ? "danger"
      : s.result === "draw" || s.result === "stalemate" || s.result === "draw-agreement"
      ? "success"
      : "";
}

export function renderMoveHistory() {
  const list = el("move-history-list");
  list.innerHTML = "";
  const history = state.moveHistory;
  for (let i = 0; i < history.length; i += 2) {
    const li = document.createElement("li");
    const w = history[i];
    const b = history[i + 1];
    li.textContent = `${w ? w.san : ""}${b ? "  " + b.san : ""}`;
    list.appendChild(li);
  }
  list.scrollTop = list.scrollHeight;
}

export function renderModeUI() {
  document.body.dataset.mode = state.mode;
  document.body.dataset.phase = state.phase;
  el("mode-switch") && void 0;
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.mode === state.mode));
  });
}

export function renderDrawBanner() {
  el("draw-offer-banner").classList.toggle("hidden", !state.pendingDrawOffer);
}

export function renderConnectionInfo() {
  // Connection-specific text folded into the status bar by callers as needed.
}

export function showPromotionModal() {
  return new Promise((resolve) => {
    const modal = el("promotion-modal");
    modal.classList.remove("hidden");
    const cleanup = () => {
      modal.classList.add("hidden");
      buttons.forEach((b) => b.removeEventListener("click", onPick));
      cancelBtn.removeEventListener("click", onCancel);
    };
    const onPick = (e) => {
      const piece = e.currentTarget.dataset.piece;
      cleanup();
      resolve(piece);
    };
    const onCancel = () => {
      cleanup();
      resolve(null);
    };
    const buttons = Array.from(modal.querySelectorAll(".promo-btn"));
    buttons.forEach((b) => b.addEventListener("click", onPick));
    const cancelBtn = el("promotion-cancel-btn");
    cancelBtn.addEventListener("click", onCancel);
  });
}

export function showHandoffScreen(color, onReady) {
  const screen = el("handoff-screen");
  el("handoff-text").textContent = `Pass the device to ${color === "white" ? "White" : "Black"}`;
  screen.classList.remove("hidden");
  const btn = el("handoff-ready-btn");
  const handler = () => {
    screen.classList.add("hidden");
    btn.removeEventListener("click", handler);
    onReady();
  };
  btn.addEventListener("click", handler);
}

export function hideHandoffScreen() {
  el("handoff-screen").classList.add("hidden");
}

export function initReactiveUI() {
  subscribe(() => {
    renderStatusBar();
    renderMoveHistory();
    renderModeUI();
    renderDrawBanner();
  });
  renderStatusBar();
  renderMoveHistory();
  renderModeUI();
  renderDrawBanner();
}

export { el, pieceName };
