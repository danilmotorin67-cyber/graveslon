import {TIMINGS} from './book-player.mjs';
import {createStage} from '../shared/stage.mjs';
const $=s=>document.querySelector(s);
const format=n=>(n/100).toFixed(2)+'×';
const media=matchMedia('(prefers-reduced-motion: reduce)');
$('#reduced-motion').checked=media.matches;

let currentMode='base';
const {player,clock,preload,restore}=createStage($('.stage'),{
  mode:()=>currentMode,
  motionFactor:()=>$('#reduced-motion').checked?0:($('#turbo').checked&&!$('#disabled-turbo').checked?1/3:1),
  onRestore:()=>$('#event-list').replaceChildren(),
  onEvent:event=>{
    const log=document.createElement('li');log.textContent=`${event.index} · ${event.type}`;$('#event-list').append(log);
    $('#status').textContent=`Событие ${event.index+1} · ${event.type}`;
  },
});
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
  await preload();
  restore(player.state);busy(false);$('#status').textContent='Готово. Выбери контрольный сценарий и нажми «Проиграть».';
  window.animationLab={player,scenarios,play,clock};
}catch(error){$('#status').textContent='Ошибка загрузки: '+error.message;}
