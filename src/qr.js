let qrEncodeMod = null;
let jsQRMod = null;

async function loadEncoder() {
  if (!qrEncodeMod) {
    qrEncodeMod = await import("https://esm.sh/qrcode@1.5.3");
  }
  return qrEncodeMod;
}

async function loadDecoder() {
  if (!jsQRMod) {
    jsQRMod = (await import("https://esm.sh/jsqr@1.4.0")).default;
  }
  return jsQRMod;
}

export async function renderQR(canvas, text) {
  try {
    const mod = await loadEncoder();
    await mod.toCanvas(canvas, text, { margin: 1, width: 220, errorCorrectionLevel: "L" });
    canvas.classList.remove("hidden");
    return true;
  } catch {
    canvas.classList.add("hidden");
    return false;
  }
}

export class QRScanner {
  constructor(videoEl) {
    this.videoEl = videoEl;
    this.stream = null;
    this.rafId = null;
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
  }

  async start(onResult) {
    const jsQR = await loadDecoder();
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    this.videoEl.srcObject = this.stream;
    await this.videoEl.play();
    const tick = () => {
      if (!this.stream) return;
      if (this.videoEl.readyState === this.videoEl.HAVE_ENOUGH_DATA) {
        this.canvas.width = this.videoEl.videoWidth;
        this.canvas.height = this.videoEl.videoHeight;
        this.ctx.drawImage(this.videoEl, 0, 0, this.canvas.width, this.canvas.height);
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code && code.data) {
          onResult(code.data);
          this.stop();
          return;
        }
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.videoEl.srcObject = null;
  }
}
