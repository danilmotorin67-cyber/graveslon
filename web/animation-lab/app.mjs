import {BookPlayer,TIMINGS} from './book-player.mjs';
const $=s=>document.querySelector(s);
const ROOT='../../assets/runtime/';
const FILES={L1:'candle',L2:'key',L3:'raven',L4:'poison',H1:'lantern',H2:'bat',H3:'cat',H4:'widow',M:'mortimer',W:'hand',S:'coffin'};
const path=(id,blur=false)=>`${ROOT}${blur?'symbols_blur':'symbols'}/sym_${id}_${FILES[id]}.png`;
const format=n=>(n/100).toFixed(2)+'×';
const media=matchMedia('(prefers-reduced-motion: reduce)');
$('#reduced-motion').checked=media.matches;

class MotionClock {
  active=new Set(); skipped=false;
  factor(){return $('#reduced-motion').checked?0:($('#turbo').checked&&!$('#disabled-turbo').checked?1/3:1);}
  begin(instant){this.skipped=instant;}
  skip(){this.skipped=true;for(const finish of [...this.active])finish();}
  async animate(el,frames,options={}){
    if(this.skipped || !this.factor())return;
    const animation=el.animate(frames,{...options,duration:(options.duration??TIMINGS.fallback)*this.factor()});
    const finish=()=>{try{animation.finish();}catch{animation.cancel();}};
    this.active.add(finish);
    try{await animation.finished.catch(()=>{});}finally{this.active.delete(finish);animation.cancel();}
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
let currentMode='base';
function character(pose){$('.mortimer').src=`${ROOT}characters/mortimer_${pose}.png`;}
function draw(state){
  const mode=state.gameType==='freegame'||state.phase==='bonus'?'bonus':'base';
  const bg=`${ROOT}backgrounds/bg_${mode}_landscape.jpg`;
  if(!$('#background').src.endsWith(bg.replace('../../','')))$('#background').src=bg;
  $('.background source').srcset=`${ROOT}backgrounds/bg_${mode}_portrait.jpg`;
  state.board.forEach((reel,r)=>reel.forEach((id,y)=>{
    const cell=cells[r][y],im=cell.querySelector('.symbol');
    if(im.dataset.symbol!==id){im.src=path(id);im.dataset.symbol=id;im.alt=id;}
    cell.classList.toggle('dug',state.graves[r][y]>0);
    const mult=cell.querySelector('.multiplier');mult.hidden=!state.graves[r][y];mult.textContent='×'+state.graves[r][y];
    cell.classList.toggle('win',state.wins.some(w=>w.win>0&&w.positions.some(p=>p.reel===r&&p.row===y+1)));
  }));
  $('#fs').textContent=state.totalFs?`${state.fs} / ${state.totalFs}`:'—';
  $('#spin-win').textContent=format(state.spinWin);$('#total').textContent=format(state.total);
}
function cleanup(){
  $('#overlay').hidden=true;$('#lines').replaceChildren();
  document.querySelectorAll('.particle,.blur-strip').forEach(e=>e.remove());
  reels.forEach(r=>r.classList.remove('anticipating'));
}
async function particles(el,count=8){
  await Promise.all(Array.from({length:count},async(_,i)=>{
    const dot=document.createElement('i');dot.className='particle';el.append(dot);
    const x=Math.cos(i*2.4)*35, y=-20-(i%4)*14;
    try{await clock.animate(dot,[{transform:'translate(0,0)',opacity:1},{transform:`translate(${x}px,${y}px)`,opacity:0}],{duration:TIMINGS.particle});}finally{dot.remove();}
  }));
}
async function overlay(asset,value,label='',counter=false){
  $('#overlay-art').src=`${ROOT}ui/${asset}.png`;
  $('#overlay-label').textContent=label;$('#overlay-value').textContent=typeof value==='number'?format(value):value;
  $('#overlay').hidden=false;
  try{
    await clock.animate($('.overlay-inner'),[{transform:'scale(.6)',opacity:0},{transform:'scale(1.03)',opacity:1},{transform:'scale(1)',opacity:1}],{duration:TIMINGS.overlay,easing:'ease-out'});
    await Promise.all([clock.wait(counter?TIMINGS.bigWin:TIMINGS.feature),counter?clock.counter($('#overlay-value'),value,TIMINGS.bigWin):Promise.resolve(),counter?particles($('.overlay-inner'),24):Promise.resolve()]);
  }finally{$('#overlay').hidden=true;}
}

const renderer={
  skip(){clock.skip();},
  restore(state){cleanup();draw(state);character(state.phase==='bonus'?'bonus':'idle');$('#event-list').replaceChildren();},
  async event(event,before,after,{instant}){
    clock.begin(instant);draw(after);
    const log=document.createElement('li');log.textContent=`${event.index} · ${event.type}`;$('#event-list').append(log);
    $('#status').textContent=`Событие ${event.index+1} · ${event.type}`;
    if(event.type==='reveal'){
      $('#lines').replaceChildren();character(after.gameType==='freegame'?'bonus':'idle');
      await Promise.all(reels.map(async(reel,r)=>{
        const strip=document.createElement('div');strip.className='blur-strip';
        for(let i=0;i<9;i++){const im=document.createElement('img');im.src=path(event.board[r][i%5].name,true);im.alt='';strip.append(im);}
        reel.append(strip);
        reel.classList.toggle('anticipating',event.anticipation[r]>0);
        try{
          const duration=TIMINGS.spin+r*TIMINGS.stagger+event.anticipation[r]*TIMINGS.anticipation;
          await clock.animate(strip,[{transform:'translateY(0)'},{transform:'translateY(33.333%)'}],{duration:duration/3,iterations:3,easing:'linear'});
        }finally{strip.remove();reel.classList.remove('anticipating');}
        await Promise.all([...reel.querySelectorAll('.symbol')].map(im=>clock.animate(im,[{transform:'translateY(-10px)'},{transform:'translateY(8px)'},{transform:'translateY(0)'}],{duration:TIMINGS.land,easing:'ease-out'})));
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
      const paid=event.wins.filter(w=>w.win>0),positions=new Map();
      $('#lines').replaceChildren();
      for(const win of paid){
        const line=document.createElementNS('http://www.w3.org/2000/svg','polyline');
        line.setAttribute('points',win.positions.map(p=>`${p.reel*100+50},${(p.row-1)*100+50}`).join(' '));$('#lines').append(line);
        win.positions.forEach(p=>positions.set(`${p.reel}:${p.row}`,p));
      }
      await Promise.all([...[...positions.values()].map(p=>clock.animate(cellAt(p).querySelector('.symbol'),[{transform:'scale(1)'},{transform:'scale(1.12)'},{transform:'scale(1)'}],{duration:TIMINGS.symbol/2,iterations:2,easing:'ease-in-out'})),clock.animate($('#lines'),[{opacity:0},{opacity:1},{opacity:0}],{duration:TIMINGS.line})]);
      $('#lines').replaceChildren();
    }else if(event.type==='freeSpinTrigger'){
      character('bonus');await overlay('bonus_entry',`${event.totalFs} FS`);
    }else if(event.type==='freeSpinRetrigger'){
      await overlay('bonus_entry',`+5 FS · ${event.totalFs} ВСЕГО`);
    }else if(event.type==='freeSpinEnd'){
      await overlay('bonus_result',event.amount);
    }else if(event.type==='finalWin'){
      // Celebration policy uses the already credited total, never computes an award.
      const cost=currentMode==='bonus'?10000:100;
      if(event.amount>cost && event.amount>=2000){
        character('win');
        await overlay(event.amount>=10000?'epic_win':event.amount>=5000?'mega_win':'big_win',event.amount,'',true);
      }
    }
  }
};
const player=new BookPlayer(renderer);
let scenarios=[];
function busy(value){
  $('#play').disabled=value;$('#scenario').disabled=value;$('#resume-at').disabled=value;
  $('#skip').disabled=!value;$('#finish').disabled=!value;
}
async function play(){
  const scenario=scenarios.find(s=>s.key===$('#scenario').value);
  currentMode=scenario.mode;busy(true);
  try{
    const result=await player.play(scenario.book,{fromEvent:Number($('#resume-at').value)});
    $('#status').textContent=result.aborted?'Воспроизведение остановлено':`Готово · итог ${format(result.state.total)} · ${scenario.mode} · QA-книга ${scenario.book.id}`;
  }catch(error){$('#status').textContent='Не удалось проиграть книгу: '+error.message;}
  finally{busy(false);}
}
$('#play').addEventListener('click',play);
$('#skip').addEventListener('click',()=>player.skip());
$('#finish').addEventListener('click',()=>player.finish());
$('.stage').addEventListener('click',()=>{if(player.running)player.skip();});
document.addEventListener('keydown',event=>{
  if(event.code==='Space'&&!['INPUT','SELECT','BUTTON','TEXTAREA'].includes(document.activeElement.tagName)){
    event.preventDefault();if(player.running)player.skip();else if(!$('#play').disabled)play();
  }
});
$('#disabled-turbo').addEventListener('change',()=>{
  $('#turbo').disabled=$('#disabled-turbo').checked;
  if($('#disabled-turbo').checked)$('#turbo').checked=false;
  syncMotion();
});
function syncMotion(){
  document.body.classList.toggle('reduced',$('#reduced-motion').checked);
  for(const key of ['fog','idle','bat'])document.body.style.setProperty('--'+key+'-duration',TIMINGS[key]*Math.max(clock.factor(),.001)+'ms');
}
$('#turbo').addEventListener('change',syncMotion);
$('#reduced-motion').addEventListener('change',syncMotion);
syncMotion();

try{
  const response=await fetch('./fixtures.json');if(!response.ok)throw new Error('Не удалось загрузить fixtures.json');
  scenarios=(await response.json()).scenarios;
  const labels={ordinary_win:'Обычный выигрыш',loss:'Без выигрыша',retrigger:'Ретриггер',multiplier_10:'Могила ×10',max_win:'Максимальный выигрыш'};
  for(const scenario of scenarios){const option=document.createElement('option');option.value=scenario.key;option.textContent=`${scenario.mode} · ${labels[scenario.label]}`;$('#scenario').append(option);}
  const sources=[...Object.keys(FILES).flatMap(id=>[path(id),path(id,true)]),...['idle','bonus','win'].map(p=>`${ROOT}characters/mortimer_${p}.png`),...['bonus_entry','bonus_result','big_win','mega_win','epic_win'].map(p=>`${ROOT}ui/${p}.png`),...['base','bonus'].flatMap(m=>['landscape','portrait'].map(o=>`${ROOT}backgrounds/bg_${m}_${o}.jpg`))];
  await Promise.all(sources.map(async src=>{const im=new Image();im.src=src;await im.decode();}));
  renderer.restore(player.state);busy(false);$('#status').textContent='Готово. Выбери контрольный сценарий и нажми «Проиграть».';
  window.animationLab={player,scenarios,play,clock};
}catch(error){$('#status').textContent='Ошибка загрузки: '+error.message;}
