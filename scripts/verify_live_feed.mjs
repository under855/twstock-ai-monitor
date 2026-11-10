import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const text=fs.readFileSync('live-v091.js','utf8');
assert(text.includes('})();'),'LIVE_WRAPPER_MISSING');
const source=text.replace(/\}\)\(\);\s*$/, 'globalThis.__live_test__={parseBackup,parseStock,parseTaiex,quoteFreshness,newerOrEqual,fetchMis,get interval(){return INTERVAL},get failureCount(){return misFailureCount},get retryAt(){return nextMisAttemptAt},get lastError(){return lastError}};})();');
const epoch=Date.parse('2026-11-10T02:00:00Z');
class FrozenDate extends Date{
  constructor(...args){super(...(args.length?args:[epoch]))}
  static now(){return epoch}
}
let requests=0,reply=null;
const ctx={
  Date:FrozenDate,Intl,Number,String,Object,Array,JSON,Map,Set,Math,RegExp,Promise,Error,
  AbortController,setTimeout,clearTimeout,
  window:{},localStorage:{getItem:()=>null,setItem:()=>{}},
  document:{readyState:'loading',visibilityState:'visible',addEventListener:()=>{}},
  addEventListener:()=>{},watchlist:()=>[],active:null,
  universeMap:new Map(),
  fetch:async()=>{requests++;return{ok:true,json:async()=>reply}}
};
vm.createContext(ctx);vm.runInContext(source,ctx,{timeout:4000});
const q=ctx.__live_test__;
assert.equal(q.interval,4000,'LIVE_INTERVAL_NOT_4_SECONDS');
assert.equal(q.quoteFreshness({date:'20261110',stamp:epoch-180000}),'older');
assert.equal(q.quoteFreshness({date:'20261110',stamp:epoch-30000}),'recent');
assert.equal(q.quoteFreshness({date:'20261110',stamp:epoch+40000}),'future');
assert.equal(q.quoteFreshness({date:'20261109',stamp:epoch}),'unknown');
const old={stamp:epoch-20000,source:'TWSE MIS'},newer={stamp:epoch-10000,source:'TWSE MIS'};
assert.equal(q.newerOrEqual(old,newer),true,'NEW_TICK_REJECTED');
assert.equal(q.newerOrEqual(newer,old),false,'OLD_TICK_REPLACED_NEW');
const during=q.parseBackup({taiex:{date:'2026-11-10',close:10000,source:'TWSE MI_INDEX'},symbols:{'0050':{close:100,tradeDate:'2026-11-10',source:'TWSE MI_INDEX'}}},['0050']);
assert.equal(during.map.size,0,'CLOSING_BACKUP_USED_DURING_MARKET');
assert.equal(during.idx,null,'FUTURE_CLOSING_INDEX_DURING_MARKET');
reply={msgArray:[{c:'0050',d:'20261110',t:'10:00:00',z:'100'}]};
await assert.rejects(()=>q.fetchMis(['0050']),/MIS index quote missing/);
assert.equal(requests,2,'MIS_FAILOVER_NOT_ATTEMPTED');
assert.equal(q.failureCount,1,'FAILURE_NOT_COUNTED');
assert(q.retryAt>epoch,'NO_RETRY_BACKOFF');
assert(q.lastError.includes('index quote missing'),'NO_ERROR_DIAGNOSTIC');
console.log('LIVE_FEED_REGRESSION_PASS: 4s loop, per-stock freshness, no intraday closing data, strict index, failover, backoff');
