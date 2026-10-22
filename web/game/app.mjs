import {createStage,symbolPath} from '../shared/stage.mjs';
import {initialState,TIMINGS} from '../animation-lab/book-player.mjs';
import {DemoProvider,GameSession,formatCredits,payoutFor} from './session.mjs';
import {translate,MESSAGES} from './i18n.mjs';

const $=selector=>document.querySelector(selector);
const all=selector=>[...document.querySelectorAll(selector)];
const systemMotion=matchMedia('(prefers-reduced-motion: reduce)');
const STORAGE='midnight-plots.preferences.v1';
let prefs={language:'ru',turbo:false,reducedMotion:systemMotion.matches};
try{
 const saved=JSON.parse(localStorage.getItem(STORAGE)||'{}');
 if(saved.language==='ru'||saved.language==='en')prefs.language=saved.language;
 for(const key of ['turbo','reducedMotion'])if(typeof saved[key]==='boolean')prefs[key]=saved[key];
}catch{/* Preferences are optional when storage is blocked. */}
const requestedLanguage=new URLSearchParams(location.search).get('lang');
if(requestedLanguage==='ru'||requestedLanguage==='en')prefs.language=requestedLanguage;
const t=(key,values)=>translate(prefs.language,key,values);
const money=amount=>formatCredits(amount,prefs.language);
let session,stage,rules,scenarios,bootError=false,booting=true,presentationBet=1_000_000n,presentationPhase='reveal';
let autoRunning=false,autoRemaining=0,autoSerial=0,buyQuote=null,selectedLine=0;

function savePreferences(){
 try{localStorage.setItem(STORAGE,JSON.stringify(prefs));}catch{/* Keep the current in-memory choices. */}
}
function motionFactor(){return prefs.reducedMotion?0:(prefs.turbo&&!session?.policy.disableTurbo?1/3:1);}
function syncMotion(){
 document.body.classList.toggle('reduced',prefs.reducedMotion);
 for(const key of ['fog','idle','bat'])document.body.style.setProperty('--'+key+'-duration',TIMINGS[key]*Math.max(motionFactor(),.001)+'ms');
 if(stage&&motionFactor()===0)stage.clock.skip();
}
function setLanguage(language){
 if(!MESSAGES[language])return;
 prefs.language=language;
 const url=new URL(location.href);
 if(url.searchParams.has('lang')){url.searchParams.set('lang',language);history.replaceState(null,'',url);}
 savePreferences();applyLanguage();
}
function applyLanguage(){
 document.documentElement.lang=prefs.language;document.title=t('title');
 all('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));
 all('[data-label]').forEach(el=>{el.setAttribute('aria-label',t(el.dataset.label));el.title=t(el.dataset.label);});
 $('#language-button').firstChild.textContent=prefs.language.toUpperCase()+' ';
 $('#language-button').setAttribute('aria-label',t('language'));
 $('#language-select').value=prefs.language;
 if(session?.betLevels.length){
  $('#bet-select').replaceChildren(...session.betLevels.map(bet=>{const option=document.createElement('option');option.value=bet.toString();option.textContent=money(bet);return option;}));
  $('#bet-select').value=session.bet.toString();
 }
 if(rules)renderRules();
 if(rules){
  $('.mortimer').alt=rules.symbols.M[prefs.language==='ru'?0:1];
  all('.stage .symbol').forEach(im=>{im.alt=rules.symbols[im.dataset.symbol]?.[prefs.language==='ru'?0:1]||im.dataset.symbol;});
 }
 stage?.refreshText();render();fullscreenLabel();
}
function render(){
 const s=session,ready=!!s?.betLevels.length&&!booting&&!bootError;
 const status=bootError?'error':(s?.status||'loading');
 document.body.dataset.state=status;
 const busy=!ready||s.locked||autoRunning;
 const playing=ready&&s.status==='playing';
 const enough=ready&&s.balance>=s.bet;
 $('#spin-button').disabled=!ready||(!playing&&(s.locked||autoRunning||!enough));
 $('#spin-button span').textContent=t(playing?'finish':'spin');
 $('#spin-button').setAttribute('aria-label',t(playing?'finish':'spin'));
 $('#spin-button').title=t(playing?'finish':'spin');
 for(const id of ['bet-select','buy-button'])$('#'+id).disabled=busy;
 const index=s?.betLevels.indexOf(s.bet)??-1;
 $('#bet-minus').disabled=busy||index<=0;$('#bet-plus').disabled=busy||index>=((s?.betLevels.length||0)-1);
 if(ready){
  $('#bet-select').value=s.bet.toString();
  $('#balance-output').textContent=money(s.balance);$('#balance-output').dataset.amount=s.balance.toString();
  $('#win-output').textContent=money(s.displayWin);$('#win-output').dataset.amount=s.displayWin.toString();
  $('#bonus-cost').textContent=money(s.bet*100n);
  $('#buy-button').disabled=busy||s.policy.disableBonus||s.balance<s.bet*100n;
 }
 $('#auto-button').disabled=!autoRunning&&(!ready||s.locked||!enough||s.policy.disableAutoplay);
 $('#auto-button').setAttribute('aria-pressed',String(autoRunning));
 $('#auto-button').setAttribute('aria-label',t(autoRunning?'stopAutoplay':'autoplay'));
 $('#auto-button').title=t(autoRunning?'stopAutoplay':'autoplay');
 $('#auto-count').hidden=!autoRunning;$('#auto-count').textContent=String(autoRemaining);
 $('#turbo-button').setAttribute('aria-pressed',String(prefs.turbo&&!s?.policy.disableTurbo));
 $('#turbo-button').disabled=!!s?.policy.disableTurbo;
 $('#turbo-setting').disabled=!!s?.policy.disableTurbo;
 $('#turbo-setting').checked=prefs.turbo&&!s?.policy.disableTurbo;
 $('#motion-setting').checked=prefs.reducedMotion;
 $('#rules-button').disabled=!rules;
 $('#settings-button').disabled=ready&&(s.locked||autoRunning);
 $('#language-button').disabled=ready&&(s.locked||autoRunning);
 const feature=s?.displayState;
 let message=t('ready');
 if(!ready)message=t('loading');
 else if(status==='requesting'||status==='settling')message=t(status);
 else if(playing){
  const phase=['winInfo','setWin'].includes(presentationPhase)?t('showingWin'):
   ({graveMultiplierUpdate:t('graveUpdateStatus'),freeSpinTrigger:t('bonusEntryStatus'),freeSpinRetrigger:t('bonusRetriggerTitle'),freeSpinEnd:t('bonus_result'),finalWin:t('showingResult')})[presentationPhase]||t('playing');
  message=feature?.totalFs?t('freeStatus',{current:feature.fs,total:feature.totalFs})+' · '+phase:phase;
 }
 else if(autoRunning)message=t('autoRemaining',{count:autoRemaining});
 else if(!enough)message=t('insufficientBalance');
 else if(s.lastWin>0n)message=t('roundComplete');
 $('#game-status').textContent=message;
 const error=bootError?'loadError':s?.error;
 $('#error-panel').hidden=!error;
 if(error){
  $('#error-message').textContent=t(MESSAGES[prefs.language][error]?error:'roundError');
  $('#retry-button').textContent=t(s?.active?'resume':bootError||status==='error'?'retry':'close');
 }
 syncMotion();
}
function showDialog(id){
 all('dialog[open]').forEach(dialog=>dialog.close());
 const dialog=$('#'+id);dialog.showModal();
 if(id==='buy-dialog')dialog.querySelector('[autofocus]').focus();
}
all('[data-close]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
all('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{
 if(event.target!==dialog)return;
 const r=dialog.getBoundingClientRect();
 if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();
}));
$('#settings-button').addEventListener('click',()=>showDialog('settings-dialog'));
$('#language-button').addEventListener('click',()=>setLanguage(prefs.language==='ru'?'en':'ru'));
$('#language-select').addEventListener('change',event=>setLanguage(event.target.value));
function setTurbo(value){prefs.turbo=!!value&&!session?.policy.disableTurbo;savePreferences();render();}
$('#turbo-button').addEventListener('click',()=>setTurbo(!prefs.turbo));
$('#turbo-setting').addEventListener('change',event=>setTurbo(event.target.checked));
$('#motion-setting').addEventListener('change',event=>{prefs.reducedMotion=event.target.checked;savePreferences();render();});
systemMotion.addEventListener('change',event=>{if(event.matches){prefs.reducedMotion=true;savePreferences();render();}});
function fullscreenLabel(){
 const key=document.fullscreenElement?'exitFullscreen':'fullscreen';
 $('#fullscreen-button').setAttribute('aria-label',t(key));$('#fullscreen-button').title=t(key);
}
$('#fullscreen-button').disabled=!document.fullscreenEnabled;
$('#fullscreen-button').addEventListener('click',async()=>{
 try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{/* Browser may decline fullscreen; the game remains usable. */}
 fullscreenLabel();
});
document.addEventListener('fullscreenchange',fullscreenLabel);
function stepBet(delta){
 if(!session||session.locked||autoRunning)return;
 const index=session.betLevels.indexOf(session.bet)+delta;
 if(session.betLevels[index]!==undefined)session.setBet(session.betLevels[index]);
}
$('#bet-minus').addEventListener('click',()=>stepBet(-1));$('#bet-plus').addEventListener('click',()=>stepBet(1));
$('#bet-select').addEventListener('change',event=>{if(!session?.locked&&!autoRunning)session.setBet(BigInt(event.target.value));});
async function spin(){
 if(!session)return;
 if(session.status==='playing'){session.finish();return;}
 if(session.locked||autoRunning||session.balance<session.bet)return;
 await session.spin();
}
$('#spin-button').addEventListener('click',spin);
$('.stage').addEventListener('click',()=>{if(stage?.player.running)stage.player.skip();});
document.addEventListener('keydown',event=>{
 if(event.code!=='Space'||event.repeat||$('dialog[open]')||['BUTTON','INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;
 event.preventDefault();spin();
});
$('#buy-button').addEventListener('click',()=>{
 if(!session||session.locked||autoRunning||session.policy.disableBonus)return;
 buyQuote={bet:session.bet,cost:session.bet*100n};
 $('#purchase-cost').textContent=money(buyQuote.cost);
 $('#confirm-buy').textContent=t('confirmBuy',{amount:money(buyQuote.cost)});
 $('#confirm-buy').disabled=session.balance<buyQuote.cost;
 showDialog('buy-dialog');
});
$('#confirm-buy').addEventListener('click',async()=>{
 if(!buyQuote||!session||session.locked||autoRunning||session.bet!==buyQuote.bet||session.balance<buyQuote.cost)return;
 buyQuote=null;$('#buy-dialog').close();await session.spin('bonus');
});
$('#buy-dialog').addEventListener('close',()=>{buyQuote=null;});
$('#auto-button').addEventListener('click',()=>{
 if(autoRunning){autoRunning=false;autoRemaining=0;autoSerial++;render();return;}
 if(!session||session.locked||session.policy.disableAutoplay)return;
 showDialog('auto-dialog');
});
$('#start-auto').addEventListener('click',async()=>{
 if(!session||session.locked||autoRunning||session.policy.disableAutoplay)return;
 const count=Number($('#auto-quantity').value);if(![10,25,50].includes(count))return;
 const stopOnBonus=$('#auto-stop-bonus').checked;
 const serial=++autoSerial;
 $('#auto-dialog').close();autoRunning=true;autoRemaining=count;render();
 while(autoRunning&&serial===autoSerial&&autoRemaining>0&&session.status==='idle'&&session.balance>=session.bet){
  await session.spin();if(serial!==autoSerial)return;autoRemaining--;render();
  if(session.error||session.active||stopOnBonus&&session.displayState?.totalFs)break;
  if(autoRemaining>0&&autoRunning)await new Promise(resolve=>setTimeout(resolve,650));
 }
 if(serial===autoSerial){autoRunning=false;autoRemaining=0;render();}
});
$('#retry-button').addEventListener('click',async()=>{
 if(session?.active)await session.recover();
 else if(bootError)await boot();
 else if(session?.status==='error')await session.initialize();
 else session?.clearError();
});

function lineSvg(line,large=false){
 const dots=Array.from({length:15},(_,i)=>`<circle class="dot" cx="${10+(i%5)*25}" cy="${10+Math.floor(i/5)*20}" r="3"/>`).join('');
 return `<svg class="${large?'line-svg':''}" viewBox="0 0 120 60" aria-hidden="true">${dots}<polyline points="${line.map((row,reel)=>`${10+reel*25},${10+row*20}`).join(' ')}"/></svg>`;
}
function chooseLine(index){
 selectedLine=index;$('#line-preview').innerHTML=lineSvg(rules.lines[index],true);
 all('.line-button').forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
 $('#line-preview').setAttribute('aria-label',t('linePattern',{number:index+1,rows:rules.lines[index].map(row=>row+1).join(', ')}));
}
function renderRules(){
 $('#rtp-note').textContent=t('rtp',{value:new Intl.NumberFormat(prefs.language,{maximumFractionDigits:1}).format(rules.targetRtp*100)});
 $('#paytable-list').replaceChildren();
 for(const symbol of ['M','W','H4','H3','H2','H1','L4','L3','L2','L1','S']){
  const card=document.createElement('article');card.className='pay-card'+(symbol==='S'?' scatter-card':'');
  const image=document.createElement('img');image.src=symbolPath(symbol);image.alt='';image.loading='lazy';
  const detail=document.createElement('div'),heading=document.createElement('h3');heading.textContent=rules.symbols[symbol][prefs.language==='ru'?0:1];detail.append(heading);
  if(symbol==='S'){const text=document.createElement('div');text.className='pay-values';text.textContent=t('scatterPay');detail.append(text);}
  else{
   const values=document.createElement('div');values.className='pay-values';
   rules.paytable[symbol].forEach((pay,index)=>{
    const item=document.createElement('span'),count=document.createElement('small'),value=document.createElement('b');
    count.textContent=String(index+3);value.textContent=new Intl.NumberFormat(prefs.language,{maximumFractionDigits:2}).format(pay/100)+'×';item.append(count,value);values.append(item);
   });detail.append(values);
  }
  card.append(image,detail);$('#paytable-list').append(card);
 }
 $('#line-list').replaceChildren(...rules.lines.map((line,index)=>{
  const button=document.createElement('button');button.type='button';button.className='line-button';button.setAttribute('aria-label',t('line',{number:index+1}));
  button.innerHTML=lineSvg(line)+`<span>${index+1}</span>`;button.addEventListener('click',()=>chooseLine(index));return button;
 }));
 chooseLine(selectedLine);
}
function selectTab(name,focus=false){
 for(const tab of all('[data-tab]')){
  const selected=tab.dataset.tab===name;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;
  $('#panel-'+tab.dataset.tab).hidden=!selected;if(selected&&focus)tab.focus();
 }
}
all('[data-tab]').forEach(tab=>{
 tab.addEventListener('click',()=>selectTab(tab.dataset.tab));
 tab.addEventListener('keydown',event=>{
  const tabs=all('[data-tab]'),index=tabs.indexOf(tab);
  const next=event.key==='ArrowRight'?(index+1)%3:event.key==='ArrowLeft'?(index+2)%3:event.key==='Home'?0:event.key==='End'?2:null;
  if(next!==null){event.preventDefault();selectTab(tabs[next].dataset.tab,true);}
 });
});
$('#rules-button').addEventListener('click',()=>{selectTab('rules');showDialog('rules-dialog');});
async function readJson(url){const response=await fetch(url);if(!response.ok)throw new Error('Content unavailable');return response.json();}
async function boot(){
 booting=true;bootError=false;render();
 try{
  stage??=createStage($('.stage'),{
   motionFactor,mode:()=>session?.active?.mode||'base',translate:t,
   symbolLabel:id=>rules?.symbols[id]?.[prefs.language==='ru'?0:1]||id,
   format:value=>money(payoutFor(presentationBet,value)),
   onState:state=>{if(session?.active)presentationBet=session.active.bet;session?.display(state);},
   onEvent:event=>{presentationPhase=event.type;render();},
  });
  const data=await Promise.all([readJson('./rules.json'),readJson('./demo-rounds.json'),stage.preload()]);
  rules=data[0];scenarios=data[1].scenarios;
  if(rules.costs.bonus!==100||rules.lines.length!==20||!Array.isArray(scenarios)||scenarios.length!==10)throw new Error('Unsupported game content');
  session=new GameSession(new DemoProvider(scenarios),stage.player,render);
  await session.initialize();
  if(session.status!=='idle')throw new Error('Demo session unavailable');
  const board=scenarios.find(s=>s.mode==='base'&&s.label==='ordinary_win').book.events.find(e=>e.type==='reveal').board;
  stage.restore({...initialState(),board:board.map(reel=>reel.slice(1,4).map(symbol=>symbol.name))});
  booting=false;applyLanguage();fullscreenLabel();
 }catch{booting=false;bootError=true;render();}
}
applyLanguage();boot();
