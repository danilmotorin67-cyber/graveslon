"""Sequential SDK simulation + maximum-entropy weight calibration. No runtime RNG."""
import argparse
import csv
import hashlib
import json
import math
import time
from pathlib import Path
import numpy as np
import zstandard as zstd
from bootstrap import ROOT
from game_config import GameConfig
from gamestate import GameState
from rules import COSTS, MAX_WIN

TOTAL_WEIGHT = 10**12

def tilt(values, target):
    """Maximum entropy distribution at one required mean, solved by bisection."""
    x=np.array(values,dtype=np.float64)
    if len(x)==0 or target < min(x) or target > max(x):
        raise ValueError(f'Target {target} outside sampled support')
    scale=max(1,float(np.std(x)))
    x=(x-target)/scale
    def prob(t):
        a=t*x
        a-=a.max()
        p=np.exp(a)
        return p/p.sum()
    lo,hi=-1.,1.
    while np.dot(prob(lo),x)>0: lo*=2
    while np.dot(prob(hi),x)<0: hi*=2
    for _ in range(100):
        mid=(lo+hi)/2
        if np.dot(prob(mid),x)>0: hi=mid
        else: lo=mid
    return prob((lo+hi)/2)

def allocate(prob, budget):
    # Reserve one integer unit for each book, ensuring no unreachable sample.
    raw=prob*(budget-len(prob))
    ints=np.floor(raw).astype(np.int64)+1
    left=budget-int(ints.sum())
    order=np.argsort(-(raw-np.floor(raw)),kind='stable')
    ints[order[:left]]+=1
    return ints

def optimize(rows, mode):
    weights=np.zeros(len(rows),dtype=np.int64)
    buckets={}
    for i,row in enumerate(rows):
        payout=row['payout']
        cat='cap' if payout==MAX_WIN else ('feature' if row['feature'] else ('win' if payout else 'zero'))
        buckets.setdefault(cat,[]).append(i)
    if mode=='base':
        # 25% positive-round target, 1/250 bonus, 37.5% RTP from triggered rounds.
        plan={'zero':(.75,0),'win':(.246,60.125/.246),
              'feature':(.004-1e-7,(36.075-.05)/(.004-1e-7)), 'cap':(1e-7,MAX_WIN)}
    else:
        plan={'feature':(1-1e-5,(9620-5)/(1-1e-5)), 'cap':(1e-5,MAX_WIN)}
    # Any rare zero-paying feature is kept inside feature bucket; report actual hit rate.
    for cat,(mass,mean) in plan.items():
        indices=buckets.get(cat,[])
        if not indices: raise ValueError(f'Missing bucket {cat}; increase simulation size')
        values=[rows[i]['payout'] for i in indices]
        p=np.full(len(indices),1/len(indices)) if len(set(values))==1 else tilt(values,mean)
        weights[indices]=allocate(p,round(mass*TOTAL_WEIGHT))
    if int(weights.sum()) != TOTAL_WEIGHT or np.any(weights<=0):
        raise ValueError('Invalid integer weights')
    return [int(w) for w in weights]

def summarize(rows,weights,mode):
    total=sum(weights)
    cost=COSTS[mode]
    mean=sum(r['payout']*w for r,w in zip(rows,weights))/total/100
    hit=sum(w for r,w in zip(rows,weights) if r['payout']>0)/total
    freq=sum(w for r,w in zip(rows,weights) if r['feature'])/total
    cap=sum(w for r,w in zip(rows,weights) if r['payout']==MAX_WIN)/total
    base=sum(r['base']*w for r,w in zip(rows,weights))/total/100/cost
    free=sum(r['free']*w for r,w in zip(rows,weights))/total/100/cost
    sd=math.sqrt(sum(w*(r['payout']/100/cost-mean/cost)**2 for r,w in zip(rows,weights))/total)
    bins=[(0,0),(.01,.99),(1,4.99),(5,19.99),(20,99.99),(100,499.99),(500,4999.99),(5000,5000)]
    return {'mode':mode,'rounds':len(rows),'totalWeight':total,'rtp':mean/cost,'baseRtp':base,'freeSpinRtp':free,
        'hitRate':hit,'featureFrequency':freq,'featureOneIn':1/freq,'maxWin':max(r['payout'] for r in rows)/100,
        'maxWinOneIn':1/cap,'standardDeviationPerCost':sd,'effectiveSampleSize':total**2/sum(w*w for w in weights),
        'aboveCostRate':sum(w for r,w in zip(rows,weights) if r['payout']>100*cost)/total,
        'payoutBands':[{'from':lo,'to':hi,'probability':sum(w for r,w in zip(rows,weights) if lo<=r['payout']/100<=hi)/total} for lo,hi in bins]}

def build(count, out, seed):
    config=GameConfig()
    game=GameState(config)
    out.mkdir(parents=True,exist_ok=True)
    reports=ROOT/'reports'
    reports.mkdir(exist_ok=True)
    statistics=[]
    checks={}
    for mode in COSTS:
        start=time.monotonic()
        rows=[]
        examples={}
        game.betmode=mode
        with (out/f'books_{mode}.jsonl.zst').open('wb') as file:
            with zstd.ZstdCompressor(level=9).stream_writer(file) as stream:
                for i in range(count):
                    # Stratified generation proportions are NOT the final runtime probabilities.
                    frac=i/count
                    game.criteria=('wincap' if i<max(2,count//1000) else
                        ('freegame' if mode=='bonus' or frac<.1 else ('zero' if frac<.55 else 'basegame')))
                    game.run_spin(i, seed+i+(0 if mode=='base' else 10000000))
                    book=game.book.to_json()
                    book['id']=i+1
                    row={'payout':game.total_units,'base':game.base_units,'free':game.free_units,'feature':game.triggered_freegame}
                    rows.append(row)
                    stream.write((json.dumps(book,separators=(',',':'))+'\n').encode())
                    keys=[]
                    if row['payout']==0: keys.append('loss')
                    if 0<row['payout']<2000: keys.append('ordinary_win')
                    if row['payout']>=2000: keys.append('big_win')
                    if row['payout']==MAX_WIN: keys.append('max_win')
                    if row['feature']: keys.append('bonus_trigger')
                    for event in book['events']:
                        if event['type']=='freeSpinRetrigger': keys.append('retrigger')
                        if event['type']=='graveMultiplierUpdate' and 10 in event['multipliers']: keys.append('multiplier_10')
                        if event['type']=='winInfo':
                            keys.extend(f"symbol_{w['symbol']}_{w['kind']}" for w in event['wins'])
                    for key in set(keys): examples.setdefault(key,book)
                    if (i+1)%10000==0: print(f'{mode}: {i+1}/{count}, {time.monotonic()-start:.1f}s',flush=True)
        weights=optimize(rows,mode)
        with (out/f'lookUpTable_{mode}_0.csv').open('w',newline='') as f:
            csv.writer(f,lineterminator='\n').writerows((i+1,w,r['payout']) for i,(r,w) in enumerate(zip(rows,weights)))
        stats=summarize(rows,weights,mode)
        statistics.append(stats)
        checks[mode]={key:b['id'] for key,b in sorted(examples.items())}
        fixture_dir=ROOT/'tests/fixtures'/mode
        fixture_dir.mkdir(parents=True,exist_ok=True)
        for key,book in examples.items():
            (fixture_dir/f'{key}.json').write_text(json.dumps(book,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps(stats,indent=2),flush=True)
    index={'modes':[{'name':mode,'cost':float(cost),'events':f'books_{mode}.jsonl.zst','weights':f'lookUpTable_{mode}_0.csv'} for mode,cost in COSTS.items()]}
    (out/'index.json').write_text(json.dumps(index,indent=2)+'\n')
    hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.iterdir()) if p.is_file()}
    report={'status':'candidate_not_platform_approved','seed':seed,'samplesPerMode':count,
            'sdk':json.loads((ROOT/'sdk.lock.json').read_text()),'statistics':statistics,'sha256':hashes,
            'calibration':'Maximum entropy per stratum; positive uint64 weights with total 10^12',
            'note':'RTP is weighted full-library expectation, not the unweighted simulation average.'}
    (reports/'math-report.json').write_text(json.dumps(report,indent=2)+'\n')
    (reports/'control-rounds.json').write_text(json.dumps(checks,indent=2)+'\n')

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--count',type=int,default=100000)
    p.add_argument('--seed',type=int,default=20261020)
    p.add_argument('--out',type=Path,default=ROOT/'games/midnight_plots/library/publish_files')
    a=p.parse_args()
    if a.count<1000: p.error('Use at least 1000 rounds per mode')
    build(a.count,a.out,a.seed)
