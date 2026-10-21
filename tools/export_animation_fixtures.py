"""Export named authoritative QA books; never an outcome distribution."""
from pathlib import Path
import gzip
import hashlib
import json
root=Path(__file__).resolve().parents[1]
source=root/'tests/fixtures.json.gz'
fixtures=json.loads(gzip.decompress(source.read_bytes()))
scenarios=[]
for mode in ('base','bonus'):
    for name in ('ordinary_win','loss','retrigger','multiplier_10','max_win'):
        scenarios.append({'key':mode+'/'+name,'label':name,'mode':mode,'book':fixtures[mode][name]})
target=root/'web/animation-lab/fixtures.json'
target.write_text(json.dumps({'purpose':'QA scenarios only; not a random or weighted distribution',
    'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'scenarios':scenarios},separators=(',',':'))+'\n')
print(f'Exported {len(scenarios)} named QA books: {target.relative_to(root)}')
