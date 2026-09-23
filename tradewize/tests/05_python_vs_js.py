"""Test 5: Python engine vs JS engine on the same CSV.

The shipped Python reads "gold.csv"; this harness redirects that one call to
gold_daily_gcf.csv so both engines see the same bars. Nothing else is patched
unless a check below says so explicitly.
"""
import json, os, subprocess, sys, importlib.util
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CSV = os.path.join(ROOT, "gold_daily_gcf.csv")
PY = os.environ.get("TW_PY", os.path.join(ROOT, "tradewize_engine_v0.py"))

spec = importlib.util.spec_from_file_location("tw", PY)
tw = importlib.util.module_from_spec(spec); spec.loader.exec_module(tw)

# 0. What does the shipped file try to open?
src = open(PY).read()
print(f"Python reads: {'gold_daily_gcf.csv' if 'gold_daily_gcf.csv' in src else 'gold.csv' if 'gold.csv' in src else '?'}")
_orig_read = pd.read_csv
pd.read_csv = lambda p, *a, **k: _orig_read(CSV if os.path.basename(str(p)) == "gold.csv" else p, *a, **k)

js = json.loads(subprocess.check_output(["node", os.path.join(HERE, "05_dump_js.js")]))
df = tw.load()
assert len(df) == len(js["days"]), (len(df), len(js["days"]))
TOL = 1e-6
close = lambda a, b: (a is None and b is None) or (a is not None and b is not None and abs(a - b) <= TOL)

def py_day(t):
    s = tw.setup(df, t)
    if s["call"] == "STAND ASIDE":
        return dict(call=s["call"], why=s["why"])
    return dict(call=s["call"], why=s["why"], entry=float(s["entry"]), far=float(s["zone_far"]), stop=float(s["stop"]),
                conf=int(s["conf"]), a_i=int(s["a_i"]), b_i=int(s["b_i"]), weekly=s["weekly"], div=bool(s["div"]))

def compare_days(label):
    bad, why_only = [], []
    for j in js["days"]:
        p = py_day(j["t"])
        diffs = []
        if p["call"] != j["call"]: diffs.append(f"call py={p['call']} js={j['call']}")
        elif p["call"] != "STAND ASIDE":
            for k in ("entry", "far", "stop"):
                if not close(p[k], j[k]): diffs.append(f"{k} py={p[k]:.4f} js={j[k]:.4f}")
            for k in ("conf", "a_i", "b_i", "weekly", "div"):
                if p[k] != j[k]: diffs.append(f"{k} py={p[k]} js={j[k]}")
        if diffs: bad.append(f"  {j['date']}: " + "; ".join(diffs))
        elif p["why"] != j["why"]: why_only.append(f"  {j['date']}: py='{p['why']}' js='{j['why']}'")
    print(f"{label}: {len(js['days'])} days, {len(bad)} with a different call/levels/confidence")
    for b in bad[:25]: print(b)
    print(f"  Same call but different 'why' text: {len(why_only)}")
    for w in why_only[:5]: print(w)
    return len(bad)

# Python port of JS backtest(): one trade at a time, using the PYTHON setup()/resolve().
def py_backtest(start, end, hold):
    tw.HOLD_DAYS = hold
    out, busy = [], -1
    for t in range(len(df)):
        d = str(df.date[t].date())
        if d < start or d > end or t <= busy: continue
        s = tw.setup(df, t)
        if s["call"] == "STAND ASIDE": continue
        r = tw.resolve(df, t, s)
        if r["status"] == "NO FILL": continue
        out.append(dict(t=t, call=s["call"], conf=int(s["conf"]), entry=float(s["entry"]), stop=float(s["stop"]),
                        status=r["status"], fill=r.get("fill"), fday=r.get("fday"), tgt=r.get("tgt"), exit=r.get("exit"), xday=r.get("xday")))
        busy = r["xday"] if r.get("xday") is not None else t + tw.FILL_DAYS
    tw.HOLD_DAYS = 5
    return out

def compare_trades():
    bad = 0
    for H in (5, 10):
        p, j = py_backtest("2025-12-01", "2026-09-18", H), js["trades"][str(H)]
        diffs = []
        if len(p) != len(j): diffs.append(f"trade count py={len(p)} js={len(j)}")
        for a, b in zip(p, j):
            for k in ("t", "call", "conf", "status", "fday", "xday"):
                if a[k] != b[k]: diffs.append(f"t={b['t']} {k} py={a[k]} js={b[k]}")
            for k in ("entry", "stop", "fill", "tgt", "exit"):
                if not close(None if a[k] is None else float(a[k]), b[k]): diffs.append(f"t={b['t']} {k} py={a[k]} js={b[k]}")
        pts = sum((1 if x["call"] == "LONG" else -1) * (x["exit"] - x["fill"]) for x in p if x["status"] in ("WIN", "LOSS", "EXPIRED+", "EXPIRED-"))
        print(f"Backtest HOLD={H}: python {len(p)} rows, js {len(j)} rows, python net points {pts:.1f}, {len(diffs)} difference(s)")
        for d in diffs[:10]: print("  " + d)
        bad += len(diffs)
    return bad

print("\n--- A. As shipped (only the CSV path redirected) ---")
n_days = compare_days("Daily setups")
n_tr = compare_trades()

print("\n--- B. Known difference 1: extra BOS condition sh[-1] < upto ---")
# swings() only confirms i <= upto-k, so sh[-1] <= upto-k < upto always. Check that on every call.
viol = 0
for t in range(len(df)):
    sh, sl = tw.swings(df.h.values, df.l.values, t)
    if (sh and sh[-1] >= t) or (sl and sl[-1] >= t): viol += 1
print(f"Days where the last swing index is >= t (the only case the extra condition matters): {viol}")
orig_structure = tw.structure
def structure_js(h, l, c, upto, k=tw.K):
    sh, sl = tw.swings(h, l, upto, k)
    if len(sh) < 2 or len(sl) < 2: return "none", sh, sl
    hh = h[sh[-1]] > h[sh[-2]]; hl = l[sl[-1]] > l[sl[-2]]
    bias = "bull" if hh and hl else "bear" if (not hh and not hl) else "mixed"
    if c[upto] > h[sh[-1]]: bias = "bull"
    if c[upto] < l[sl[-1]]: bias = "bear"
    return bias, sh, sl
tw.structure = structure_js
n_bos = compare_days("Daily setups with JS-style BOS")
tw.structure = orig_structure

print("\n--- C. Known difference 2: FOMC list ---")
py_f = [str(x.date()) for x in tw.FOMC]
extra = [d for d in js["fomc"] if d not in py_f]
last_bar = str(df.date.iloc[-1].date())
print(f"JS-only FOMC dates: {extra}. Last bar in data: {last_bar}.")
print(f"Any JS-only date within one day after the last bar? {any(d <= str((df.date.iloc[-1] + pd.Timedelta(days=1)).date()) for d in extra)}")
orig_fomc = tw.FOMC
tw.FOMC = pd.to_datetime(js["fomc"])
n_fomc = compare_trades()
tw.FOMC = orig_fomc

print("\n--- D. Python's own run() (a different backtest method) ---")
for H in (5, 10):
    tw.HOLD_DAYS = H
    _, r = tw.run("2025-12-01", "2026-09-18")
    tw.HOLD_DAYS = 5
    taken = r[r.get("status").notna() & ~r["status"].isin(["same setup", "NO FILL", "PENDING"])] if "status" in r else r.iloc[0:0]
    closed = taken[taken.status.isin(["WIN", "LOSS", "EXPIRED+", "EXPIRED-"])]
    w, l = (closed.status == "WIN").sum(), (closed.status == "LOSS").sum()
    print(f"run() HOLD={H}: {len(closed)} closed trades, {w} win / {l} loss, statuses {closed.status.value_counts().to_dict()}")
print("run() de-duplicates by (call, A, B) and allows overlapping trades; JS backtest() takes one trade at a time. "
      "So run() does NOT reproduce the published table and cannot be used to cross-check it.")

print("\nRESULT:", "PASS" if n_days == 0 and n_tr == 0 else "FAIL")
sys.exit(0 if n_days == 0 and n_tr == 0 else 1)
