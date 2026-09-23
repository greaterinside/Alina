#!/usr/bin/env bash
# Runs every verification test and saves each output to tests/output/.
# Needs Node 18+. Python test needs pandas + numpy. Browser test needs Playwright + Chromium.
cd "$(dirname "$0")/.." || exit 1
mkdir -p tests/output
export NODE_PATH="${NODE_PATH:-$(npm root -g 2>/dev/null)}"
status=0
run() { local name=$1; shift
  if "$@" > "tests/output/$name.txt" 2>&1; then echo "PASS  $name"; else echo "FAIL  $name  (see tests/output/$name.txt)"; status=1; fi; }
run 02_data            node tests/02_data.js      # first: writes gold_daily_gcf.csv used by test 5
run 01_engine_match    node tests/01_engine_match.js
run 03_no_lookahead    node tests/03_no_lookahead.js
run 04_backtest        node tests/04_backtest.js
run 05_python_vs_js    python3 tests/05_python_vs_js.py
run 06_rules_vs_notes  node tests/06_rules_vs_notes.js
run 07_performance     node tests/07_performance.js
run 08_browser_smoke   node tests/08_browser_smoke.js "$@"
exit $status
