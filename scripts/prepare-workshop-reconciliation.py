"""Prepare an auditable current-position plan. Inputs are private JSON snapshots.
Filtered columns: days, customer, equipment, approval, technical delivery, estimate, notes, status.
Never invent ERP identities, workshop locations or physical departure dates.
"""
import json,re,unicodedata,datetime,collections,sys
current,audit,output=sys.argv[1:4]
rows=json.load(open(current));db=json.load(open(audit))
fold=lambda x:re.sub('[^A-Z0-9]','',unicodedata.normalize('NFKD',str(x or '')).encode('ascii','ignore').decode().upper())
rows=[(i+1,r) for i,r in enumerate(rows) if len(r)==8 and str(r[0]).isdigit()]
assert len(rows)==58,'Unexpected count: review source before applying'
# All uniquely matched previous entry dates must agree on the report reference day.
reference=[]
for _,r in rows:
 m=[x for x in db['imports'] if x['sheet']=='Equipamentos em Oficina' and fold(x['document']['equipment_description'])==fold(r[2]) and fold(x['document']['customer'])==fold(r[1])]
 if len(m)==1 and m[0]['document']['entered']:reference.append(datetime.date.fromisoformat(m[0]['document']['entered'])+datetime.timedelta(days=int(r[0])))
assert len(set(reference))==1,'Report reference dates disagree'
ref=reference[0]
mapstage={'1':'diagnosis','2':'quotation','3':'approval','4':'parts','6':'repair','8':'ready','9':'return_unrepaired','13':'factory_warranty','14':'rj_warranty'}
plan=[]
def excel(v):return (datetime.date(1899,12,30)+datetime.timedelta(days=int(float(v)))).isoformat() if v else None
for line,r in rows:
 entered=(ref-datetime.timedelta(days=int(r[0]))).isoformat()
 matches=[x for x in db['imports'] if x['sheet']=='Equipamentos em Oficina' and fold(x['document']['equipment_description'])==fold(r[2]) and fold(x['document']['customer'])==fold(r[1]) and x['document']['entered']==entered]
 assert len(matches)<=1,(line,'Ambiguous entry')
 old=matches[0] if matches else None;source=dict(old['document']) if old else {}
 visits=[v for v in db['visits'] if old and v['source'].get('sheet')==old['sheet'] and v['source'].get('row')==old['row_number']]
 assert len(visits)<=1
 if visits:assert not visits[0]['exited_at'],'Do not reopen a recorded departure automatically'
 source.update(customer=r[1],equipment_description=r[2],original_status=r[7],entered=entered,notes=r[6] or '',sheet=old['sheet'] if old else 'Posição atual',row=old['row_number'] if old else line,reconciled_file='Equipamentos em oficina atual.xlsx',reconciled_row=line,reference_date=str(ref),reported_days=int(r[0]),filtered_cells=r,approval_date=excel(r[3]),technical_delivery_date=excel(r[4]),estimated_execution=r[5],entry_date_basis='Data original da planilha' if old else 'Calculada pelos dias da posição de '+str(ref))
 plan.append(dict(line=line,existingId=visits[0]['id'] if visits else None,importId=old['id'] if old else None,equipmentId=source.get('equipmentId'),workshopId=source.get('workshopId'),entered=entered,stage=mapstage[r[7].split(' ')[0]],notes=r[6] or '',source=source))
keep={p['existingId'] for p in plan if p['existingId']}
removed=[dict(id=v['id'],version=v['version'],source=v['source']) for v in db['visits'] if not v['exited_at'] and v['id'] not in keep and v['created_by']=='Importação da planilha']
json.dump(dict(reference=str(ref),rows=plan,removed=removed),open(output,'w'),ensure_ascii=False,indent=2)
print(json.dumps(dict(reference=str(ref),count=len(plan),existing=len(keep),new=sum(not p['existingId'] for p in plan),unlinked=sum(not p['equipmentId'] for p in plan),unknown_workshop=sum(not p['workshopId'] for p in plan),removed=len(removed),statuses=dict(collections.Counter(p['stage'] for p in plan))),ensure_ascii=False))
