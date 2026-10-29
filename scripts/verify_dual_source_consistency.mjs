const CODES=['0050','3711','3293','2002','00878','00919'];
const MIS='https://proxy.cors.dev/https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch='+encodeURIComponent('tse_t00.tw|tse_0050.tw|tse_3711.tw|otc_3293.tw|tse_2002.tw|tse_00878.tw|tse_00919.tw')+'&json=1&delay=0&_=';
const BACKUP='https://under855.github.io/twstock-ai-monitor/data/latest.json?_=';
const LIVEJS='https://under855.github.io/twstock-ai-monitor/live-v091.js?_=';

const n=v=>{if(v==null||v===''||v==='-'||v==='--')return null;const x=Number(String(v).replaceAll(',','').replaceAll('+',''));return Number.isFinite(x)?x:null};
const compact=v=>String(v||'').replaceAll('-','').replaceAll('/','');
const sourcePriority=s=>/MIS/.test(String(s||''))?2:1;
const stamp=(d,t)=>Date.parse(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${t}+08:00`);
async function json(url){const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0'},cache:'no-store'});if(!r.ok)throw new Error(`${r.status} ${url}`);return r.json()}
async function text(url){const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0'},cache:'no-store'});if(!r.ok)throw new Error(`${r.status} ${url}`);return r.text()}
function newer(a,b){if(!a)return b;if(!b)return a;if(b.stamp>a.stamp)return b;if(b.stamp<a.stamp)return a;return sourcePriority(b.source)>sourcePriority(a.source)?b:a}
function parseMis(j){const out={};let idx=null;for(const m of j.msgArray||[]){const c=String(m.c||'');const d=String(m.d||'');if(c==='t00'){const p=n(m.z),t=String(m.t||m['%']||'');if(p!=null&&/^\d{8}$/.test(d)&&/^\d{2}:\d{2}:\d{2}$/.test(t))idx={code:'TAIEX',date:d,time:t,price:p,stamp:stamp(d,t),source:'MIS'};continue}if(!CODES.includes(c))continue;const tr=m.trade||{},p=n(tr.z)??n(m.z),t=String(tr.t||m.t||'');if(p!=null&&/^\d{8}$/.test(d)&&/^\d{2}:\d{2}:\d{2}$/.test(t))out[c]={code:c,date:d,time:t,price:p,stamp:stamp(d,t),source:'MIS'}}return {out,idx}}
function parseBackup(j){const out={};const ti=j.taiex||{};let idx=null;const td=compact(ti.date),tt=/^\d{2}:\d{2}:\d{2}$/.test(String(ti.time||''))?String(ti.time):'13:33:00';if(/^\d{8}$/.test(td)&&n(ti.close)!=null)idx={code:'TAIEX',date:td,time:tt,price:n(ti.close),stamp:stamp(td,tt),source:'BACKUP'};for(const c of CODES){const x=j.symbols?.[c];if(!x)continue;const d=compact(x.tradeDate);if(/^\d{8}$/.test(d)&&n(x.close)!=null)out[c]={code:c,date:d,time:'13:30:00',price:n(x.close),stamp:stamp(d,'13:30:00'),source:'BACKUP'}}return {out,idx}}
function validateTruth(m,b){for(const c of CODES){if(!b[c])throw new Error(`backup missing ${c}`);if(!/^\d{8}$/.test(b[c].date))throw new Error(`backup bad date ${c}`);if(m[c]&&m[c].date===b[c].date&&Math.abs(m[c].price-b[c].price)>1e-8)throw new Error(`same-date mismatch ${c}: MIS ${m[c].price} vs BACKUP ${b[c].price}`)}}
function merged(m,b,mi,bi){const out={TAIEX:newer(bi,mi)};for(const c of CODES)out[c]=newer(b[c],m[c]);return out}
function stableKey(x){return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,v?{date:v.date,time:v.time,price:v.price,source:v.source}:null]))}
async function pass(label){const now=Date.now();const [mj,bj,js]=await Promise.all([json(MIS+now),json(BACKUP+now),text(LIVEJS+now)]);for(const required of ["const VERSION='0.9.4';","const INTERVAL=15000;","const BACKUP_INTERVAL=60000;","newerOrEqual(oldv,newv)","pollBackup(true)"])if(!js.includes(required))throw new Error(`runtime contract missing ${required}`);const M=parseMis(mj),B=parseBackup(bj);if(!M.idx)throw new Error('MIS TAIEX missing');if(!B.idx)throw new Error('backup TAIEX missing');validateTruth(M.out,B.out);if(M.idx.date===B.idx.date&&Math.abs(M.idx.price-B.idx.price)>1e-8)throw new Error(`same-date TAIEX mismatch ${M.idx.price} vs ${B.idx.price}`);const selected=merged(M.out,B.out,M.idx,B.idx);for(const [k,v] of Object.entries(selected))if(!v)throw new Error(`no selected value ${k}`);console.log(label,JSON.stringify({mis:stableKey({TAIEX:M.idx,...M.out}),backup:stableKey({TAIEX:B.idx,...B.out}),selected:stableKey(selected)}));return stableKey(selected)}

const results=[];
for(let i=1;i<=3;i++){results.push(await pass(`PASS_${i}`));if(i<3)await new Promise(r=>setTimeout(r,2500))}
for(let i=1;i<results.length;i++)for(const k of Object.keys(results[0])){const a=results[i-1][k],b=results[i][k];if(!a||!b)throw new Error(`missing selected ${k}`);if(b.date<a.date)throw new Error(`date regressed ${k}`);if(b.date===a.date&&b.time<a.time)throw new Error(`time regressed ${k}`)}
console.log('DUAL_SOURCE_CONSISTENCY_PASS x3');
