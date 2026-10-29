from pathlib import Path
p=Path('extras-v090.js')
s=p.read_text(encoding='utf-8')
old="""    let hist=card.querySelector('#historyChart');if(!hist){hist=document.createElement('canvas');hist.id='historyChart';hist.className='big';hist.width=820;hist.height=260;hist.style.display='none';live.insertAdjacentElement('afterend',hist)}
    const modes=[['today','今日'],['5','5日'],['20','20日'],['60','60日']];
"""
new="""    let hist=card.querySelector('#historyChart');if(!hist){hist=document.createElement('canvas');hist.id='historyChart';hist.className='big';hist.width=820;hist.height=260;hist.style.display='none';live.insertAdjacentElement('afterend',hist)}
    let histMsg=card.querySelector('#historyChartMsg');if(!histMsg){histMsg=document.createElement('div');histMsg.id='historyChartMsg';histMsg.className='muted small';histMsg.style.display='none';hist.insertAdjacentElement('afterend',histMsg)}
    const modes=[['today','今日'],['5','5日'],['20','20日'],['60','60日']];
"""
if old not in s: raise SystemExit('history canvas anchor missing')
s=s.replace(old,new,1)
old2="""      if(mode==='today'){live.style.display='block';hist.style.display='none';displayTitle.textContent='今日盤中即時走勢';return}
      const count=Number(mode),h=(historyCache?.[key]||[]).slice(-count);live.style.display='none';hist.style.display='block';displayTitle.textContent=`近 ${count} 個交易日走勢`;
      if(h.length>=2){draw(hist,h,false,priceFor(key));if(msg)msg.textContent=`近 ${Math.min(count,h.length)} 個交易日｜歷史分析圖`}
      else if(msg)msg.textContent='歷史資料不足，暫時無法繪製這個區間。';
"""
new2="""      if(mode==='today'){live.style.display='block';hist.style.display='none';if(msg)msg.style.display='';histMsg.style.display='none';displayTitle.textContent='今日盤中即時走勢';return}
      const count=Number(mode),h=(historyCache?.[key]||[]).slice(-count);live.style.display='none';hist.style.display='block';if(msg)msg.style.display='none';histMsg.style.display='';displayTitle.textContent=`近 ${count} 個交易日走勢`;
      if(h.length>=2){draw(hist,h,false,priceFor(key));histMsg.textContent=`近 ${Math.min(count,h.length)} 個交易日｜歷史分析圖`}
      else histMsg.textContent='歷史資料不足，暫時無法繪製這個區間。';
"""
if old2 not in s: raise SystemExit('chart mode anchor missing')
s=s.replace(old2,new2,1)
p.write_text(s,encoding='utf-8')
print('detail chart message isolated')
