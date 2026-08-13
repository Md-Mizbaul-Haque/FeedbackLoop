import { chromium } from "playwright-core";
import { existsSync } from "node:fs";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const TARGET_PATH = process.env.TARGET_PATH ?? "/pricing";
const OUT_PATH = process.env.OUT_PATH ?? "public/pricing.png";

const BROWSER_PATHS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

const executablePath = BROWSER_PATHS.find(existsSync);

if (!executablePath) {
  console.error("No Chromium/Edge executable found. Install one or set BROWSER_PATH.");
  process.exit(1);
}

const browser = await chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${BASE_URL}${TARGET_PATH}`, { waitUntil: "networkidle" });
  await page.waitForSelector("h1", { timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);

  await page.evaluate(() => {
    document
      .querySelectorAll('[data-slot="sidebar"], header')
      .forEach((el) => el.remove());
    // Dev-only artifacts: Next.js dev tools indicator + route announcer portals.
    document
      .querySelectorAll("nextjs-portal, next-route-announcer")
      .forEach((el) => el.remove());
  });

  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT_PATH, fullPage: true });

  const { width, height } = await page.locator("body").boundingBox();
  console.log(`Saved ${OUT_PATH} (${Math.round(width)}x${Math.round(height)})`);
} finally {
  await browser.close();
}
