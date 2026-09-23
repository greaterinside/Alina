// Helper for test 5: dump the JS engine's daily setups and backtest trades as JSON
// (run on gold_daily_gcf.csv, the same file the Python side reads).
const { htmlEngine, readCsv } = require("./lib");
const E = htmlEngine();
const bars = readCsv();
const days = bars.map((b, t) => {
  const s = E.analyze(bars, t);
  return { t, date: b.d, call: s.call, why: s.why, entry: s.entry ?? null, far: s.far ?? null, stop: s.stop ?? null,
    conf: s.conf ?? null, a_i: s.call === "STAND ASIDE" ? null : s.aI, b_i: s.call === "STAND ASIDE" ? null : s.bI,
    weekly: s.weekly ?? null, div: s.div ?? null };
});
const trades = {};
for (const H of [5, 10]) trades[H] = E.backtest(bars, "2025-12-01", "2026-09-18", 3, H)
  .map(x => ({ t: x.t, call: x.call, conf: x.conf, entry: x.entry, stop: x.stop, status: x.status,
    fill: x.fill ?? null, fday: x.fday ?? null, tgt: x.tgt ?? null, exit: x.exit ?? null, xday: x.xday ?? null }));
process.stdout.write(JSON.stringify({ days, trades, fomc: E.FOMC }));
