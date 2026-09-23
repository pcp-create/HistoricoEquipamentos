"""Prepare validated latest readings. Local files only; no remote database writes."""
import json,re,datetime,collections
from pathlib import Path
from preventive_research import fold,safe_write

def meter(value):
    s=str(value or '').strip()
    if re.fullmatch(r'\d+',s): return float(s)
    if re.fullmatch(r'\d{1,3}(?:\.\d{3})+(?:,\d+)?',s): return float(s.replace('.','').replace(',','.'))
    if re.fullmatch(r'\d+,\d{1,2}',s): return float(s.replace(',','.'))
    if re.fullmatch(r'\d+\.\d{1,2}',s): return float(s)
    return None

def prepare(folder):
    readings=json.loads((folder/'readings.json').read_text());machines=json.loads((folder/'machines.json').read_text())
    for rows in (readings,machines):
        if not rows or len(rows)!=int(rows[0]['total']):raise ValueError('Snapshot incompleto')
    byid={m['id']:m for m in machines};bycustomer=collections.defaultdict(list)
    for m in machines:bycustomer[m['customer_id']].append(m)
    counts=collections.Counter(r['os_id'] for r in readings)
    accepted=collections.defaultdict(list);issues=[]
    def reject(r,why):issues.append({**r,'reason':why})
    for r in readings:
        value=meter(r['value'])
        if value is None or value>=100000000:reject(r,'horímetro vazio ou formato inválido');continue
        try:day=datetime.date.fromisoformat(r['date'])
        except (ValueError,TypeError):reject(r,'sem data válida');continue
        if day>datetime.date.today():reject(r,'data futura');continue
        text=fold(' '.join(str(r.get(k) or '') for k in ('name','group')))
        if re.search(r's[eé]rie',str(r['number3_prefix'] or ''),re.I):text+=' '+fold(r['number3'])
        matches=[]
        for m in bycustomer[r['customer_id']]:
            serial=fold(m['serial_number']).strip()
            if len(serial)>=4 and re.search(r'(?<![a-z0-9])'+re.escape(serial)+r'(?![a-z0-9])',text): matches.append(m)
        if len(matches)>1:reject(r,'série duplicada no cliente');continue
        if matches:m=matches[0];method='série no item + cliente'
        elif counts[r['os_id']]==1 and r['machine_id'] in byid:
            m=byid[r['machine_id']];method='máquina da OS'
            if re.search(r's[eé]rie',str(r['number3_prefix'] or ''),re.I) and str(r['number3'] or '').strip():
                actual=re.sub(r'[^a-z0-9]','',fold(r['number3']));expected=re.sub(r'[^a-z0-9]','',fold(m['serial_number']))
                if actual not in ('nc','na','naoconsta') and actual!=expected:reject(r,'série do item difere da máquina da OS');continue
        else:reject(r,'sem vínculo inequívoco por item/máquina');continue
        if not m['m8_external_id']:reject(r,'máquina Iliot sem ID M8');continue
        accepted[str(m['m8_external_id'])].append({**r,'meter':value,'machine_id_resolved':m['id'],'serial':m['serial_number'],'method':method})
    candidates=[]
    for equipment,rows in accepted.items():
        days=sorted(set(r['date'] for r in rows),reverse=True)
        latest=[r for r in rows if r['date']==days[0]]
        if len(set(r['meter'] for r in latest))>1:
            for r in latest:reject(r,'leituras diferentes na última data do checklist')
            continue
        latest=sorted(latest,key=lambda r:(r['os_id'],r['item_id']),reverse=True)[0]
        previous=[r for r in rows if len(days)>1 and r['date']==days[1]]
        rate=None
        warnings=[]
        if previous:
            values=set(r['meter'] for r in previous)
            if len(values)==1:
                delta=latest['meter']-previous[0]['meter'];elapsed=(datetime.date.fromisoformat(days[0])-datetime.date.fromisoformat(days[1])).days
                if delta<0 or delta/elapsed>24:
                    warnings.append(f'Revisar: leitura anterior {previous[0]["meter"]} h em {days[1]}; última {latest["meter"]} h em {days[0]}. Redução ou taxa acima de 24 h/dia. Última leitura registrada por autorização; não usar este par para estimar operação.')
                else: rate=delta/elapsed
        candidates.append({'equipment_id':equipment,'latest':latest,'previous':previous,'calendar_hours_day':rate,'warnings':warnings})
    safe_write(folder/'prepared.json',{'candidates':candidates,'issues':issues,'all_linked_readings':dict(accepted)})
    print(json.dumps({'source_readings':len(readings),'source_machines':len(machines),'linked_equipment':len(accepted),'candidates':len(candidates),'issues':len(issues),'reasons':dict(collections.Counter(i['reason'] for i in issues))},ensure_ascii=False))

if __name__=='__main__':prepare(Path('.m8/iliot-readings'))
