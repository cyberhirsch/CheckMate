// Local persistence. Three separate stores so a corrupt game can't take the
// profile with it, and so the games map can grow without rewriting settings.
//
//   checkmate:profile:v2  { name, gameType, rotateAfterMove, showHandoffScreen }
//   checkmate:games:v2    { [gameId]: GameRecord }
//   checkmate:friends:v2  [ { pubkey, name, lastPlayed } ]
//
// A GameRecord is everything needed to rebuild a game without a network:
//   { gameId, gameType, mode, localColor, moves, pendingAction,
//     opponentPubkey, opponentName, status, phase, updatedAt }

const PROFILE_KEY = "checkmate:profile:v2";
const GAMES_KEY = "checkmate:games:v2";
const FRIENDS_KEY = "checkmate:friends:v2";
const LEGACY_KEY = "checkmate:state:v1";

const MAX_GAMES = 60; // oldest finished games are pruned past this

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // storage full or unavailable; the app keeps working in memory
  }
}

/* ---------- Profile ---------- */

export function getProfile() {
  const p = read(PROFILE_KEY, {});
  return {
    name: typeof p.name === "string" ? p.name : "",
    gameType: p.gameType || "chess",
    rotateAfterMove: typeof p.rotateAfterMove === "boolean" ? p.rotateAfterMove : null,
    showHandoffScreen: typeof p.showHandoffScreen === "boolean" ? p.showHandoffScreen : false,
    notificationsEnabled: typeof p.notificationsEnabled === "boolean" ? p.notificationsEnabled : false,
  };
}

export function saveProfile(patch) {
  const merged = { ...getProfile(), ...patch };
  write(PROFILE_KEY, merged);
  return merged;
}

export function hasProfileName() {
  return getProfile().name.trim().length > 0;
}

/* ---------- Games ---------- */

export function allGames() {
  const map = read(GAMES_KEY, {});
  return map && typeof map === "object" ? map : {};
}

export function getGame(gameId) {
  if (!gameId) return null;
  return allGames()[gameId] || null;
}

export function saveGame(record) {
  if (!record || !record.gameId) return;
  const map = allGames();
  map[record.gameId] = { ...(map[record.gameId] || {}), ...record, updatedAt: Date.now() };
  write(GAMES_KEY, prune(map));
}

export function deleteGame(gameId) {
  const map = allGames();
  delete map[gameId];
  write(GAMES_KEY, map);
}

// Newest first; finished games sort after live ones so the list stays useful.
export function listGames() {
  const games = Object.values(allGames());
  return games.sort((a, b) => {
    const aDone = a.phase === "finished" ? 1 : 0;
    const bDone = b.phase === "finished" ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
}

function prune(map) {
  const entries = Object.entries(map);
  if (entries.length <= MAX_GAMES) return map;
  // Drop the oldest finished games first, then the oldest of anything.
  const sorted = entries.sort(([, a], [, b]) => {
    const aDone = a.phase === "finished" ? 0 : 1;
    const bDone = b.phase === "finished" ? 0 : 1;
    if (aDone !== bDone) return aDone - bDone;
    return (a.updatedAt || 0) - (b.updatedAt || 0);
  });
  const keep = sorted.slice(sorted.length - MAX_GAMES);
  return Object.fromEntries(keep);
}

// Relay tags for every game that could still receive a move.
export function activeGameIds() {
  return listGames()
    .filter((g) => g.mode === "online" && g.phase !== "finished")
    .map((g) => g.gameId);
}

/* ---------- Friends ---------- */

export function listFriends() {
  const list = read(FRIENDS_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function addFriend(pubkey, name) {
  if (!pubkey || !/^[0-9a-f]{64}$/.test(pubkey)) return listFriends();
  const list = listFriends();
  const existing = list.find((f) => f.pubkey === pubkey);
  if (existing) {
    // Keep the latest name they announced, but never blank an existing one.
    if (name && name.trim()) existing.name = name.trim();
    existing.lastPlayed = Date.now();
  } else {
    list.push({ pubkey, name: (name || "").trim(), lastPlayed: Date.now() });
  }
  write(FRIENDS_KEY, list);
  return list;
}

export function removeFriend(pubkey) {
  const list = listFriends().filter((f) => f.pubkey !== pubkey);
  write(FRIENDS_KEY, list);
  return list;
}

export function friendName(pubkey) {
  const f = listFriends().find((x) => x.pubkey === pubkey);
  return f ? f.name : "";
}

/* ---------- Migration ---------- */

// Carries a single pre-v2 game (and its settings) into the new stores once.
export function migrateLegacy() {
  const legacy = read(LEGACY_KEY, null);
  if (!legacy) return false;
  try {
    const profile = {};
    if (legacy.gameType) profile.gameType = legacy.gameType;
    if (typeof legacy.rotateAfterMove === "boolean") profile.rotateAfterMove = legacy.rotateAfterMove;
    if (typeof legacy.showHandoffScreen === "boolean") profile.showHandoffScreen = legacy.showHandoffScreen;
    if (Object.keys(profile).length) saveProfile(profile);

    if (legacy.gameId && Array.isArray(legacy.linkMoves)) {
      saveGame({
        gameId: legacy.gameId,
        gameType: legacy.gameType || "chess",
        mode: legacy.mode || "hotseat",
        localColor: legacy.localColor || null,
        moves: legacy.linkMoves,
        pendingAction: legacy.pendingAction || null,
        opponentPubkey: legacy.opponentPubkey || null,
        opponentName: "",
        status: legacy.status || { result: "active", winner: null },
        phase: legacy.phase || "active",
      });
    }
    localStorage.removeItem(LEGACY_KEY);
    return true;
  } catch {
    return false;
  }
}

/* ---------- Wipe ---------- */

export function clearEverything() {
  for (const k of [PROFILE_KEY, GAMES_KEY, FRIENDS_KEY, LEGACY_KEY]) {
    try {
      localStorage.removeItem(k);
    } catch { /* ignore */ }
  }
}
