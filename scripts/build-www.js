// Stages the static site into www/ for Capacitor to bundle into the native app.
// No build step for the app itself — this just copies the files that make up
// the deployed site (same set the service worker caches), skipping dev/tooling
// directories (android*, node_modules, .git, dl).
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "www");

const FILES = ["index.html", "manifest.webmanifest", "service-worker.js"];
// .well-known carries assetlinks.json, which Android fetches from the site
// root to verify the app may open checkmate.sebhirsch.com links.
const DIRS = ["assets", "styles", "src", ".well-known"];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

for (const f of FILES) fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
for (const d of DIRS) copyDir(path.join(ROOT, d), path.join(OUT, d));

console.log(`Staged site into ${OUT}`);
