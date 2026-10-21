"""Reproducible exports from immutable artwork and editable vector UI.

No generative model is used here: only resizing, vertical motion blur, SVG
rendering, and composition of existing layers, as in guide sections 3.3–3.5.
"""
from pathlib import Path
import hashlib
import json
import io
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps
import cairosvg
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets'
SOURCE = ASSETS / 'source'
RUNTIME = ASSETS / 'runtime'
VECTOR = ASSETS / 'vector'
PREVIEW = ASSETS / 'preview'
FONT_PATH = ASSETS / 'fonts/DejaVuSerif-Bold.ttf'
font = TTFont(FONT_PATH)
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
upem = font['head'].unitsPerEm
records = []


def record(path, role, source, **extra):
    im = Image.open(path)
    records.append(dict(path=path.relative_to(ASSETS).as_posix(), role=role,
                        source=source, width=im.width, height=im.height,
                        mode=im.mode, bytes=path.stat().st_size,
                        sha256=hashlib.sha256(path.read_bytes()).hexdigest(), **extra))


def save(im, relative, role, source, **extra):
    path = RUNTIME / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    output = io.BytesIO()
    if path.suffix == '.jpg':
        im.convert('RGB').save(output, format='JPEG', quality=91, subsampling=0, optimize=True)
    else:
        im.save(output, format='PNG', optimize=True)
    temporary = path.with_suffix(path.suffix+'.tmp')
    temporary.write_bytes(output.getvalue())
    temporary.replace(path)
    record(path, role, source, **extra)
    return path


def resize(im, size):
    # Pillow's RGBa mode resamples premultiplied alpha and avoids dark halos.
    if im.mode == 'RGBA':
        return im.convert('RGBa').resize(size, Image.Resampling.LANCZOS).convert('RGBA')
    return im.resize(size, Image.Resampling.LANCZOS)


def vertical_blur(im, radius=20):
    # A true 41-pixel vertical kernel, not Gaussian blur in both directions.
    rgba = np.asarray(im, dtype=np.float64) / 255
    rgba[:, :, :3] *= rgba[:, :, 3:4]
    padded = np.pad(rgba, ((radius, radius), (0, 0), (0, 0)))
    cumsum = np.concatenate([np.zeros_like(padded[:1]), np.cumsum(padded, axis=0)])
    out = (cumsum[2*radius+1:] - cumsum[:-2*radius-1]) / (2*radius+1)
    np.divide(out[:, :, :3], out[:, :, 3:4], out=out[:, :, :3], where=out[:, :, 3:4] > 0)
    return Image.fromarray(np.uint8(np.clip(out * 255, 0, 255) + .5))


def text_path(text, x, baseline, size, fill='#edcf8c', max_width=None):
    names = [cmap[ord(c)] for c in text]
    advance = sum(font['hmtx'][n][0] for n in names)
    scale = size / upem
    if max_width:
        scale = min(scale, max_width / advance)
    x -= advance * scale / 2
    parts = []
    for name in names:
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(pen)
        parts.append(f'<path d="{pen.getCommands()}" transform="translate({x:.3f} {baseline}) scale({scale:.6f} {-scale:.6f})" fill="{fill}"/>')
        x += font['hmtx'][name][0] * scale
    return ''.join(parts)


def svg(w, h, body):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
    <defs><linearGradient id="metal" x2="0" y2="1"><stop stop-color="#f2d691"/><stop offset=".4" stop-color="#8d6b39"/><stop offset=".65" stop-color="#d5b776"/><stop offset="1" stop-color="#51402e"/></linearGradient>
    <linearGradient id="stone" x2="0" y2="1"><stop stop-color="#292b37"/><stop offset="1" stop-color="#0c101b"/></linearGradient></defs>{body}</svg>'''


def vector(name, w, h, body, role):
    VECTOR.mkdir(parents=True, exist_ok=True)
    path = VECTOR / (name + '.svg')
    path.write_text(svg(w, h, body))
    target = RUNTIME / 'ui' / (name + '.png')
    target.parent.mkdir(parents=True, exist_ok=True)
    data = cairosvg.svg2png(url=str(path))
    temporary = target.with_suffix('.png.tmp')
    temporary.write_bytes(data)
    temporary.replace(target)
    record(target, role, path.relative_to(ASSETS).as_posix())
    return Image.open(target).convert('RGBA')


def plate(w=1536, h=1024, accent='#89dd94'):
    return f'''<path d="M110 310 L180 270 H{w-180} L{w-110} 310 V680 L{w-180} 720 H180 L110 680Z" fill="url(#stone)" stroke="url(#metal)" stroke-width="14"/>
    <path d="M140 330 L195 300 H{w-195} L{w-140} 330 V660 L{w-195} 690 H195 L140 660Z" fill="none" stroke="#665a44" stroke-width="3"/>
    <path d="M{w/2-80} 260 L{w/2} 210 L{w/2+80} 260 L{w/2} 290Z" fill="#131820" stroke="url(#metal)" stroke-width="6"/>
    <path d="M{w/2} 229 L{w/2+20} 255 L{w/2} 274 L{w/2-20} 255Z" fill="{accent}"/>
    <path d="M{w/2-170} 756 H{w/2+170}" stroke="{accent}" stroke-width="4"/>
    <path d="M78 430 L110 470 L78 510 L48 470Z M{w-78} 430 L{w-110} 470 L{w-78} 510 L{w-48} 470Z" fill="#1b222b" stroke="url(#metal)" stroke-width="5"/>'''


def build_ui():
    # Frame opening: x=64,y=64,width=1152,height=624, ratio 24:13.
    body = '''<rect x="24" y="24" width="1232" height="704" rx="44" fill="none" stroke="#090d14" stroke-width="40"/>
    <rect x="31" y="31" width="1218" height="690" rx="35" fill="none" stroke="url(#metal)" stroke-width="14"/>
    <rect x="54" y="54" width="1172" height="644" rx="15" fill="none" stroke="#76ba8e" stroke-width="3"/>'''
    for x, y, sx, sy in [(14,14,1,1),(1266,14,-1,1),(14,738,1,-1),(1266,738,-1,-1)]:
        body += f'''<g transform="translate({x} {y}) scale({sx} {sy})"><path d="M0 130 V48 Q0 0 48 0 H140 L110 18 H50 Q18 18 18 50 V110Z" fill="#1c242a" stroke="url(#metal)" stroke-width="5"/><path d="M28 44 L45 27 L62 44 L45 61Z" fill="#75e68c" stroke="#b3e4a3" stroke-width="3"/></g>'''
    vector('reel_frame',1280,752,body,'frame')
    logo = '<path d="M670 130 A88 88 0 1 0 830 130 A65 65 0 0 1 670 130Z" fill="#b8d9b8"/>'
    logo += text_path('MIDNIGHT',768,475,165,max_width=1370)
    logo += text_path('PLOTS',768,690,260,fill='#e8ede4',max_width=1320)
    logo += '<path d="M280 765 H635 L768 810 L901 765 H1256" fill="none" stroke="#698778" stroke-width="5"/>'
    logo_image = vector('logo_midnight_plots',1536,1024,logo,'logo')
    for label, accent in [('BIG WIN','#8cdf9b'),('MEGA WIN','#b9a1ec'),('EPIC WIN','#f8c774')]:
        vector(label.lower().replace(' ','_'),1536,1024,plate(accent=accent)+text_path(label,768,570,172,max_width=1200),'win_plate')
    vector('bonus_entry',1536,1024,plate()+text_path('OPEN GRAVES',768,465,122,max_width=1190)+text_path('FREE SPINS',768,602,80,fill='#b9dcc3'),'bonus_overlay')
    vector('bonus_result',1536,1024,plate()+text_path('GRAVES CLOSED',768,465,115,max_width=1190)+text_path('TOTAL WIN',768,602,80,fill='#b9dcc3'),'bonus_overlay')
    # Reusable blank plaque: the game draws a localised multiplier as text.
    tomb = '<path d="M80 430 V180 Q80 70 256 40 Q432 70 432 180 V430Z" fill="url(#stone)" stroke="url(#metal)" stroke-width="13"/><path d="M105 410 V185 Q105 95 256 68 Q407 95 407 185 V410Z" fill="none" stroke="#6ec38c" stroke-width="4"/>'
    vector('grave_plate',512,512,tomb,'multiplier_plate')
    for mult in (2,3,5,10):
        vector(f'grave_x{mult}',512,512,tomb+text_path(f'×{mult}',256,306,144,max_width=280),'multiplier_preview')
    paths = {
        'spin':'<path d="M170 130 A150 150 0 1 0 390 310"/><path d="M164 80 V178 H262"/>',
        'autoplay':'<path d="M220 166 L355 256 L220 346Z" fill="#d1ddcd"/><path d="M155 140 A164 164 0 1 1 120 305"/><path d="M110 154 L155 140 L170 188"/>',
        'turbo':'<path d="M280 95 L155 280 H250 L232 420 L365 220 H275Z" fill="#d1ddcd"/>',
        'bet_plus':'<path d="M146 256 H366 M256 146 V366"/>',
        'bet_minus':'<path d="M146 256 H366"/>',
        'menu':'<path d="M150 172 H362 M150 256 H362 M150 340 H362"/>',
        'sound_on':'<path d="M136 216 H195 L270 156 V356 L195 296 H136Z"/><path d="M318 195 Q370 256 318 317 M355 150 Q448 256 355 362"/>',
        'sound_off':'<path d="M126 216 H185 L260 156 V356 L185 296 H126Z"/><path d="M315 211 L399 301 M399 211 L315 301"/>',
        'info':'<circle cx="256" cy="160" r="14" fill="#d1ddcd" stroke="none"/><path d="M256 220 V354 M230 354 H282"/>',
        'close':'<path d="M177 177 L335 335 M335 177 L177 335"/>',
    }
    for name, path in paths.items():
        outer='<circle cx="256" cy="256" r="230" fill="url(#stone)" stroke="url(#metal)" stroke-width="11"/><circle cx="256" cy="256" r="207" fill="none" stroke="#495d54" stroke-width="3"/>'
        vector('icon_'+name,512,512,outer+'<g stroke="#d1ddcd" stroke-width="22" stroke-linecap="round" stroke-linejoin="round" fill="none">'+path+'</g>','ui_icon')
    return logo_image


def composite(im, layer, box):
    layer = ImageOps.contain(layer, (box[2],box[3]), Image.Resampling.LANCZOS)
    im.alpha_composite(layer, (box[0]+(box[2]-layer.width)//2,box[1]+(box[3]-layer.height)//2))


def build_covers(logo):
    # Native composition of the existing character, title, and scenery layers.
    for n, pose, background in [(1,'idle','base'),(2,'win','bonus'),(3,'bonus','base')]:
        base=Image.open(RUNTIME/f'backgrounds/bg_{background}_landscape.jpg').convert('RGBA')
        base=ImageOps.fit(base,(1200,800))
        # A simple translucent panel protects the title at lobby-thumbnail size.
        panel=Image.new('RGBA',base.size)
        ImageDraw.Draw(panel).rounded_rectangle((430,90,1170,710),40,fill=(8,12,20,205),outline=(140,113,66,230),width=3)
        base.alpha_composite(panel)
        composite(base,Image.open(RUNTIME/f'characters/mortimer_{pose}.png'),(0,0,620,800))
        composite(base,logo,(450,165,700,480))
        save(base.convert('RGB'),f'covers/cover_v{n}.jpg','cover_draft',f'Native composition: mortimer_{pose}, bg_{background}, logo',dashboardSizeConfirmed=False)


def build_reviews():
    names=sorted(SOURCE.glob('sym_*.png'))
    sheet=Image.new('RGB',(1140,510),'#10161e')
    draw=ImageDraw.Draw(sheet)
    label_font=ImageFont.truetype(str(FONT_PATH),18)
    for i,path in enumerate(names):
        im=Image.open(RUNTIME/'symbols'/path.name).convert('RGBA')
        thumb=resize(im,(120,120))
        x=20+(i%6)*185; y=20+(i//6)*245
        sheet.paste(thumb,(x+25,y),thumb)
        gray=ImageOps.grayscale(thumb).convert('RGBA');gray.putalpha(thumb.getchannel('A'))
        sheet.paste(gray,(x+25,y+118),gray)
        draw.text((x+48,y+222),path.stem.split('_')[1],font=label_font,fill='#d4c5a8')
    PREVIEW.mkdir(exist_ok=True)
    sheet.save(PREVIEW/'symbols_120px.jpg',quality=95)
    # Review image of a static art layout; it is deliberately not a playable slot.
    canvas=Image.open(RUNTIME/'backgrounds/bg_base_landscape.jpg').convert('RGBA')
    canvas=resize(canvas,(1920,1080))
    composite(canvas,Image.open(RUNTIME/'characters/mortimer_idle.png'),(20,170,360,800))
    frame=Image.open(RUNTIME/'ui/reel_frame.png')
    composite(canvas,frame,(382,250,1280,752))
    plate=Image.new('RGBA',canvas.size)
    ImageDraw.Draw(plate).rounded_rectangle((446,314,1598,938),18,fill=(9,15,23,225))
    canvas.alpha_composite(plate)
    for col in range(5):
        for row in range(3):
            im=Image.open(RUNTIME/'symbols'/names[(col*3+row)%11].name)
            composite(canvas,im,(451+col*230,318+row*208,216,200))
    composite(canvas,Image.open(RUNTIME/'ui/logo_midnight_plots.png'),(620,0,800,270))
    canvas.convert('RGB').save(PREVIEW/'art_layout_desktop.jpg',quality=93)
    portrait=Image.open(RUNTIME/'backgrounds/bg_base_portrait.jpg').convert('RGBA')
    composite(portrait,Image.open(RUNTIME/'ui/logo_midnight_plots.png'),(90,120,900,550))
    board=Image.new('RGBA',(1152,624),(9,15,23,235))
    for col in range(5):
        for row in range(3):
            composite(board,Image.open(RUNTIME/'symbols'/names[(col*3+row)%11].name),(col*230,row*208,216,200))
    panel=Image.new('RGBA',(1280,752))
    panel.alpha_composite(board,(64,64))
    panel.alpha_composite(frame)
    composite(portrait,panel,(0,620,1080,635))
    composite(portrait,Image.open(RUNTIME/'characters/mortimer_bonus.png'),(0,1230,520,650))
    portrait.convert('RGB').save(PREVIEW/'art_layout_portrait.jpg',quality=93)
    paths=sorted((RUNTIME/'covers').glob('*.jpg'))+sorted((RUNTIME/'ui').glob('*.png'))+sorted((RUNTIME/'screens').glob('*.png'))
    contact=Image.new('RGB',(1400,((len(paths)+4)//5)*210),'#10151d')
    draw=ImageDraw.Draw(contact)
    labels=ImageFont.truetype(str(FONT_PATH),13)
    for i,path in enumerate(paths):
        im=Image.open(path).convert('RGBA')
        im.thumbnail((266,174))
        x=i%5*280+(280-im.width)//2; y=i//5*210
        contact.paste(im,(x,y),im)
        draw.text((i%5*280+8,y+180),path.stem,font=labels,fill='white')
    contact.save(PREVIEW/'ui_contact.jpg',quality=92)


def build_bonus_screens():
    for kind in ('entry','result'):
        canvas=Image.open(RUNTIME/'backgrounds/bg_bonus_landscape.jpg').convert('RGBA')
        canvas=resize(canvas,(1536,1024))
        canvas.alpha_composite(Image.new('RGBA',canvas.size,(5,9,16,95)))
        canvas.alpha_composite(Image.open(RUNTIME/f'ui/bonus_{kind}.png'))
        save(canvas.convert('RGB'),f'screens/bonus_{kind}.png','bonus_screen',f'bg_bonus_landscape + vector/bonus_{kind}.svg')


def main():
    RUNTIME.mkdir(exist_ok=True)
    for source in sorted(SOURCE.glob('sym_*.png')):
        im=resize(Image.open(source).convert('RGBA'),(384,384))
        save(im,'symbols/'+source.name,'symbol','source/'+source.name)
        save(vertical_blur(im),'symbols_blur/'+source.name,'symbol_blur','source/'+source.name,blurKernel=41)
    for source in sorted(SOURCE.glob('bg_*.png')):
        size=(1080,1920) if 'portrait' in source.stem else (1920,1080)
        original=Image.open(source)
        out=ImageOps.fit(original,size,Image.Resampling.LANCZOS)
        save(out,'backgrounds/'+source.stem+'.jpg','background','source/'+source.name,upscaled=original.width<size[0] or original.height<size[1])
    for source in sorted(SOURCE.glob('mortimer_*.png')):
        save(resize(Image.open(source).convert('RGBA'),(768,1152)),'characters/'+source.name,'character','source/'+source.name)
    logo=build_ui()
    build_covers(logo)
    build_bonus_screens()
    build_reviews()
    (ASSETS/'manifest.json').write_text(json.dumps({'schema':1,'scope':'Art exports only; no game outcomes or RGS implementation','assets':records},indent=2)+'\n')
    print(f'Built {len(records)} runtime assets; {sum(r["bytes"] for r in records)/1024/1024:.2f} MiB')


if __name__=='__main__':
    main()
