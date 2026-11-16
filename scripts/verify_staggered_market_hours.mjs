import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const js=fs.readFileSync('live-v091.js','utf8');
assert(js.includes('const INTERVAL=6000;'),'PRIMARY_NOT_6_SECONDS');
assert(js.includes('const SECONDARY_INTERVAL=10000;'),'SECONDARY_NOT_10_SECONDS');
assert(js.includes('const SECONDARY_OFFSET=3000;'),'SECONDARY_NOT_STAGGERED');
assert(js.includes('setInterval(()=>poll(false),INTERVAL)'),'PRIMARY_SCHEDULER_MISSING');
assert(js.includes('setTimeout(()=>{pollSecondary();setInterval(pollSecondary,SECONDARY_INTERVAL)},SECONDARY_OFFSET)'),'SECONDARY_SCHEDULER_MISSING');
const text=js.replace(/\}\)\(\);\s*$/, "window.__CHECK__={poll,pollSecondary,pollBackup,pollIndexSnapshot,marketOpen,postCloseWindow,officialCloseComplete,fetchMis,getQuote:c=>quotes.get(c),getIndex:()=>taiex,acceptQuote,acceptIndex,getPrimaryFailure:()=>misFailureCount,getSecondaryError:()=>secondaryLastError};})();");
assert(text.includes('window.__CHECK__='),'TEST_HOOK_MISSING');
let epoch=Date.parse('2026-11-16T02:15:00Z'),req=[],mode='secondary-online';
class FixedDate extends Date{
  constructor(...args){super(...(args.length?args:[epoch]))}
  static now(){return epoch}
}
const clock={Date:FixedDate,Intl,Number,String,Object,Array,JSON,Map,Set,Math,RegExp,Promise,Error,
  AbortController,setTimeout,clearTimeout,
  window:{},localStorage:{getItem:()=>null,setItem:()=>{}},
  document:{readyState:'loading',visibilityState:'visible',addEventListener:()=>{},querySelectorAll:()=>[],getElementById:()=>null},
  addEventListener:()=>{},watchlist:()=>['0050'],active:null,universeMap:new Map(),universeQuote:()=>null,snapshotQuote:()=>null,
  fetch:async(url)=>{
    req.push(url);
    if(url.includes('api.allorigins.win')){
      if(mode==='secondary-down')throw Error('secondary failure');
      return {ok:true,json:async()=>({msgArray:[{c:'t00',d:'20261116',t:'10:14:50',z:'42010',y:'41900'},{c:'0050',d:'20261116',t:'10:14:50',z:'100.25',y:'99'}]})};
    }
    if(url.includes('proxy.cors.dev'))throw Error('primary failure');
    return {ok:true,json:async()=>({date:'2026-11-16',generatedAt:'2026-11-16T10:14:00+08:00',source:'TWSE MIS official snapshots',stocks:{},taiex:[]})};
  }
};
vm.createContext(clock);vm.runInContext(text,clock,{timeout:5000});
const q=clock.window.__CHECK__;
assert(q.marketOpen(),'EXPECTED_MON_MORNING_MARKET');
await q.pollSecondary();
assert(req.some(x=>x.includes('api.allorigins.win')),'SECONDARY_GATEWAY_NOT_USED');
assert(!req.some(x=>x.includes('proxy.cors.dev')),'SECONDARY_USED_PRIMARY_GATEWAY');
assert.equal(q.getQuote('0050')?.price,100.25,'SECONDARY_QUOTE_NOT_APPLIED');
assert.equal(q.getIndex()?.price,42010,'SECONDARY_INDEX_NOT_APPLIED');
assert.equal(q.getPrimaryFailure(),0,'SECONDARY_CHANGED_PRIMARY_FAILURES');
mode='secondary-down';
await q.pollSecondary();
assert.equal(q.getQuote('0050')?.price,100.25,'SECONDARY_OUTAGE_CLEARED_VALID_QUOTE');
assert(q.getSecondaryError(),'SECONDARY_FAILURE_NOT_REPORTED');
epoch=Date.parse('2026-11-16T07:00:00Z'); // 15:00 Asia/Taipei
assert(!q.marketOpen()&&q.postCloseWindow(),'EXPECTED_POST_CLOSE');
const prev=req.length;
await q.poll();await q.pollSecondary();await q.pollIndexSnapshot();
assert.equal(req.length,prev,'MARKET_HOURS_GUARD_FAILED');
epoch=Date.parse('2026-11-16T13:00:00Z'); // 21:00 Asia/Taipei
assert(!q.postCloseWindow(),'POST_CLOSE_WINDOW_TOO_LONG');
const later=req.length;
await q.pollBackup(true);
assert.equal(req.length,later,'STOCK_BACKUP_CONTINUES_AFTER_EVENING_CUTOFF');
epoch=Date.parse('2026-11-14T02:15:00Z'); // Saturday
assert(!q.marketOpen()&&!q.postCloseWindow(),'WEEKEND_TREATED_AS_OPEN');
await q.poll();await q.pollSecondary();await q.pollBackup(true);await q.pollIndexSnapshot();
assert.equal(req.length,later,'WEEKEND_GENERATED_STOCK_REQUESTS');
epoch=Date.parse('2026-12-25T02:15:00Z'); // 2026 Christmas exchange holiday
assert(!q.marketOpen()&&!q.postCloseWindow(),'2026_OFFICIAL_HOLIDAY_NOT_BLOCKED');
await q.poll();await q.pollSecondary();await q.pollBackup(true);await q.pollIndexSnapshot();
assert.equal(req.length,later,'2026_HOLIDAY_GENERATED_STOCK_REQUESTS');
epoch=Date.parse('2027-02-08T02:15:00Z'); // 2027 Lunar New Year exchange holiday
assert(!q.marketOpen()&&!q.postCloseWindow(),'2027_OFFICIAL_HOLIDAY_NOT_BLOCKED');
await q.poll();await q.pollSecondary();await q.pollBackup(true);await q.pollIndexSnapshot();
assert.equal(req.length,later,'2027_HOLIDAY_GENERATED_STOCK_REQUESTS');
console.log('STAGGERED_MARKET_HOURS_PASS: 6s/10s stagger, secondary independent, primary failure isolation, close 15:00 / 21:00 and weekends stop stock network requests');
