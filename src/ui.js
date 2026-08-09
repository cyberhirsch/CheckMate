import { state, subscribe } from "./state.js";
import { gameModule } from "./games/registry.js";
import { t, tNote, applyStaticTranslations, onLanguageChange } from "./i18n.js";
import { listGames, listFriends, getProfile } from "./storage.js";

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

function relTime(ts) {
  if (!ts) return "";
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return t("time.now");
  if (mins < 60) return t("time.minutes", { n: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t("time.hours", { n: hours });
  return t("time.days", { n: Math.round(hours / 24) });
}

// Games list. Callbacks are supplied once by main.js.
let gameHandlers = { open: () => {}, remove: () => {} };
let friendHandlers = { invite: () => {}, remove: () => {} };

export function setListHandlers(games, friends) {
  gameHandlers = games;
  friendHandlers = friends;
}

export function renderGamesList() {
  const panel = el("games-panel");
  const list = el("games-list");
  const games = listGames();
  list.innerHTML = "";
  panel.classList.toggle("has-entries", games.length > 0);
  for (const g of games) {
    const mod = gameModule(g.gameType);
    const li = document.createElement("li");
    li.className = "entry";
    const finished = g.phase === "finished";
    let sub;
    if (finished) {
      sub = t("games.finished");
    } else if (g.mode === "hotseat") {
      sub = t("mode.hotseat");
    } else {
      const replayTurn = (g.moves || []).length;
      // Whose move it is follows from history length only for alternating games,
      // so ask the engine instead — cheap for the list sizes we deal with.
      const engine = mod && mod.createEngine(g.moves || [], { gameId: g.gameId });
      const turnColor = engine ? (engine.turn() === "w" ? "white" : "black") : null;
      const mine = turnColor && turnColor === g.localColor;
      li.classList.toggle("your-turn", !!mine);
      sub = mine ? t("games.yourTurn") : t("games.theirTurn");
    }
    li.classList.toggle("finished", finished);

    const opponent = g.mode === "hotseat"
      ? t("mode.hotseat")
      : (g.opponentName || "").trim() || t("games.unknownOpponent");

    const open = document.createElement("button");
    open.type = "button";
    open.className = "entry-open";
    const glyph = document.createElement("span");
    glyph.className = "entry-glyph";
    glyph.textContent = mod ? mod.meta.glyph : "?";
    const text = document.createElement("span");
    text.className = "entry-text";
    const title = document.createElement("span");
    title.className = "entry-title";
    // textContent, never innerHTML: opponent names arrive from strangers.
    title.textContent = `${gameTitle(g.gameType)} · ${opponent}`;
    const subEl = document.createElement("span");
    subEl.className = "entry-sub";
    subEl.textContent = `${sub} · ${relTime(g.updatedAt)}`;
    text.append(title, subEl);
    open.append(glyph, text);
    open.addEventListener("click", () => gameHandlers.open(g.gameId));

    const del = document.createElement("button");
    del.type = "button";
    del.className = "entry-action";
    del.textContent = "✕";
    del.setAttribute("aria-label", t("games.delete"));
    del.addEventListener("click", () => gameHandlers.remove(g.gameId));

    li.append(open, del);
    list.appendChild(li);
  }
}

export function renderFriendsList() {
  const panel = el("friends-panel");
  const list = el("friends-list");
  const friends = listFriends().sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
  list.innerHTML = "";
  panel.classList.toggle("has-entries", friends.length > 0);
  for (const f of friends) {
    const li = document.createElement("li");
    li.className = "entry";
    const info = document.createElement("span");
    info.className = "entry-text";
    const title = document.createElement("span");
    title.className = "entry-title";
    title.textContent = (f.name || "").trim() || t("friends.unnamed");
    const sub = document.createElement("span");
    sub.className = "entry-sub";
    sub.textContent = f.pubkey.slice(0, 12) + "…";
    info.append(title, sub);

    const invite = document.createElement("button");
    invite.type = "button";
    invite.className = "entry-action";
    invite.textContent = t("friends.invite");
    invite.addEventListener("click", () => friendHandlers.invite(f.pubkey));

    const del = document.createElement("button");
    del.type = "button";
    del.className = "entry-action";
    del.textContent = "✕";
    del.setAttribute("aria-label", t("friends.remove"));
    del.addEventListener("click", () => friendHandlers.remove(f.pubkey));

    li.append(info, invite, del);
    list.appendChild(li);
  }
}

export function renderAll() {
  applyStaticTranslations();
  renderStatusBar();
  renderMoveHistory();
  renderModeUI();
  renderDrawBanner();
  renderGamesList();
  renderFriendsList();
}

export function initReactiveUI() {
  subscribe(renderAll);
  onLanguageChange(renderAll);
  renderAll();
}

export { el, playerName, t };
