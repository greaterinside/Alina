// Shared helpers for the verification tests.
// Pulls the inlined engine and the embedded price data out of the demo HTML,
// so every test runs against exactly what a visitor's browser would run.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const HTML_PATH = process.env.TW_HTML || path.join(ROOT, "tradewize-gold-engine-v0.html");
const ENGINE_PATH = path.join(ROOT, "engine.js");
const CSV_PATH = path.join(ROOT, "gold_daily_gcf.csv");

const readHtml = () => fs.readFileSync(HTML_PATH, "utf8");

// The engine block. The notes say it sits between <script>/*ENGINE*/ markers.
// If that marker is missing, fall back to the <script> that opens with the
// engine's header comment. Returns {code, how} so the test can report which.
function extractEngine(html = readHtml()) {
  const m = html.match(/<script>\/\*ENGINE\*\/\n?([\s\S]*?)<\/script>/);
  if (m) return { code: m[1], how: "marker" };
  const f = html.match(/<script>(\/\* Tradewize gold engine v0[\s\S]*?)<\/script>/);
  if (f) return { code: f[1], how: "fallback (no /*ENGINE*/ marker found)" };
  throw new Error("engine block not found in HTML");
}

function extractBars(html = readHtml()) {
  const m = html.match(/<script>const BUNDLED=(\[[\s\S]*?\]);?\s*<\/script>/);
  if (!m) throw new Error("BUNDLED data not found in HTML");
  return JSON.parse(m[1]);
}

// Load an engine from source text in a sandbox (same as the browser: sets root.TWEngine).
function loadEngine(code) {
  const sb = { console };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(code, sb);
  return sb.TWEngine;
}

const htmlEngine = () => loadEngine(extractEngine().code);
const fileEngine = () => require(ENGINE_PATH);

function readCsv(p = CSV_PATH) {
  const lines = fs.readFileSync(p, "utf8").trim().split(/\r?\n/);
  const hdr = lines.shift().split(",");
  return lines.map(l => { const v = l.split(","); const r = {};
    hdr.forEach((k, i) => r[k === "date" ? "d" : k] = k === "date" ? v[i] : +v[i]); return r; });
}

module.exports = { ROOT, HTML_PATH, ENGINE_PATH, CSV_PATH, readHtml, extractEngine, extractBars,
  loadEngine, htmlEngine, fileEngine, readCsv };
