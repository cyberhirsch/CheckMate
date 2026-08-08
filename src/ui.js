import { state, subscribe } from "./state.js";
import { gameModule } from "./games/registry.js";

const el = (id) => document.getElementById(id);
const liveRegion = () => el("live-region");

export function announce(text) {
  const lr = liveRegion();
  lr.textContent = "";
  window.requestAnimationFrame(() => {
    lr.textContent = text;
  });
}

function playerName(shellColor) {
  const mod = gameModule(state.gameType);
  if (!mod) return shellColor === "white" ? "White" : "Black";
  return mod.meta.players[shellColor === "white" ? "w" : "b"];
}

function statusText() {
  const s = state.status;
  if (state.phase === "setup") return "Choose a game and a mode.";
  const note = s.note ? ` — ${s.note}` : "";
  if (s.result === "win") return `${playerName(s.winner)} wins${note}`;
  if (s.result === "draw") return `Draw${note}`;
  if (s.result === "resignation") return `${playerName(s.winner)} wins by resignation`;
  if (s.result === "draw-agreement") return "Game drawn by agreement";
  const turnName = playerName(state.turn);
  if (state.mode === "online") {
    return state.turn === state.localColor
      ? `Your move (${turnName})${note}`
      : `Waiting for opponent${note}`;
  }
  return `${turnName} to move${note}`;
}

export function renderStatusBar() {
  const bar = el("status-bar");
  bar.textContent = statusText();
  const s = state.status;
  bar.dataset.tone =
    s.result === "win" || s.result === "resignation"
      ? "danger"
      : s.result === "draw" || s.result === "draw-agreement"
      ? "success"
      : "";
}

export function renderMoveHistory() {
  const list = el("move-history-list");
  list.innerHTML = "";
  const history = state.moveHistory;
  for (let i = 0; i < history.length; i += 2) {
    const li = document.createElement("li");
    const a = history[i];
    const b = history[i + 1];
    li.textContent = `${a ? a.label : ""}${b ? "  " + b.label : ""}`;
    list.appendChild(li);
  }
  list.scrollTop = list.scrollHeight;
}

export function renderModeUI() {
  document.body.dataset.mode = state.mode;
  document.body.dataset.phase = state.phase;
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.mode === state.mode));
  });
  document.querySelectorAll(".game-card").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.game === state.gameType));
  });
  // rotation controls only make sense for rotatable games
  const mod = gameModule(state.gameType);
  const rotatable = !!(mod && mod.meta.rotatable);
  document.body.dataset.rotatable = rotatable ? "yes" : "no";
}

export function renderDrawBanner() {
  el("draw-offer-banner").classList.toggle("hidden", !state.pendingDrawOffer);
}

// Generic choice modal (chess promotion, future game choices).
export function showChoices(options) {
  return new Promise((resolve) => {
    const modal = el("promotion-modal");
    const wrap = modal.querySelector(".promotion-choices");
    wrap.innerHTML = "";
    const cleanup = () => {
      modal.classList.add("hidden");
      cancelBtn.removeEventListener("click", onCancel);
    };
    const onCancel = () => {
      cleanup();
      resolve(null);
    };
    for (const opt of options) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn promo-btn";
      btn.innerHTML = `<span class="promo-glyph">${opt.glyph || ""}</span>${opt.label}`;
      btn.addEventListener("click", () => {
        cleanup();
        resolve(opt.value);
      });
      wrap.appendChild(btn);
    }
    const cancelBtn = el("promotion-cancel-btn");
    cancelBtn.addEventListener("click", onCancel);
    modal.classList.remove("hidden");
  });
}

export function showHandoffScreen(colorName, onReady) {
  const screen = el("handoff-screen");
  el("handoff-text").textContent = `Pass the device to ${colorName}`;
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

export { el, playerName };
