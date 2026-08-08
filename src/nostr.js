// Nostr transport: serverless async move delivery through public relays.
// Each player publishes their full game state as a signed, replaceable event
// (NIP-78 kind 30078, addressable by game tag). The opponent's client
// subscribes to the game tag and applies newer states through the same
// validation used for links. Public relays store events, so neither player
// needs to be online at the same time — and no one runs a server.

const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
  "wss://relay.snort.social",
];

const APP_TAG_PREFIX = "checkmate:";
const KIND_APP_DATA = 30078;
const SECRET_KEY_STORAGE = "checkmate:nostr-sk";

let tools = null;
async function loadTools() {
  if (!tools) {
    tools = await import("https://esm.sh/nostr-tools@2.7.2");
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

export class NostrTransport {
  constructor() {
    this.pool = null;
    this.sub = null;
    this.pubkey = null;
    this._sk = null;
    this.available = false;
  }

  async init() {
    try {
      const t = await loadTools();
      let skHex = null;
      try {
        skHex = localStorage.getItem(SECRET_KEY_STORAGE);
      } catch { /* storage unavailable */ }
      if (skHex) {
        this._sk = hexToBytes(skHex);
      } else {
        this._sk = t.generateSecretKey();
        try {
          localStorage.setItem(SECRET_KEY_STORAGE, bytesToHex(this._sk));
        } catch { /* fine, key lives for this session only */ }
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

  // Publishes this player's current state for a game. Resolves true when at
  // least one relay accepted the event.
  async publishState(gameId, payload) {
    if (!this.available) return false;
    const t = await loadTools();
    const event = t.finalizeEvent(
      {
        kind: KIND_APP_DATA,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["d", APP_TAG_PREFIX + gameId]],
        content: JSON.stringify(payload),
      },
      this._sk
    );
    const results = await Promise.allSettled(this.pool.publish(RELAYS, event));
    return results.some((r) => r.status === "fulfilled");
  }

  // Subscribes to all state events for a game. Calls onState(pubkey, payload,
  // createdAt) for each valid event from someone else.
  async subscribe(gameId, onState) {
    if (!this.available) return false;
    const t = await loadTools();
    this.unsubscribe();
    this.sub = this.pool.subscribeMany(
      RELAYS,
      [{ kinds: [KIND_APP_DATA], "#d": [APP_TAG_PREFIX + gameId] }],
      {
        onevent: (event) => {
          if (event.pubkey === this.pubkey) return;
          if (!t.verifyEvent(event)) return;
          let payload;
          try {
            payload = JSON.parse(event.content);
          } catch {
            return;
          }
          if (!payload || !Array.isArray(payload.moves)) return;
          onState(event.pubkey, payload, event.created_at);
        },
      }
    );
    return true;
  }

  unsubscribe() {
    if (this.sub) {
      try {
        this.sub.close();
      } catch { /* already closed */ }
      this.sub = null;
    }
  }
}
