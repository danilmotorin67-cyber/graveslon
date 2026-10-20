"""Independent replay audit: integer payouts, boards, every event, free spins and weights."""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import sys
import zstandard as zstd
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'games/midnight_plots'))
from rules import PAYS, LINES, MAX_WIN, FS, COSTS


def require(test, message):
    if not test: raise ValueError(message)


def brute_wins(board, graves, remaining):
    """Enumerate each possible paytable symbol, independent of production prefix logic."""
    result=[]
    for lid,line in enumerate(LINES,1):
        candidates=[]
        for symbol,pays in PAYS.items():
            n=0
            for reel,row in enumerate(line):
                if board[reel][row] == symbol or (symbol!='W' and board[reel][row]=='W'):
                    n+=1
                else: break
            if n<3: continue
            # Pure wild prefixes pay as W, never invent an ordinary symbol.
            if symbol!='W' and all(board[r][line[r]]=='W' for r in range(n)): continue
            mult=sum(graves[r][line[r]] for r in range(n)) or 1
            candidates.append((pays[n-3]*mult,symbol,n,mult,pays[n-3]))
        if not candidates: continue
        # Production tie-break favours W over an equal ordinary candidate.
        raw,symbol,n,mult,base=max(candidates,key=lambda c:(c[0],c[1]=='W'))
        paid=min(raw,remaining)
        remaining-=paid
        result.append({'symbol':symbol,'kind':n,'rawWin':raw,'win':paid,
            'positions':[{'reel':r,'row':line[r]+1} for r in range(n)],
            'meta':{'lineIndex':lid,'multiplier':mult,'winWithoutMult':base}})
    return result


def load_reels():
    result={}
    for path in (ROOT/'games/midnight_plots/reels').glob('*.csv'):
        with path.open() as f:
            result[path.stem]=list(map(list,zip(*csv.reader(f))))
    return result


def audit_book(book, mode, reels=None):
    require(type(book['id']) is int and book['id']>0,'book id')
    events=book['events']
    require(all(e['index']==i for i,e in enumerate(events)),'event index sequence')
    cursor=0
    def take(kind, **expected):
        nonlocal cursor
        require(cursor<len(events),f'missing {kind}')
        e=events[cursor];cursor+=1
        require(e['type']==kind,f"expected {kind}, got {e['type']}")
        for key,val in expected.items(): require(e.get(key)==val,f'{kind}.{key} mismatch')
        return e
    total=base=free=0
    graves=[[0]*3 for _ in range(5)]
    spin=0;allowed=0;feature=False
    while True:
        in_free=spin>0
        if in_free: take('updateFreeSpin',amount=spin,total=allowed)
        e=take('reveal',gameType='freegame' if in_free else 'basegame')
        require(len(e['board'])==5 and all(len(c)==5 for c in e['board']),'padded 5x5 board')
        require(len(e['paddingPositions'])==5,'reel stop count')
        board=[[c[y]['name'] for y in (1,2,3)] for c in e['board']]
        require(all(s in (*PAYS,'S') for c in board for s in c),'unknown symbol')
        if reels:
            name='BR0' if not in_free else ('WCAP' if book['criteria']=='wincap' else 'FR0')
            for r,col in enumerate(e['board']):
                strip=reels[name][r];stop=e['paddingPositions'][r]
                require([v['name'] for v in col]==[strip[(stop+y)%len(strip)] for y in (-1,0,1,2,3)],'reel strip mismatch')
        if in_free:
            positions=[];multipliers=[]
            for r in range(5):
                for y in range(3):
                    if board[r][y]=='W':
                        old=graves[r][y];new={0:2,2:3,3:5,5:10,10:10}[old]
                        if new!=old:
                            positions.append({'reel':r,'row':y+1});multipliers.append(new)
                            graves[r][y]=new
            if positions: take('graveMultiplierUpdate',positions=positions,multipliers=multipliers)
        wins=brute_wins(board,graves,MAX_WIN-total)
        amount=sum(w['win'] for w in wins)
        total+=amount
        if in_free: free+=amount
        else: base+=amount
        if wins:
            take('winInfo',wins=wins,totalWin=amount)
            take('setWin',amount=amount)
        take('setTotalWin',amount=total)
        if total==MAX_WIN:
            take('wincap',amount=MAX_WIN)
            if in_free: take('freeSpinEnd',amount=free)
            break
        positions=[{'reel':r,'row':y+1} for r in range(5) for y in range(3) if board[r][y]=='S']
        require(len(positions)<=5,'too many scatters')
        if not in_free:
            if len(positions)<3:
                require(mode!='bonus','bonus purchase without trigger')
                break
            allowed=FS[len(positions)];feature=True
            take('freeSpinTrigger',totalFs=allowed,positions=positions)
            spin=1
        else:
            if len(positions)>=3:
                allowed+=5
                take('freeSpinRetrigger',totalFs=allowed,positions=positions)
            if spin==allowed:
                take('freeSpinEnd',amount=free)
                break
            spin+=1
    take('finalWin',amount=total)
    require(cursor==len(events),'trailing events')
    require(type(book['payoutMultiplier']) is int and book['payoutMultiplier']==total,'book payout mismatch')
    require(round(book['baseGameWins']*100)==base and round(book['freeGameWins']*100)==free,'base/free split')
    return {'payout':total,'base':base,'free':free,'feature':feature}


def validate(path):
    index=json.loads((path/'index.json').read_text())
    require({m['name']:m['cost'] for m in index['modes']}==COSTS,'modes/costs')
    reels=load_reels();results=[]
    for mode in index['modes']:
        name=mode['name'];sumw=paid=hits=features=caps=base=free=0;count=0
        lut=iter(csv.reader((path/mode['weights']).open()))
        with (path/mode['events']).open('rb') as src:
            with zstd.ZstdDecompressor().stream_reader(src) as raw:
                for line in io.TextIOWrapper(raw,encoding='utf-8'):
                    book=json.loads(line);row=next(lut,None)
                    require(row is not None and len(row)==3,'LUT shorter than books')
                    require(all(s.isdigit() for s in row),'LUT integer format')
                    bid,w,p=map(int,row)
                    count+=1
                    require(bid==book['id']==count,'IDs must be sequential, unique, matching')
                    require(0<w<2**64 and 0<=p<=MAX_WIN,'uint64 weight or capped payout')
                    try: result=audit_book(book,name,reels)
                    except (ValueError,KeyError,IndexError) as ex:
                        raise ValueError(f'{name} book {bid}: {ex}') from ex
                    require(p==result['payout'],'CSV/book payout mismatch')
                    sumw+=w;paid+=w*p;hits+=w*(p>0);features+=w*result['feature'];caps+=w*(p==MAX_WIN)
                    base+=w*result['base'];free+=w*result['free']
        require(next(lut,None) is None,'LUT longer than books')
        rtp=paid/(sumw*100*mode['cost'])
        require(abs(rtp-.962)<1e-6,f'RTP out of tolerance: {rtp}')
        require(caps>0,'no reachable max win')
        if name=='base':
            require(abs(hits/sumw-.25)<.001,'base hit rate')
            require(150<=sumw/features<=250.00001,'base feature frequency')
            require(.35<=free/paid<=.40,'freegame RTP share')
            require(sumw/caps<=10000000.0001,'base max win frequency')
        else: require(features==sumw,'every bonus must trigger')
        results.append({'mode':name,'auditedBooks':count,'rtp':rtp,'hitRate':hits/sumw,
                        'featureOneIn':sumw/features,'maxWinOneIn':sumw/caps,'freeGameShareOfRtp':free/paid})
        print(f'{name}: audited {count} books; RTP {rtp:.10%}; PASS',flush=True)
    report={'status':'PASS','validator':'independent brute-force event replay','results':results,
            'sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in path.iterdir() if p.is_file()}}
    (ROOT/'reports/validation.json').write_text(json.dumps(report,indent=2)+'\n')
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('path',nargs='?',type=Path,default=ROOT/'games/midnight_plots/library/publish_files')
    validate(p.parse_args().path)
