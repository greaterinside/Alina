// Test 1: is the engine inside the HTML byte-for-byte the same as engine.js?
const fs = require("fs");
const { extractEngine, ENGINE_PATH } = require("./lib");

const { code, how } = extractEngine();
const file = fs.readFileSync(ENGINE_PATH, "utf8");
const norm = s => s.replace(/\r\n/g, "\n").replace(/\s+$/, "");
const a = norm(code).split("\n"), b = norm(file).split("\n");

console.log(`Engine block located by: ${how}`);
console.log(`HTML engine: ${a.length} lines, engine.js: ${b.length} lines`);
const diffs = [];
for (let i = 0; i < Math.max(a.length, b.length); i++)
  if (a[i] !== b[i]) diffs.push({ line: i + 1, html: a[i], file: b[i] });
if (!diffs.length) console.log("PASS: identical (ignoring trailing whitespace)");
else {
  console.log(`FAIL: ${diffs.length} differing line(s)`);
  diffs.slice(0, 20).forEach(d => console.log(`  line ${d.line}\n    html: ${d.html}\n    file: ${d.file}`));
}
const exact = code.replace(/\s+$/, "") === file.replace(/\s+$/, "");
console.log(`Exact match incl. whitespace inside: ${exact}`);
process.exitCode = diffs.length ? 1 : 0;
