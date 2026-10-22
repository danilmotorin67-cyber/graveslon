"""Build explicit demonstration books, never a runtime probability distribution."""
import gzip
import hashlib
import json

from bootstrap import ROOT
from game_config import GameConfig
from gamestate import GameState
from validate_math import audit_book, load_reels

source = ROOT / 'tests/fixtures.json.gz'
fixtures = json.loads(gzip.decompress(source.read_bytes()))
game = GameState(GameConfig())
game.betmode = 'base'
reels = load_reels()
for label, criteria, seed in [('ordinary_win', 'basegame', 2026102201), ('loss', 'zero', 2026102202)]:
    game.criteria = criteria
    for attempt in range(100):
        game.run_spin(attempt, seed + attempt)
        if game.triggered_freegame:
            continue
        book = game.book.to_json()
        book['id'] = attempt + 1
        audit_book(book, 'base', reels)
        fixtures['base'][label] = book
        break
    else:
        raise RuntimeError('Unable to prepare a plain base demonstration')

scenarios = []
for mode in ('base', 'bonus'):
    for label in ('ordinary_win', 'loss', 'retrigger', 'multiplier_10', 'max_win'):
        book = fixtures[mode][label]
        audit_book(book, mode, reels)
        scenarios.append({'key': mode + '/' + label, 'label': label, 'mode': mode, 'book': book})
target = ROOT / 'web/game/demo-rounds.json'
target.write_text(json.dumps({
    'purpose': 'Fixed demo sequence only; not weighted outcomes, not an RTP sample, not RGS',
    'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'baseSeeds': [2026102201, 2026102202],
    'sdkCommit': json.loads((ROOT / 'sdk.lock.json').read_text())['commit'],
    'scenarios': scenarios,
}, separators=(',', ':')) + '\n')
print('Exported and independently audited', len(scenarios), 'demo books:', target.relative_to(ROOT))
