// Writes dl/checkmate-qr.svg pointing at the sideload APK on this machine's
// LAN address, so a phone on the same Wi-Fi can scan and install it.
//
//   node scripts/genqr.mjs [url]
//
// With no argument it guesses http://<lan-ip>:8090/dl/checkmate.apk.
import QRCode from "../src/vendor/qrcode.js";
import fs from "fs";
import os from "os";

// Machines here tend to have a VPN/virtual adapter alongside the real Wi-Fi,
// and the phone can only reach the Wi-Fi one — so home-LAN ranges are ranked
// ahead of the rest rather than just taking the first non-internal address.
function lanAddress() {
  const rank = (ip) =>
    ip.startsWith("192.168.") ? 0 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 1 : ip.startsWith("10.") ? 2 : 3;
  const candidates = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === "IPv4" && !a.internal) candidates.push(a.address);
    }
  }
  candidates.sort((a, b) => rank(a) - rank(b));
  return candidates[0] || "localhost";
}

const url = process.argv[2] || `http://${lanAddress()}:8090/dl/checkmate.apk`;
const svg = await QRCode.toString(url, { type: "svg", width: 400, margin: 2 });
fs.mkdirSync("dl", { recursive: true });
fs.writeFileSync("dl/checkmate-qr.svg", svg);
console.log("done", url);
