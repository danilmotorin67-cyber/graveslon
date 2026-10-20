"""Stake Math SDK lines configuration; SDK sources remain unmodified."""
from pathlib import Path
from src.config.config import Config
from src.config.betmode import BetMode
from src.config.distributions import Distribution
from rules import LINES, PAYS, FS, COSTS, TARGET_RTP

class GameConfig(Config):
    def __init__(self):
        super().__init__()
        root = Path(__file__).resolve().parent
        self.game_id = self.game_name = 'midnight_plots'
        self.working_name = 'Midnight Plots'
        self.provider_name = 'Motor'
        self.provider_number = 0  # Assigned by platform before submission.
        self.wincap = 5000
        self.rtp = TARGET_RTP
        self.win_type = 'lines'
        self.reels_path = str(root / 'reels')
        self.library_path = str(root / 'library')
        self.publish_path = str(root / 'library/publish_files')
        self.num_reels, self.num_rows = 5, [3]*5
        self.paytable = {(n,s):p[n-3]/100 for s,p in PAYS.items() for n in (3,4,5)}
        self.paylines = dict(enumerate(LINES,1))
        self.include_padding = True
        self.special_symbols = {'wild':['W'],'scatter':['S']}
        self.freespin_triggers = {'basegame':FS,'freegame':{3:5,4:5,5:5}}
        self.anticipation_triggers = {'basegame':2,'freegame':2}
        self.reels = {name:self.read_reels_csv(root/'reels'/f'{name}.csv') for name in ('BR0','FR0','WCAP')}
        self.padding_reels = {'basegame':self.reels['BR0'],'freegame':self.reels['FR0']}
        self.bet_modes = []
        for mode,cost in COSTS.items():
            distributions = []
            for name,quota in ([('zero',.45),('basegame',.45),('freegame',.099),('wincap',.001)] if mode=='base' else [('freegame',.999),('wincap',.001)]):
                conditions = {'reel_weights':{'basegame':{'BR0':1},'freegame':{'WCAP':1} if name=='wincap' else {'FR0':1}},
                              'scatter_triggers':{3:85,4:12,5:3},
                              'force_freegame':name in ('freegame','wincap'), 'force_wincap':name=='wincap'}
                distributions.append(Distribution(criteria=name,quota=quota,conditions=conditions))
            self.bet_modes.append(BetMode(name=mode,cost=cost,rtp=self.rtp,max_win=self.wincap,
                auto_close_disabled=False,is_feature=mode=='base',is_buybonus=mode=='bonus',distributions=distributions))
