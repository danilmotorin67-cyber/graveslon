"""Export display rules from canonical math; does not generate or select outcomes."""
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'games/midnight_plots'))
from rules import COSTS, FS, LADDER, LINES, MAX_WIN, PAYS, SYMBOLS, TARGET_RTP

target = ROOT / 'web/game/rules.json'
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps({
    'schema': 1, 'paytable': PAYS, 'symbols': SYMBOLS, 'lines': LINES,
    'freeSpins': FS, 'graveLadder': LADDER, 'costs': COSTS,
    'maxPayout': MAX_WIN, 'targetRtp': TARGET_RTP,
}, ensure_ascii=False, indent=2) + '\n')
print('Exported frontend display rules:', target.relative_to(ROOT))
