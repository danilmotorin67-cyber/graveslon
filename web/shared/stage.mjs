import {BookPlayer,TIMINGS} from '../animation-lab/book-player.mjs';
export const ASSET_ROOT=new URL('../../assets/runtime/',import.meta.url).href;
const FILES={L1:'candle',L2:'key',L3:'raven',L4:'poison',H1:'lantern',H2:'bat',H3:'cat',H4:'widow',M:'mortimer',W:'hand',S:'coffin'};
export const symbolPath=(id,blur=false)=>`${ASSET_ROOT}${blur?'symbols_blur':'symbols'}/sym_${id}_${FILES[id]}.png`;

// One renderer serves the QA lab and game UI; neither selects or evaluates outcomes.
export function createStage(root,options={}){
const $=selector=>root.querySelector(selector);
const ROOT=ASSET_ROOT,path=symbolPath;
const format=options.format ?? (n=>(n/100).toFixed(2)+'×');
function write(selector,value){const el=$(selector);if(el)el.textContent=value;}
const text=(key,values={})=>options.translate?.(key,values) ?? ({
  line:`Линия ${values.number}`,lineProgress:`${values.current} / ${values.total}`,
  linesPaid:`Оплачено линий: ${values.count}`,spinAward:'Выигрыш за вращение',roundAward:'Общий выигрыш',winningLine:'Выигрышная линия',
}[key]||key);
class MotionClock {
  active=new Set(); skipped=false;
  factor(){return options.motionFactor?.() ?? 1;}
  begin(instant){this.skipped=instant;}
  skip(){this.skipped=true;for(const finish of [...this.active])finish();}
  async animate(el,frames,options={}){
    if(this.skipped || !this.factor())return;
    const animation=el.animate(frames,{...options,duration:(options.duration??TIMINGS.fallback)*this.factor()});
    const finish=()=>{try{animation.finish();}catch{animation.cancel();}};
    this.active.add(finish);
    try{await animation.finished.catch(()=>{});}finally{this.active.delete(finish);animation.cancel();}
  }
  loop(el,frames,duration){
    if(this.skipped||!this.factor())return ()=>{};
    const animation=el.animate(frames,{duration:duration*this.factor(),iterations:Infinity,easing:'linear'});
    animation.finished.catch(()=>{});
    const stop=()=>{this.active.delete(stop);animation.cancel();};
    this.active.add(stop);return stop;
  }
  wait(ms){
    if(this.skipped || !this.factor())return Promise.resolve();
    return new Promise(resolve=>{
      const finish=()=>{clearTimeout(timer);this.active.delete(finish);resolve();};
      const timer=setTimeout(finish,ms*this.factor());this.active.add(finish);
    });
  }
  counter(el,total,ms){
    if(this.skipped || !this.factor()){el.textContent=format(total);return Promise.resolve();}
    return new Promise(resolve=>{
      const start=performance.now(),duration=ms*this.factor();let frame;
      const finish=()=>{cancelAnimationFrame(frame);el.textContent=format(total);this.active.delete(finish);resolve();};
      const tick=now=>{const t=Math.min(1,(now-start)/duration);el.textContent=format(Math.round(total*(1-(1-t)**3)));if(t===1)finish();else frame=requestAnimationFrame(tick);};
      this.active.add(finish);frame=requestAnimationFrame(tick);
    });
  }
}

const clock=new MotionClock();
const reels=[],cells=[];
for(let r=0;r<5;r++){
  const reel=document.createElement('div');reel.className='reel';reels.push(reel);cells[r]=[];
  for(let y=0;y<3;y++){
    const cell=document.createElement('div');cell.className='cell';cell.dataset.reel=r;cell.dataset.row=y+1;
    const glow=document.createElement('div');glow.className='grave-glow';
    const im=document.createElement('img');im.className='symbol';im.alt='';
    const mult=document.createElement('span');mult.className='multiplier';mult.hidden=true;
    cell.append(glow,im,mult);reel.append(cell);cells[r][y]=cell;
  }
  $('#reels').append(reel);
}
const cellAt=p=>cells[p.reel][p.row-1];
const readout=document.createElement('div');readout.className='win-readout';readout.hidden=true;
readout.setAttribute('role','status');readout.setAttribute('aria-live','polite');
const readoutLabel=document.createElement('span'),readoutValue=document.createElement('strong'),readoutDetail=document.createElement('small');
readoutLabel.className='win-readout-label';readoutValue.className='win-readout-value';readoutDetail.className='win-readout-detail';
readout.append(readoutLabel,readoutValue,readoutDetail);$('.reels-shell').append(readout);
let award=null;
function refreshText(){
  if(!award)return;
  const {key,amount,detail,values,kind}=award;
  readout.hidden=false;readout.dataset.kind=kind;readout.dataset.amount=String(amount);
  readoutLabel.textContent=text(key,values);readoutValue.textContent=format(amount);readoutDetail.textContent=detail?text(detail,values):'';
}
function showAward(key,amount,detail='',values={},kind='total'){
  award={key,amount,detail,values,kind};refreshText();
}
function highlight(wins){
  cells.flat().forEach(cell=>cell.classList.remove('win'));
  wins.forEach(win=>win.positions.forEach(p=>cellAt(p).classList.add('win')));
  root.classList.toggle('presenting-wins',wins.length>0);
}
function clearAwards(){
  award=null;readout.hidden=true;delete readout.dataset.line;highlight([]);$('#lines').replaceChildren();
}
function character(pose){
  $('.mortimer-actor').dataset.pose=pose;
  $('.mortimer').src=`${ROOT}characters/mortimer_${pose}.png`;
}
function drawReel(state,r){
  state.board[r].forEach((id,y)=>{
    const cell=cells[r][y],im=cell.querySelector('.symbol');
    if(im.dataset.symbol!==id){im.src=path(id);im.dataset.symbol=id;im.alt=options.symbolLabel?.(id)??id;}
    cell.classList.toggle('dug',state.graves[r][y]>0);
    const mult=cell.querySelector('.multiplier');mult.hidden=!state.graves[r][y];mult.textContent='×'+state.graves[r][y];
  });
}
function draw(state,{deferReels=false}={}){
  const mode=state.gameType==='freegame'||state.phase==='bonus'?'bonus':'base';
  const bg=`${ROOT}backgrounds/bg_${mode}_landscape.jpg`;
  if(!$('#background').src.endsWith(bg.replace('../../','')))$('#background').src=bg;
  $('.background source').srcset=`${ROOT}backgrounds/bg_${mode}_portrait.jpg`;
  if(!deferReels)reels.forEach((_,r)=>drawReel(state,r));
  write('#fs',state.totalFs?`${state.fs} / ${state.totalFs}`:'—');
  write('#spin-win',format(state.spinWin));write('#total',format(state.total));
  options.onState?.(state);
}
function cleanup(){
  clock.skip();clearAwards();$('#overlay').hidden=true;
  root.querySelectorAll('.particle,.blur-strip,.landing-strip').forEach(e=>e.remove());
  reels.forEach(r=>r.classList.remove('anticipating','spinning','stopping'));
}
async function particles(el,count=8){
  await Promise.all(Array.from({length:count},async(_,i)=>{
    const dot=document.createElement('i');dot.className='particle';el.append(dot);
    const x=Math.cos(i*2.4)*35, y=-20-(i%4)*14;
    try{await clock.animate(dot,[{transform:'translate(0,0)',opacity:1},{transform:`translate(${x}px,${y}px)`,opacity:0}],{duration:TIMINGS.particle});}finally{dot.remove();}
  }));
}
async function overlay(asset,value,label='',counter=false){
  $('#overlay-art').hidden=!!options.translate;
  if(!options.translate)$('#overlay-art').src=`${ROOT}ui/${asset}.png`;
  $('#overlay-label').textContent=label || options.translate?.(asset) || '';$('#overlay-value').textContent=typeof value==='number'?format(counter?0:value):value;
  $('#overlay').hidden=false;
  try{
    await clock.animate($('.overlay-inner'),[{transform:'scale(.6)',opacity:0},{transform:'scale(1.03)',opacity:1},{transform:'scale(1)',opacity:1}],{duration:TIMINGS.overlay,easing:'ease-out'});
    await Promise.all([clock.wait(counter?TIMINGS.bigWin:TIMINGS.feature),counter?clock.counter($('#overlay-value'),value,TIMINGS.bigWin):Promise.resolve(),counter?particles($('.overlay-inner'),24):Promise.resolve()]);
  }finally{$('#overlay').hidden=true;}
}

const renderer={
  skip(){clock.skip();},
  restore(state){cleanup();draw(state);character(state.phase==='bonus'?'bonus':'idle');options.onRestore?.();},
  async event(event,before,after,{instant}){
    clock.begin(instant);draw(after,{deferReels:event.type==='reveal'});
    options.onEvent?.(event,before,after);
    if(event.type==='reveal'){
      clearAwards();character(after.gameType==='freegame'?'bonus':'idle');
      await Promise.all(reels.map(async(reel,r)=>{
        if(clock.skipped||!clock.factor()){drawReel(after,r);return;}
        reel.classList.add('spinning');
        const strip=document.createElement('div');strip.className='blur-strip';
        strip.setAttribute('aria-hidden','true');
        // Repeat the same five padded symbols so the loop has no visible seam.
        for(let i=0;i<15;i++){const im=document.createElement('img');im.src=path(event.board[r][i%5].name,true);im.alt='';strip.append(im);}
        reel.append(strip);
        const stopLoop=clock.loop(strip,[{transform:'translateY(-33.333333%)'},{transform:'translateY(0)'}],TIMINGS.cycle);
        let landing;
        try{
          await clock.wait(TIMINGS.spin+r*TIMINGS.stagger);
          if(event.anticipation[r]>0){
            if(!clock.skipped&&clock.factor())reel.classList.add('anticipating');
            await clock.wait(event.anticipation[r]*TIMINGS.anticipation);
          }
          stopLoop();drawReel(after,r);
          if(!clock.skipped&&clock.factor()){
            landing=document.createElement('div');landing.className='landing-strip';landing.setAttribute('aria-hidden','true');
            event.board[r].forEach(symbol=>{const im=document.createElement('img');im.src=path(symbol.name);im.alt='';landing.append(im);});
            reel.append(landing);reel.classList.add('stopping');strip.remove();
            await clock.animate(landing,[{transform:'translateY(-20%)'},{transform:'translateY(2%)',offset:.82},{transform:'translateY(0)'}],{duration:TIMINGS.land,easing:'cubic-bezier(.18,.7,.28,1)'});
          }
        }finally{stopLoop();strip.remove();landing?.remove();reel.classList.remove('anticipating','spinning','stopping');}
        await Promise.all(after.board[r].map(async(id,y)=>{
          const cell=cells[r][y],im=cell.querySelector('.symbol');
          if(id==='W')await Promise.all([clock.animate(im,[{transform:'translateY(60%)',opacity:0},{transform:'translateY(0)',opacity:1}],{duration:TIMINGS.wild}),particles(cell)]);
          if(id==='S')await clock.animate(im,[{transform:'rotate(-5deg)',filter:'drop-shadow(0 0 12px #b779ff)'},{transform:'rotate(5deg)',filter:'drop-shadow(0 0 18px #b779ff)'},{transform:'rotate(0)',filter:'drop-shadow(0 0 0 transparent)'}],{duration:TIMINGS.scatter});
        }));
      }));
    }else if(event.type==='graveMultiplierUpdate'){
      await Promise.all(event.positions.map(async p=>{
        const cell=cellAt(p);
        await Promise.all([clock.animate(cell.querySelector('.multiplier'),[{transform:'scale(.3)'},{transform:'scale(1.35)'},{transform:'scale(1)'}],{duration:TIMINGS.grave}),clock.animate(cell.querySelector('.grave-glow'),[{opacity:0},{opacity:1}],{duration:TIMINGS.grave}),particles(cell)]);
      }));
    }else if(event.type==='winInfo'){
      const paid=event.wins.filter(w=>w.win>0);
      clearAwards();
      const duration=Math.max(360,Math.min(TIMINGS.line,3200/Math.max(1,paid.length)));
      for(const [index,win] of paid.entries()){
        if(clock.skipped||!clock.factor())break;
        highlight([win]);$('#lines').replaceChildren();
        const number=win.meta?.lineIndex;
        readout.dataset.line=Number.isInteger(number)?String(number):'';
        showAward(Number.isInteger(number)?'line':'winningLine',win.win,paid.length>1?'lineProgress':'',{number,current:index+1,total:paid.length},'line');
        const line=document.createElementNS('http://www.w3.org/2000/svg','polyline');
        line.setAttribute('points',win.positions.map(p=>`${p.reel*100+50},${(p.row-1)*100+50}`).join(' '));$('#lines').append(line);
        const length=line.getTotalLength();line.style.strokeDasharray=String(length);
        await Promise.all([
          clock.wait(duration),
          clock.animate(line,[{strokeDashoffset:length},{strokeDashoffset:0}],{duration:Math.min(300,duration),easing:'ease-out'}),
          ...win.positions.map(p=>clock.animate(cellAt(p).querySelector('.symbol'),[{transform:'scale(1)'},{transform:'scale(1.09)',offset:.45},{transform:'scale(1)'}],{duration:Math.min(TIMINGS.symbol,duration),easing:'ease-in-out'})),
        ]);
      }
      $('#lines').replaceChildren();delete readout.dataset.line;highlight(paid);
      if(paid.length)showAward('spinAward',event.totalWin,paid.length>1?'linesPaid':'',{count:paid.length});
    }else if(event.type==='setWin'){
      if(event.amount>0)showAward('spinAward',event.amount);
    }else if(event.type==='freeSpinTrigger'){
      character('bonus');await overlay('bonus_entry',options.translate?.('freeCount',{count:event.totalFs}) ?? `${event.totalFs} FS`);
    }else if(event.type==='freeSpinRetrigger'){
      await overlay('bonus_entry',options.translate?.('retriggerCount',{total:event.totalFs}) ?? `+5 FS · ${event.totalFs} ВСЕГО`);
    }else if(event.type==='freeSpinEnd'){
      await overlay('bonus_result',event.amount);
    }else if(event.type==='finalWin'){
      if(event.amount>0)showAward(after.totalFs?'roundAward':'spinAward',event.amount);
      else clearAwards();
      // Celebration policy uses the already credited total, never computes an award.
      const cost=options.mode?.()==='bonus'?10000:100;
      if(event.amount>cost && event.amount>=2000){
        character('win');
        await overlay(event.amount>=10000?'epic_win':event.amount>=5000?'mega_win':'big_win',event.amount,'',true);
      }
    }
  }
};
const player=new BookPlayer(renderer);

async function preload(){
  const sources=[`${ROOT}environment/ground_mortimer.png`,...Object.keys(FILES).flatMap(id=>[path(id),path(id,true)]),...['idle','bonus','win'].map(p=>`${ROOT}characters/mortimer_${p}.png`),...['bonus_entry','bonus_result','big_win','mega_win','epic_win'].map(p=>`${ROOT}ui/${p}.png`),...['base','bonus'].flatMap(m=>['landscape','portrait'].map(o=>`${ROOT}backgrounds/bg_${m}_${o}.jpg`))];
  await Promise.all(sources.map(async src=>{const im=new Image();im.src=src;await im.decode();}));
}
return {player,clock,preload,draw,character,refreshText,restore:state=>renderer.restore(state)};
}
