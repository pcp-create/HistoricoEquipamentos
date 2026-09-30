"""Extract the supplied Pressure PSV25AP revision 00 parts list without inferring codes."""
import hashlib
import json
import re
import sys
from pathlib import Path
import pymupdf

source = Path(sys.argv[1])
raw = source.read_bytes()
pdf = pymupdf.open(stream=raw, filetype='pdf')
if len(pdf) != 3:
    raise ValueError('Esperado catálogo PSV25AP de 3 páginas.')
cover, specs, parts = [page.get_text() for page in pdf]
if not all(token in cover for token in ['Cabeçote PSV25AP', 'REVISÃO 00', '06/2014']):
    raise ValueError('Modelo/revisão diferente do catálogo validado.')
rows = re.findall(r'^([0-9]+|A)\n([0-9]+)\n([^\n]+)\n([A-Z]+[0-9]{3}-[0-9]{3}|#)\n', parts, re.M)
expected = [1,5,6,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,44,45,46,47,48,49,50,51,53,54,55,56,57,58,59,60,61,62]
if [r[0] for r in rows] != [str(i) for i in expected] + ['A']:
    raise ValueError('Lista extraída incompleta ou fora da ordem validada. Confira o PDF.')
if 'NÃO' not in parts or 'COMERCIALIZADAS PELA PRESSURE' not in parts:
    raise ValueError('Nota de peças comuns de mercado não encontrada.')
print(json.dumps({
    'source': source.name, 'sha256': hashlib.sha256(raw).hexdigest(), 'pages': len(pdf),
    'manufacturer': 'Pressure', 'model': 'PSV25AP', 'version': 'Rev. 00 — 06/2014',
    'rows': [{'position': pos, 'quantity': int(qty), 'description': desc.strip(), 'reference': code, 'page': 3,
              'section': 'Kits para o cabeçote' if pos == 'A' else 'Componentes'} for pos, qty, desc, code in rows]
}, ensure_ascii=False))
