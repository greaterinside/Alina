// Test 4: reproduce the published backtest numbers exactly as the page computes them.
const { htmlEngine, extractBars } = require("./lib");
const E = htmlEngine();
const bars = extractBars();
const START = "2025-12-01", END = "2026-09-18", FILL = 3;

const EXPECTED = {
  5: { trades: 13, win: 4, wl: 6, profitPct: 62, pts: 540 },
  10: { trades: 10, win: 5, wl: 6, profitPct: 70, pts: 728 },
};

// Same "daily bias right 5 sessions later" figure as renderBT() in the HTML.
function dirRate() {
  const dirs = [];
  for (let i = 0; i < bars.length - 5; i++) {
    if (bars[i].d < START || bars[i].d > END) continue;
    const s = E.analyze(bars, i); if (s.call === "STAND ASIDE") continue;
    const chg = bars[i + 5].c - bars[i].c; dirs.push((s.d === 1 && chg > 0) || (s.d === -1 && chg < 0));
  }
  return { n: dirs.length, right: dirs.filter(Boolean).length };
}

const f1 = v => v == null ? "" : v.toFixed(1);
let fails = 0;
for (const HOLD of [5, 10]) {
  const tr = E.backtest(bars, START, END, FILL, HOLD), sm = E.summary(tr);
  console.log(`\n=== HOLD=${HOLD}, FILL=${FILL}, ${START} to ${END} ===`);
  console.log("called      call  conf  entry    stop     filled      fill     target   exit        exit px  status    points");
  tr.forEach(x => console.log([x.date, x.call.padEnd(5), String(x.conf).padStart(4), f1(x.entry).padStart(8), f1(x.stop).padStart(8),
    (x.fillDate || "").padEnd(10), f1(x.fill).padStart(8), f1(x.tgt).padStart(8), (x.exitDate || "").padEnd(10), f1(x.exit).padStart(8),
    x.status.padEnd(9), x.pnl == null ? "" : (x.pnl >= 0 ? "+" : "") + f1(x.pnl)].join("  ")));
  const other = tr.filter(x => !["WIN", "LOSS", "EXPIRED+", "EXPIRED-"].includes(x.status));
  const got = { trades: sm.closed, win: sm.win, wl: sm.win + sm.loss, profitPct: Math.round(sm.profitRate * 100), pts: Math.round(sm.pts) };
  console.log(`Rows in table: ${tr.length} (closed ${sm.closed}, not closed ${other.length}: ${other.map(x => x.status).join(", ") || "none"})`);
  console.log(`Wins ${sm.win}, losses ${sm.loss}, expired ${sm.expired} (${tr.filter(x => x.status === "EXPIRED+").length}+ / ${tr.filter(x => x.status === "EXPIRED-").length}-)`);
  console.log(`Target before stop: ${sm.win} of ${sm.win + sm.loss} = ${(sm.hitRate * 100).toFixed(1)}%`);
  console.log(`Profitable at exit: ${tr.filter(x => sm && ["WIN","LOSS","EXPIRED+","EXPIRED-"].includes(x.status) && x.pnl > 0).length} of ${sm.closed} = ${(sm.profitRate * 100).toFixed(1)}%`);
  console.log(`Net points: ${sm.pts.toFixed(1)}`);
  const exp = EXPECTED[HOLD];
  const mism = Object.keys(exp).filter(k => exp[k] !== got[k]);
  if (mism.length) { fails++; console.log(`FAIL vs DEVELOPER-NOTES: ${mism.map(k => `${k} expected ${exp[k]} got ${got[k]}`).join("; ")}`); }
  else console.log("PASS: matches DEVELOPER-NOTES");
  // confidence vs outcome, for the "confidence is uncalibrated" claim
  const byConf = {};
  tr.filter(x => x.status === "WIN" || x.status === "LOSS").forEach(x => { byConf[x.conf] = byConf[x.conf] || { w: 0, l: 0 }; byConf[x.conf][x.status === "WIN" ? "w" : "l"]++; });
  console.log(`Wins/losses by confidence: ${JSON.stringify(byConf)}`);
}
const dr = dirRate();
console.log(`\nDaily bias right 5 sessions later: ${dr.right} of ${dr.n} = ${(dr.right / dr.n * 100).toFixed(1)}% (notes say 53%)`);
process.exitCode = fails ? 1 : 0;
