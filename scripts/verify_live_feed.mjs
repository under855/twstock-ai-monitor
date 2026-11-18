import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const text=fs.readFileSync('live-v091.js','utf8');
assert(text.includes('})();'),'LIVE_WRAPPER_MISSING');
const source=text.replace(/\}\)\(\);\s*$/, 'globalThis.__live_test__={parseBackup,parseStock,parseTaiex,quoteFreshness,intradayIndexState,paintIndex,setIndex:(x)=>{taiex=x;lastIndexMisStamp=Number(x?.stamp)||0},newerOrEqual,fetchMis,get interval(){return INTERVAL},get failureCount(){return misFailureCount},get retryAt(){return nextMisAttemptAt},get lastError(){return lastError},setMisReceivedAt:x=>{lastMisReceivedAt=x;lastIndexMisReceivedAt=x}};})();');
const epoch=Date.parse('2026-11-10T02:00:00Z');
class FrozenDate extends Date{
  constructor(...args){super(...(args.length?args:[epoch]))}
  static now(){return epoch}
}
let requests=0,reply=null;
const dom={taiex:{textContent:'43,300.32',className:''},taiexChg:{textContent:'+588.40｜TWSE MIS live',className:'s up'}};

const ctx={
  Date:FrozenDate,Intl,Number,String,Object,Array,JSON,Map,Set,Math,RegExp,Promise,Error,
  AbortController,setTimeout,clearTimeout,
  window:{},localStorage:{getItem:()=>null,setItem:()=>{}},
  document:{readyState:'loading',visibilityState:'visible',addEventListener:()=>{},getElementById:id=>dom[id]||null},
  addEventListener:()=>{},watchlist:()=>[],active:null,
  universeMap:new Map(),
  fetch:async()=>{requests++;return{ok:true,json:async()=>reply}}
};
vm.createContext(ctx);vm.runInContext(source,ctx,{timeout:4000});
const q=ctx.__live_test__;
assert.equal(q.interval,6000,'LIVE_INTERVAL_NOT_6_SECONDS');
assert.equal(q.intradayIndexState({date:'20261110',stamp:epoch-37*60000}),'stale','37_MIN_OLD_INDEX_MUST_BE_STALE');
assert.equal(q.intradayIndexState({date:'20261110',stamp:epoch-50000}),'stale','INDEX_NEEDS_RECENT_RELAY_CONFIRMATION');
q.setIndex({date:'20261110',price:43300.32,change:588.4,stamp:epoch-37*60000,time:'09:23:00',source:'TWSE MIS'});
q.paintIndex();
assert.equal(dom.taiex.textContent,'43,300.32','LAST_VERIFIED_INDEX_NOT_SHOWN_AS_DELAYED');
assert(dom.taiexChg.textContent.includes('37 分鐘')&&dom.taiexChg.textContent.includes('09:23:00')&&dom.taiexChg.textContent.includes('非即時'),'STALE_INDEX_MUST_EXPLICITLY_SHOW_DELAY');
q.setMisReceivedAt(epoch);
q.setIndex({date:'20261110',price:43381.74,change:669.82,stamp:epoch-20000,time:'09:59:40',source:'TWSE MIS'});
q.paintIndex();
assert.equal(dom.taiex.textContent,'43,381.74','FRESH_INDEX_NOT_RENDERED');
assert(dom.taiexChg.textContent.includes('09:59:40'),'FRESH_INDEX_SOURCE_TIME_MISSING');
assert.equal(q.intradayIndexState({date:'20261110',stamp:epoch-22*60000,source:'TWSE MIS'}),'stale','RECENT_HTTP_MUST_NOT_MARK_22_MIN_OLD_INDEX_FRESH');

assert.equal(q.quoteFreshness({date:'20261110',stamp:epoch-180000}),'older');
assert.equal(q.quoteFreshness({date:'20261110',stamp:epoch-30000}),'older');
assert.equal(q.quoteFreshness({date:'20261110',stamp:epoch+40000}),'future');
assert.equal(q.quoteFreshness({date:'20261109',stamp:epoch}),'unknown');
const old={stamp:epoch-20000,source:'TWSE MIS'},newer={stamp:epoch-10000,source:'TWSE MIS'};
assert.equal(q.newerOrEqual(old,newer),true,'NEW_TICK_REJECTED');
assert.equal(q.newerOrEqual(newer,old),false,'OLD_TICK_REPLACED_NEW');
const during=q.parseBackup({taiex:{date:'2026-11-10',close:10000,source:'TWSE MI_INDEX'},symbols:{'0050':{close:100,tradeDate:'2026-11-10',source:'TWSE MI_INDEX'}}},['0050']);
assert.equal(during.map.size,0,'CLOSING_BACKUP_USED_DURING_MARKET');
assert.equal(during.idx,null,'FUTURE_CLOSING_INDEX_DURING_MARKET');
reply={msgArray:[{c:'0050',d:'20261110',t:'10:00:00',z:'100'}]};
const stocksOnly=await q.fetchMis(['0050']);
assert.equal(stocksOnly.length,1,'STOCK_WITHOUT_INDEX_REJECTED');
assert.equal(requests,1,'UNNECESSARY_RETRY_FOR_VALID_STOCK');
reply={msgArray:[
  {c:'t00',d:'20261110',t:'09:54:00',tlong:epoch-360000,z:'10000'},
  {c:'0050',d:'20261110',t:'10:00:00',z:'100'}
]};
const filtered=await q.fetchMis(['0050']);
assert.equal(filtered.length,2,'VALID_SAME_DAY_MIS_INDEX_WRONGLY_REMOVED_AFTER_TIME_LIMIT');
assert(filtered.some(x=>x.c==='0050'),'VALID_STOCK_LOST_WITH_OLDER_INDEX');
reply={msgArray:[{c:'t00',d:'20261109',t:'13:30:00',z:'10000'}]};
await assert.rejects(()=>q.fetchMis(['0050']),/MIS quote payload has no today prices/);
assert.equal(requests,3,'MIS_ONE_REQUEST_PER_CYCLE_EXPECTED');
assert.equal(q.failureCount,1,'FAILURE_NOT_COUNTED');
assert.equal(q.retryAt,0,'NEXT_SIX_SECOND_CYCLE_SHOULD_RETRY');
assert(q.lastError.includes('no today prices'),'NO_ERROR_DIAGNOSTIC');
reply={msgArray:[{c:'0050',d:'20261110',t:'10:00:00',z:'100',trade:{z:'-',t:'09:59:59'}},{c:'t00',d:'20261110',t:'09:59:55',z:'42000',trade:{z:'-'}}]};
const recovered=await q.fetchMis(['0050']);
assert.equal(recovered.length,2,'PLACEHOLDER_TRADE_PRICE_HID_VALID_TOP_LEVEL_PRICE');
assert.equal(q.parseStock(recovered[0]).tradeTime,'10:00:00','FALLBACK_PRICE_MUST_USE_ITS_TIMESTAMP');
assert.equal(q.parseTaiex(recovered[1]).price,42000,'INDEX_TOP_LEVEL_PRICE_REJECTED');
console.log('LIVE_FEED_REGRESSION_PASS: 6s polling, separately acknowledged MIS receipts, unchanged exchange trades never invalidated by 90s, no fake close');
