// Test 3 (most important): does the engine ever use data from after day t?
// A. analyze(bars.slice(0,t+1), t) must equal analyze(bars, t) for every t.
// B. Stronger: replace every bar after t with random prices; output must not change.
const { htmlEngine, extractBars } = require("./lib");
const E = htmlEngine();
const bars = extractBars();

// Everything the UI shows or the backtest uses. `hist` is compared up to t only
// (later values exist in the full-array run but are never read for day t).
const FIELDS = ["call", "d", "entry", "far", "stop", "conf", "A", "B", "aI", "bI", "weekly", "div", "why", "inZone", "blocked"];
function snap(s, t) {
  const o = {};
  FIELDS.forEach(k => o[k] = s[k]);
  o.trace = JSON.stringify(s.trace);
  o.sh = JSON.stringify(s.st && s.st.sh); o.sl = JSON.stringify(s.st && s.st.sl);
  o.bias = s.st && s.st.bias; o.bos = s.st && s.st.bos;
  o.hist = JSON.stringify(s.hist.slice(0, t + 1));
  return o;
}
function compare(label, mk) {
  const bad = [];
  for (let t = 0; t < bars.length; t++) {
    let a, b;
    try { a = snap(E.analyze(bars, t), t); } catch (e) { a = { error: String(e) }; }
    try { b = snap(E.analyze(mk(t), t), t); } catch (e) { b = { error: String(e) }; }
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    const diff = [...keys].filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    if (diff.length) bad.push({ t, d: bars[t].d, diff, a, b });
  }
  console.log(`${label}: ${bars.length} days checked, ${bad.length} mismatch(es)`);
  bad.slice(0, 30).forEach(m => console.log(`  ${m.d} (t=${m.t}) differs in: ${m.diff.join(", ")}` +
    m.diff.filter(k => k !== "trace" && k !== "hist").map(k => `\n    ${k}: full=${JSON.stringify(m.a[k])} sliced=${JSON.stringify(m.b[k])}`).join("")));
  return bad.length;
}

// Early days throw? Record which t's error so we know the engine handles a short history.
const errs = [];
for (let t = 0; t < bars.length; t++) { try { E.analyze(bars.slice(0, t + 1), t); } catch (e) { errs.push(`${bars[t].d}: ${e.message}`); } }
console.log(`Days where analyze() throws on a short history: ${errs.length}`);
errs.slice(0, 5).forEach(e => console.log("  " + e));

let rnd = 12345; const rand = () => (rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648;
const n1 = compare("A. slice test (bars up to t only)", t => bars.slice(0, t + 1));
const n2 = compare("B. scramble test (future bars replaced with random prices)", t => bars.map((b, i) => {
  if (i <= t) return b;
  const m = 3000 + rand() * 3000, r = rand() * 200;
  return { d: b.d, o: m, h: m + r, l: m - r, c: m - r + rand() * 2 * r };
}));

// Summary of calls, for the report
const calls = {}; bars.forEach((_, t) => { const c = E.analyze(bars, t).call; calls[c] = (calls[c] || 0) + 1; });
console.log(`Calls over all ${bars.length} days: ${JSON.stringify(calls)}`);
console.log(n1 + n2 + errs.length ? "FAIL" : "PASS: no look-ahead found");
process.exitCode = n1 + n2 + errs.length ? 1 : 0;
