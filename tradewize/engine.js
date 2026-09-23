/* Tradewize gold engine v0 — Nikhil method, daily + weekly only.
   Every rule cites what he says on camera (see RULES). No look-ahead. */
(function(root){
const RULES = {
  R1:{name:"Trend structure",   src:"Higher-high / higher-low is bullish, lower-high / lower-low is bearish. Mixed = Plan A / Plan B only."},
  R2:{name:"Break of structure", src:"A break needs a candle close beyond the level. A wick alone is not a break."},
  R3:{name:"Timeframe ladder",   src:"Weekly is macro structure, daily is micro structure nested inside it. Higher timeframe sets direction."},
  R4:{name:"Discount entry",     src:"Accumulate in discount, the deep fib of the leg. Do not chase price at highs or at a magnet."},
  R5:{name:"Invalidation",       src:"A close beyond 78.6 to 85.4 (the 7885 zone) voids the plan. Wick is not a close."},
  R6:{name:"Bounce target",      src:"Bounce trade targets 78 to 85 percent recovery of the leg. Near-term target, not overnight."},
  R7:{name:"Divergence filter",  src:"MACD histogram divergence is exhaustion or a corrective bounce, not a reversal until BOS plus hold."},
  R8:{name:"Event gate",         src:"Let the event come to you. First move after the Fed may be the wrong move. No new entries at the print."},
  R9:{name:"Confidence",         src:"Never 100 percent confidence. This is analysis for the trader to act on, not a trade call."}
};
const FOMC = ["2025-10-29","2025-12-10","2026-01-28","2026-03-18","2026-04-29","2026-06-17","2026-07-29","2026-09-16","2026-10-28","2026-12-09"];
const K = 3;
const F = v => (Math.round(v*10)/10).toLocaleString("en-US",{minimumFractionDigits:1,maximumFractionDigits:1});

function ema(a,n){const k=2/(n+1);const out=[a[0]];for(let i=1;i<a.length;i++)out.push(a[i]*k+out[i-1]*(1-k));return out;}
function macdHist(c){const m=ema(c,12).map((v,i)=>v-ema(c,26)[i]);const s=ema(m,9);return m.map((v,i)=>v-s[i]);}
function addDays(iso,n){const d=new Date(iso+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function weekEnd(iso){const d=new Date(iso+"T00:00:00Z");return addDays(iso,(5-d.getUTCDay()+7)%7);}

function swings(h,l,upto,k){const sh=[],sl=[];
  for(let i=k;i<=upto-k;i++){let mx=-Infinity,mn=Infinity;
    for(let j=i-k;j<=i+k;j++){if(h[j]>mx)mx=h[j];if(l[j]<mn)mn=l[j];}
    if(h[i]===mx)sh.push(i);if(l[i]===mn)sl.push(i);}
  return {sh,sl};}

function structure(h,l,c,upto,k){const {sh,sl}=swings(h,l,upto,k);
  if(sh.length<2||sl.length<2)return {bias:"none",sh,sl};
  const hh=h[sh[sh.length-1]]>h[sh[sh.length-2]], hl=l[sl[sl.length-1]]>l[sl[sl.length-2]];
  let bias=hh&&hl?"bull":(!hh&&!hl)?"bear":"mixed", bos=null;
  if(c[upto]>h[sh[sh.length-1]]){bias="bull";bos="up";}
  if(c[upto]<l[sl[sl.length-1]]){bias="bear";bos="down";}
  return {bias,sh,sl,hh,hl,bos};}

function weekly(bars,t){const g=new Map();
  for(let i=0;i<=t;i++){const w=weekEnd(bars[i].d);if(!g.has(w))g.set(w,{h:-Infinity,l:Infinity,c:0});const x=g.get(w);x.h=Math.max(x.h,bars[i].h);x.l=Math.min(x.l,bars[i].l);x.c=bars[i].c;}
  const ws=[...g.entries()].slice(0,-1); // drop the current, incomplete week
  if(ws.length<8)return {bias:"none",n:ws.length};
  const st=structure(ws.map(w=>w[1].h),ws.map(w=>w[1].l),ws.map(w=>w[1].c),ws.length-1,2);
  return {bias:st.bias,n:ws.length,hh:st.hh,hl:st.hl,weeks:ws};}

function analyze(bars,t){
  const h=bars.map(b=>b.h),l=bars.map(b=>b.l),c=bars.map(b=>b.c),hist=macdHist(c);
  const D=i=>bars[i].d, trace=[];
  const st=structure(h,l,c,t,K), {sh,sl}=st, last=a=>a[a.length-1], prev=a=>a[a.length-2];
  // 1 swing map
  if(st.bias==="none"){trace.push({rule:"R1",title:"Swing map",inputs:"Fewer than two confirmed swing highs and lows in the window.",result:"Not enough structure to read.",state:"skip"});
    return {call:"STAND ASIDE",why:"not enough structure",trace,st,hist};}
  trace.push({rule:"R1",title:"Swing map (daily, 3-bar fractal, confirmed only)",
    inputs:`Swing highs: ${D(prev(sh))} ${F(h[prev(sh)])} then ${D(last(sh))} ${F(h[last(sh)])}. Swing lows: ${D(prev(sl))} ${F(l[prev(sl)])} then ${D(last(sl))} ${F(l[last(sl)])}.`,
    result:`${st.hh?"Higher high":"Lower high"} and ${st.hl?"higher low":"lower low"}.`,state:"info"});
  // 2 BOS
  const rawBias=st.hh&&st.hl?"bull":(!st.hh&&!st.hl)?"bear":"mixed";
  trace.push({rule:"R2",title:"Break of structure (close-based)",
    inputs:`Close ${F(c[t])} vs last swing high ${F(h[last(sh)])} and last swing low ${F(l[last(sl)])}.`,
    result:st.bos==="up"?"Daily close above the last swing high. Bias flips to bullish.":st.bos==="down"?"Daily close below the last swing low. Bias flips to bearish.":"No close beyond either swing. Structure read stands.",state:st.bos?"flag":"pass"});
  trace.push({rule:"R1",title:"Daily bias",inputs:`Structure ${rawBias}${st.bos?", overridden by break of structure":""}.`,
    result:st.bias==="mixed"?"Mixed structure. Plan A / Plan B only, no trade.":st.bias==="bull"?"Bullish":"Bearish",state:st.bias==="mixed"?"stop":"pass"});
  if(st.bias==="mixed")return {call:"STAND ASIDE",why:"daily structure mixed: Plan A/B only, no trade",trace,st,hist};
  // 3 weekly
  const wk=weekly(bars,t);
  trace.push({rule:"R3",title:"Weekly ladder",inputs:wk.bias==="none"?`Only ${wk.n} completed weeks available.`:`${wk.n} completed weeks. ${wk.hh?"Higher high":"Lower high"}, ${wk.hl?"higher low":"lower low"} on weekly swings.`,
    result:wk.bias==="none"?"Weekly not readable. No adjustment.":wk.bias===st.bias?`Weekly ${wk.bias} agrees with daily. Confidence +15.`:wk.bias==="mixed"?"Weekly mixed. No adjustment.":`Weekly ${wk.bias} disagrees with daily. Counter-trend, confidence -10.`,
    state:wk.bias===st.bias?"pass":wk.bias==="bull"||wk.bias==="bear"?"flag":"info"});
  // 4 leg
  const d=st.bias==="bull"?1:-1; let aI,bI,A,B;
  if(d===1){const cand=sl.filter(i=>i<last(sh));if(!cand.length)return {call:"STAND ASIDE",why:"no clean leg",trace,st,hist};
    aI=last(cand);A=l[aI];bI=aI;for(let i=aI;i<=t;i++)if(h[i]>h[bI])bI=i;B=h[bI];}
  else{const cand=sh.filter(i=>i<last(sl));if(!cand.length)return {call:"STAND ASIDE",why:"no clean leg",trace,st,hist};
    aI=last(cand);A=h[aI];bI=aI;for(let i=aI;i<=t;i++)if(l[i]<l[bI])bI=i;B=l[bI];}
  const rng=Math.abs(B-A);
  trace.push({rule:"R4",title:"Impulse leg (A to B)",inputs:`A = ${D(aI)} at ${F(A)}. B = ${D(bI)} at ${F(B)}. Leg size ${F(rng)} points.`,
    result:`Last ${d===1?"bullish":"bearish"} impulse. Retracement is measured against this leg.`,state:"info"});
  // 5 fib zone
  const entry=B-d*0.5*rng, far=B-d*0.786*rng, stop=B-d*0.854*rng;
  trace.push({rule:"R4",title:"Fib retracement of the leg",inputs:`50% = ${F(entry)}. 78.6% = ${F(far)}. 85.4% = ${F(stop)}.`,
    result:`Entry zone ${F(Math.min(entry,far))} to ${F(Math.max(entry,far))}. Invalidation on a daily close ${d===1?"below":"above"} ${F(stop)} (R5).`,state:"info"});
  const voided=d===1?c[t]<stop:c[t]>stop;
  const inZone=d===1?(c[t]<=entry&&c[t]>=far):(c[t]>=entry&&c[t]<=far);
  trace.push({rule:"R5",title:"Where price sits now",inputs:`Close ${F(c[t])}.`,
    result:voided?"Close is beyond invalidation. Thesis void, stand aside.":inZone?"Inside the discount zone. Entry is live.":d===1?(c[t]>entry?"Above the zone. Do not chase. Wait for the pullback to the 50% line.":"Below 78.6%, still above invalidation. Deep discount, entry live."):(c[t]<entry?"Below the zone. Do not chase. Wait for the bounce to the 50% line.":"Above 78.6%, still below invalidation. Deep premium, entry live."),
    state:voided?"stop":inZone?"pass":"wait"});
  if(voided)return {call:"STAND ASIDE",why:"thesis already void",trace,st,hist,A,B,aI,bI,d};
  // 6 divergence
  let div=false,divTxt="No prior swing to compare.";
  if(d===1){const p=sh.filter(i=>i<bI-K);if(p.length){const pi=last(p);div=h[bI]>h[pi]&&hist[bI]<hist[pi];divTxt=`B high ${F(h[bI])} vs prior swing high ${D(pi)} ${F(h[pi])}. Histogram ${F(hist[bI])} vs ${F(hist[pi])}.`;}}
  else{const p=sl.filter(i=>i<bI-K);if(p.length){const pi=last(p);div=l[bI]<l[pi]&&hist[bI]>hist[pi];divTxt=`B low ${F(l[bI])} vs prior swing low ${D(pi)} ${F(l[pi])}. Histogram ${F(hist[bI])} vs ${F(hist[pi])}.`;}}
  trace.push({rule:"R7",title:"MACD histogram divergence",inputs:divTxt,result:div?"Price made a new extreme, histogram did not. Exhaustion warning, confidence -12. Not a reversal by itself.":"No divergence. Momentum confirms the leg.",state:div?"flag":"pass"});
  // 7 event gate
  const nextF=FOMC.find(x=>x>=bars[t].d), blocked=nextF&&(nextF===bars[t].d||nextF===addDays(bars[t].d,1));
  trace.push({rule:"R8",title:"Event gate (FOMC only in v0)",inputs:`Next FOMC decision ${nextF||"none loaded"}.`,result:blocked?"Inside the FOMC window. No new fills today or tomorrow.":"Clear of the FOMC window.",state:blocked?"flag":"pass"});
  // 8 confidence
  const wAdj=wk.bias===st.bias?15:(wk.bias==="bull"||wk.bias==="bear")?-10:0, dAdj=div?-12:0;
  const conf=Math.max(30,Math.min(80,55+wAdj+dAdj));
  trace.push({rule:"R9",title:"Confidence",inputs:`Base 55, weekly ${wAdj>=0?"+":""}${wAdj}, divergence ${dAdj}. Capped between 30 and 80.`,result:`${conf} out of 100. Uncalibrated in v0.`,state:"info"});
  const call=d===1?"LONG":"SHORT";
  const why=`daily ${st.bias}, weekly ${wk.bias}`+(div?", MACD hist divergence":"");
  trace.push({rule:"R6",title:"Output",inputs:`Limit ${call.toLowerCase()} at ${F(entry)} (50% line). Stop on daily close beyond ${F(stop)}.`,
    result:`Target = 78.6% recovery from fill toward B ${F(B)}. Order lives 3 sessions, trade held up to 5 sessions.`,state:"pass"});
  return {call,d,A,B,aI,bI,entry,far,stop,weekly:wk.bias,div,conf,why,trace,st,hist,inZone,blocked};
}

function resolve(bars,t,s,FILL,HOLD){const n=bars.length,d=s.d;
  for(let f=t+1;f<=Math.min(t+FILL,n-1);f++){
    if(FOMC.includes(bars[f].d)||FOMC.includes(addDays(bars[f].d,1)))continue;
    const touched=d===1?bars[f].l<=s.entry:bars[f].h>=s.entry; if(!touched)continue;
    const fill=d===1?Math.min(bars[f].o,s.entry):Math.max(bars[f].o,s.entry);
    if((d===1&&bars[f].c<s.stop)||(d===-1&&bars[f].c>s.stop))return {status:"LOSS",fill,fday:f,exit:bars[f].c,xday:f};
    const tgt=fill+d*0.786*Math.abs(s.B-fill);
    for(let x=f+1;x<=Math.min(f+HOLD,n-1);x++){
      const hit=d===1?bars[x].h>=tgt:bars[x].l<=tgt, stp=d===1?bars[x].c<s.stop:bars[x].c>s.stop;
      if(hit&&stp)return {status:"LOSS",fill,fday:f,tgt,exit:bars[x].c,xday:x};
      if(hit)return {status:"WIN",fill,fday:f,tgt,exit:tgt,xday:x};
      if(stp)return {status:"LOSS",fill,fday:f,tgt,exit:bars[x].c,xday:x};}
    const last=Math.min(f+HOLD,n-1);
    if(f+HOLD>n-1)return {status:"OPEN",fill,fday:f,tgt,exit:bars[last].c,xday:last};
    const pnl=d*(bars[last].c-fill);return {status:pnl>0?"EXPIRED+":"EXPIRED-",fill,fday:f,tgt,exit:bars[last].c,xday:last};}
  return {status:t+FILL>n-1?"PENDING":"NO FILL"};}

function backtest(bars,start,end,FILL,HOLD){const out=[];let busy=-1;
  for(let t=0;t<bars.length;t++){if(bars[t].d<start||bars[t].d>end||t<=busy)continue;
    const s=analyze(bars,t);if(s.call==="STAND ASIDE")continue;
    const r=resolve(bars,t,s,FILL,HOLD);if(r.status==="NO FILL")continue;
    out.push({t,date:bars[t].d,call:s.call,conf:s.conf,entry:s.entry,stop:s.stop,why:s.why,...r,
      fillDate:r.fday!=null?bars[r.fday].d:null,exitDate:r.xday!=null?bars[r.xday].d:null,
      pnl:r.fill!=null?s.d*(r.exit-r.fill):null});
    busy=r.xday!=null?r.xday:t+FILL;}
  return out;}

function summary(tr){const c=tr.filter(x=>["WIN","LOSS","EXPIRED+","EXPIRED-"].includes(x.status));
  const w=c.filter(x=>x.status==="WIN").length,l=c.filter(x=>x.status==="LOSS").length,p=c.filter(x=>x.pnl>0).length;
  return {closed:c.length,win:w,loss:l,expired:c.length-w-l,hitRate:w+l?w/(w+l):null,profitRate:c.length?p/c.length:null,pts:c.reduce((a,x)=>a+x.pnl,0)};}

const api={RULES,FOMC,K,analyze,resolve,backtest,summary,macdHist,swings,structure,weekly,F};
if(typeof module!=="undefined")module.exports=api;else root.TWEngine=api;
})(typeof window!=="undefined"?window:globalThis);
