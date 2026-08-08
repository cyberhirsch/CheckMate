const KEY = "checkmate:state:v1";

export function loadStored() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveStored(partial) {
  try {
    const current = loadStored() || {};
    const merged = { ...current, ...partial };
    localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    /* storage unavailable; ignore */
  }
}

export function clearStored() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
