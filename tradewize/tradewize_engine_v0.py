"""
Nikhil-method engine, v0 (daily + weekly only).
Each rule maps to his on-camera habits (see transcript summary):
 R1 Structure: HH/HL = bullish, LH/LL = bearish, mixed = no trade (Plan A/B only)
 R2 Break of structure: daily CLOSE beyond last swing flips bias (wick is not enough)
 R3 Weekly->Daily ladder: weekly structure must agree for full confidence
 R4 Discount/premium: only enter on retracement into 50-78.6% of last impulse leg ("don't chase")
 R5 Invalidation: daily close beyond 85.4% of the leg voids the thesis
 R6 Target: bounce target = 78.6% recovery back toward the leg extreme
 R7 MACD histogram divergence = exhaustion warning, lowers confidence (not a reversal by itself)
 R8 Event gate: no new entries on FOMC eve / FOMC day ("let the event come to you")
"""
import pandas as pd, numpy as np

K = 3            # swing fractal size (bars each side)
FILL_DAYS = 3    # limit order must fill within 3 sessions
HOLD_DAYS = 5    # intra-week horizon after fill
FOMC = pd.to_datetime(["2025-10-29","2025-12-10","2026-01-28","2026-03-18",
                       "2026-04-29","2026-06-17","2026-07-29","2026-09-16"])

def load():
    df = pd.read_csv("gold.csv", parse_dates=["date"])
    ema = lambda s,n: s.ewm(span=n, adjust=False).mean()
    macd = ema(df.c,12) - ema(df.c,26)
    df["mh"] = macd - ema(macd,9)
    return df

def swings(h, l, upto, k=K):
    """Swing highs/lows CONFIRMED by bar `upto` (no look-ahead)."""
    sh, sl = [], []
    for i in range(k, upto - k + 1):
        if h[i] == max(h[i-k:i+k+1]): sh.append(i)
        if l[i] == min(l[i-k:i+k+1]): sl.append(i)
    return sh, sl

def structure(h, l, c, upto, k=K):
    sh, sl = swings(h, l, upto, k)
    if len(sh) < 2 or len(sl) < 2: return "none", sh, sl
    hh = h[sh[-1]] > h[sh[-2]]; hl = l[sl[-1]] > l[sl[-2]]
    bias = "bull" if hh and hl else "bear" if (not hh and not hl) else "mixed"
    # R2: close-based break of structure overrides
    if c[upto] > h[sh[-1]] and sh[-1] < upto: bias = "bull"
    if c[upto] < l[sl[-1]] and sl[-1] < upto: bias = "bear"
    return bias, sh, sl

def weekly_bias(df, t):
    w = df.iloc[:t+1].set_index("date").resample("W-FRI").agg({"h":"max","l":"min","c":"last"}).dropna()
    w = w.iloc[:-1]  # only completed weeks
    if len(w) < 8: return "none"
    b,_,_ = structure(w.h.values, w.l.values, w.c.values, len(w)-1, k=2)
    return b

def setup(df, t):
    h, l, c, hist = df.h.values, df.l.values, df.c.values, df["mh"].values
    bias, sh, sl = structure(h, l, c, t)
    if bias not in ("bull","bear"):
        return dict(call="STAND ASIDE", why=f"daily structure {bias}: Plan A/B only, no trade")
    wb = weekly_bias(df, t)
    if bias == "bull":
        a_i = max([i for i in sl if i < sh[-1]], default=None)
        if a_i is None: return dict(call="STAND ASIDE", why="no clean leg")
        A = l[a_i]; b_i = a_i + int(np.argmax(h[a_i:t+1])); B = h[b_i]; rng = B - A
        z_top, z_bot, inval = B-.5*rng, B-.786*rng, B-.854*rng
        if c[t] < inval: return dict(call="STAND ASIDE", why="thesis already void")
        prev = [i for i in sh if i < b_i - K]
        div = bool(prev) and h[b_i] > h[prev[-1]] and hist[b_i] < hist[prev[-1]]
        d = 1
    else:
        a_i = max([i for i in sh if i < sl[-1]], default=None)
        if a_i is None: return dict(call="STAND ASIDE", why="no clean leg")
        A = h[a_i]; b_i = a_i + int(np.argmin(l[a_i:t+1])); B = l[b_i]; rng = A - B
        z_top, z_bot, inval = B+.5*rng, B+.786*rng, B+.854*rng   # 'top' = first touched
        if c[t] > inval: return dict(call="STAND ASIDE", why="thesis already void")
        prev = [i for i in sl if i < b_i - K]
        div = bool(prev) and l[b_i] < l[prev[-1]] and hist[b_i] > hist[prev[-1]]
        d = -1
    conf = 55 + (15 if wb == bias else -10 if wb in ("bull","bear") else 0) - (12 if div else 0)
    conf = int(max(30, min(80, conf)))   # never near 100
    return dict(call="LONG" if d==1 else "SHORT", d=d, A=A, B=B, a_i=a_i, b_i=b_i,
                entry=z_top, zone_far=z_bot, stop=inval, weekly=wb, div=div, conf=conf,
                why=f"daily {bias}, weekly {wb}" + (", MACD hist divergence" if div else ""))

def resolve(df, t, s):
    """Limit entry at near edge of zone, close-based stop, touch target, 5-day hold."""
    h, l, c, o, dates = df.h.values, df.l.values, df.c.values, df.o.values, df.date.values
    d, n = s["d"], len(df)
    for f in range(t+1, min(t+1+FILL_DAYS, n)):
        if pd.Timestamp(dates[f]) in FOMC or pd.Timestamp(dates[f]) + pd.Timedelta(days=1) in FOMC:
            continue  # R8
        touched = l[f] <= s["entry"] if d == 1 else h[f] >= s["entry"]
        if not touched: continue
        fill = min(o[f], s["entry"]) if d == 1 else max(o[f], s["entry"])
        if (d==1 and c[f] < s["stop"]) or (d==-1 and c[f] > s["stop"]):
            return dict(status="LOSS", fill=fill, fday=f, exit=c[f], xday=f)
        tgt = fill + d*0.786*abs(s["B"] - fill)          # R6
        for x in range(f+1, min(f+1+HOLD_DAYS, n)):
            hit = h[x] >= tgt if d==1 else l[x] <= tgt
            stp = c[x] < s["stop"] if d==1 else c[x] > s["stop"]
            if hit and stp:  return dict(status="LOSS", fill=fill, fday=f, tgt=tgt, exit=c[x], xday=x)  # conservative
            if hit:          return dict(status="WIN", fill=fill, fday=f, tgt=tgt, exit=tgt, xday=x)
            if stp:          return dict(status="LOSS", fill=fill, fday=f, tgt=tgt, exit=c[x], xday=x)
        last = min(f+HOLD_DAYS, n-1)
        if f + HOLD_DAYS > n-1: return dict(status="OPEN", fill=fill, fday=f, tgt=tgt, exit=c[last], xday=last)
        pnl = d*(c[last]-fill)
        return dict(status="EXPIRED+" if pnl>0 else "EXPIRED-", fill=fill, fday=f, tgt=tgt, exit=c[last], xday=last)
    if t + FILL_DAYS > n-1: return dict(status="PENDING")
    return dict(status="NO FILL")

def run(start, end, verbose=False):
    df = load(); rows = []; seen = set()
    idx = df.index[(df.date >= start) & (df.date <= end)]
    for t in idx:
        s = setup(df, t)
        r = dict(date=df.date[t].date(), close=df.c[t], call=s["call"], why=s["why"])
        if s["call"] != "STAND ASIDE":
            key = (s["call"], s["a_i"], s["b_i"])
            r.update(entry=round(s["entry"],1), stop=round(s["stop"],1), conf=s["conf"], new=key not in seen)
            if key not in seen:
                seen.add(key); r.update(resolve(df, t, s))
            else: r["status"] = "same setup"
        # simple bias check: did price move in bias direction over next 5 sessions?
        if t+5 < len(df): r["fwd5"] = round(df.c[t+5]-df.c[t],1)
        rows.append(r)
    return df, pd.DataFrame(rows)
