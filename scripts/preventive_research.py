"""Read-only Iliot collection and auditable, local SQLite preventive research.
Never writes equipment settings or production preventive plans.
"""
import argparse
import collections
import csv
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import time
import unicodedata
import urllib.error
import urllib.request

MACHINES_URL = 'https://equipamentos-4ejo.onrender.com/machines'
ORDERS_URL = 'https://app.rjcompressores.com.br/api/v1/integration/service_orders.json'


def fold(value):
    return ''.join(c for c in unicodedata.normalize('NFD', str(value or '')) if unicodedata.category(c) != 'Mn').lower()


def number(value):
    if value is None or isinstance(value, bool):
        return None
    s = str(value).strip()
    if ',' in s:
        s = s.replace('.', '').replace(',', '.')
    elif re.fullmatch(r'\d{1,3}(?:\.\d{3})+', s):
        s = s.replace('.', '')
    try:
        n = float(s)
        return n if 0 <= n < 10000000 else None
    except ValueError:
        return None


def interval_candidates(text, source):
    original = str(text or "")
    text = fold(text)
    result = []
    # Only maintenance labels followed by an hour interval; meter readings are not intervals.
    pattern = r'(?:preventiv[ao]|manutencao|revisao)[^\n.;:]{0,65}?(\d[\d. ]*(?:\s*/\s*\d[\d. ]*)*)\s*(?:horas?\b|hrs?\b|h\b)'
    for match in re.finditer(pattern, text):
        values = [number(v.replace(' ', '')) for v in match.group(1).split('/')]
        values = sorted(set(int(v) for v in values if v and v.is_integer() and 100 <= v <= 100000))
        context = text[max(0, match.start()-70):min(len(text),match.end()+200)]
        future = bool(re.search(r'orcamento|orcado|proxim[ao]|pendente|nao realiz|nao execut|recomend|programad|previst|suger', context))
        for value in values:
            result.append({'hours': value, 'source': source, 'excerpt': original[match.start():match.end()],
                           'review': len(values) != 1 or future,
                           'reason': 'intervalos alternativos' if len(values) != 1 else 'menção planejada/negada' if future else ''})
    return result


def date(value):
    try:
        return dt.date.fromisoformat(str(value or '')[:10]).isoformat()
    except ValueError:
        return None


def safe_write(path, value):
    tmp = path.with_suffix(path.suffix + '.tmp')
    with open(tmp, 'w', encoding='utf-8') as f:
        os.chmod(tmp, 0o600)
        json.dump(value, f, ensure_ascii=False)
    tmp.replace(path)


def get_json(url, token=None):
    headers = {'Accept': 'application/json', 'Content-Type': 'application/json'}
    if token:
        headers['iliot-company-token'] = token
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=90) as response:
                data = json.load(response)
            if not isinstance(data, list):
                raise RuntimeError('Resposta inesperada: a API deve retornar uma lista. Nenhum avanço de página.')
            return data
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503, 504) and attempt < 2:
                time.sleep(min(60, max(10, int(e.headers.get('Retry-After', '30')))))
                continue
            raise RuntimeError(f'API retornou HTTP {e.code}; verifique liberação Cloudflare/token. Coleta preservada.') from None
    raise RuntimeError('Coleta interrompida')


def collect(folder, token):
    safe_write(folder / 'machines.json', get_json(MACHINES_URL))
    if not token:
        raise RuntimeError('Defina ILIOT_COMPANY_TOKEN no ambiente para coletar as OS.')
    manifest_path = folder / 'collection.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {'next_page': 1, 'complete': False, 'started_at': dt.datetime.now(dt.timezone.utc).isoformat()}
    if manifest['complete']:
        print('Coleta já concluída. Para nova coleta use outro diretório.')
        return
    page = manifest['next_page']
    previous = None
    if page > 1:
        previous = hashlib.sha256((folder / f'orders-page{page-1}.json').read_bytes()).hexdigest()
    while page <= 10000:
        rows = get_json(f'{ORDERS_URL}?page={page}', token)
        payload = json.dumps(rows, ensure_ascii=False).encode()
        digest = hashlib.sha256(payload).hexdigest()
        if rows and digest == previous:
            raise RuntimeError('Página repetida pela API; coleta interrompida sem marcar conclusão.')
        safe_write(folder / f'orders-page{page}.json', rows)
        manifest.update(next_page=page+1, complete=not rows, updated_at=dt.datetime.now(dt.timezone.utc).isoformat())
        safe_write(manifest_path, manifest)
        print(json.dumps({'page': page, 'orders': len(rows), 'complete': not rows}), flush=True)
        if not rows:
            return
        previous = digest
        page += 1
        time.sleep(1)
    raise RuntimeError('Limite de páginas atingido, coleta não concluída.')


def checklist_readings(order):
    """Conservative candidates. Dates/status require real-payload validation before use."""
    result = []
    for item in order.get('service_order_items') or []:
        if not isinstance(item, dict):
            continue
        title = ' '.join(str(item.get(k) or '') for k in ('group', 'name'))
        for i in range(1, 11):
            field = f'number{i}'
            label = str(item.get(field+'_prefix') or '')
            context = fold(title + ' ' + label)
            if not re.search(r'horimetro|horas totais|horas de funcionamento', context):
                continue
            if re.search(r'carga|parcial|proxim|restant|intervalo', fold(label)):
                continue
            n = number(item.get(field))
            if n is not None:
                result.append({'value': n, 'item': item.get('id'), 'field': field, 'label': title+' / '+label,
                               'date': None, 'review': True, 'reason': 'validar significado, execução e data real do checklist'})
        for field in ('comment', 'selected_button'):
            for match in re.finditer(r'hor[ií]metro\s*[:=\-]?\s*(\d[\d.,]*)', str(item.get(field) or ''), re.I):
                n = number(match.group(1))
                if n is not None:
                    result.append({'value': n, 'item': item.get('id'), 'field': field, 'label': title,
                                   'date': None, 'review': True, 'reason': 'texto livre; confirmar data e execução'})
    return result


def estimate(readings):
    # Only readings explicitly verified as actual are allowed in a suggestion.
    valid = [r for r in readings if not r.get('review', True) and date(r.get('date')) and number(r.get('value')) is not None and date(r['date']) <= dt.date.today().isoformat()]
    by_date = collections.defaultdict(set)
    for r in valid:
        by_date[date(r['date'])].add(float(r['value']))
    dates = sorted(by_date, reverse=True)
    if not dates:
        return {'reason': 'sem leitura real validada'}
    if len(by_date[dates[0]]) != 1:
        return {'reason': 'leituras conflitantes na última data'}
    latest = next(iter(by_date[dates[0]]))
    result = {'meter': latest, 'meterDate': dates[0], 'hoursDay': None, 'daysYear': None}
    if len(dates) < 2 or len(by_date[dates[1]]) != 1:
        return {**result, 'reason': 'penúltima leitura ausente ou conflitante'}
    previous = next(iter(by_date[dates[1]]))
    elapsed = (dt.date.fromisoformat(dates[0])-dt.date.fromisoformat(dates[1])).days
    rate = (latest-previous)/elapsed
    if not 0 <= rate <= 24:
        return {**result, 'reason': 'troca/reset de horímetro ou taxa superior a 24 h/dia'}
    return {**result, 'previousMeter': previous, 'previousDate': dates[1], 'elapsedDays': elapsed,
            'calendarHoursDay': round(rate, 4), 'equivalentDaysYear': 365,
            'reason': 'média por dia corrido; dias/ano e jornada efetiva não identificáveis por duas leituras'}


def build(folder):
    equipment = json.loads((folder/'m8-equipment.json').read_text())
    orders = json.loads((folder/'m8-orders.json').read_text())
    machines = json.loads((folder/'machines.json').read_text())
    known = {str(e['id']): e for e in equipment}
    mapping = {str(m['id']): str(m.get('m8_external_id') or '') for m in machines}
    by_m8 = collections.defaultdict(list)
    for iliot, m8 in mapping.items():
        if m8 in known:
            by_m8[m8].append(iliot)
    manifest = json.loads((folder/'collection.json').read_text()) if (folder/'collection.json').exists() else {'complete': False}
    iliot_orders = {}
    inventory = collections.Counter()
    for path in sorted(folder.glob('orders-page*.json'), key=lambda p:int(re.search(r'page(\d+)',p.name)[1])):
        for o in json.loads(path.read_text()):
            iliot_orders[str(o['id'])] = o
            for item in o.get('service_order_items') or []:
                if isinstance(item, dict):
                    inventory[(str(item.get('group') or ''),str(item.get('name') or ''), *[str(item.get(f'number{i}_prefix') or '') for i in range(1,11)])] += 1
    events = []
    for order in orders:
        candidates = interval_candidates(order.get('tipo_atendimento_nome'), 'tipoAtendimentoNome') + interval_candidates(order.get('observacao'), 'observacao')
        ids = set(str(x) for x in order.get('linked', []))
        if order.get('equipment_id'):
            ids.add(str(order['equipment_id']))
        ids &= known.keys()
        obs_exact = {c['hours'] for c in candidates if c['source']=='observacao' and not c['review']}
        for c in candidates:
            if c['reason']=='intervalos alternativos' and len(obs_exact)==1 and c['hours'] in obs_exact:
                c = {**c, 'review': False, 'reason': 'intervalo confirmado pela observação'}
            status_ok = order['status']=='Processado' and order.get('finalized') is True and order.get('pending') is False
            day = date(order.get('data_entrega') or order.get('emissao') or order.get('data_abertura'))
            reason = c['reason']
            if not status_ok: reason += '; OS não processada ou coleta incompleta'
            if len(ids)!=1: reason += '; vínculo ausente ou múltiplos equipamentos'
            if not day: reason += '; sem data'
            if day and day > dt.date.today().isoformat(): reason += '; data futura'
            for equipment_id in sorted(ids) or [None]:
                events.append({**c,'equipment_id':equipment_id,'company':order['company_id'],'order_id':order['id'],
                               'order_number':order.get('number') or order['id'],'date':day,'date_source':'data_entrega' if order.get('data_entrega') else 'emissao' if order.get('emissao') else 'data_abertura',
                               'review':c['review'] or not status_ok or len(ids)!=1 or not day or day > dt.date.today().isoformat(),
                               'reason':reason.strip('; '),'status':order['status'], 'source_text':order.get('observacao' if c['source']=='observacao' else 'tipo_atendimento_nome') or ''})
    readings = []
    for m in machines:
        m8 = mapping[str(m['id'])]
        if m8 not in known: continue
        if number(m.get('working_time')) is not None:
            readings.append({'equipment_id':m8,'machine_id':str(m['id']),'value':number(m['working_time']),
                             'date':date(m.get('last_reading_date')),'source':'machines.working_time','review':True,
                             'reason':'cadastro de máquina; validar leitura real e vínculo, não usar sensor virtual como leitura real'})
    for o in iliot_orders.values():
        mid = str(o.get('machine_id') or '')
        for reading in checklist_readings(o):
            readings.append({**reading,'equipment_id':mapping.get(mid),'machine_id':mid,'order_id':str(o['id']),'source':'service_order_items'})
    report=[]
    for eq in equipment:
        eid=str(eq['id'])
        related=[e for e in events if e['equipment_id']==eid]
        groups=collections.defaultdict(list)
        for e in related: groups[e['hours']].append(e)
        intervals=[]
        for hours, group in sorted(groups.items()):
            accepted=sorted((e for e in group if not e['review']),key=lambda e:(e['date'],int(e['order_id'])),reverse=True)
            intervals.append({'hours':hours,'latest':accepted[0] if accepted else None,'evidence_count':len(group),'review_count':sum(e['review'] for e in group), 'latest_mention':max(group,key=lambda e:(e['date'] or '',int(e['order_id'])))})
        report.append({**eq,'iliot_ids':by_m8[eid],'mapping_review':len(by_m8[eid])!=1,'intervals':intervals,
                       'reading_suggestion':estimate([r for r in readings if r['equipment_id']==eid])})
    summary={'equipment':len(equipment),'m8_orders':len(orders),'iliot_machines':len(machines),'iliot_orders':len(iliot_orders),
             'iliot_collection_complete':manifest.get('complete',False),'linked_equipment':sum(bool(by_m8[e]) for e in known),
             'duplicate_mappings':sum(len(by_m8[e])>1 for e in known),'equipment_with_intervals':sum(bool(e['intervals']) for e in report),
             'equipment_with_dated_evidence':sum(any(i['latest'] for i in e['intervals']) for e in report),
             'events':len(events),'events_review':sum(e['review'] for e in events),'reading_candidates':len(readings),
             'generated_at':dt.datetime.now(dt.timezone.utc).isoformat()}
    # Local provisional database only, rebuilt atomically from preserved snapshots.
    temp=folder/'research.tmp.sqlite'
    if temp.exists(): temp.unlink()
    db=sqlite3.connect(temp); os.chmod(temp,0o600)
    for table, rows in [('equipment',report),('m8_orders',orders),('maintenance_evidence',events),('reading_candidates',readings),('iliot_machines',machines),('iliot_orders',list(iliot_orders.values()))]:
        db.execute(f'CREATE TABLE {table} (row_id INTEGER PRIMARY KEY, equipment_id TEXT, payload TEXT NOT NULL)')
        db.executemany(f'INSERT INTO {table}(equipment_id,payload) VALUES(?,?)',[(str(r.get('equipment_id') or r.get('m8_external_id') or r.get('id') or ''),json.dumps(r,ensure_ascii=False)) for r in rows])
    db.commit();db.close();temp.replace(folder/'research.sqlite')
    safe_write(folder/'summary.json',summary); safe_write(folder/'equipment-report.json',report)
    with open(folder/'equipment-summary.csv','w',encoding='utf-8-sig',newline='') as f:
        writer=csv.writer(f,delimiter=';')
        writer.writerow(['ID M8','Equipamento','IDs Iliot','Intervalo mencionado (horas; conferir aplicação)','Última data candidata','Empresa','OS','ID OS M8','Campo de data','Situação da evidência','Campo de origem','Trecho identificado','Texto de origem','Pendências','Motivo de revisão','Link OS'])
        def cell(value):
            text=str(value or '')
            return "'" + text if text.lstrip().startswith(('=','+','-','@')) else text
        for e in report:
            for interval in e['intervals'] or [{}]:
                latest=interval.get('latest') or interval.get('latest_mention') or {}
                link=f"https://historicorj.vercel.app/?view=orders&company={latest['company']}&orderNumber={latest['order_number']}" if latest else ''
                writer.writerow([e['id'],cell(e['name']),','.join(e['iliot_ids']),interval.get('hours',''),
                                 latest.get('date',''),latest.get('company',''),latest.get('order_number',''),
                                 latest.get('order_id',''),latest.get('date_source',''),
                                 ('Revisar — não confirma manutenção executada' if latest.get('review') else 'Evidência candidata — conferir execução e aplicação') if latest else 'Sem evidência',
                                 latest.get('source',''),cell(latest.get('excerpt')),cell(latest.get('source_text')),
                                 interval.get('review_count',''),cell(latest.get('reason')),link])
    with open(folder/'maintenance-evidence.csv','w',encoding='utf-8-sig',newline='') as f:
        writer=csv.writer(f,delimiter=';')
        writer.writerow(['ID M8','Empresa','OS','ID OS M8','Intervalo mencionado','Data candidata','Campo de data','Origem','Trecho','Revisar','Motivo','Texto completo'])
        for e in events:
            writer.writerow([e['equipment_id'],e['company'],e['order_number'],e['order_id'],e['hours'],e['date'],e['date_source'],e['source'],cell(e['excerpt']),e['review'],cell(e['reason']),cell(e['source_text'])])
    safe_write(folder/'checklist-inventory.json',[{'labels':list(k),'count':v} for k,v in inventory.most_common()])
    print(json.dumps(summary,ensure_ascii=False,indent=2))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['collect','build'])
    parser.add_argument('--directory',default='.m8/preventive-research')
    parser.add_argument('--token-file',help='Arquivo Power Query privado fornecido pelo usuário; token nunca impresso ou salvo na base')
    args=parser.parse_args();folder=Path(args.directory);folder.mkdir(parents=True,exist_ok=True,mode=0o700)
    if args.action=='collect':
        token=os.environ.get('ILIOT_COMPANY_TOKEN')
        if args.token_file:
            match=re.search(r'#"iliot-company-token"\s*=\s*"([^"]+)"',Path(args.token_file).read_text())
            if not match: raise RuntimeError('Token não localizado no arquivo privado.')
            token=match[1]
        collect(folder,token)
    else: build(folder)

if __name__=='__main__':
    try: main()
    except (RuntimeError,urllib.error.URLError,TimeoutError) as e:
        print(str(e));raise SystemExit(1)
