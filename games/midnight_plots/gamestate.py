"""Lines-template flow extended with persistent grave multipliers and integer accounting."""
from src.executables.executables import Executables
from rules import MAX_WIN, FS, advance_graves, evaluate, credited

class GameState(Executables):
    def assign_special_sym_function(self):
        self.special_symbol_functions = {}

    def reset_book(self):
        super().reset_book()
        self.graves = [[0]*3 for _ in range(5)]
        self.total_units = self.base_units = self.free_units = 0

    def emit(self, kind, **fields):
        self.book.add_event({'index':len(self.book.events),'type':kind,**fields})

    def evaluate_board(self):
        names = [[s.name for s in reel] for reel in self.board]
        if self.gametype == 'freegame':
            changed = advance_graves(names,self.graves)
            if changed:
                self.emit('graveMultiplierUpdate',positions=[{'reel':r,'row':y+1} for r,y,_ in changed],
                          multipliers=[m for _,_,m in changed])
        wins = credited(evaluate(names,self.graves),MAX_WIN-self.total_units)
        amount = sum(w['win'] for w in wins)
        self.total_units += amount
        if self.gametype == 'basegame':
            self.base_units += amount
        else:
            self.free_units += amount
        if wins:
            self.emit('winInfo',wins=wins,totalWin=amount)
            self.emit('setWin',amount=amount,winLevel=self.config.get_win_level(amount/100,'standard'))
        self.emit('setTotalWin',amount=self.total_units)
        self.wincap_triggered = self.total_units == MAX_WIN
        if self.wincap_triggered:
            self.emit('wincap',amount=MAX_WIN)

    def scatter_positions(self):
        return [{'reel':p['reel'],'row':p['row']+1} for p in self.special_syms_on_board['scatter']]

    def run_spin(self, sim, simulation_seed=None):
        self.reset_seed(sim, seed_override=simulation_seed)
        for attempt in range(10000):
            self.reset_book()
            self.draw_board()
            self.evaluate_board()
            scatters = self.count_special_symbols('scatter')
            if scatters >= 3 and not self.wincap_triggered:
                self.tot_fs = FS[scatters]
                self.emit('freeSpinTrigger',totalFs=self.tot_fs,positions=self.scatter_positions())
                self.run_freespin()
            if self.criteria == 'zero' and self.total_units != 0:
                continue
            if self.criteria == 'basegame' and (self.total_units == 0 or self.triggered_freegame):
                continue
            if self.criteria == 'wincap' and self.total_units != MAX_WIN:
                continue
            self.emit('finalWin',amount=self.total_units)
            self.book.payout_multiplier = self.total_units/100
            self.book.basegame_wins = self.base_units/100
            self.book.freegame_wins = self.free_units/100
            return
        raise RuntimeError(f'Acceptance exhausted: {self.betmode}/{self.criteria}/{sim}')

    def run_freespin(self):
        self.triggered_freegame = True
        self.gametype = 'freegame'
        self.fs = 0
        while self.fs < self.tot_fs and not self.wincap_triggered:
            if self.fs >= 1000:
                raise RuntimeError('Unexpected 1000-spin round: investigate, never truncate silently')
            self.fs += 1
            self.emit('updateFreeSpin',amount=self.fs,total=self.tot_fs)
            self.draw_board()
            self.evaluate_board()
            if self.count_special_symbols('scatter') >= 3 and not self.wincap_triggered:
                self.tot_fs += 5
                self.emit('freeSpinRetrigger',totalFs=self.tot_fs,positions=self.scatter_positions())
        self.emit('freeSpinEnd',amount=self.free_units,winLevel=self.config.get_win_level(self.free_units/100,'endFeature'))
