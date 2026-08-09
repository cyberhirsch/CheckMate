// Nostr transport: serverless async move delivery through public relays.
//
// Two kinds of message, both NIP-78 app data (kind 30078), both signed:
//
//   d = checkmate:<gameId>            a player's full state for one game
//   d = checkmate:inbox:<pubkey>      an invite addressed to one player
//
// Kind 30078 is addressable, so relays keep only the latest event per author
// per d-tag: a 60-move game stays one small record, and each friend gets their
// own slot in your inbox rather than piling up.
//
// One subscription covers every active game plus the inbox, and is rebuilt
// whenever that set changes.

const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
  "wss://relay.snort.social",
];

const TAG_PREFIX = "checkmate:";
const INBOX_PREFIX = "checkmate:inbox:";
const KIND_APP_DATA = 30078;
const SECRET_KEY_STORAGE = "checkmate:nostr-sk";

let tools = null;
async function loadTools() {
  if (!tools) {
    tools = await import("./vendor/nostr-tools.js");
  }
  return tools;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

export function gameTag(gameId) {
  return TAG_PREFIX + gameId;
}
export function inboxTag(pubkey) {
  return INBOX_PREFIX + pubkey;
}

export class NostrTransport {
  constructor() {
    this.pool = null;
    this.sub = null;
    this.pubkey = null;
    this._sk = null;
    this.available = false;
    this._tags = [];
    this._onGameState = () => {};
    this._onInvite = () => {};
    this._onFriendRequest = () => {};
  }

  async init() {
    if (this.available) return true;
    try {
      const t = await loadTools();
      let skHex = null;
      try {
        skHex = localStorage.getItem(SECRET_KEY_STORAGE);
      } catch { /* storage unavailable */ }
      if (skHex && /^[0-9a-f]{64}$/.test(skHex)) {
        this._sk = hexToBytes(skHex);
      } else {
        this._sk = t.generateSecretKey();
        try {
          localStorage.setItem(SECRET_KEY_STORAGE, bytesToHex(this._sk));
        } catch { /* key lives for this session only */ }
      }
      this.pubkey = t.getPublicKey(this._sk);
      this.pool = new t.SimplePool();
      this.available = true;
      return true;
    } catch {
      this.available = false;
      return false;
    }
  }

  async _publish(dTag, payload) {
    if (!this.available) return false;
    const t = await loadTools();
    const event = t.finalizeEvent(
      {
        kind: KIND_APP_DATA,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["d", dTag]],
        content: JSON.stringify(payload),
      },
      this._sk
    );
    const results = await Promise.allSettled(this.pool.publish(RELAYS, event));
    return results.some((r) => r.status === "fulfilled");
  }

  // Publishes this player's current state for one game.
  publishState(gameId, payload) {
    return this._publish(gameTag(gameId), payload);
  }

  // Sends an invite straight to a friend's inbox — no link needed.
  publishInvite(recipientPubkey, payload) {
    return this._publish(inboxTag(recipientPubkey), { type: "invite", ...payload });
  }

  // Tells someone whose pubkey we just learned (via their link/QR) that we
  // added them, carrying our own name. Their client adds us back on receipt,
  // so friending only ever requires one side to act.
  publishFriendRequest(recipientPubkey, payload) {
    return this._publish(inboxTag(recipientPubkey), { type: "friend-request", ...payload });
  }

  setHandlers({ onGameState, onInvite, onFriendRequest }) {
    if (onGameState) this._onGameState = onGameState;
    if (onInvite) this._onInvite = onInvite;
    if (onFriendRequest) this._onFriendRequest = onFriendRequest;
  }

  // Rebuilds the single subscription to cover the given game IDs plus our inbox.
  async syncSubscriptions(gameIds) {
    if (!this.available) return false;
    const t = await loadTools();
    const tags = [inboxTag(this.pubkey), ...gameIds.map(gameTag)];
    const unchanged =
      tags.length === this._tags.length && tags.every((tag, i) => tag === this._tags[i]);
    if (unchanged && this.sub) return true;
    this._tags = tags;
    this.closeSubscription();

    this.sub = this.pool.subscribeMany(
      RELAYS,
      [{ kinds: [KIND_APP_DATA], "#d": tags }],
      {
        onevent: (event) => {
          if (event.pubkey === this.pubkey) return; // our own echo
          if (!t.verifyEvent(event)) return;
          const dTag = (event.tags.find((x) => x[0] === "d") || [])[1];
          if (!dTag) return;
          let payload;
          try {
            payload = JSON.parse(event.content);
          } catch {
            return;
          }
          if (!payload || typeof payload !== "object") return;

          if (dTag.startsWith(INBOX_PREFIX)) {
            if (payload.type === "invite" && typeof payload.gameId === "string") {
              this._onInvite(event.pubkey, payload);
            } else if (payload.type === "friend-request") {
              this._onFriendRequest(event.pubkey, payload);
            }
            return;
          }
          if (!Array.isArray(payload.moves)) return;
          this._onGameState(dTag.slice(TAG_PREFIX.length), event.pubkey, payload);
        },
      }
    );
    return true;
  }

  closeSubscription() {
    if (this.sub) {
      try {
        this.sub.close();
      } catch { /* already closed */ }
      this.sub = null;
    }
  }
}
