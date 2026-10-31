"""Read only input cells from the supplied workbook; formulas are recalculated by the application."""
import sys,json,hashlib,uuid,xml.etree.ElementTree as E
from zipfile import ZipFile
from pathlib import PurePosixPath
path=sys.argv[1]
raw=open(path,'rb').read();digest=hashlib.sha256(raw).hexdigest();z=ZipFile(path)
ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
strings=[''.join(node.itertext()) for node in E.fromstring(z.read('xl/sharedStrings.xml'))] if 'xl/sharedStrings.xml' in z.namelist() else []
rels={r.get('Id'):r.get('Target') for r in E.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
result=[]
for sheet in E.fromstring(z.read('xl/workbook.xml')).findall('m:sheets/m:sheet',ns):
 name=sheet.get('name')
 if name=='Calculadora':continue
 target=rels[sheet.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')]
 target=target.lstrip('/') if target.startswith('/') else str(PurePosixPath('xl')/target)
 cells={}
 for c in E.fromstring(z.read(target)).findall('.//m:sheetData/m:row/m:c',ns):
  value=c.find('m:v',ns);inline=c.find('m:is',ns)
  if value is None and inline is None:continue
  value=value.text if value is not None else ''.join(inline.itertext())
  if c.get('t')=='s':value=strings[int(value)]
  cells[c.get('r')]=value
 machines=[]
 for i in range(6,200):
  if not cells.get('A'+str(i)) or not cells.get('B'+str(i)) or not cells.get('C'+str(i)):continue
  try:power,flow,hours,days=[float(cells[col+str(i)]) for col in 'BCDE']
  except (ValueError,KeyError):continue
  machines.append({'id':str(uuid.uuid5(uuid.NAMESPACE_URL,digest+':'+name+':'+str(i))),'name':cells['A'+str(i)],'powerKw':power,'flowM3min':flow,'hoursPerDay':hours,'daysPerYear':days})
 def setting(prefix):
  return next(float(cells['H'+key[1:]]) for key,value in cells.items() if key.startswith('E') and value.lower().startswith(prefix))
 client=cells.get('A4',name).removeprefix('Cliente:').strip()
 result.append({'sourceKey':'workbook:'+digest+':'+name,'document':{'title':'Base de cálculo · '+name,'client':client,'date':'','serviceOrder':'','inspector':'','location':name,'notes':'Cadastro importado da planilha base. Data do levantamento não informada no arquivo.','machines':machines,'pressureBar':setting('pressão da rede'),'energyPrice':setting('preço energia')}})
json.dump(result,sys.stdout,ensure_ascii=False)
