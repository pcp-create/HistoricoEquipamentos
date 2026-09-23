"""Select executed M8 preventive evidence; never write production data."""
import json
import re
import sqlite3
from pathlib import Path
from preventive_research import fold


def explicit_execution(e):
    if e['source'] != 'observacao' or 'intervalos alternativos' in e['reason']:
        return False
    text, excerpt = fold(e['source_text']), fold(e['excerpt'])
    for match in re.finditer(re.escape(excerpt), text):
        before = text[max(0, match.start()-55):match.start()]
        if re.search(r'nao|pendente|sera|a realizar', before):
            continue
        if re.search(r'(?:realizad[ao]|executad[ao]|efetuad[ao])\s*$', before):
            return True
    return False


def main():
    folder = Path('.m8/preventive-research')
    connection = sqlite3.connect(folder / 'research.sqlite')
    selected = {}
    for (payload,) in connection.execute('SELECT payload FROM maintenance_evidence'):
        e = json.loads(payload)
        if not e['equipment_id'] or e['status'] != 'Processado':
            continue
        if any(s in e['reason'] for s in ['OS não processada', 'data futura', 'sem data', 'vínculo ausente', 'intervalos alternativos']):
            continue
        if e['review'] and not explicit_execution(e):
            continue
        key = (e['equipment_id'], e['hours'])
        if key not in selected or (e['date'], int(e['order_id'])) > (selected[key]['date'], int(selected[key]['order_id'])):
            selected[key] = e
    output = list(selected.values())
    (folder / 'last-intervention-candidates.json').write_text(json.dumps(output, ensure_ascii=False, indent=2))
    print(json.dumps({'candidates': len(output), 'equipment': len({e['equipment_id'] for e in output})}))

if __name__ == '__main__':
    main()
