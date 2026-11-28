import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const dividends=fs.readFileSync('dividend-enhance.js','utf8');
const charts=fs.readFileSync('extras-v090.js','utf8');
const response={items:[{code:'0050',name:'元大台灣50',exDate:'2026/11/17',cashDividend:1.25,source:'TWSE ETF 收益分配'}]};
let calls=0;
const context={
  show:async()=>{},window:{},document:{visibilityState:'visible',getElementById:()=>null},
  location:{search:''},URLSearchParams,Map,Promise,Date,Array,Object,Number,String,JSON,
  allEx:[],N:v=>Number(v),F:v=>String(v),dateObj:v=>new Date(v),
  fetch:async u=>{
    assert(String(u).startsWith('./data/dividends.json?ts='));
    calls++;
    return {ok:true,json:async()=>response};
  },
};
context.window=context;
vm.createContext(context);
vm.runInContext(dividends,context,{filename:'dividend-enhance.js'});
assert.equal(typeof context.__TW_DIVIDEND_FEED__,'function');
const [a,b]=await Promise.all([context.__TW_DIVIDEND_FEED__(),context.__TW_DIVIDEND_FEED__()]);
assert.equal(calls,1,'ETF/corporate callers must share only one network request');
assert.equal(a.length,b.length);
await context.__TW_DIVIDEND_FEED__();
assert.equal(calls,1,'Cache must be reused until explicit refresh');
assert(!charts.includes('setInterval(()=>{if(stockTradeOpen())run()},4000)'),'Redundant chart DOM scan still active');
assert(!charts.includes('refreshTodayFallbackCharts(true).catch(()=>{})},30000'),'Forced half-minute source fetch still active');
assert(charts.includes('refreshTodayFallbackCharts(false).catch(()=>{})},60000'),'Shared minute-cadence chart fallback missing');
assert(charts.includes('new MutationObserver'),'DOM mutation-based chart refresh must be retained');
assert(charts.includes('window.__TW_DRAW_MAIN_TODAY__'),'Live-feed chart redraw connection must be retained');
console.log('SHARED_DIVIDEND_AND_CHART_TIMER_PASS',{dividendFetches:calls});
