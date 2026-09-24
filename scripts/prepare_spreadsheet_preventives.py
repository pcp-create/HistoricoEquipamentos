"""Prepare private, auditable Excel-derived evidence. No database writes."""
import json,re,unicodedata,datetime,collections,pathlib
D=pathlib.Path('.m8/spreadsheet-preventives');today=datetime.date.today().isoformat()
def fold(v):return unicodedata.normalize('NFKD',str(v or '')).encode('ascii','ignore').decode().upper()
def norm(v):return re.sub('[^A-Z0-9]','',fold(v))
def date(v):
 try:
  if isinstance(v,(int,float)): d=(datetime.datetime(1899,12,30)+datetime.timedelta(days=v)).date()
  else:
   m=re.fullmatch(r'(\d{1,2})/(\d{1,2})/(\d{2}|\d{4})',str(v).strip());y=int(m[3]);d=datetime.date(y+2000 if y<100 else y,int(m[2]),int(m[1]))
  return d.isoformat() if '1990-01-01'<=d.isoformat()<=today else None
 except:return None
def num(v):
 try:return float(str(v).replace('.','').replace(',','.'))
 except:return None
equipment=json.load(open(D/'m8-equipment.json'));patterns=[]
for e in equipment:
 serial=norm(e['serial'])
 if len(serial)<4 or serial in ['0000','1111','9999']:continue
 patterns.append((e,re.compile(r'(?<![A-Z0-9])'+r'[\s.\-/]*'.join(map(re.escape,serial))+r'(?![A-Z0-9])')))
clients={e['id']:set(e['clients']) for e in json.load(open(D/'current.json'))['equipment']}
rows=[];pending=[];excluded=[]
for file in ['rj','serrana']:
 for sheet in json.load(open(D/(file+'.json'))):
  header=sheet['rows'][3];contract='Contratos' in sheet['sheet']; removed='PERDIDOS' in sheet['sheet'] or 'Transição' in sheet['sheet']
  ix=3 if contract else next(i for i,v in enumerate(header) if v and 'MODELO' in str(v))
  for rn,r in enumerate(sheet['rows'][4:],5):
   text=r[ix] if len(r)>ix else None
   if not isinstance(text,str) or not text.strip():continue
   ev={'file':file,'sheet':sheet['sheet'],'row':rn,'equipment_text':text,'source_cells':r[:15]}
   if removed:excluded.append({**ev,'reason':'controle inativo/perdido/removido; não reativar automaticamente'});continue
   tail=re.split(r'SERIE\s*[:\-]?\s*',fold(text),maxsplit=1)[-1]
   matched={e['id']:e for e,p in patterns if p.search(tail)}
   if len(matched)>1:
    customer=str(r[0] if contract else r[2]).strip()
    narrowed={k:v for k,v in matched.items() if customer in clients.get(k,set())}
    if len(narrowed)==1:matched=narrowed
   if len(matched)!=1:pending.append({**ev,'reason':'serie ausente/sem correspondencia' if not matched else 'serie ambigua','matches':list(matched)});continue
   e=next(iter(matched.values()));ev.update(equipment_id=e['id'],serial=e['serial'])
   sit=str(r[8] or '') if contract else str(r[header.index('Situação')] or '')
   last=date(r[5] if contract else r[header.index('Última Data')]);period=r[4] if contract else r[header.index('Periodicidade (em meses)')]
   interval='' if contract else str(r[header.index('Intervalo entre Manutenções')] or '')
   hs=[]
   if contract:
    hs=[num(m) for m in re.findall(r'(?:PREV\.?|PREVENTIVA|MANUTENCAO|REVISAO)\s*(\d[\d.,]*)\s*(?:HRS|HORAS)',fold(sit))]
   elif 'MES' not in fold(interval):
    hs=[num(m) for m in re.findall(r'\d[\d.,]*',interval)]
   hs=sorted(set(h for h in hs if h and 100<=h<=1000000))
   mm=None
   match=re.search(r'(\d+)\s*MES',fold(interval))
   if match:mm=int(match[1])
   elif isinstance(period,(float,int)) and period==int(period) and 1<=period<=1200:mm=int(period)
   if not hs and not mm:pending.append({**ev,'reason':'intervalo nao identificado'})
   # Date in explicit last-date field is historical; contract notes may describe pending work.
   unexecuted=contract and bool(re.search(r'A EXECUTAR|FALTA EXECUTAR|P EXECUCAO',fold(sit)))
   meter=None;readingDate=None
   sm=re.search(r'\bH\.?\s*T\.?\s*[:=\-]?\s*(\d[\d.,]*)(?!/)',fold(sit))
   if sm:
    meter=num(sm[1]);following=sit[sm.end():];dm=re.match(r'\s*EM\s*(\d{1,2}/\d{1,2}/(?:\d{4}|\d{2}))(?!\d)',following,re.I)
    readingDate=date(dm[1]) if dm else (last if contract and not unexecuted else None)
   rev=re.search(r'\bH\.?\s*T\.?\s*EM\s*(\d{1,2}/\d{1,2}/(?:\d{4}|\d{2}))(?!\d)\s*[-:]?\s*(\d[\d.,]*)',fold(sit))
   if rev:readingDate=date(rev[1]);meter=num(rev[2])
   if meter is not None and not readingDate:pending.append({**ev,'reason':'horimetro sem data inequivoca','meter':meter,'text':sit})
   readings=[]
   for m in re.finditer(r'\bH\.?\s*T\.?\s*[:=\-]?\s*(\d[\d.,]*)\s*EM\s*(\d{1,2}/\d{1,2}/(?:\d{4}|\d{2}))(?!\d)',fold(sit)):
    if date(m[2]):readings.append({'meter':num(m[1]),'date':date(m[2])})
   if readingDate:readings.append({'meter':meter,'date':readingDate})
   if readings:
    latest=sorted(readings,key=lambda r:r['date'])[-1];meter=latest['meter'];readingDate=latest['date']
   ev['readings']=readings
   orders=re.findall(r'\bO\.?\s*S\.?\s*(\d[\d.]*)',fold(sit))
   ev.update(hours=hs,months=mm,lastDate=None if unexecuted else last,meter=meter if readingDate else None,meterDate=readingDate,order_mentions=orders,situation=sit,condition=str(r[7] if contract else r[header.index('Condição')]))
   rows.append(ev)
out={'rows':rows,'pending':pending,'excluded':excluded}
(D/'prepared.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
print(json.dumps({'matched_rows':len(rows),'equipment':len(set(r['equipment_id'] for r in rows)),'hour_plans':sum(len(r['hours']) for r in rows),'readings':sum(r['meterDate'] is not None for r in rows),'pending':len(pending),'excluded':len(excluded),'reasons':dict(collections.Counter(p['reason'] for p in pending))}))
