// Test 2: extract the embedded price data to gold_daily_gcf.csv and sanity-check it.
const fs = require("fs");
const { extractBars, CSV_PATH } = require("./lib");

const bars = extractBars();
fs.writeFileSync(CSV_PATH, "date,o,h,l,c\n" + bars.map(b => [b.d, b.o, b.h, b.l, b.c].join(",")).join("\n") + "\n");
console.log(`Wrote ${CSV_PATH}`);

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

console.log(`Rows: ${bars.length} (expected 252)`);
ok(bars.length === 252, `row count ${bars.length} != 252`);
console.log(`First: ${bars[0].d}  Last: ${bars[bars.length - 1].d} (expected 2025-09-18 to 2026-09-18)`);
ok(bars[0].d === "2025-09-18", `first date ${bars[0].d}`);
ok(bars[bars.length - 1].d === "2026-09-18", `last date ${bars[bars.length - 1].d}`);

// fields and values
bars.forEach((b, i) => {
  const keys = Object.keys(b).sort().join();
  ok(keys === "c,d,h,l,o", `row ${i} keys ${keys}`);
  ok(/^\d{4}-\d{2}-\d{2}$/.test(b.d) && !isNaN(new Date(b.d + "T00:00:00Z")), `row ${i} bad date ${b.d}`);
  for (const k of ["o", "h", "l", "c"]) ok(typeof b[k] === "number" && isFinite(b[k]) && b[k] > 0, `${b.d} ${k}=${b[k]} not a positive number`);
  ok(b.h >= b.l, `${b.d} high ${b.h} < low ${b.l}`);
  ok(b.c <= b.h && b.c >= b.l, `${b.d} close ${b.c} outside ${b.l}-${b.h}`);
  ok(b.o <= b.h && b.o >= b.l, `${b.d} open ${b.o} outside ${b.l}-${b.h}`);
  const dow = new Date(b.d + "T00:00:00Z").getUTCDay();
  ok(dow >= 1 && dow <= 5, `${b.d} is a weekend day`);
});

// order and duplicates
const seen = new Set();
bars.forEach((b, i) => {
  ok(!seen.has(b.d), `duplicate date ${b.d}`); seen.add(b.d);
  if (i) ok(bars[i - 1].d < b.d, `not ascending at ${b.d}`);
});
// duplicate OHLC rows on different dates (stale data copied forward)
for (let i = 1; i < bars.length; i++) {
  const a = bars[i - 1], b = bars[i];
  if (a.o === b.o && a.h === b.h && a.l === b.l && a.c === b.c) problems.push(`${b.d} identical OHLC to previous day (stale?)`);
}

// missing weekdays, labelled with US market holidays where they apply
const HOL = {
  "2025-11-27": "Thanksgiving", "2025-12-25": "Christmas", "2026-01-01": "New Year",
  "2026-01-19": "MLK Day", "2026-02-16": "Presidents Day", "2026-04-03": "Good Friday",
  "2026-05-25": "Memorial Day", "2026-06-19": "Juneteenth", "2026-07-03": "Independence Day (observed)",
  "2026-09-07": "Labor Day",
};
const missing = [];
for (let d = new Date(bars[0].d + "T00:00:00Z"); d <= new Date(bars[bars.length - 1].d + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
  const iso = d.toISOString().slice(0, 10), dow = d.getUTCDay();
  if (dow === 0 || dow === 6 || seen.has(iso)) continue;
  missing.push(iso + (HOL[iso] ? ` (${HOL[iso]})` : " (NOT a US holiday)"));
}
console.log(`Weekdays with no bar: ${missing.length}`);
missing.forEach(m => console.log("  " + m));
const unexplained = missing.filter(m => m.includes("NOT"));
const holidaysWithBar = Object.keys(HOL).filter(d => seen.has(d));
if (holidaysWithBar.length) console.log(`US holidays that DO have a bar (normal for Globex, shortened session): ${holidaysWithBar.join(", ")}`);

// big moves (not errors, just worth eyeballing)
const jumps = [];
for (let i = 1; i < bars.length; i++) {
  const r = bars[i].c / bars[i - 1].c - 1;
  if (Math.abs(r) > 0.04) jumps.push(`${bars[i].d} close ${(r * 100).toFixed(1)}%`);
}
console.log(`Daily close moves over 4%: ${jumps.length ? jumps.join("; ") : "none"}`);
const lo = Math.min(...bars.map(b => b.l)), hi = Math.max(...bars.map(b => b.h));
console.log(`Price range: ${lo} to ${hi}`);

console.log(problems.length ? `FAIL: ${problems.length} problem(s)` : "PASS: no bad values, no duplicates, dates ascending");
problems.forEach(p => console.log("  " + p));
if (unexplained.length) console.log(`NOTE: ${unexplained.length} missing weekday(s) not explained by a US holiday`);
process.exitCode = problems.length ? 1 : 0;
