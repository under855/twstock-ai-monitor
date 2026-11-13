(() => {
  'use strict';
  // One per-tab fetch for the shared official snapshot. This is NOT a live quote.
  // A fulfilled result is reused for up to 60 seconds, never indefinitely.
  const MAX_AGE_MS=60000;
  let value=null, fetchedAt=0, pending=null;
  let networkRequests=0, hits=0;
  window.__TW_LATEST_JSON__=function(){
    const now=Date.now();
    if(value!==null&&now-fetchedAt<MAX_AGE_MS){hits++;return Promise.resolve(value)}
    if(pending){hits++;return pending}
    // All callers intentionally use this same URL and a single in-flight promise.
    // No caller can accidentally force a separate cache-busting request.
    const ac=new AbortController();
    const timeout=setTimeout(()=>ac.abort(),10000);
    networkRequests++;
    const request=fetch('./data/latest.json?_='+now,{cache:'no-store',signal:ac.signal})
      .then(response=>{if(!response.ok)throw Error('latest.json HTTP '+response.status);return response.json()})
      .then(json=>{
        if(!json||typeof json!=='object'||Array.isArray(json)||!json.symbols||typeof json.symbols!=='object')throw Error('latest.json 格式異常');
        value=json;fetchedAt=Date.now();return json;
      })
      .finally(()=>{clearTimeout(timeout);pending=null});
    pending=request;
    return request;
  };
  // Read-only diagnostics for browser acceptance; never exposes private watchlists.
  window.__TW_LATEST_FETCH_STATS__=()=>({networkRequests,cacheHits:hits,fetchedAt,pending:!!pending});
})();
