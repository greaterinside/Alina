// Test 6: does the code do what DEVELOPER-NOTES.md says each rule does?
// Each check runs over every day in the data, not just a few examples.
const { htmlEngine, extractBars } = require("./lib");
const E = htmlEngine();
const bars = extractBars();
const n = bars.length, h = bars.map(b => b.h), l = bars.map(b => b.l), c = bars.map(b => b.c);
const results = [];
const check = (id, claim, bad, note = "") => { results.push({ id, claim, ok: !bad.length, bad, note }); };
const all = bars.map((_, t) => E.analyze(bars, t));
const addDays = (iso, k) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };
const weekEnd = iso => addDays(iso, (5 - new Date(iso + "T00:00:00Z").getUTCDay() + 7) % 7);

// R1 swing map: highest high of 7 bars (3 each side), only once 3 later bars exist
{
  const bad = [];
  for (let t = 0; t < n; t++) {
    const { sh, sl } = E.swings(h, l, t, 3);
    const expH = [], expL = [];
    for (let i = 3; i <= t - 3; i++) {
      const w = [...Array(7)].map((_, j) => i - 3 + j);
      if (h[i] === Math.max(...w.map(j => h[j]))) expH.push(i);
      if (l[i] === Math.min(...w.map(j => l[j]))) expL.push(i);
    }
    if (JSON.stringify(sh) !== JSON.stringify(expH) || JSON.stringify(sl) !== JSON.stringify(expL)) bad.push(bars[t].d);
    if (sh.some(i => i > t - 3) || sl.some(i => i > t - 3)) bad.push(bars[t].d + " unconfirmed swing");
  }
  check("R1", "Swing = extreme of 7 bars (K=3), confirmed only after 3 later bars", bad);
  // ties: two equal highs in one window both count as swings
  const { sh, sl } = E.swings(h, l, n - 1, 3), ties = [];
  sh.forEach(i => { for (let j = i - 3; j <= i + 3; j++) if (j !== i && h[j] === h[i]) ties.push(`high ${bars[i].d}=${bars[j].d}`); });
  sl.forEach(i => { for (let j = i - 3; j <= i + 3; j++) if (j !== i && l[j] === l[i]) ties.push(`low ${bars[i].d}=${bars[j].d}`); });
  results.push({ id: "R1", claim: "Equal highs/lows in one window (ties) — notes silent", ok: true, bad: [], note: `ties found in this data: ${ties.length ? ties.join(", ") : "none"}` });
}

// R2 break of structure uses the close; R1 bias = HH+HL bull, LH+LL bear, else mixed
{
  const bad = [];
  let bosFlips = 0, bosOverridesOpposite = 0; const oppDays = [];
  all.forEach((s, t) => {
    const st = s.st; if (st.bias === "none") return;
    const raw = st.hh && st.hl ? "bull" : (!st.hh && !st.hl) ? "bear" : "mixed";
    let exp = raw;
    if (c[t] > h[st.sh.at(-1)]) exp = "bull";
    if (c[t] < l[st.sl.at(-1)]) exp = "bear";
    if (exp !== st.bias) bad.push(bars[t].d);
    // a wick beyond the swing with the close inside must NOT flip
    if (st.bos && raw !== st.bias) bosFlips++;
    if (st.bos && ((raw === "bull" && st.bias === "bear") || (raw === "bear" && st.bias === "bull"))) { bosOverridesOpposite++; oppDays.push(`${bars[t].d} ${raw}->${st.bias}`); }
    if (!st.bos && (h[t] > h[st.sh.at(-1)] || l[t] < l[st.sl.at(-1)]) && st.bias !== raw) bad.push(bars[t].d + " wick flipped bias");
    if (s.call !== "STAND ASIDE" && s.call !== (st.bias === "bull" ? "LONG" : "SHORT")) bad.push(bars[t].d + " call != bias");
    if (st.bias === "mixed" && s.call !== "STAND ASIDE") bad.push(bars[t].d + " mixed but traded");
  });
  check("R2/R1", "Bias from HH/HL vs LH/LL, close (not wick) beyond last swing overrides it; mixed = stand aside", bad,
    `BOS changed the bias on ${bosFlips} day(s); on ${bosOverridesOpposite} of them it flipped a clean opposite trend outright (${oppDays.join(", ")}). Notes don't say BOS can do this; Nikhil should confirm`);
}

// R3 weekly ladder: completed weeks only, 5-bar swing (k=2), +15 agree / -10 disagree
{
  const bad = [], contradictions = [];
  all.forEach((s, t) => {
    if (s.call === "STAND ASIDE") return;
    const wk = E.weekly(bars, t);
    if (wk.weeks && wk.weeks.at(-1)[0] >= weekEnd(bars[t].d)) bad.push(bars[t].d + " current week included");
    if (s.weekly !== wk.bias) bad.push(bars[t].d);
    // trace honesty: weekly BOS can set the bias but the trace only prints HH/HL
    if (wk.bias !== "none") {
      const raw = wk.hh && wk.hl ? "bull" : (!wk.hh && !wk.hl) ? "bear" : "mixed";
      if (raw !== wk.bias) contradictions.push(bars[t].d);
    }
  });
  const fridays = all.filter((s, t) => s.call !== "STAND ASIDE" && new Date(bars[t].d + "T00:00:00Z").getUTCDay() === 5).length;
  check("R3", "Weekly read uses completed weeks only, k=2", bad,
    `Known flaw confirmed: on Fridays the just-finished week is dropped (${fridays} trade-call Fridays affected). ` +
    (contradictions.length
      ? `Trace wording: on ${contradictions.length} call day(s) the weekly bias came from a weekly break of structure, but the R3 trace line only prints the HH/HL read, with no mention of the break (first: ${contradictions.slice(0, 3).join(", ")}).`
      : `Latent trace gap: a weekly break of structure can set the weekly bias, but the R3 trace line only prints the HH/HL read. Happens on 0 call days in this data.`));
}

// R4 leg + fib, R5 invalidation
{
  const bad = [];
  all.forEach((s, t) => {
    if (s.call === "STAND ASIDE" || s.aI == null) return;
    const { sh, sl } = s.st, d = s.d;
    const expA = d === 1 ? sl.filter(i => i < sh.at(-1)).at(-1) : sh.filter(i => i < sl.at(-1)).at(-1);
    if (s.aI !== expA) bad.push(bars[t].d + " A");
    const seg = (d === 1 ? h : l).slice(s.aI, t + 1), ext = d === 1 ? Math.max(...seg) : Math.min(...seg);
    if (s.B !== ext) bad.push(bars[t].d + " B");
    const rng = Math.abs(s.B - s.A);
    if (Math.abs(s.entry - (s.B - d * 0.5 * rng)) > 1e-9 || Math.abs(s.far - (s.B - d * 0.786 * rng)) > 1e-9 || Math.abs(s.stop - (s.B - d * 0.854 * rng)) > 1e-9) bad.push(bars[t].d + " fib");
    if (d === 1 ? c[t] < s.stop : c[t] > s.stop) bad.push(bars[t].d + " traded past invalidation");
  });
  const voids = all.filter(s => s.why === "thesis already void").length;
  check("R4/R5", "A = last swing low before last swing high (mirror for bear), B = extreme since A, entry 50%, zone to 78.6%, invalidation 85.4%, stand aside if close already beyond", bad,
    `stand-aside for 'thesis already void' on ${voids} day(s)`);
}

// R7 divergence: -12, never flips the call
{
  const bad = [];
  all.forEach((s, t) => { if (s.call === "STAND ASIDE") return;
    const w = s.weekly === s.st.bias ? 15 : (s.weekly === "bull" || s.weekly === "bear") ? -10 : 0;
    if (s.conf !== Math.max(30, Math.min(80, 55 + w + (s.div ? -12 : 0)))) bad.push(bars[t].d); });
  check("R7/R9", "Divergence only lowers confidence by 12; confidence = 55 +15/-10 weekly -12 divergence, clamped 30-80", bad);
  const vals = [...new Set(all.filter(s => s.conf != null).map(s => s.conf))].sort((a, b) => a - b);
  results.push({ id: "R9", claim: "Confidence range", ok: true, bad: [], note: `values seen: ${vals.join(", ")}. The formula can only produce 33-70, so the 30-80 clamp never applies. Harmless, but the trace says "Capped between 30 and 80".` });
  // MACD 12/26/9 check against an independent computation
  const ema = (a, k) => { const m = 2 / (k + 1), o = [a[0]]; for (let i = 1; i < a.length; i++) o.push(a[i] * m + o[i - 1] * (1 - m)); return o; };
  const e12 = ema(c, 12), e26 = ema(c, 26), macd = e12.map((v, i) => v - e26[i]), sig = ema(macd, 9), ref = macd.map((v, i) => v - sig[i]);
  const hist = E.macdHist(c), maxd = Math.max(...hist.map((v, i) => Math.abs(v - ref[i])));
  check("R7", "MACD histogram is 12/26/9 on daily closes", maxd > 1e-9 ? [`max diff ${maxd}`] : []);
}

// R8 event gate: no fills on FOMC day or the day before
{
  const bad = [], traceWrong = [];
  all.forEach((s, t) => {
    if (s.call === "STAND ASIDE") return;
    for (const H of [5, 10]) { const r = E.resolve(bars, t, s, 3, H);
      if (r.fday != null) { const fd = bars[r.fday].d; if (E.FOMC.includes(fd) || E.FOMC.includes(addDays(fd, 1))) bad.push(`${bars[t].d} filled ${fd}`); } }
    // trace says "No new fills today or tomorrow"; check tomorrow (next session) really is gated
    if (s.blocked && t + 1 < n) { const nd = bars[t + 1].d; if (!(E.FOMC.includes(nd) || E.FOMC.includes(addDays(nd, 1)))) traceWrong.push(`${bars[t].d} (next session ${nd} is not gated)`); }
  });
  const fomcInData = E.FOMC.filter(d => d >= bars[0].d && d <= bars[n - 1].d);
  const missingBar = fomcInData.filter(d => !bars.some(b => b.d === d));
  check("R8", "No fills on an FOMC day or the day before", bad,
    `FOMC dates inside the data: ${fomcInData.join(", ")}${missingBar.length ? `; no bar on ${missingBar}` : ""}. ` +
    `Trace wording: "Inside the FOMC window. No new fills today or tomorrow" is shown on FOMC day itself, but the day after FOMC is NOT gated: wrong on ${traceWrong.length} call day(s)${traceWrong.length ? ` (${traceWrong.join("; ")})` : ""}.`);
}

// R6 output + backtest rules
{
  const bad = []; let fillDayTarget = 0;
  all.forEach((s, t) => { if (s.call === "STAND ASIDE") return;
    const r = E.resolve(bars, t, s, 3, 5);
    if (r.fday == null) return;
    const f = r.fday, o = bars[f].o, exp = s.d === 1 ? Math.min(o, s.entry) : Math.max(o, s.entry);
    if (r.fill !== exp) bad.push(bars[t].d + " fill");
    if (r.fday - t > 3 || r.fday <= t) bad.push(bars[t].d + " fill outside 3 sessions");
    if (r.tgt != null && Math.abs(r.tgt - (r.fill + s.d * 0.786 * Math.abs(s.B - r.fill))) > 1e-9) bad.push(bars[t].d + " target");
    if (r.xday != null && r.xday - f > 5) bad.push(bars[t].d + " held too long");
    if (r.tgt != null && (s.d === 1 ? bars[f].h >= r.tgt : bars[f].l <= r.tgt)) fillDayTarget++;
  });
  check("R6", "Limit at 50% line, lives 3 sessions, fill = entry or gapped open, target = 78.6% from fill toward B, hold 5", bad,
    `Not in notes: the target is not checked on the fill day itself (only the stop is). Days where the fill-day bar already touched the target: ${fillDayTarget}. ` +
    `Interpretation for Nikhil: RULES.R6 says "78 to 85 percent recovery of the leg"; the code targets 78.6% of the distance from the fill back to B, which from a 50% fill is about 39% of the whole leg.`);
  // one trade at a time, same setup re-taken
  for (const H of [5, 10]) {
    const tr = E.backtest(bars, "2025-12-01", "2026-09-18", 3, H), overlap = [], repeat = [];
    tr.forEach((x, i) => { if (i && x.t <= (tr[i - 1].xday ?? tr[i - 1].t + 3)) overlap.push(x.date);
      if (i && x.entry === tr[i - 1].entry && x.stop === tr[i - 1].stop) repeat.push(`${tr[i - 1].date} and ${x.date}`); });
    check("BT", `One trade at a time (hold ${H})`, overlap,
      repeat.length ? `Same setup (identical entry and stop) traded twice back to back: ${repeat.join("; ")}. Notes don't say whether a setup can be re-used after its first trade ends.` : "");
  }
}

let fails = 0;
results.forEach(r => { if (!r.ok) fails++;
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.id.padEnd(6)} ${r.claim}`);
  if (r.bad.length) console.log(`        mismatches (${r.bad.length}): ${r.bad.slice(0, 8).join(", ")}`);
  if (r.note) console.log(`        note: ${r.note}`); });
process.exitCode = fails ? 1 : 0;
