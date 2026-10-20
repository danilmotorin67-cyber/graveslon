"""Resolve the pinned SDK; run `python tools/setup_sdk.py` once."""
import os
import json
import subprocess
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
SDK = Path(os.environ.get('STAKE_MATH_SDK', ROOT/'.cache/math-sdk')).resolve()
if not (SDK/'src/state/state.py').is_file():
    raise SystemExit('Run python tools/setup_sdk.py first, or set STAKE_MATH_SDK to the pinned checkout.')
sys.path[:0] = [str(SDK),str(ROOT/'games/midnight_plots')]

expected=json.loads((ROOT/'sdk.lock.json').read_text())['commit']
actual=subprocess.check_output(['git','-C',str(SDK),'rev-parse','HEAD'],text=True).strip()
if actual!=expected:
    raise SystemExit(f'SDK version mismatch: expected {expected}, got {actual}')
