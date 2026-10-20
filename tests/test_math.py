import copy
import gzip
import json
import random
from pathlib import Path
import sys
import unittest
ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'games/midnight_plots'),str(ROOT/'tools')]
from rules import LINES,PAYS,advance_graves,evaluate,credited,MAX_WIN
from validate_math import audit_book,brute_wins

class MathTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixtures=json.loads(gzip.decompress((ROOT/'tests/fixtures.json.gz').read_bytes()))
    def board(self, middle):
        return [['S',s,'S'] for s in middle]
    def middle(self,wins):
        return next((w for w in wins if w['meta']['lineIndex']==2),None)
    def test_lines_unique_valid(self):
        self.assertEqual(len({tuple(x) for x in LINES}),20)
        self.assertTrue(all(len(x)==5 and all(y in (0,1,2) for y in x) for x in LINES))
    def test_all_symbols_all_lengths(self):
        for s,table in PAYS.items():
            for n in (3,4,5):
                board=self.board([s]*n+['S']*(5-n))
                win=self.middle(evaluate(board,[[0]*3 for _ in range(5)]))
                self.assertEqual(win['rawWin'],table[n-3])
    def test_left_to_right_and_scatter(self):
        for row in [['S','M','M','M','M'],['M','M','S','M','M']]:
            self.assertIsNone(self.middle(evaluate(self.board(row),[[0]*3 for _ in range(5)])))
    def test_best_wild_award_without_double_pay(self):
        g=[[0]*3 for _ in range(5)]
        win=self.middle(evaluate(self.board(['W','W','W','L1','L1']),g))
        self.assertEqual((win['symbol'],win['rawWin']),('W',250))
        win=self.middle(evaluate(self.board(['W','W','W','H1','H1']),g))
        self.assertEqual((win['symbol'],win['rawWin']),('H1',500))
    def test_persistent_graves_add_not_multiply(self):
        g=[[0,2,0],[0,3,0],[0,0,0],[0,10,0],[0,10,0]]
        win=self.middle(evaluate(self.board(['L1','L1','L1','S','S']),g))
        self.assertEqual(win['rawWin'],50) # Ignore graves beyond three matching symbols.
        self.assertEqual(win['meta']['multiplier'],5)
    def test_wild_ladder_and_cap(self):
        b=self.board(['W','S','S','S','S']);g=[[0]*3 for _ in range(5)]
        for expected in (2,3,5,10,10):
            advance_graves(b,g);self.assertEqual(g[0][1],expected)
        self.assertEqual(advance_graves(b,g),[])
        advance_graves(self.board(['L1']*5),g)
        self.assertEqual(g[0][1],10)
    def test_cap_partial_credit(self):
        wins=evaluate([['W']*3 for _ in range(5)],[[10]*3 for _ in range(5)])
        paid=credited(wins,17)
        self.assertEqual(sum(w['win'] for w in paid),17)
        self.assertEqual(paid[0]['win'],17)
        self.assertTrue(all(w['win']==0 for w in paid[1:]))
    def test_differential_boards(self):
        rng=random.Random(2026)
        for _ in range(3000):
            board=[[rng.choice([*PAYS,'S','W','W']) for _ in range(3)] for _ in range(5)]
            g=[[rng.choice([0,0,2,3,5,10]) for _ in range(3)] for _ in range(5)]
            rem=rng.randint(0,MAX_WIN)
            self.assertEqual(credited(evaluate(board,g),rem),brute_wins(board,g,rem))
    def test_all_saved_fixtures(self):
        for mode in ('base','bonus'):
            for book in self.fixtures[mode].values():
                audit_book(book,mode)
    def test_audit_rejects_corruption(self):
        b=self.fixtures['base']['max_win']
        for mutation in ('payout','multiplier','event_index','final','symbol'):
            bad=copy.deepcopy(b)
            if mutation=='payout': bad['payoutMultiplier']-=1
            if mutation=='multiplier':
                next(e for e in bad['events'] if e['type']=='graveMultiplierUpdate')['multipliers'][0]=99
            if mutation=='event_index': bad['events'][1]['index']=1234
            if mutation=='final': bad['events'][-1]['amount']+=1
            if mutation=='symbol': next(e for e in bad['events'] if e['type']=='reveal')['board'][0][1]['name']='INVALID'
            with self.assertRaises(ValueError): audit_book(bad,'base')

if __name__=='__main__': unittest.main()
