// Screen router. The app is a small stack of full screens rather than one
// page that hides parts of itself: menu → select → game, with continue and
// friends hanging off the menu. `back` always means "one step towards menu".

const SCREENS = ["menu", "select", "continue", "friends", "game"];

let current = "menu";
const listeners = new Set();

export function getScreen() {
  return current;
}

export function onScreenChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function showScreen(name) {
  if (!SCREENS.includes(name)) return;
  current = name;
  for (const id of SCREENS) {
    const el = document.getElementById("screen-" + id);
    if (el) el.classList.toggle("active", id === name);
  }
  document.body.dataset.screen = name;
  // Back is available everywhere except the menu itself.
  const back = document.getElementById("back-btn");
  if (back) back.classList.toggle("hidden", name === "menu");
  window.scrollTo(0, 0);
  for (const fn of listeners) fn(name);
}

// Where "back" goes from each screen.
export function parentOf(name) {
  return name === "menu" ? "menu" : "menu";
}
