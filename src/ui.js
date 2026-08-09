import { state, subscribe } from "./state.js";
import { gameModule } from "./games/registry.js";
import { t, tNote, applyStaticTranslations, onLanguageChange } from "./i18n.js";

const el = (id) => document.getElementById(id);
const liveRegion = () => el("live-region");

export function announce(text) {
  const lr = liveRegion();
  lr.textContent = "";
  window.requestAnimationFrame(() => {
    lr.textContent = text;
  });
}

// Player name for a shell colour ("white"/"black"), translated per game.
function playerName(shellColor) {
  const mod = gameModule(state.gameType);
  if (!mod) return t(shellColor === "white" ? "player.white" : "player.black");
  return t(mod.meta.players[shellColor === "white" ? "w" : "b"]);
}

export function gameTitle(gameType) {
  const mod = gameModule(gameType);
  return mod ? t(mod.meta.titleKey) : gameType;
}

function statusText() {
  const s = state.status;
  if (state.phase === "setup") return t("setup.choose");
  const note = tNote(s.note);
  const suffix = note ? ` — ${note}` : "";
  if (s.result === "win") return t("status.wins", { name: playerName(s.winner) }) + suffix;
  if (s.result === "draw") return t("status.draw") + suffix;
  if (s.result === "resignation") return t("status.winsResign", { name: playerName(s.winner) });
  if (s.result === "draw-agreement") return t("status.drawAgreed");
  const turnName = playerName(state.turn);
  if (state.mode === "online") {
    return state.turn === state.localColor
      ? t("status.yourMove", { name: turnName }) + suffix
      : t("status.waiting") + suffix;
  }
  return t("status.turn", { name: turnName }) + suffix;
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
    const nameEl = btn.querySelector(".game-name");
    if (nameEl) nameEl.textContent = gameTitle(btn.dataset.game);
  });
  const mod = gameModule(state.gameType);
  document.body.dataset.rotatable = mod && mod.meta.rotatable ? "yes" : "no";
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
      const label = opt.labelKey ? t(opt.labelKey) : opt.label || "";
      btn.innerHTML = `<span class="promo-glyph">${opt.glyph || ""}</span>${label}`;
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
  el("handoff-text").textContent = t("handoff.pass", { name: colorName });
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

export function renderAll() {
  applyStaticTranslations();
  renderStatusBar();
  renderMoveHistory();
  renderModeUI();
  renderDrawBanner();
}

export function initReactiveUI() {
  subscribe(renderAll);
  onLanguageChange(renderAll);
  renderAll();
}

export { el, playerName, t };
