const CACHE_NAME = "checkmate-shell-v15";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./styles/base.css",
  "./styles/board.css",
  "./styles/games.css",
  "./styles/mobile.css",
  "./styles/desktop.css",
  "./src/main.js",
  "./src/state.js",
  "./src/ui.js",
  "./src/screens.js",
  "./src/i18n.js",
  "./src/board-host.js",
  "./src/game-controller.js",
  "./src/hotseat-controller.js",
  "./src/online-controller.js",
  "./src/link-codec.js",
  "./src/nostr.js",
  "./src/mode-controller.js",
  "./src/qr.js",
  "./src/storage.js",
  "./src/vendor/chess.js",
  "./src/games/registry.js",
  "./src/games/grid-view.js",
  "./src/games/chess.js",
  "./src/games/connect4.js",
  "./src/games/tictactoe.js",
  "./src/games/ultimate.js",
  "./src/games/reversi.js",
  "./src/games/checkers.js",
  "./src/games/gomoku.js",
  "./src/games/hex.js",
  "./src/games/morris.js",
  "./src/games/dots.js",
  "./src/games/mancala.js",
  "./src/games/breakthrough.js",
  "./src/games/ur.js",
  "./assets/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // CDN (qr, nostr-tools) hits network directly

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => cached);
    })
  );
});
