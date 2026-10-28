import {BookPlayer,TIMINGS} from '../animation-lab/book-player.mjs';
import {createBonusPresentation} from './bonus-presentation.mjs';
import {createMortimerRig} from './mortimer-rig.mjs';
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
  bonusName:'Разрытые могилы',freeSpins:'Бесплатные вращения',graveLadder:'Множители могил: ×2 → ×3 → ×5 → ×10',
  graveContribution:'Могилы',graveSumExplanation:'Множители участвующих могил складываются',cappedAward:`Начислено ${values.amount} · лимит 5000×`,
  gravesStrengthen:'Могилы усиливаются',gravesOpen:'Открываются могилы',graveAtMax:'×10 МАКС',
  bonusKicker:'Бонус',bonusIntroHelp:'Бесплатных вращений\nМогилы сохраняются: ×2 → ×3 → ×5 → ×10.',
  bonusRetriggerTitle:'Бонус продолжается',bonusRetriggerKicker:'Дополнительные вращения',bonusRetriggerHelp:`Всего ${values.total} бесплатных вращений.\nОткрытые могилы сохраняются.`,
  bonusFinished:'Бонус завершён',bonus_result:'Итог бонуса',bonusResultHelp:`Сыграно вращений: ${values.played} / ${values.total}`,
  bonusRoundTotal:`Общий выигрыш раунда: ${values.amount}`,bonusCapHelp:'Достигнут лимит 5000×. Оставшиеся вращения завершены.',
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
      const tick=now=>{const t=Math.max(0,Math.min(1,(now-start)/duration));el.textContent=format(Math.round(total*(1-(1-t)**3)));if(t===1)finish();else frame=requestAnimationFrame(tick);};
      this.active.add(finish);frame=requestAnimationFrame(tick);
    });
  }
}

const clock=new MotionClock();
const rig=createMortimerRig($('.mortimer-actor'),{motionFactor:()=>clock.factor()});
const reels=[],cells=[];
for(let r=0;r<5;r++){
  const reel=document.createElement('div');reel.className='reel';reels.push(reel);cells[r]=[];
  for(let y=0;y<3;y++){
    const cell=document.createElement('div');cell.className='cell';cell.dataset.reel=r;cell.dataset.row=y+1;
    const glow=document.createElement('div');glow.className='grave-glow';
    const bed=document.createElement('div');bed.className='grave-bed';bed.setAttribute('aria-hidden','true');
    const im=document.createElement('img');im.className='symbol';im.alt='';
    const mult=document.createElement('span');mult.className='multiplier';mult.hidden=true;
    cell.append(glow,bed,im,mult);reel.append(cell);cells[r][y]=cell;
  }
  $('#reels').append(reel);
}
const cellAt=p=>cells[p.reel][p.row-1];
const readout=document.createElement('div');readout.className='win-readout';readout.hidden=true;
readout.setAttribute('role','status');readout.setAttribute('aria-live','polite');
const readoutLabel=document.createElement('span'),readoutValue=document.createElement('strong'),readoutDetail=document.createElement('small');
readoutLabel.className='win-readout-label';readoutValue.className='win-readout-value';readoutDetail.className='win-readout-detail';
readout.append(readoutLabel,readoutValue,readoutDetail);$('.reels-shell').append(readout);
let award=null,bonus;
function refreshText(){
  bonus?.refreshText();
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
  bonus?.clearContributions();
  award=null;readout.hidden=true;delete readout.dataset.line;highlight([]);$('#lines').replaceChildren();
}
function drawCell(state,r,y,{holdBonus=false}={}){
    const id=state.board[r][y],cell=cells[r][y],im=cell.querySelector('.symbol');
    if(im.dataset.symbol!==id){im.src=path(id);im.dataset.symbol=id;im.alt=options.symbolLabel?.(id)??id;}
    const value=state.bonusEnded&&!holdBonus?0:state.graves[r][y];
    cell.classList.toggle('dug',value>0);cell.dataset.multiplier=String(value);
    const mult=cell.querySelector('.multiplier');mult.hidden=!value;mult.textContent='×'+value;
}
function drawReel(state,r,settings){state.board[r].forEach((_,y)=>drawCell(state,r,y,settings));}
function draw(state,{deferReels=false,holdBonus=false}={}){
  const mode=state.totalFs&&(!state.bonusEnded||holdBonus)?'bonus':'base';
  const bg=`${ROOT}backgrounds/bg_${mode}_landscape.jpg`;
  if(!$('#background').src.endsWith(bg.replace('../../','')))$('#background').src=bg;
  $('.background source').srcset=`${ROOT}backgrounds/bg_${mode}_portrait.jpg`;
  if(!deferReels)reels.forEach((_,r)=>drawReel(state,r,{holdBonus}));
  write('#fs',state.totalFs?`${state.fs} / ${state.totalFs}`:'—');
  write('#spin-win',format(state.spinWin));write('#total',format(state.total));
  options.onState?.(state);
  bonus?.render(state,{holdBonus});
}
function cleanup(){
  clock.skip();clearAwards();bonus?.cleanup();$('#overlay').hidden=true;
  root.querySelectorAll('.particle,.blur-strip,.landing-strip,.scene-transition,.mortimer-echo').forEach(e=>e.remove());
  reels.forEach(r=>r.classList.remove('anticipating','spinning','stopping'));
}
async function particles(el,count=8){
  await Promise.all(Array.from({length:count},async(_,i)=>{
    const dot=document.createElement('i');dot.className='particle';el.append(dot);
    const x=Math.cos(i*2.4)*35, y=-20-(i%4)*14;
    try{await clock.animate(dot,[{transform:'translate(0,0)',opacity:1},{transform:`translate(${x}px,${y}px)`,opacity:0}],{duration:TIMINGS.particle});}finally{dot.remove();}
  }));
}
const overlayKicker=document.createElement('div');overlayKicker.className='bonus-overlay-kicker';overlayKicker.hidden=true;
const overlayEmblem=document.createElement('img');overlayEmblem.className='bonus-overlay-emblem';overlayEmblem.src=path('S');overlayEmblem.alt='';overlayEmblem.hidden=true;
const overlayDetail=document.createElement('div');overlayDetail.className='bonus-overlay-detail';overlayDetail.hidden=true;
$('.overlay-inner').prepend(overlayKicker);$('#overlay-label').after(overlayEmblem);$('#overlay-value').after(overlayDetail);
function captureScene(){
  if(clock.skipped||!clock.factor())return null;
  const previous=$('.background').cloneNode(true);previous.classList.add('scene-transition');previous.querySelector('img').removeAttribute('id');previous.setAttribute('aria-hidden','true');root.append(previous);return previous;
}
async function fadeScene(previous){
  if(!previous)return;
  try{await clock.animate(previous,[{opacity:1},{opacity:0}],{duration:600,easing:'ease-in-out'});}finally{previous.remove();}
}
async function overlay(asset,value,label='',counter=false,settings={}){
  $('#overlay').dataset.kind=settings.kind||asset;
  $('#overlay-art').hidden=!!options.translate||!!settings.kind;
  if(!options.translate&&!settings.kind)$('#overlay-art').src=`${ROOT}ui/${asset}.png`;
  overlayKicker.hidden=!settings.kind;overlayEmblem.hidden=!settings.kind;overlayDetail.hidden=!settings.kind;
  overlayKicker.textContent=settings.kicker||'';overlayDetail.textContent=settings.detail||'';
  $('#overlay-label').textContent=label || options.translate?.(asset) || '';$('#overlay-value').textContent=typeof value==='number'?format(counter?0:value):value;
  $('#overlay').hidden=false;
  try{
    await clock.animate($('.overlay-inner'),[{transform:'scale(.6)',opacity:0},{transform:'scale(1.03)',opacity:1},{transform:'scale(1)',opacity:1}],{duration:TIMINGS.overlay,easing:'ease-out'});
    const duration=counter?(settings.counterDuration||TIMINGS.bigWin):TIMINGS.feature;
    await Promise.all([clock.wait(duration),counter?clock.counter($('#overlay-value'),value,duration):Promise.resolve(),counter?particles($('.overlay-inner'),24):Promise.resolve()]);
    if(settings.hold)await clock.wait(settings.hold);
  }finally{$('#overlay').hidden=true;}
}

bonus=createBonusPresentation(root,{clock,cells,readout,format,text,renderCell:drawCell});

const renderer={
  skip(){clock.skip();},
  restore(state){cleanup();draw(state);options.onRestore?.();},
  async event(event,before,after,{instant}){
    clock.begin(instant);
    const previousScene=event.type==='freeSpinTrigger'?captureScene():null;
    draw(after,{deferReels:['reveal','graveMultiplierUpdate'].includes(event.type),holdBonus:event.type==='freeSpinEnd'});
    options.onEvent?.(event,before,after);
    if(event.type==='reveal'){
      clearAwards();
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
      await bonus.updateGraves(event,before,after);
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
        bonus.showContribution(win,after.graves);
        const line=document.createElementNS('http://www.w3.org/2000/svg','polyline');
        line.setAttribute('points',win.positions.map(p=>`${p.reel*100+50},${(p.row-1)*100+50}`).join(' '));$('#lines').append(line);
        const length=line.getTotalLength();line.style.strokeDasharray=String(length);
        await Promise.all([
          clock.wait(duration),
          bonus.animateContribution(duration),
          clock.animate(line,[{strokeDashoffset:length},{strokeDashoffset:0}],{duration:Math.min(300,duration),easing:'ease-out'}),
          ...win.positions.map(p=>clock.animate(cellAt(p).querySelector('.symbol'),[{transform:'scale(1)'},{transform:'scale(1.09)',offset:.45},{transform:'scale(1)'}],{duration:Math.min(TIMINGS.symbol,duration),easing:'ease-in-out'})),
        ]);
      }
      bonus.clearContributions();$('#lines').replaceChildren();delete readout.dataset.line;highlight(paid);
      if(paid.length)showAward('spinAward',event.totalWin,paid.length>1?'linesPaid':'',{count:paid.length});
    }else if(event.type==='setWin'){
      if(event.amount>0)showAward('spinAward',event.amount);
    }else if(event.type==='freeSpinTrigger'){
      await Promise.all([fadeScene(previousScene),overlay('bonus_entry',String(event.totalFs),text('bonusName'),false,{
        kind:'bonus-entry',kicker:text('bonusKicker'),detail:text('bonusIntroHelp'),
      })]);
    }else if(event.type==='updateFreeSpin'){
      await bonus.pulseCounter();
    }else if(event.type==='freeSpinRetrigger'){
      await Promise.all([bonus.pulseCounter(),overlay('bonus_entry','+'+(event.totalFs-before.totalFs),text('bonusRetriggerTitle'),false,{
        kind:'bonus-retrigger',kicker:text('bonusRetriggerKicker'),detail:text('bonusRetriggerHelp',{total:event.totalFs}),
      })]);
    }else if(event.type==='freeSpinEnd'){
      const detail=after.capped?text('bonusCapHelp'):text('bonusResultHelp',{played:after.fs,total:after.totalFs});
      await overlay('bonus_result',event.amount,text('bonus_result'),true,{
        kind:'bonus-result',kicker:text('bonusFinished'),detail:detail+(after.total!==event.amount?'\n'+text('bonusRoundTotal',{amount:format(after.total)}):''),counterDuration:2400,hold:850,
      });
      const scene=captureScene();clearAwards();draw(after);
      await fadeScene(scene);
    }else if(event.type==='finalWin'){
      if(event.amount>0)showAward(after.totalFs?'roundAward':'spinAward',event.amount);
      else clearAwards();
      // Celebration policy uses the already credited total, never computes an award.
      const cost=options.mode?.()==='bonus'?10000:100;
      if(!after.totalFs&&event.amount>cost && event.amount>=2000){
        await overlay(event.amount>=10000?'epic_win':event.amount>=5000?'mega_win':'big_win',event.amount,'',true);
      }
    }
  }
};
const player=new BookPlayer(renderer);

async function preload(){
  const sources=[`${ROOT}environment/ground_mortimer.png`,...Object.keys(FILES).flatMap(id=>[path(id),path(id,true)]),...['bonus_entry','bonus_result','big_win','mega_win','epic_win'].map(p=>`${ROOT}ui/${p}.png`),...['base','bonus'].flatMap(m=>['landscape','portrait'].map(o=>`${ROOT}backgrounds/bg_${m}_${o}.jpg`))];
  await Promise.all([rig.preload(),...sources.map(async src=>{const im=new Image();im.src=src;await im.decode();})]);
}
return {player,clock,rig,preload,draw,refreshText,restore:state=>renderer.restore(state)};
}
