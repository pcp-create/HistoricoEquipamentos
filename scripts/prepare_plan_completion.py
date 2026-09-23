"""Prepare intervention evidence including matching checklist meters; no production writes."""
import json,re,datetime
from pathlib import Path
from preventive_research import interval_candidates,fold,date,number
from prepare_last_interventions import explicit_execution

folder=Path('.m8/preventive-research')
orders=json.loads((folder/'m8-orders.json').read_text())
readings=json.loads(Path('.m8/iliot-readings/prepared.json').read_text())['all_linked_readings']
known={e['id'] for e in json.loads((folder/'m8-equipment.json').read_text())}
result=[]
for o in orders:
    if o['status']!='Processado' or not o['finalized'] or o['pending']:continue
    ids=set(map(str,o['linked']))|({str(o['equipment_id'])} if o['equipment_id'] else set())
    ids &= known
    if len(ids)!=1:continue
    equipment=next(iter(ids));obs=o.get('observacao') or '';text=fold(obs)
    intervals=interval_candidates(o.get('tipo_atendimento_nome'),'tipoAtendimentoNome')+interval_candidates(obs,'observacao')
    executed=bool(re.search(r'(?<!nao )realizad[ao]\s+(?:manutencao\s+)?(?:preventiva|revisao)',text))
    # Require execution evidence or previously unambiguous processed service type.
    intervals=[e for e in intervals if (not e['review']) or explicit_execution({**e,'source_text':obs}) or (executed and e['source']=='tipoAtendimentoNome')]
    if not intervals:continue
    day=date(o.get('data_entrega') or o.get('emissao') or o.get('data_abertura'))
    if not day or day>datetime.date.today().isoformat():continue
    start=date(o.get('data_abertura') or o.get('emissao'))
    linked=[]
    for r in readings.get(equipment,[]):
        # Number alone is insufficient: equipment and intervention date must agree,
        # or the M8 observation explicitly references the Iliot report.
        report_ref=bool(re.search(r'(?:iliot|relatorio)(?:\s+(?:tecnico|n[ºo°.]?|numero|id))*\s*[:.#-]?\s*'+str(r['os_number'])+r'\b',text))
        same_number=o['company_id']==1 and str(r['os_number'])==str(o['number'] or o['id']) and r['date']==day
        if report_ref or same_number:
            if start and start<=r['date']<=day:linked.append(r)
    meter=None;meter_source=None
    if linked:
        latest=max(r['date'] for r in linked);latestrows=[r for r in linked if r['date']==latest]
        values={r['meter'] for r in latestrows}
        if len(values)==1:
            meter=next(iter(values));day=latest;meter_source={'kind':'checklist','readings':latestrows}
    if meter is None:
        values=set()
        for m in re.finditer(r'\b(?:horimetro|ht)\s*[:=\-]?\s*(\d[\d.,]*)',text):
            n=number(m.group(1).rstrip('.,'))
            if n is not None:values.add(n)
        if len(values)==1:
            meter=next(iter(values));meter_source={'kind':'observacao','order':o['id']}
    result.append({'equipment_id':equipment,'hours':max(e['hours'] for e in intervals),'date':day,'meter':meter,'meter_source':meter_source,'order':o,'intervals':intervals})
(folder/'plan-completion-candidates.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps({'interventions':len(result),'with_meter':sum(e['meter'] is not None for e in result),'example':[{'hours':e['hours'],'date':e['date'],'meter':e['meter']} for e in result if str(e['order']['id'])=='14153']}))
