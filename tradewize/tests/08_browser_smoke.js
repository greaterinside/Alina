// Test 8: open the page in headless Chromium at desktop and phone width.
// Reports JS errors, external requests, horizontal overflow, the headline numbers,
// and any "75%" text a visitor can see. Run: NODE_PATH=$(npm root -g) node tests/08_browser_smoke.js [file.html]
const path = require("path");
const { chromium } = require("playwright");
const { HTML_PATH } = require("./lib");
const file = path.resolve(process.argv[2] || HTML_PATH);

(async () => {
  const browser = await chromium.launch();
  let fails = 0;
  for (const vp of [{ name: "desktop", width: 1280, height: 900 }, { name: "phone", width: 375, height: 812 }]) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const errors = [], external = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    page.on("request", r => { if (!r.url().startsWith("file:") && !r.url().startsWith("data:")) external.push(r.url()); });
    await page.goto("file://" + file, { waitUntil: "load", timeout: 20000 }).catch(e => errors.push("load: " + e.message));
    await page.waitForTimeout(300);
    const info = await page.evaluate(() => {
      const res = {};
      for (const tab of ["read", "bt", "data"]) {
        document.querySelector(`nav button[data-page="${tab}"]`).click();
        res["overflow_" + tab] = document.documentElement.scrollWidth - window.innerWidth;
      }
      document.querySelector('nav button[data-page="read"]').click();
      res.call = document.querySelector(".callword")?.textContent.trim();
      res.traceSteps = document.querySelectorAll("#ledger .step").length;
      res.stats = [...document.querySelectorAll("#btStats .stat")].map(s => s.innerText.replace(/\s+/g, " ").trim());
      res.rows = document.querySelectorAll("#btTable tr.click").length;
      res.text75 = (document.body.textContent.replace(/[ \t]+/g, " ").match(/[^.\n]*75\s?%[^.\n]*/g) || []).map(s => s.trim());
      res.title = document.title;
      res.favicon = !!document.querySelector('link[rel~="icon"]');
      return res;
    });
    console.log(`\n=== ${vp.name} ${vp.width}px ===`);
    console.log(`title: "${info.title}", favicon: ${info.favicon}`);
    console.log(`call shown: ${info.call}, trace steps: ${info.traceSteps}, backtest rows: ${info.rows}`);
    console.log(`stats: ${JSON.stringify(info.stats)}`);
    console.log(`horizontal overflow (px) read/backtest/data: ${info.overflow_read}/${info.overflow_bt}/${info.overflow_data}`);
    console.log(`JS errors: ${errors.length ? errors.join(" | ") : "none"}`);
    console.log(`external requests: ${external.length ? [...new Set(external.map(u => new URL(u).host))].join(", ") : "none"}`);
    console.log(`visible text mentioning 75%: ${info.text75.length ? "\n  - " + info.text75.join("\n  - ") : "none"}`);
    if (errors.length || external.length || info.text75.length || Math.max(info.overflow_read, info.overflow_bt, info.overflow_data) > 0) fails++;
    await page.close();
  }
  await browser.close();
  console.log(fails ? "\nFAIL (see above)" : "\nPASS");
  process.exitCode = fails ? 1 : 0;
})();
