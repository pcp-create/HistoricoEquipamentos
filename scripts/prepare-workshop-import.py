"""Prepare a reviewable import from read-only workbook JSON and an ERP catalog snapshot.
Extraction uses openpyxl data_only=True; never executes macros or writes the workbook.
Private inputs/outputs are supplied as arguments, never stored in source control.
"""
import json,re,sys,hashlib,unicodedata,collections
source,catalog_file,output=sys.argv[1:4]
sheets=json.load(open(source));db=json.load(open(catalog_file))
fold=lambda v:re.sub('[^A-Z0-9]','',unicodedata.normalize('NFKD',str(v or '')).encode('ascii','ignore').decode().upper())
cat={r['id']:r for r in db['catalog']};orders=collections.defaultdict(set)
for r in db['orders']:
 for e in r['equipment_ids']+([r['direct']] if r['direct'] else []):
  if e in cat:orders[r['number']].add(e)
fleet=collections.defaultdict(set)
for r in sheets['Equipamentos de Locação']:
 c=r['cells']
 if c[1] and c[2] and str(c[1]) in cat:fleet[str(c[2])].add(str(c[1]))
def match(description,os,code=None):
 desc=fold(description);serial={e['id'] for e in db['catalog'] if len(fold(e['serial']))>=4 and desc.endswith(fold(e['serial']))}
 byos=set().union(*(orders[n] for n in re.findall(r'\d+',str(os or ''))))
 bycode=fleet[str(code)] if code is not None else set()
 groups=[g for g in [serial,byos,bycode] if g]
 if not groups:return None,'Equipamento não identificado por série ou OS'
 candidates=set.intersection(*groups)
 if len(candidates)==1:return next(iter(candidates)),'Vínculo exato por '+', '.join(k for k,g in [('série',serial),('OS',byos),('código de frota',bycode)] if g)
 return None,'Identificações divergentes ou mais de um equipamento candidato'
def date(v):return v[:10] if isinstance(v,str) and re.match(r'^20\d\d-\d\d-\d\d',v) else None
def workshop(v):
 s=fold(v)
 return 2 if 'SERRANA' in s else 3 if 'CRIC' in s else 1 if 'RJCOMPRESSORES' in s else None
def stage(v):
 s=fold(v)
 return 'parts' if 'PECAS' in s else 'repair' if 'EXECUCAO' in s or 'GARANTIA' in s else 'approval' if 'APROVACAO' in s or 'ORCAMENTO' in s else 'ready' if 'PRONTO' in s or 'AGENDADO' in s else 'diagnosis'
result=[]
for sheet in ['Equipamentos em Oficina','Equipamentos Locação em revisão','ENVIO A TERCEIROS']:
 for row in sheets[sheet]:
  c=row['cells'];external=sheet=='ENVIO A TERCEIROS';rental=sheet=='Equipamentos Locação em revisão'
  description=c[1] if not rental else c[2];os=c[14] if external else c[0] if rental else c[2]
  eq,reason=match(description,os,c[1] if rental else None)
  status=str(c[10] if external else c[4] if rental else c[6] or '')
  closed=('CONCLUIDO' in fold(status) or 'DEVOLVIDO' in fold(status)) if external else ('LIBERADO' in fold(status) or 'DESCART' in fold(status)) if rental else ('ENTREGUE' in fold(status) or 'DEVOLVIDO' in fold(status))
  entered=date(c[6] if external else c[3]);exited=date(c[8] if external else c[6] if rental else c[11]);loc=None if external else workshop(c[7] if rental else c[14])
  reasons=[]
  if not eq:reasons.append(reason)
  if not entered:reasons.append('Data de entrada/envio ausente ou inválida')
  if closed and not exited:reasons.append('Registro encerrado sem data de saída/retorno')
  if exited and entered and exited<entered:reasons.append('Saída/retorno anterior à entrada/envio')
  if exited and not closed:reasons.append('Data de saída preenchida com situação ainda aberta')
  if not external and not loc:reasons.append('Oficina não identificada')
  document={'equipment_description':description,'customer':c[0] if not rental else 'Frota própria','original_status':status,'closed':closed,'orders':os,'cells':c,'entered':entered,'exited':exited,'workshopId':loc,'stage':stage(status),'expected':date(c[7] if external else c[6] if rental else c[10]),'notes':str((c[12] if external else c[8] if rental else c[13]) or ''),'component':str(c[2] or '') if external else None,'supplier':str(c[13] or '') if external else None,'equipmentId':eq,'match':reason}
  result.append({'id':hashlib.sha256((sheet+':'+str(row['row'])+json.dumps(c,default=str,ensure_ascii=False)).encode()).hexdigest(),'sheet':sheet,'row':row['row'],'document':document,'reason':'; '.join(reasons) if reasons else None,'external':external})
# Prevent two rows claiming that the same equipment is currently in the workshop.
openrows=collections.defaultdict(list)
for r in result:
 if not r['external'] and not r['reason'] and not r['document']['exited']:openrows[r['document']['equipmentId']].append(r)
for items in openrows.values():
 if len(items)>1:
  for r in items:r['reason']='Mais de uma entrada aberta na planilha para o mesmo equipamento'
json.dump(result,open(output,'w'),ensure_ascii=False,indent=2)
print(json.dumps({'rows':len(result),'eligible_visits':sum(not r['reason'] and not r['external'] for r in result),'eligible_external_candidates':sum(not r['reason'] and r['external'] for r in result),'pending':dict(collections.Counter(r['reason'] for r in result if r['reason']))},ensure_ascii=False))
