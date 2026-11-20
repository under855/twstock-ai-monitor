#!/usr/bin/env python3
"""Verified BOT gold passbook + CPC weekly prices only. No market live engine access."""
import argparse
import datetime as dt
import json
import os
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

DEST=Path("data/gold-oil.json")
TZ=ZoneInfo("Asia/Taipei")
BOT="https://rate.bot.com.tw/gold?Lang=zh-TW"
CPC="https://vipmbr.cpc.com.tw/opendata/sixtypeoillistprice"
def get(url):
    req=Request(url,headers={"User-Agent":"Mozilla/5.0 (compatible; verified-market-board/1.0)","Accept":"text/html,application/json"})
    with urlopen(req,timeout=17) as response:
        raw=response.read(2_000_000)
        return raw.decode("utf-8-sig")
class Cells(HTMLParser):
    def __init__(self):
        super().__init__();self.rows=[];self.row=None;self.cell=None;self.text=[]
    def handle_starttag(self,tag,attrs):
        if tag=="tr":self.row=[]
        if tag in ("td","th") and self.row is not None:self.cell=[]
    def handle_data(self,data):
        self.text.append(data)
        if self.cell is not None:self.cell.append(data)
    def handle_endtag(self,tag):
        if tag in ("td","th") and self.cell is not None and self.row is not None:self.row.append(" ".join("".join(self.cell).split()));self.cell=None
        if tag=="tr" and self.row is not None:self.rows.append(self.row);self.row=None
def parse_gold(html):
    doc=Cells();doc.feed(html)
    text=" ".join(" ".join(doc.text).split())
    tm=re.search(r"(?:掛牌時間|牌價時間|報價時間|Quoted\s*Time)\s*[：:]\s*(20\d{2})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2}):(\d{2})",text,re.I)
    if not tm:raise ValueError("BOT quote time missing")
    quote=dt.datetime(*map(int,tm.groups()),tzinfo=TZ)
    if quote>dt.datetime.now(TZ)+dt.timedelta(minutes=10):raise ValueError("BOT future quote")
    selling=buying=None;in_passbook=False
    if "黃金存摺" not in text and "Gold Passbook" not in text:raise ValueError("BOT passbook page not confirmed")
    for row in doc.rows:
        line=" ".join(row)
        if "1 公克" in line or "1 g" in line or re.search(r"黃金存摺|Gold\s*Passbook",line,re.I):in_passbook=True
        if not in_passbook:continue
        if "黃金條塊" in line or re.search(r"Gold\s*Bar|Gold\s*Holobar",line,re.I):break
        m=re.search(r"(?<!\d)(\d{1,3}(?:,\d{3})+|\d{4,6})(?!\d)",line)
        if not m:continue
        price=int(m.group(1).replace(",",""))
        if re.search(r"(?:本行)?賣出|Selling",line,re.I) and selling is None:selling=price
        if re.search(r"(?:本行)?買進|Buying",line,re.I) and buying is None:buying=price
        if selling is not None and buying is not None:break
    if not (selling and buying and 1000<buying<selling<30000):raise ValueError("BOT passbook buy/sell invalid or absent")
    return {"bankBuy":buying,"bankSell":selling,"unit":"TWD/g","quoteAt":quote.isoformat(timespec="minutes"),"source":"BOT gold passbook","sourceUrl":BOT}
def date_str(value):
    s=str(value or "").strip()
    if re.fullmatch(r"\d{7}",s):
        return dt.date(1911+int(s[:3]),int(s[3:5]),int(s[5:7])).isoformat()
    if re.fullmatch(r"\d{8}",s):
        return dt.date(int(s[:4]),int(s[4:6]),int(s[6:8])).isoformat()
    m=re.search(r"(\d{2,4})[/-](\d{1,2})[/-](\d{1,2})",s)
    if not m:raise ValueError("CPC effective date missing")
    year,month,day=map(int,m.groups())
    if year<1911:year+=1911
    return dt.date(year,month,day).isoformat()
def parse_oil(payload):
    if isinstance(payload,dict):
        for key in ("data","Data","items","Items","result","Result"):
            if isinstance(payload.get(key),list):payload=payload[key];break
    if not isinstance(payload,list):raise ValueError("CPC dataset is not list")
    result={}
    for row in payload:
        if not isinstance(row,dict):continue
        kind=str(row.get("型別名稱",row.get("型別",row.get("TypeName",""))))
        if kind and "汽柴油" not in kind:continue
        name=str(row.get("產品名稱",row.get("品名",row.get("ProductName","")))).replace(" ","")
        unit=str(row.get("計價單位",row.get("Unit","")))
        if unit and not ("公升" in unit or "L" in unit.upper()):continue
        code=None
        for key in ("92","95","98"):
            if re.search(key+r".{0,5}(?:無鉛|汽油)|(?:無鉛|汽油).{0,5}"+key,name):code=key;break
        if ("超級柴油" in name or "高級柴油" in name) and code is None:code="diesel"
        if not code:continue
        price=float(str(row.get("參考牌價_金額",row.get("參考牌價",row.get("Price","")))).replace(",",""))
        if not 5<price<80:continue
        when=date_str(row.get("牌價生效日期",row.get("生效日期",row.get("EffectiveDate",""))))
        record=result.setdefault(when,{})
        record[code]=round(price,2)
    full=[(k,v) for k,v in result.items() if all(x in v for x in ("92","95","98","diesel"))]
    if not full:raise ValueError("CPC four verified retail fuel prices absent")
    effective,prices=max(full,key=lambda x:x[0])
    current=dt.datetime.now(TZ).date()
    when=dt.date.fromisoformat(effective)
    if when>current+dt.timedelta(days=9) or when<current-dt.timedelta(days=60):
        raise ValueError("CPC effective date outside acceptable window")
    return {"effectiveFrom":effective,"prices":prices,"unit":"TWD/L","source":"CPC official open data","sourceUrl":CPC}
def update_oil(old,new):
    old=old if isinstance(old,dict) else {}
    previous=[x for x in old.get("history",[]) if isinstance(x,dict) and x.get("effectiveFrom") and isinstance(x.get("prices"),dict)]
    if old.get("effectiveFrom") and isinstance(old.get("prices"),dict):previous.append({"effectiveFrom":old["effectiveFrom"],"prices":old["prices"]})
    previous.append({"effectiveFrom":new["effectiveFrom"],"prices":new["prices"]})
    unique={x["effectiveFrom"]:x for x in previous}
    dates=sorted(unique)
    history=[unique[d] for d in dates[-12:]]
    comparable=next((unique[d]["prices"] for d in reversed(dates) if d<new["effectiveFrom"]),None)
    change={k:round(new["prices"][k]-comparable[k],2) for k in new["prices"]} if comparable and all(k in comparable for k in new["prices"]) else None
    return {**new,"history":history,"change":change,"comparisonDate":max((d for d in dates if d<new["effectiveFrom"]),default=None)}
def test():
    gold='<div>黃金存摺｜掛牌時間：2026/11/20 11:55</div><table><tr><td>1 公克</td></tr><tr><td>黃金存摺</td><td>賣出</td><td>3,790</td></tr><tr><td></td><td>買進</td><td>3,747</td></tr><tr><td>黃金條塊</td><td>賣出</td><td>999999</td></tr></table>'
    g=parse_gold(gold);assert g["bankSell"]==3790 and g["bankBuy"]==3747
    data=[{"型別名稱":"汽柴油零售","產品名稱":n,"計價單位":"元/公升","參考牌價_金額":v,"牌價生效日期":"2026/11/16"} for n,v in [("92無鉛汽油",31.2),("95無鉛汽油",32.7),("98無鉛汽油",34.7),("超級柴油",29.9)]]
    o=parse_oil(data);assert o["prices"]["95"]==32.7 and o["effectiveFrom"]=="2026-11-16"
    x=update_oil({"effectiveFrom":"2026-11-09","prices":{"92":31.1,"95":32.6,"98":34.6,"diesel":29.9}},o)
    assert x["change"]["95"]==0.1 and x["change"]["diesel"]==0
    assert date_str("1151116")=="2026-11-16"
    try:parse_oil(data[:2]);raise AssertionError("missing fuels accepted")
    except ValueError:pass
    try:parse_gold("<html>error</html>");raise AssertionError("invalid gold accepted")
    except ValueError:pass
    print("GOLD_OIL_OFFICIAL_PARSER_SELFTEST_PASS")
def main():
    parser=argparse.ArgumentParser();parser.add_argument("--self-test",action="store_true");args=parser.parse_args()
    if args.self_test:test();return
    old=json.loads(DEST.read_text("utf-8")) if DEST.exists() else {"gold":None,"oil":None}
    new={"gold":old.get("gold"),"oil":old.get("oil")}
    failures=[]
    try:
        candidate=parse_gold(get(BOT))
        previous=old.get("gold") if isinstance(old.get("gold"),dict) else None
        if not previous or candidate["quoteAt"]>=str(previous.get("quoteAt","")):new["gold"]=candidate
        print("GOLD_OFFICIAL_VERIFIED",candidate["quoteAt"])
    except Exception as e:failures.append("BOT: "+str(e))
    try:new["oil"]=update_oil(old.get("oil"),parse_oil(json.loads(get(CPC))));print("CPC_OFFICIAL_VERIFIED",new["oil"]["effectiveFrom"])
    except Exception as e:failures.append("CPC: "+str(e))
    # Never overwrite last verified data with errors or invented quotations.
    if new!=old:
        DEST.parent.mkdir(exist_ok=True,parents=True)
        DEST.write_text(json.dumps(new,ensure_ascii=False,indent=2,sort_keys=True)+"\n","utf-8")
        print("COMMODITY_DATA_UPDATED")
    else:print("COMMODITY_DATA_UNCHANGED")
    for failure in failures:print("SOURCE_UNAVAILABLE_RETAIN_PREVIOUS:",failure)
    # Unavailable external source is not an application failure: do not create error-email flood.
if __name__=="__main__":main()
