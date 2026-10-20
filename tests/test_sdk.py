import json
from pathlib import Path
import sys
import unittest
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
import bootstrap
from game_config import GameConfig
from gamestate import GameState
from validate_math import audit_book

class SDKIntegrationTests(unittest.TestCase):
    def test_round_reset_seed_and_two_modes(self):
        game=GameState(GameConfig())
        for mode in ('base','bonus'):
            game.betmode=mode;game.criteria='freegame'
            game.run_spin(42,20261020)
            first=game.book.to_json();first['id']=43
            audit_book(first,mode)
            game.run_spin(19,12345)
            game.run_spin(42,20261020)
            second=game.book.to_json();second['id']=43
            self.assertEqual(first,second)
        game.betmode='base';game.criteria='basegame'
        game.run_spin(3,9876)
        self.assertEqual(game.graves,[[0]*3 for _ in range(5)])
        self.assertFalse(game.triggered_freegame)
    def test_real_cap_ends_bonus(self):
        game=GameState(GameConfig());game.betmode='bonus';game.criteria='wincap'
        game.run_spin(0,99)
        book=game.book.to_json();book['id']=1
        audit_book(book,'bonus')
        self.assertEqual(book['payoutMultiplier'],500000)
        types=[e['type'] for e in book['events']]
        self.assertEqual(types[-3:],['wincap','freeSpinEnd','finalWin'])

if __name__=='__main__': unittest.main()
