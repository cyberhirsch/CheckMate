// Regenerates all app icons (web manifest + Android) from Graphics/Logo2.png.
//
// The source logo is inverted (RGB only — the alpha channel is left alone, so
// the transparent area outside the circle stays transparent).
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

const SRC = "G:/Code/checkmate/Graphics/Logo2.png";
const BLACK = { r: 0, g: 0, b: 0, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };
const ROOT = path.resolve(__dirname, "..");

// Inverted logo, alpha preserved.
function logo() {
  return sharp(SRC).negate({ alpha: false });
}

async function scaled(size, logoScale) {
  const logoSize = Math.round(size * logoScale);
  return logo().resize(logoSize, logoSize).png().toBuffer();
}

// Splash: the logo small and centred on black, portrait-ish square source.
async function splash() {
  const inner = await logo().resize(640, 640).png().toBuffer();
  return sharp({ create: { width: 2732, height: 2732, channels: 4, background: BLACK } })
    .composite([{ input: inner, gravity: "center" }])
    .png()
    .toBuffer();
}

// Logo centred on a canvas, keeping the logo's own transparency.
async function onCanvas(size, logoScale, background) {
  const inner = await scaled(size, logoScale);
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: inner, gravity: "center" }])
    .png()
    .toBuffer();
}

async function main() {
  const assets = path.join(ROOT, "assets");
  const resources = path.join(ROOT, "resources");
  fs.mkdirSync(assets, { recursive: true });
  fs.mkdirSync(resources, { recursive: true });

  // Web manifest icons — transparent, so the logo sits on whatever the
  // launcher/browser uses behind it.
  fs.writeFileSync(path.join(assets, "icon-192.png"), await onCanvas(192, 0.92, CLEAR));
  fs.writeFileSync(path.join(assets, "icon-512.png"), await onCanvas(512, 0.92, CLEAR));
  // Maskable — the safe zone is the inner ~80%, so the logo is inset further.
  // These need an opaque ground because the launcher crops them to its mask.
  fs.writeFileSync(path.join(assets, "icon-maskable-192.png"), await onCanvas(192, 0.68, BLACK));
  fs.writeFileSync(path.join(assets, "icon-maskable-512.png"), await onCanvas(512, 0.68, BLACK));

  // SVG wrapper embedding the 512 PNG, for the "any" size manifest entry.
  const png512 = await onCanvas(512, 0.92, CLEAR);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<image width="512" height="512" href="data:image/png;base64,${png512.toString("base64")}"/>
</svg>
`;
  fs.writeFileSync(path.join(assets, "icon.svg"), svg);

  // Android sources for capacitor-assets, which requires these exact
  // filenames. Note it defaults to reading a folder called `assets/` — which
  // here is the *web* icon folder — so it must be run with
  // `--assetPath resources`, see the npm `icons` script.
  //
  // icon-only: legacy square launcher icon, needs an opaque ground.
  // icon-foreground/background: the two adaptive-icon layers. The foreground
  // keeps its transparency and is inset to survive the system's mask.
  fs.writeFileSync(path.join(resources, "icon-only.png"), await onCanvas(1024, 0.9, BLACK));
  fs.writeFileSync(path.join(resources, "icon-foreground.png"), await onCanvas(1024, 0.62, CLEAR));
  fs.writeFileSync(
    path.join(resources, "icon-background.png"),
    await sharp({ create: { width: 1024, height: 1024, channels: 4, background: BLACK } }).png().toBuffer()
  );
  // Splash screens sit on black too.
  fs.writeFileSync(path.join(resources, "splash.png"), await splash());
  fs.writeFileSync(path.join(resources, "splash-dark.png"), await splash());

  console.log("Icons regenerated from", path.basename(SRC), "(inverted, alpha preserved)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
