// Captures Play Store phone screenshots by driving the local site in headless
// Chrome. Renders at 540x675 CSS px (below the 768px desktop breakpoint, so the
// phone layout is used) with deviceScaleFactor 2 — giving native 1080x1350.
// That 4:5 ratio is well inside Play's 1:2..2:1 limits and, unlike a full 9:16
// frame, doesn't leave the board floating in a third of a screen of black.
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = "http://localhost:8090";
const OUT = path.resolve(__dirname, "..", "store-screenshots");

const WIDTH = 540, HEIGHT = 675, SCALE = 2;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Menu buttons, in DOM order.
const MENU = { offline: 0, online: 1, contin: 2, friends: 3 };

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--force-device-scale-factor=" + SCALE, "--hide-scrollbars"],
    defaultViewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true },
  });
  const page = await browser.newPage();

  // Seed a profile so the welcome modal doesn't cover every shot.
  await page.goto(URL, { waitUntil: "networkidle2" });
  await page.evaluate(() => {
    localStorage.setItem("checkmate:profile:v2", JSON.stringify({ name: "Alex" }));
  });

  let n = 0;
  const shot = async (name) => {
    n += 1;
    const file = path.join(OUT, `${String(n).padStart(2, "0")}-${name}.png`);
    await page.screenshot({ path: file });
    console.log("  ->", path.basename(file));
  };

  const home = async () => {
    await page.goto(URL, { waitUntil: "networkidle2" });
    await sleep(500);
  };

  const clickMenu = async (which) => {
    await page.evaluate((i) => {
      [...document.querySelector("#screen-menu").querySelectorAll("button")][i].click();
    }, MENU[which]);
    await sleep(350);
  };

  const pickGame = async (i) => {
    await page.evaluate((idx) => {
      [...document.querySelector("#screen-select").querySelectorAll("button")][idx].click();
    }, i);
    await sleep(700);
  };

  const tapCells = async (ids) => {
    for (const id of ids) {
      await page.evaluate((c) => {
        const el = document.querySelector(`[data-cell="${c}"]`);
        if (el) el.click();
      }, id);
      await sleep(320);
    }
  };

  // 1. Main menu
  console.log("main menu");
  await home();
  await shot("menu");

  // 2. Game selection
  console.log("game select");
  await clickMenu("offline");
  await shot("choose-game");

  // 3. Chess mid-game
  console.log("chess");
  await pickGame(0);
  await tapCells(["e2", "e4", "e7", "e5", "g1", "f3", "b8", "c6", "f1", "c4"]);
  await shot("chess");

  // 4. Connect Four
  console.log("connect four");
  await home(); await clickMenu("offline"); await pickGame(1);
  await tapCells(["3", "3", "4", "4", "2", "5"]);
  await shot("connect-four");

  // 5. Reversi
  console.log("reversi");
  await home(); await clickMenu("offline"); await pickGame(4);
  await tapCells(["d3", "c5", "f6"]);
  await shot("reversi");

  // 6. Hex
  console.log("hex");
  await home(); await clickMenu("offline"); await pickGame(7);
  await tapCells(["f6", "e5", "g7", "d4", "f5"]);
  await shot("hex");

  // 7. Nine Men's Morris
  console.log("morris");
  await home(); await clickMenu("offline"); await pickGame(8);
  await tapCells(["0", "1", "9", "2", "21"]);
  await shot("morris");

  // 8. Royal Game of Ur — the one game carrying a tutorial so far
  console.log("ur");
  await home(); await clickMenu("offline"); await pickGame(12);
  await shot("royal-game-of-ur");

  // 9. Last-move highlight, mid-pulse
  console.log("last move");
  await home(); await clickMenu("offline"); await pickGame(0);
  await tapCells(["e2", "e4", "e7", "e5", "d1", "h5"]);
  await page.evaluate(() => document.getElementById("last-move-btn").click());
  await sleep(250);
  await shot("last-move");

  await browser.close();
  console.log("\nDone ->", OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
