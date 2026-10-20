"""Run upstream fifty_fifty sequentially where process-manager sockets are unavailable."""
import csv
import json
import subprocess
import sys
from pathlib import Path
from bootstrap import ROOT, SDK
# Isolate upstream imports from the custom game's same-named modules.
program='''
import sys,json,csv
from pathlib import Path
import zstandard as zstd
sdk,out=sys.argv[1:]
sys.path[:0]=[str(Path(sdk)/'games/fifty_fifty'),sdk]
from game_config import GameConfig
from gamestate import GameState
out=Path(out);out.mkdir(parents=True,exist_ok=True)
g=GameState(GameConfig());g.betmode='base';g.criteria='basegame'
books=[]
for i in range(100):
 g.run_spin(i)
 b=g.book.to_json();b['id']=i+1;books.append(b)
raw=''.join(json.dumps(b)+'\\n' for b in books).encode()
(out/'books_base.jsonl.zst').write_bytes(zstd.ZstdCompressor().compress(raw))
with (out/'lookUpTable_base_0.csv').open('w',newline='') as f:
 csv.writer(f,lineterminator='\\n').writerows((b['id'],1,b['payoutMultiplier']) for b in books)
(out/'index.json').write_text(json.dumps({'modes':[{'name':'base','cost':1.,'events':'books_base.jsonl.zst','weights':'lookUpTable_base_0.csv'}]}))
assert sum(b['payoutMultiplier'] for b in books)==10000
print('Upstream fifty_fifty: 100 books, expected RTP 100%, files generated; PASS')
'''
subprocess.run([sys.executable,'-c',program,str(SDK),str(ROOT/'.cache/fifty_fifty')],check=True)
