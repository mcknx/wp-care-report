// node shots.mjs -> img/{email,archive}-{1280,375}.jpg: the newest care email in Mailpit and the /p6 archive page.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || "playwright");
const out = new URL("img/", import.meta.url).pathname;
const { messages } = await (await fetch("http://localhost:8025/api/v1/search?query=to:owner@bayviewdental.example")).json();
if (!messages?.length) throw new Error("no care email in Mailpit — run check.sh first");
const browser = await chromium.launch();
for (const [w, h] of [[1280, 720], [375, 812]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: w < 600 ? 2 : 1 });
  for (const [name, url] of [["email", `http://localhost:8025/view/${messages[0].ID}`], ["archive", "http://localhost:8788/p6"]]) {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}${name}-${w}.jpg`, type: "jpeg", quality: 80 });
  }
  await page.close();
}
await browser.close();
console.log("shots ok");
