"""Canonical rules. All payouts are integer hundredths of the TOTAL bet."""
LINES = [
 [0,0,0,0,0], [1,1,1,1,1], [2,2,2,2,2], [0,1,2,1,0], [2,1,0,1,2],
 [0,0,1,2,2], [2,2,1,0,0], [1,0,1,2,1], [1,2,1,0,1], [0,1,1,1,2],
 [2,1,1,1,0], [0,1,0,1,2], [2,1,2,1,0], [1,1,0,1,1], [1,1,2,1,1],
 [0,2,1,0,2], [2,0,1,2,0], [0,0,2,0,0], [2,2,0,2,2], [1,0,0,0,1],
]
PAYS = {
 'L1': [10,30,100], 'L2': [15,40,150], 'L3': [20,50,200], 'L4': [25,75,300],
 'H1': [50,150,500], 'H2': [75,200,750], 'H3': [100,300,1000],
 'H4': [150,500,2000], 'M': [250,1000,5000], 'W': [250,1000,5000],
}
SYMBOLS = {
 'L1': ['Свеча','Candle'], 'L2': ['Ключ от склепа','Crypt Key'],
 'L3': ['Ворон','Raven'], 'L4': ['Яд','Poison'], 'H1': ['Фонарь','Lantern'],
 'H2': ['Летучая мышь','Vampire Bat'], 'H3': ['Зомби-кот','Undead Cat'],
 'H4': ['Ведьма-вдова','Witch Widow'], 'M': ['Мортимер','Mortimer'],
 'W': ['Рука из могилы','Grave Hand'], 'S': ['Гроб с цепями','Chained Coffin'],
}
LADDER = (2,3,5,10)
MAX_WIN = 500_000
FS = {3:10,4:12,5:15}
COSTS = {'base':1,'bonus':100}
TARGET_RTP = 0.962


def advance_graves(board, graves):
    changed = []
    for reel in range(5):
        for row in range(3):
            if board[reel][row] == 'W':
                old = graves[reel][row]
                new = LADDER[0] if old == 0 else LADDER[min(LADDER.index(old)+1,3)]
                if new != old:
                    graves[reel][row] = new
                    changed.append((reel,row,new))
    return changed


def evaluate(board, graves):
    """One best award per line. Grave multipliers add on winning positions only."""
    wins = []
    for lid,line in enumerate(LINES,1):
        cells = [board[r][line[r]] for r in range(5)]
        leading = 0
        while leading < 5 and cells[leading] == 'W':
            leading += 1
        candidates = []
        if leading >= 3:
            candidates.append(('W',leading,PAYS['W'][leading-3]))
        if leading < 5 and cells[leading] in PAYS:
            symbol = cells[leading]
            count = leading
            while count < 5 and cells[count] in (symbol,'W'):
                count += 1
            if count >= 3:
                candidates.append((symbol,count,PAYS[symbol][count-3]))
        best = None
        for symbol,count,base in candidates:
            multiplier = max(1,sum(graves[r][line[r]] for r in range(count)))
            amount = base * multiplier
            if best is None or amount > best['rawWin']:
                best = {'symbol':symbol, 'kind':count, 'rawWin':amount,
                        'positions':[{'reel':r,'row':line[r]+1} for r in range(count)],
                        'meta':{'lineIndex':lid,'multiplier':multiplier,'winWithoutMult':base}}
        if best:
            wins.append(best)
    return wins


def credited(wins, remaining):
    out = []
    for win in wins:
        value = min(win['rawWin'],remaining)
        remaining -= value
        out.append({**win,'win':value})
    return out
