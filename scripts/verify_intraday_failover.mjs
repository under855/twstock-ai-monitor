import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync('live-v091.js','utf8').replace(/\}\)\(\);\s*$/, "window.__TEST__={parseIntradaySnapshot,pollIntradayBackup,parse,fetchMis,acceptQuote,acceptIndex,quoteProblem,getStock:c=>quotes.get(c),getIndex:()=>taiex,setError:x=>lastError=x};})();");
assert(source.includes('window.__TEST__='),'TEST_HOOK_MISSING');
let clock=Date.parse('2026-11-16T02:15:00Z');
class TestDate extends Date{
  constructor(...args){super(...(args.length?args:[clock]))}
  static now(){return clock}
}
const observed=[];
let response=null;
const ctx={
  Date:TestDate,Intl,Number,String,Object,Array,JSON,Map,Set,Math,RegExp,Promise,Error,
  AbortController,setTimeout,clearTimeout,
  window:{},localStorage:{getItem:()=>null,setItem:()=>{}},
  document:{readyState:'loading',visibilityState:'visible',addEventListener:()=>{},querySelectorAll:()=>[],getElementById:()=>null},
  addEventListener:()=>{},watchlist:()=>['0050','2330'],active:null,universeMap:new Map(),
  universeQuote:()=>null,snapshotQuote:()=>null,
  fetch:async url=>{observed.push(url);return {ok:true,json:async()=>response}}
};
vm.createContext(ctx);
vm.runInContext(source,ctx,{timeout:4000});
const q=ctx.window.__TEST__;
assert(q,'TEST_API_UNAVAILABLE');
const point=(price,age=20000)=>({stamp:clock-age,close:price,time:'10:14:40',source:'TWSE MIS'});
const good={date:'2026-11-16',generatedAt:'2026-11-16T10:15:00+08:00',source:'TWSE MIS official snapshots',stocks:{'0050':[point(100)],'2330':[point(2200)],'2002':[point(20)]},taiex:[point(42000)]};
let r=q.parseIntradaySnapshot(good,['0050','2330']);
assert.equal(r.map.size,2,'VALID_BACKUP_NOT_PARSED');
assert.equal(r.map.get('0050').price,100);
assert.equal(r.map.get('0050').change,null,'FABRICATED_CHANGE');
assert.equal(r.map.get('0050').volume,null,'FABRICATED_VOLUME');
assert.equal(r.idx.price,42000);
assert(!q.parseIntradaySnapshot(good,['0050']).map.has('2330'),'UNREQUESTED_SYMBOL_ACCEPTED');
assert.throws(()=>q.parseIntradaySnapshot({...good,date:'2026-11-13'},['0050']),/日期/);
assert.equal(q.parseIntradaySnapshot({...good,stocks:{'0050':[point(100,180000)]},taiex:[]},['0050']).map.size,1,'THREE_MINUTE_DELAYED_BACKUP_WRONGLY_REJECTED');
assert.equal(q.parseIntradaySnapshot({...good,stocks:{'0050':[point(100,45*60000)]},taiex:[]},['0050']).map.size,1,'FORTY_FIVE_MINUTE_BACKUP_WRONGLY_REJECTED');
assert.equal(q.parseIntradaySnapshot({...good,stocks:{'0050':[point(100,121*60000)]},taiex:[]},['0050']).map.size,1,'VERIFIED_SAME_DAY_QUOTE_OLDER_THAN_TWO_HOURS_REJECTED');
assert.equal(q.parseIntradaySnapshot({...good,stocks:{'0050':[point(100,9*3600000)]},taiex:[]},['0050']).map.size,1,'VERIFIED_SAME_DAY_QUOTE_OLDER_THAN_NINE_HOURS_REJECTED');
assert.equal(q.parseIntradaySnapshot({...good,stocks:{'0050':[point(100,24*3600000)]},taiex:[]},['0050']).map.size,0,'PREVIOUS_DAY_SNAPSHOT_ACCEPTED_AS_TODAY');
assert.equal(q.parseIntradaySnapshot({...good,stocks:{'0050':[{...point(100),source:'wrong'}]},taiex:[]},['0050']).map.size,0,'UNVERIFIED_SOURCE_ACCEPTED');
assert.equal(q.parseIntradaySnapshot({...good,stocks:{'0050':[point(100,-90000)]},taiex:[]},['0050']).map.size,0,'FUTURE_ACCEPTED');
response=good;
assert.equal(await q.pollIntradayBackup(true),true,'BACKUP_REQUEST_FAILED');
assert.equal(q.getStock('0050').price,100,'BACKUP_DID_NOT_UPDATE_QUOTE');
assert.equal(q.getIndex().price,42000,'BACKUP_DID_NOT_UPDATE_INDEX');
q.setError('Primary MIS connection failed');
assert.equal(q.quoteProblem('0050',q.getStock('0050')),'','PRIMARY_FAILURE_MASKED_HEALTHY_BACKUP');
assert.match(q.getStock('0050').source,/延遲行情/,'BACKUP_NOT_EXPLICITLY_DELAYED');
const before=observed.length;
await q.pollIntradayBackup(false);
assert.equal(observed.length,before,'BACKUP_THROTTLE_NOT_ENFORCED');
response={msgArray:[
 {c:'t00',d:'20261116',t:'10:14:55',z:'42050',y:'41900'},
 {c:'0050',d:'20261116',t:'10:14:55',z:'101',y:'99'}
]};
const mis=q.parse(await q.fetchMis(['0050']));
assert.equal(mis.map.get('0050').price,101);
assert(q.acceptQuote(mis.map.get('0050')),'RECOVERED_PRIMARY_TICK_REJECTED');
assert(q.acceptIndex(mis.idx),'RECOVERED_PRIMARY_INDEX_REJECTED');
assert.equal(q.getStock('0050').price,101,'PRIMARY_NOT_RESTORED');
clock+=92000;
assert.equal(q.quoteProblem('0050',q.getStock('0050')),'','UNCHANGED_TRADE_MUST_NOT_BECOME_INVALID_AFTER_90_SECONDS');
response=good;
assert.equal(await q.pollIntradayBackup(true),true,'VERIFIED_DELAYED_BACKUP_WRONGLY_REJECTED');
assert.equal(q.getStock('0050').price,101,'EXPIRED_BACKUP_OVERWROTE_NEWER_PRIMARY');
console.log('DUAL_SOURCE_REGRESSION_PASS: parsing, provenance, full same-day dated historical backup, independent backup, failover, throttle, primary recovery');
