# Tradewize Gold Engine v0: verification report

Date: 23 September 2026. Scope: Phase 2 (verify only). **No engine, Python or HTML code has been changed.**
Files checked: `tradewize-gold-engine-v0.html`, `engine.js`, `tradewize_engine_v0.py`, `DEVELOPER-NOTES.md`.

## The short version (for Ajit)

- **The engine is honest about time.** On every one of the 252 days, the call it makes is exactly the same whether or not it is given the prices that came afterwards. It does not peek at the future.
- **The published backtest numbers are exactly right.** 5-session hold: 13 trades, 4 of 6 target-before-stop, 62% profitable, +540 points. 10-session hold: 10 trades, 5 of 6, 70%, +728. All match the notes.
- **The Python copy agrees with the website** on every daily call and every trade.
- **The rules in the code match the notes.** No rule does something different from what the notes say. There are a few judgment calls the notes don't mention, listed below for Nikhil.
- **The page is not ready to show yet**, for presentation reasons rather than logic: it says "Benchmark 75%" in two places, shows the confidence number with no warning next to it, loads fonts from Google's servers, and has two small wording errors in the step-by-step explanation. All are fixable without touching the trading logic.
- **Keep in mind:** "4 of 6" and "5 of 6" come from **6 trades** that reached target or stop. That is too few to say anything firm, which is why the message should stay "promising, needs more data".

## How to re-run

```
cd tradewize
tests/run_all.sh          # every test; each output saved to tests/output/<name>.txt
```
Needs Node 18+, Python 3 with pandas and numpy (test 5), and Playwright with Chromium (test 8).

## Results

| # | Check | Result | Key numbers |
|---|---|---|---|
| 1 | Engine in HTML = `engine.js` | **PASS** (one caveat) | 139 lines, byte-identical. The `/*ENGINE*/` marker the notes describe does **not** exist in the HTML. |
| 2 | Embedded data | **PASS** | 252 rows, 2025-09-18 to 2026-09-18, no duplicates, no bad values |
| 3 | No look-ahead | **PASS** | 0 mismatches on 252 days, in two separate tests |
| 4 | Backtest reproduction | **PASS** | Both hold lengths match the notes exactly |
| 5 | Python vs JS | **PASS** | 0 differences in calls, levels, confidence or trades |
| 6 | Rules vs notes | **PASS** | All 9 rules match. 6 unstated judgment calls found. |
| 7 | Performance | Measured | Backtest 167 ms now, 96 ms with the fix. Histogram identical. |
| 8 | Page in a browser (extra) | **FAIL** | "75%" shown twice, external fonts, no favicon. No JS errors, no sideways scrolling at 375 px. |

### 1. Engine match

The engine inside the HTML is byte-for-byte identical to `engine.js` (139 lines, whitespace included).

**Caveat:** the notes say the engine sits between `<script>/*ENGINE*/` markers. It doesn't. The block is a plain `<script>` that starts with the engine's header comment. The test finds it that way instead. When we next rebuild the HTML (Phase 3), I'll add the marker so the documented rebuild step actually works.

### 2. Data

Extracted to `gold_daily_gcf.csv` (`date,o,h,l,c`).

- 252 rows, first 2025-09-18, last 2026-09-18. Dates ascending, no duplicates, no weekend dates.
- In every row the high is at least the low, and the open and close sit inside the high-low range. All values are positive numbers.
- 10 weekdays have no bar. All 10 are US market holidays (Thanksgiving, Christmas, New Year, MLK Day, Presidents Day, Good Friday, Memorial Day, Juneteenth, 3 July, Labor Day). There are no unexplained gaps.
- Price range 3,660.5 to 5,586.2. Six daily moves were bigger than 4%. The largest is **2026-01-30, a 10.8% fall**. That isn't an error the data can show on its own, but it's big enough to check against a second source (for example the MT5 export) before the demo. I couldn't verify it independently from here.

### 3. No look-ahead (most important)

- **Test A (the one you asked for):** for every day t, `analyze(bars.slice(0, t+1), t)` compared with `analyze(bars, t)`. Compared fields: call, direction, entry, 78.6% level, stop, confidence, A, B and their dates, weekly bias, divergence, the "why" text, in-zone flag, FOMC flag, swing lists, break-of-structure flag, MACD histogram up to t, and the **full trace text**. **0 mismatches in 252 days.**
- **Test B (stronger):** every bar after day t was replaced with random prices. **0 mismatches in 252 days.** Even completely different future prices don't change a single character of the output.
- `analyze()` never crashes on short histories. It just says "not enough structure" for the first 37 days.
- Calls over all 252 days: 99 LONG, 79 SHORT, 74 STAND ASIDE.

The backtest's `resolve()` is *meant* to look forward, because it grades a call using what happened next. The page shows those later bars greyed out as "what happened next", and they're never fed into the call.

### 4. Backtest reproduction

Range 2025-12-01 to 2026-09-18, orders live 3 sessions.

| Hold | Trades closed | Target before stop | Profitable at exit | Net points | Notes say | Match |
|---|---|---|---|---|---|---|
| 5 | 13 (4 win, 2 loss, 4 expired+, 3 expired-) | 4 of 6 = 66.7% | 8 of 13 = 61.5% | +540.2 | 13, 4/6, 62%, +540 | ✅ |
| 10 | 10 (5 win, 1 loss, 2 expired+, 2 expired-) | 5 of 6 = 83.3% | 7 of 10 = 70.0% | +728.2 | 10, 5/6, 70%, +728 | ✅ |

Each run also has one PENDING call at the end (2026-09-16 or 09-17) that isn't counted. "Daily bias right 5 sessions later" is 85 of 159 = 53.5%, which matches the notes' 53%. The full trade lists are in `tests/output/04_backtest.txt`.

The data supports "confidence is uncalibrated". With a 5-session hold, the confidence-70 trades went 1 win and 1 loss, while the confidence-55 and 58 trades went 3 wins and 0 losses. A higher number did not mean a better trade.

### 5. Python vs JS

Both engines run on `gold_daily_gcf.csv`. The test only redirects Python's `gold.csv` path and changes nothing else.

- **Daily calls:** 252 of 252 days identical in call, entry, 78.6%, stop, confidence, A, B, weekly bias and divergence (tolerance 1e-6).
- **Trades:** Python's own `setup()` and `resolve()`, driven by the JS one-trade-at-a-time loop, give exactly the same 14 rows (hold 5) and 11 rows (hold 10), with the same fills, targets, exits and points.

The three differences you already knew about:

| Difference | Changes any output? | Why |
|---|---|---|
| Python's extra BOS condition `sh[-1] < upto` | **No** | A swing is only confirmed 3 bars later (2 on weekly), so the last swing is always before `upto` and the condition is always true. Checked on all 252 days, and re-running Python without it gives identical output. |
| Python's FOMC list stops at 2026-09-16 | **No, not yet** | The data ends 2026-09-18, so the two extra JS dates (2026-10-28, 2026-12-09) never come into play. They **will** once newer data is loaded. |
| Python reads `gold.csv` | Yes | The shipped Python crashes unless that file exists. Fix: point it at `gold_daily_gcf.csv`. |

Other differences I found:

1. **Python's `run()` is a different backtest.** It de-duplicates setups by (call, A, B) and lets trades overlap. JS takes one trade at a time. Over the same period `run()` reports 17 closed trades (6 win / 2 loss at hold 5, 9 / 3 at hold 10), not the published 13 and 10. The notes' claim that Python gives "identical trades in the backtest" is only true with the JS loop, which the Python file doesn't contain.
2. **Hold length can't be passed in Python.** It's a module constant (`HOLD_DAYS = 5`). The test sets it by hand for the 10-session run.
3. **Wording:** for the first 37 days Python says "daily structure none: Plan A/B only, no trade", while JS says "not enough structure". Same call. JS is the clearer label.
4. The notes say the engines agree on "all 220 test days". They actually agree on all 252.

### 6. Rules vs notes

Each rule was checked as a property on every day, not just read.

| Rule | What the notes say | Code matches? |
|---|---|---|
| R1 Swing map | Extreme of 7 bars (3 each side), counts only after 3 later bars | ✅ |
| R2 Break of structure | Uses the daily close, not the wick | ✅ A wick beyond a swing never flipped the bias. |
| R1 Daily bias | HH+HL bull, LH+LL bear, else mixed = stand aside | ✅ Mixed never traded. |
| R3 Weekly ladder | Completed weeks, 5-bar swing, +15 agree / -10 disagree | ✅ |
| R4 Impulse leg | A = last swing low before last swing high, B = highest high since A (mirror for bear) | ✅ |
| R4 Fib zone | Entry 50%, zone to 78.6% | ✅ |
| R5 Invalidation | Close beyond 85.4%; stand aside if already beyond | ✅ Triggered on 4 days. |
| R7 Divergence | MACD 12/26/9 histogram; -12; never flips the call | ✅ Histogram checked against an independent calculation, difference 0. |
| R8 Event gate | No fills on FOMC day or the day before | ✅ No backtest fill on a gated day. |
| R9 Confidence | 55 base, adjustments, clamp 30-80, uncalibrated | ✅ |
| R6 Output | Limit at 50%, 3 sessions, target 78.6% from fill toward B, hold 5/10 | ✅ |
| Backtest | One trade at a time, gap fill at open, same-day both = loss | ✅ |

The code does what the notes say. Six things the notes don't say are listed as issues 6 to 11 below.

### 7. Performance

`macdHist()` runs the full 26-period EMA again for every bar: **254 EMA passes where 3 are needed.**

| | Now | With each EMA computed once |
|---|---|---|
| `macdHist` (252 closes) | 0.64 ms | 0.08 ms |
| `analyze` one day | 1.96 ms | 1.32 ms |
| Full backtest, hold 5 | 167 ms | 96 ms |
| Backtest-tab click (backtest + direction check) | 459 ms | 259 ms |
| `macdHist` on 5 years of data (1,260 bars) | 14 ms | 0.1 ms |
| Histogram difference | | **0 (exactly identical)** |

Measured on this server. Expect a mid-range phone to be about 3 to 5 times slower, so a backtest click takes 1.5 to 2 seconds now versus about 1 second after the fix. The fix isn't urgent at 252 bars but becomes important once Nikhil pastes years of MT5 data. The rest of the cost is structural (`analyze()` rebuilds everything for every day), and I'd leave that alone for v0.

### 8. Page in a browser (extra check)

Headless Chromium at 1280 px and 375 px:

- ✅ No JavaScript errors from the page. The call card renders with an 11-step trace, and the backtest table shows 14 rows.
- ✅ No sideways scrolling of the page body on any tab at 375 px. The trade table scrolls inside its own box, which is intended.
- ❌ The page loads fonts from `fonts.googleapis.com`. That's an outside server (hard rule 6), and it failed here.
- ❌ It shows **"Benchmark 75%"** on the headline stat and **"The 75% benchmark Nikhil set…"** in the "What counts as a success" box (hard rule 5).
- ❌ No favicon, and the title is "Tradewize Gold Engine v0".

## Issues, ranked

**A. Must fix before Nikhil sees it (breaks a hard rule or could mislead). No trading-logic change.**

1. **"75%" is shown twice in the UI** (backtest headline stat and the success-definition box). This breaks hard rule 5. Planned for Phase 4.
2. **Confidence is shown as a bare "Confidence 70" pill** on the call card and in the trade table, with no "uncalibrated, not a win chance" wording next to it. Only the trace says "Uncalibrated". It's easy to read as 70%. Hard rule 4. Planned for Phase 4.
3. **The headline stat is a large "67%" (or "83%") based on 6 trades.** It's technically correct, but it's the first thing anyone will quote. Proposal: lead with "4 of 6" and state the sample size, with the percentage secondary. Phase 4, presentation only.
4. **The trace is wrong in two places:**
   - On an FOMC day, R8 says "No new fills today or tomorrow", but the day after FOMC is **not** gated in the backtest (and shouldn't be, per the notes). This is wrong on 5 call days in the data: 2026-01-28, 03-18, 04-29, 06-17 and 09-16. The fix is wording only, for example "Inside the FOMC window. No fills until the day after the decision."
   - R6 says "trade held up to 5 sessions", and "What happened next" always grades on 5 sessions, even when the backtest is set to 10. Only the wording and that side card are affected; the backtest itself is correct.

   The trace is engine output, so the first fix is a one-line text change in `engine.js`. **I need your OK.**
5. **External fonts and no favicon** (hard rule 6). Switch to system fonts and an inline SVG favicon. Phase 4.

**B. Judgment calls for Nikhil. The code matches the notes, but the notes are silent. I won't change any of these without your approval.**

6. **The same setup can be traded twice.** After a trade ends, the identical setup (same A, B, entry and stop) can be taken again. This happened on 2026-03-26 and 2026-04-09 (both SHORT at 4674.4 / stop 5081.0, both expired at a loss, hold 5). One idea counts as two trades.
7. **A break of structure can flip a clean trend outright.** A close beyond the last swing doesn't just decide a mixed read, it can turn a clean HH/HL uptrend bearish. This happened on 4 days (2026-04-28, 04-29, 05-04, 05-05, bull→bear), and the 2026-05-04 SHORT came from it. That may be exactly his "BOS" idea, but he should confirm.
8. **Target interpretation.** The R6 source line says "78 to 85 percent recovery of the leg". The code targets 78.6% of the distance from the fill back to B. From a 50% fill that's about 39% of the whole leg. Worth showing him a picture.
9. **The target isn't checked on the fill day, only the stop is.** With daily bars we can't know whether the target was touched before or after the fill, so this is the cautious choice. It came up on 8 days. It should be written in the notes.
10. **Weekly bias drops a finished week on Fridays** (already in the notes). This affects 34 Friday call days. It's conservative and involves no look-ahead.
11. The confidence formula can only produce 33 to 70, so the "capped between 30 and 80" in the trace never applies. Harmless.

**C. Housekeeping. Safe, and outputs are identical or no output changes.**

12. **`macdHist` is O(n²).** Fix planned for Phase 3, with a before/after proof.
13. **Missing `/*ENGINE*/` marker** in the HTML. Add it in Phase 3 so the documented rebuild step works.
14. **Python:** reads `gold.csv`; stale FOMC list; its `run()` is a different backtest method than JS; no hold-length parameter; "none" is worded as Plan A/B. Planned for Phase 3 (JS is the source of truth).
15. **DEVELOPER-NOTES corrections:** "220 test days" should be 252; "identical trades" is only true with the JS backtest loop; the `/*ENGINE*/` marker doesn't exist yet; the same-setup and fill-day behaviours should be documented. Note that the notes' first section still frames v0 as "a test of whether that code reaches the 75% hit rate". That's fine for an internal file, but it shouldn't be copied onto the page.
16. **CSV import:** a parser line does nothing (`if(...&&false){}`), and rows with a high below the open or close are loaded with a warning rather than rejected. That's minor and only affects pasted data.
17. **Data sanity:** the 10.8% fall on 2026-01-30 should be cross-checked against a second source before the demo.

## What I need from you

- **OK to fix issue 4** (two wording lines in the trace)? This is text only; calls, levels and numbers don't change.
- For **issues 6 to 9**: leave as they are and raise them with Nikhil (my recommendation), or change any of them now?
- **OK to go ahead with Phase 3** (issues 12 to 15)?
