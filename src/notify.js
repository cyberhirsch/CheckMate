// Notifications, kept inside what a static page can actually do: an in-app
// toast when the tab is visible, and a real OS notification banner when the
// tab is open but backgrounded (another app in front, or another tab).
// Nothing here can wake a fully closed browser — that would need a server
// watching relays around the clock, which this project deliberately has none
// of. See PRD "Non-goals".

import { getProfile, saveProfile } from "./storage.js";

const OPEN_GAME_EVENT = "checkmate:open-game";

export function notificationsEnabled() {
  return !!getProfile().notificationsEnabled;
}

export function notificationsSupported() {
  return typeof Notification !== "undefined";
}

// Must run from a user gesture (a settings toggle tap) — browsers ignore or
// auto-deny permission requests fired without one.
export async function requestPermission() {
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export function setEnabled(flag) {
  saveProfile({ notificationsEnabled: !!flag });
}

// Fired when a toast or OS notification is tapped, so main.js can route to
// the right screen without this module knowing about screens/games itself.
export function onOpenGame(handler) {
  window.addEventListener(OPEN_GAME_EVENT, (e) => handler(e.detail.gameId));
}

function dispatchOpenGame(gameId) {
  if (!gameId) return;
  window.dispatchEvent(new CustomEvent(OPEN_GAME_EVENT, { detail: { gameId } }));
}

let toastHost = null;
function getToastHost() {
  if (toastHost) return toastHost;
  toastHost = document.createElement("div");
  toastHost.id = "toast-host";
  toastHost.setAttribute("role", "status");
  toastHost.setAttribute("aria-live", "polite");
  document.body.appendChild(toastHost);
  return toastHost;
}

function showToast({ title, body, gameId }) {
  const host = getToastHost();
  const toast = document.createElement("div");
  toast.className = "toast";
  const titleEl = document.createElement("div");
  titleEl.className = "toast-title";
  titleEl.textContent = title;
  const bodyEl = document.createElement("div");
  bodyEl.className = "toast-body";
  bodyEl.textContent = body;
  toast.append(titleEl, bodyEl);
  if (gameId) {
    toast.classList.add("toast-tappable");
    toast.addEventListener("click", () => {
      dispatchOpenGame(gameId);
      toast.remove();
    });
  }
  host.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast-in"));
  const remove = () => {
    toast.classList.remove("toast-in");
    setTimeout(() => toast.remove(), 200);
  };
  setTimeout(remove, 5000);
}

function showOsNotification({ title, body, gameId, tag }) {
  const n = new Notification(title, {
    body,
    tag: tag || gameId || undefined, // same tag replaces a stale prior notification for the same game
    icon: "assets/icon-192.png",
    badge: "assets/icon-192.png",
  });
  n.addEventListener("click", () => {
    window.focus();
    dispatchOpenGame(gameId);
    n.close();
  });
}

// The one entry point callers use. Picks toast vs OS banner based on whether
// the tab is actually in front of the player right now.
export function notify({ title, body, gameId, tag }) {
  if (!notificationsEnabled()) return;
  const backgrounded = document.visibilityState === "hidden" || !document.hasFocus();
  if (backgrounded && notificationsSupported() && Notification.permission === "granted") {
    showOsNotification({ title, body, gameId, tag });
  } else {
    showToast({ title, body, gameId });
  }
}
