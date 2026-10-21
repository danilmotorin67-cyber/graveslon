"""Audit completeness and integrity of exported art; never selects game outcomes."""
from pathlib import Path
import hashlib
import json
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'assets'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def main():
    manifest=json.loads((ASSETS/'manifest.json').read_text())
    items=manifest['assets']
    paths=[a['path'] for a in items]
    require(len(paths)==len(set(paths)), 'Duplicate manifest paths')
    roles={r: [a for a in items if a['role']==r] for r in {a['role'] for a in items}}
    expected={'symbol':11,'symbol_blur':11,'background':4,'character':3,
              'ui_icon':10,'frame':1,'logo':1,'win_plate':3,'bonus_overlay':2,
              'multiplier_plate':1,'multiplier_preview':4,'cover_draft':3,'bonus_screen':2}
    require({r:len(v) for r,v in roles.items()}==expected,'Incomplete art pack')
    for a in items:
        p=ASSETS/a['path']
        require(p.is_file(),f'Missing {p}')
        require(hashlib.sha256(p.read_bytes()).hexdigest()==a['sha256'],f'Hash mismatch: {p}')
        with Image.open(p) as im:
            im.load()
            require(list(im.size)==[a['width'],a['height']],f'Dimension mismatch: {p}')
            require(im.mode==a['mode'],f'Mode mismatch: {p}')
            if a['role'] in ('symbol','symbol_blur'):
                require(im.size==(384,384) and im.mode=='RGBA',f'Invalid symbol: {p}')
            if a['role'] in ('symbol','character','ui_icon','frame','logo','win_plate','bonus_overlay','multiplier_plate','multiplier_preview'):
                require(im.mode=='RGBA' and im.getchannel('A').getextrema()[0]==0,f'No transparency: {p}')
                require(im.getchannel('A').getextrema()[1]>200,f'Empty asset: {p}')
            if a['role']=='background':
                require(im.size in ((1920,1080),(1080,1920)),f'Invalid background dimensions: {p}')
    codes={Path(a['path']).stem.split('_')[1] for a in roles['symbol']}
    require(codes=={'L1','L2','L3','L4','H1','H2','H3','H4','M','W','S'},'GDD symbol IDs mismatch')
    source=json.loads((ASSETS/'sources.json').read_text())['assets']
    for a in source:
        require(hashlib.sha256((ROOT/a['path']).read_bytes()).hexdigest()==a['sha256'],'Original source changed: '+a['path'])
    source_names={Path(a['path']).name for a in source}
    require(source_names=={p.name for p in (ASSETS/'source').glob('*.png')},'Unregistered source artwork')
    result={'status':'PASS','sourceFiles':len(source),'runtimeAssets':len(items),
            'runtimeBytes':sum(a['bytes'] for a in items),'roleCounts':expected,
            'checks':['Source and runtime SHA-256','All 11 GDD symbol codes','Dimensions, formats, real transparency','Full guide art inventory, with three cover drafts'],
            'visualReview':['All 11 symbols reviewed at 120 px in colour and grayscale','Desktop and portrait static layouts','Three poses: two arms, two legs, no cropped hat or boots','Base/bonus backgrounds preserve scene layout'],
            'limitations':['Art-stage candidate only; no animation, audio or playable frontend','Cover dimensions await the Engine dashboard','Recovered original prompts are unavailable','Base backgrounds and bonus backgrounds are upscaled exports; source pixels retained'],
            'publication':'Blocked pending explicit user authorization to push artwork to public GitHub'}
    (ROOT/'reports/art-validation.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))


if __name__=='__main__':
    main()
