const listeners = new Set();

export const state = {
  mode: "hotseat",
  phase: "setup",
  gameType: "chess",
  gameId: "",
  localColor: null,
  fen: null,
  turn: "white",
  moveHistory: [],
  status: { result: "active", winner: null },
  boardOrientation: "white",
  rotateAfterMove: true,
  showHandoffScreen: false,
  connectionState: "not-applicable",
  pendingDrawOffer: false,
  awaitingHandoff: false,
  handoffColor: null,
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setState(patch) {
  Object.assign(state, patch);
  for (const fn of listeners) fn(state);
}

export function isNarrowScreen() {
  return window.matchMedia("(max-width: 767px)").matches;
}
