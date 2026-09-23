# Tradewize Gold Engine v0 — developer notes

Date: 22 September 2026. Owner: Ajit (inlo.ai). Client: Nikhil, Tradewize / Moneytize.

## What this is

A single HTML file that runs Nikhil's chart method on real daily gold prices and shows, for every day, the rules it used to reach its call. It is a test of whether his method can be turned into code and whether that code reaches the 75% hit rate he set. It is not the product.

The method was taken from 20 of his public YouTube videos. We do not have his course material. Expect him to correct some rules when he sees this. That is the point of showing him the logic.

## Files

- `tradewize-gold-engine-v0.html` — the demo. One file, no build step, no server. Open in a browser or drop on Netlify.
- `engine.js` — the rules engine on its own. This is the source of truth. The HTML has a copy of it inlined between `<script>/*ENGINE*/` markers. If you change the engine, rebuild the HTML by pasting the new file in.
- `tradewize_engine_v0.py` — the same rules in Python. Used to cross-check the JS. Both produce identical calls on all 220 test days and identical trades in the backtest.
- `gold_daily_gcf.csv` — 252 daily bars, 18 Sep 2025 to 18 Sep 2026, COMEX gold futures (Yahoo `GC=F`). Also embedded in the HTML.

## How the engine decides (the part Nikhil will judge)

Each rule is a line he says on camera. `engine.js` has them in the `RULES` object with the source wording. The order is fixed:

1. **R1 Swing map.** Swing high = highest high of 7 bars (3 each side). Same for lows. A swing only counts once 3 later bars exist, so the engine never sees the future.
2. **R2 Break of structure.** Uses the daily close, not the wick.
3. **R1 Daily bias.** Higher high and higher low = bull. Lower high and lower low = bear. Anything else = mixed = stand aside (his "Plan A / Plan B only").
4. **R3 Weekly ladder.** Same structure read on completed weeks (5-bar swing). Agrees with daily: confidence +15. Disagrees: -10.
5. **R4 Impulse leg.** A = last swing low before the last swing high (for a bull leg). B = highest high since A. Mirror for bear.
6. **R4 Fib zone.** Entry at the 50% retracement, zone runs to 78.6%.
7. **R5 Invalidation.** Daily close beyond 85.4% of the leg. If the current close is already beyond it, stand aside.
8. **R7 Divergence.** MACD histogram (12, 26, 9). If B made a new extreme and the histogram did not, confidence -12. It never flips the call.
9. **R8 Event gate.** No fills on the day before or the day of an FOMC decision. Dates are hard-coded in `FOMC`.
10. **R9 Confidence.** 55 base, plus the adjustments above, clamped 30 to 80. It is not calibrated. In testing the high-confidence trades did not win more often. Treat it as a placeholder.
11. **R6 Output.** Limit order at the 50% line, lives 3 sessions. Target = 78.6% recovery from the fill toward B. Hold 5 sessions (10 selectable).

## Backtest rules

- One trade at a time. While a trade is open no new setups are taken.
- Fill = the entry price, or the open if the open gaps through the entry.
- Win = target touched before a close beyond invalidation. Loss = the close-based stop first. Same day both: counted as a loss.
- Expired = neither hit within the hold; marked plus or minus at the last close.
- No spread, commission or slippage.

Results on the bundled data, 1 Dec 2025 to 18 Sep 2026:

| Hold | Trades | Target before stop | Profitable at exit | Net points |
|---|---|---|---|---|
| 5 sessions | 13 | 4 of 6 (67%) | 62% | +540 |
| 10 sessions | 10 | 5 of 6 (83%) | 70% | +728 |

Daily direction alone (no entry discipline) was right 53% of the time. The edge comes from waiting for the pullback, which is what he teaches.

Sample is small. Do not quote 75% to the client from this. Say "in the right range, needs more data".

## Known flaws and judgment calls

- Swing window (3 bars) and the 50 / 78.6 / 85.4 levels are my reading of his videos. He should confirm or change them. They are constants at the top of `analyze` and in `RULES`.
- B is the running extreme since A, so the zone moves while a leg is still extending. He does the same thing on camera ("imaginary fib assuming a future low") but it means the levels are not fixed until the leg ends.
- Weekly bias drops the current week even when the day being read is a Friday.
- Prices are the December futures contract, roughly 40 to 70 dollars above spot. Fine for testing structure. For the product, use whatever his students trade (spot XAUUSD on MetaTrader).
- The FOMC list needs maintaining. Other releases (CPI, NFP, PCE) are not gated yet.
- The engine is daily only. His entries in the videos come from 4-hour and 1-hour charts. That is the biggest gap and needs intraday data (export from his MetaTrader terminal is the quickest source).

## What to build next, in order

1. **Data feed.** Replace the pasted CSV with a daily pull (spot gold, plus DXY and silver for the next steps). Keep the CSV import; Nikhil will want to paste his own MT5 exports.
2. **Intraday ladder.** Run the same `structure()` on 4H and 1H bars. Add his timeframe gate: a lower-timeframe break only counts when the higher timeframe close confirms.
3. **Dollar first.** Run structure on DXY and flag when gold's call disagrees with the dollar read.
4. **Calendar.** CPI, NFP, PCE dates from a public calendar, feeding R8.
5. **Plan A / Plan B card.** When structure is mixed, show both scenarios with their invalidation instead of a bare "stand aside".
6. **Confidence calibration.** Once there are 50+ trades, fit the score to actual hit rate.
7. **Alerts.** Email or WhatsApp when a setup goes from "waiting" to "in zone", inside the user's chosen session window.

## Things not to do

- Do not let an LLM read the chart live. The rules must run as code so results are repeatable and the backtest is honest. Use the LLM only to write the explanation text from the trace, if at all.
- Do not remove the trace. The whole demo rests on Nikhil seeing why each call was made.
- Do not present the confidence number as a probability.
