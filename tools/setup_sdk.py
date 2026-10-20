"""Fetch a reproducible upstream dependency without modifying its sources."""
import json
import subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
lock=json.loads((root/'sdk.lock.json').read_text())
path=root/'.cache/math-sdk'
if not path.exists():
    subprocess.run(['git','clone',lock['url'],str(path)],check=True)
subprocess.run(['git','-C',str(path),'checkout','--detach',lock['commit']],check=True)
print('Pinned SDK ready:',lock['commit'])
