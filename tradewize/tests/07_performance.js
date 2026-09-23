// Test 7: how slow is the engine, and how much of that is macdHist()?
// macdHist() calls ema(c,26) inside a .map(), so it recomputes the whole 26-EMA once per bar: O(n^2).
const { htmlEngine, extractBars, loadEngine, extractEngine } = require("./lib");
const E = htmlEngine();
const bars = extractBars();
const c = bars.map(b => b.c);
const START = "2025-12-01", END = "2026-09-18";

const time = (fn, reps = 1) => { fn(); const t0 = process.hrtime.bigint(); for (let i = 0; i < reps; i++) fn(); return Number(process.hrtime.bigint() - t0) / 1e6 / reps; };

// What the Backtest tab does on each click: backtest() + the 5-session direction loop (another analyze() per day).
function pageBacktest(Eng, hold) {
  const tr = Eng.backtest(bars, START, END, 3, hold); Eng.summary(tr);
  for (let i = 0; i < bars.length - 5; i++) { if (bars[i].d < START || bars[i].d > END) continue; Eng.analyze(bars, i); }
}

function report(label, Eng) {
  const mh = time(() => Eng.macdHist(c), 20);
  const an = time(() => Eng.analyze(bars, bars.length - 1), 20);
  const b5 = time(() => Eng.backtest(bars, START, END, 3, 5), 3);
  const b10 = time(() => Eng.backtest(bars, START, END, 3, 10), 3);
  const pg = time(() => pageBacktest(Eng, 5), 3);
  const load = time(() => { Eng.analyze(bars, bars.length - 1); pageBacktest(Eng, 5); }, 3);
  console.log(`${label}\n  macdHist(252 closes): ${mh.toFixed(2)} ms\n  analyze(one day): ${an.toFixed(2)} ms` +
    `\n  backtest HOLD=5: ${b5.toFixed(0)} ms, HOLD=10: ${b10.toFixed(0)} ms` +
    `\n  Backtest tab click (backtest + direction check): ${pg.toFixed(0)} ms\n  Page load work (read + backtest): ${load.toFixed(0)} ms`);
  return { mh, an, b5, pg };
}

// Count how many times the 26-EMA runs for one macdHist call
const src = extractEngine().code
  .replace("function ema(a,n){", "let __n=0;function ema(a,n){__n++;")
  .replace("const api={", "const api={emaCalls:()=>__n,");
const Ecount = loadEngine(src);
Ecount.macdHist(c);
console.log(`ema() calls inside one macdHist() on ${c.length} closes: ${Ecount.emaCalls()} (a correct version needs 3)`);

const before = report("Current engine (as shipped):", E);

// Projection only: same engine with each EMA computed once. Not applied to engine.js (Phase 3).
const fixedSrc = extractEngine().code.replace(
  "function macdHist(c){const m=ema(c,12).map((v,i)=>v-ema(c,26)[i]);",
  "function macdHist(c){const e12=ema(c,12),e26=ema(c,26),m=e12.map((v,i)=>v-e26[i]);");
if (fixedSrc === extractEngine().code) throw new Error("projection patch did not apply");
const Efix = loadEngine(fixedSrc);
const after = report("Projection with the Phase 3 fix (NOT applied yet):", Efix);
const maxd = Math.max(...E.macdHist(c).map((v, i) => Math.abs(v - Efix.macdHist(c)[i])));
console.log(`Max difference in histogram between the two: ${maxd}`);
console.log(`Speed-up: macdHist ${(before.mh / after.mh).toFixed(0)}x, backtest ${(before.b5 / after.b5).toFixed(1)}x`);
// scaling: how the current version grows with more history (e.g. 5 years pasted in)
const big = []; for (let k = 0; k < 5; k++) bars.forEach(b => big.push(b.c));
console.log(`macdHist on ${big.length} closes (about 5 years): current ${time(() => E.macdHist(big), 2).toFixed(0)} ms, fixed ${time(() => Efix.macdHist(big), 2).toFixed(1)} ms`);
