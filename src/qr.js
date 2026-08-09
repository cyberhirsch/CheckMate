let qrEncodeMod = null;

async function loadEncoder() {
  if (!qrEncodeMod) {
    qrEncodeMod = await import("./vendor/qrcode.js");
  }
  return qrEncodeMod;
}

export async function renderQR(canvas, text) {
  try {
    const mod = await loadEncoder();
    await mod.toCanvas(canvas, text, { margin: 1, width: 220, errorCorrectionLevel: "L" });
    // toCanvas writes inline width/height styles, which beat the stylesheet and
    // stop the canvas scaling down in square — a stretched QR is hard to scan.
    // The width/height *attributes* still carry the bitmap size.
    canvas.style.removeProperty("width");
    canvas.style.removeProperty("height");
    canvas.classList.remove("hidden");
    return true;
  } catch {
    canvas.classList.add("hidden");
    return false;
  }
}
