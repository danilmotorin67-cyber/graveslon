const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const fixtures=JSON.parse(fs.readFileSync(path.join(ROOT,'web/animation-lab/fixtures.json'))).scenarios;

async function audit(browser,{baseURL,outputDir}){
 const checks=[],errors=[];
 async function openLab(motion='no-preference'){
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:motion});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(baseURL+'/web/animation-lab/',{waitUntil:'networkidle'});await page.waitForFunction(()=>!!window.animationLab);return page;
 }
 async function start(page,key,index){await page.selectOption('#scenario',key);await page.fill('#resume-at',String(index));await page.evaluate(()=>{window.__playing=window.animationLab.play();});}
 async function finish(page){return page.evaluate(async()=>{const lab=window.animationLab;lab.player.finish();await window.__playing;return {total:lab.player.state.total,active:lab.clock.active.size,
  leftovers:document.querySelectorAll('.grave-change,.mortimer-echo,.scene-transition,.landing-strip,.blur-strip,.particle').length};});}
 function clean(result,expected){assert.equal(result.total,expected);assert.equal(result.active,0);assert.equal(result.leftovers,0);}
 // Check every authoritative map at actual event boundaries, including replacements.
 const maps=await openLab('reduce');
 const coverage=await maps.evaluate(async()=>{
  const lab=window.animationLab,original=lab.player.renderer.event.bind(lab.player.renderer);
  const seen={reveals:0,updates:0,retriggers:0,persistentNonWild:0,levels:[],poses:[],results:0};
  function same(a,b,label){if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(label+': '+JSON.stringify(a)+' != '+JSON.stringify(b));}
  lab.player.renderer.event=async(event,before,after,options)=>{
   await original(event,before,after,options);
   const cells=[...document.querySelectorAll('.cell')];
   seen.poses.push(document.querySelector('.mortimer-actor').dataset.pose);
   if(event.type==='reveal'||event.type==='graveMultiplierUpdate'||event.type==='freeSpinRetrigger'){
    const expected=after.graves.flat();same(cells.map(cell=>Number(cell.dataset.multiplier)),expected,'persistent map');
    same(cells.map(cell=>cell.classList.contains('dug')),expected.map(v=>v>0),'grave markers');
    if(event.type==='reveal'){
     seen.reveals++;cells.forEach((cell,i)=>{if(expected[i]>0&&cell.querySelector('.symbol').dataset.symbol!=='W')seen.persistentNonWild++;});
    }else if(event.type==='graveMultiplierUpdate'){seen.updates++;seen.levels.push(...event.multipliers);}
    else{seen.retriggers++;same(after.graves,before.graves,'retrigger must retain every grave');}
   }
   if(event.type==='freeSpinEnd'){
    seen.results++;if(document.querySelector('.stage').dataset.bonus!=='complete')throw new Error('Bonus did not exit');
    if(!document.querySelector('#feature-counter').hidden||cells.some(c=>c.classList.contains('dug')))throw new Error('Bonus UI was not cleared');
    if(!document.querySelector('#background').src.endsWith('bg_base_landscape.jpg'))throw new Error('Base scene was not restored');
   }
  };
  for(const scenario of lab.scenarios){document.querySelector('#scenario').value=scenario.key;document.querySelector('#resume-at').value=0;await lab.play();
   if(lab.player.state.total!==scenario.book.payoutMultiplier||lab.clock.active.size)throw new Error('Replay did not settle cleanly');
  }
  seen.levels=[...new Set(seen.levels)].sort((a,b)=>a-b);seen.poses=[...new Set(seen.poses)].sort();return seen;
 });
 assert.ok(coverage.persistentNonWild>0);assert.ok(coverage.retriggers>0);assert.equal(coverage.results,10);assert.deepEqual(coverage.levels,[2,3,5,10]);assert.deepEqual(coverage.poses,['rig']);
 checks.push({name:'all 10 books: grave maps, non-wild replacements, retriggers, all levels and base-scene restoration',status:'PASS',coverage});await maps.close();
 // Observe the visible upgrade, not only the final replay state.
 for(const level of [3,10]){
  const source=fixtures.find(s=>s.key==='base/multiplier_10');const event=source.book.events.find(e=>e.type==='graveMultiplierUpdate'&&e.multipliers.includes(level));
  const page=await openLab();const bottom=await page.locator('.mortimer').evaluate(el=>el.getBoundingClientRect().bottom);
  await start(page,source.key,event.index);await page.waitForSelector('.grave-upgrading');
  const tag=await page.locator(`.grave-upgrading[data-multiplier="${level}"] .grave-change`).first().textContent();
  assert.ok(tag.includes('→ ×'+level));assert.equal(await page.locator('.mortimer-actor').getAttribute('data-cue'),'breathing');
  assert.ok(Math.abs((await page.locator('.mortimer').evaluate(el=>el.getBoundingClientRect().bottom))-bottom)<1,'the feet must keep the same ground plane');
  clean(await finish(page),source.book.payoutMultiplier);checks.push({name:'visible grave upgrade to ×'+level+' and grounded Mortimer',status:'PASS'});await page.close();
 }
 const recoverSource=fixtures.find(s=>s.key==='base/multiplier_10'),upgrade=recoverSource.book.events.find(e=>e.type==='graveMultiplierUpdate'&&e.multipliers.includes(10));
 const recovery=await openLab();await start(recovery,recoverSource.key,upgrade.index);await recovery.waitForSelector('.grave-upgrading');
 await recovery.evaluate(async()=>{window.animationLab.player.stop();await window.__playing;});
 assert.equal(await recovery.locator('.grave-change,.mortimer-echo,.scene-transition').count(),0);
 const savedMap=await recovery.evaluate(()=>window.animationLab.player.state.graves.flat());
 await recovery.evaluate(()=>{const renderer=window.animationLab.player.renderer,restore=renderer.restore.bind(renderer);renderer.restore=state=>{restore(state);window.__restoredGraves=[...document.querySelectorAll('.cell')].map(c=>Number(c.dataset.multiplier));};});
 await recovery.check('#reduced-motion');await start(recovery,recoverSource.key,upgrade.index+1);await recovery.evaluate(()=>window.__playing);
 assert.deepEqual(await recovery.evaluate(()=>window.__restoredGraves),savedMap);assert.equal(await recovery.evaluate(()=>window.animationLab.player.state.total),recoverSource.book.payoutMultiplier);
 checks.push({name:'stop during grave upgrade and restore the same ×10 map',status:'PASS'});await recovery.close();
 const source=fixtures.find(s=>s.key==='base/max_win'),capEvent=source.book.events.find(e=>e.type==='winInfo'&&e.wins.some(w=>w.win>0&&w.win<w.rawWin));
 const capped=capEvent.wins.find(w=>w.win>0&&w.win<w.rawWin),formula=await openLab();
 await start(formula,source.key,capEvent.index);
 await formula.waitForFunction(line=>document.querySelector('.win-readout').dataset.line===String(line)&&!document.querySelector('.grave-formula').hidden,capped.meta.lineIndex);
 const detail=await formula.locator('.grave-formula').evaluate(el=>({raw:Number(el.dataset.raw),credited:Number(el.dataset.credited),base:Number(el.dataset.base),multiplier:Number(el.dataset.multiplier),
  terms:[...el.querySelectorAll('.grave-term')].map(t=>({reel:Number(t.dataset.reel),row:Number(t.dataset.row),multiplier:Number(t.textContent.slice(1))})),note:el.querySelector('.grave-cap-note').textContent}));
 assert.equal(detail.raw,capped.rawWin);assert.equal(detail.credited,capped.win);assert.equal(detail.base,capped.meta.winWithoutMult);assert.equal(detail.multiplier,capped.meta.multiplier);
 assert.ok(detail.raw>detail.credited);assert.ok(detail.note.includes('лимит 5000×'));assert.ok(detail.terms.length>0);
 for(const term of detail.terms)assert.ok(capped.positions.some(p=>p.reel===term.reel&&p.row===term.row));
 clean(await finish(formula),source.book.payoutMultiplier);checks.push({name:'grave formula explains raw award and capped credited amount separately',status:'PASS'});await formula.close();
 const retriggerSource=fixtures.find(s=>s.key==='bonus/retrigger'),retrigger=retriggerSource.book.events.find(e=>e.type==='freeSpinRetrigger');
 const extra=await openLab();await start(extra,retriggerSource.key,retrigger.index);await extra.waitForSelector('#overlay[data-kind=bonus-retrigger]:not([hidden])');
 assert.equal(await extra.locator('#overlay-value').textContent(),'+5');assert.equal(await extra.locator('#feature-counter').getAttribute('data-total'),String(retrigger.totalFs));
 assert.equal(await extra.locator('.mortimer-actor').getAttribute('data-cue'),'breathing');assert.equal(await extra.locator('.grave-change').count(),0);
 clean(await finish(extra),retriggerSource.book.payoutMultiplier);checks.push({name:'retrigger +5 and updated total while Mortimer keeps breathing',status:'PASS'});await extra.close();
 // End normally with skip-current-effect; finalWin must not replay a second celebration.
 for(const key of ['base/max_win','bonus/loss']){
  const source=fixtures.find(s=>s.key===key),end=source.book.events.find(e=>e.type==='freeSpinEnd'),page=await openLab();
  await page.evaluate(()=>{window.__overlays=[];let open=false;new MutationObserver(()=>{const el=document.querySelector('#overlay');if(!el.hidden&&!open)window.__overlays.push(el.dataset.kind);open=!el.hidden;}).observe(document.querySelector('#overlay'),{attributes:true});});
  await start(page,key,end.index);await page.waitForSelector('#overlay[data-kind=bonus-result]:not([hidden])');
  assert.equal(await page.locator('.mortimer-actor').getAttribute('data-cue'),'breathing');
  assert.equal(await page.locator('.stage').getAttribute('data-bonus'),'active','retain the bonus scene while showing its result');
  await page.evaluate(()=>window.animationLab.player.skip());await page.evaluate(()=>window.__playing);
  assert.deepEqual(await page.evaluate(()=>window.__overlays),['bonus-result']);
  assert.equal(await page.locator('.stage').getAttribute('data-bonus'),'complete');assert.equal(await page.locator('.dug,.grave-contributing,.grave-change,.mortimer-echo,.scene-transition').count(),0);
  assert.equal(await page.locator('.mortimer-actor').getAttribute('data-pose'),'rig');
  assert.equal(await page.evaluate(()=>window.animationLab.player.state.total),source.book.payoutMultiplier);
  checks.push({name:'single bonus result, clean exit and neutral return: '+key,status:'PASS'});await page.close();
 }
 fs.mkdirSync(outputDir,{recursive:true});
 // Verify the actual game, including the narrow portrait space beside Mortimer.
 for(const [name,width,height] of [['desktop',1440,1000],['desktop-compact',1280,900],['phone',390,844],['small-phone',320,568],['tablet',768,1024],['landscape',844,390]]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'no-preference'});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(baseURL+'/web/game/',{waitUntil:'networkidle'});await page.waitForFunction(()=>document.body.dataset.state==='idle');
  // Advance two real demo purchases to the genuine multiplier_10 book.
  for(let i=0;i<2;i++){await page.click('#buy-button');await page.click('#confirm-buy');await page.waitForFunction(()=>document.body.dataset.state==='playing');await page.click('#spin-button');await page.waitForFunction(()=>document.body.dataset.state==='idle');}
  await page.click('#buy-button');await page.click('#confirm-buy');await page.waitForSelector('#overlay[data-kind=bonus-entry]:not([hidden])');
  assert.equal(await page.locator('#overlay-label').textContent(),'Разрытые могилы');assert.equal(await page.locator('#overlay-value').textContent(),'10');
  if(name==='desktop'||name==='phone'){await page.waitForTimeout(450);await page.screenshot({path:path.join(outputDir,'bonus-entry-'+name+'.png'),fullPage:true});}
  await page.locator('.stage').click({position:{x:10,y:10}});await page.waitForSelector('.grave-opening');
  assert.equal(await page.locator('.grave-opening .multiplier').first().textContent(),'×2');
  const anchors=await page.locator('.mortimer').evaluate(el=>({sprite:el.getBoundingClientRect().bottom,actor:el.closest('.mortimer-actor').getBoundingClientRect().bottom}));
  assert.ok(Math.abs(anchors.sprite-anchors.actor)<1,'Mortimer stays planted');
  await page.waitForSelector('.grave-formula:not([hidden])');
  const layout=await page.evaluate(()=>{
   const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom};};
   const a=rect('.grave-formula'),b=rect('.mortimer-actor');
   return {hud:rect('.bonus-hud'),reels:rect('.reels-shell'),formula:a,panel:rect('.game-panel'),
    overlapsActor:a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top,overflow:document.documentElement.scrollWidth>innerWidth};
  });
  assert.equal(layout.overflow,false,name+' overflow');assert.ok(layout.hud.bottom<=layout.reels.top+2,name+' bonus HUD overlaps reels: '+JSON.stringify(layout));
  assert.ok(layout.formula.bottom<=layout.panel.top,name+' formula is covered by the controls: '+JSON.stringify(layout));assert.equal(layout.overlapsActor,false,name+' formula covers Mortimer');
  await page.waitForTimeout(300);await page.screenshot({path:path.join(outputDir,'bonus-formula-'+name+'.png'),fullPage:true});
  if(name==='desktop'||name==='desktop-compact'||name==='landscape'){
   // Capture the short cap phase at the DOM transition. The remote test runner
   // can otherwise miss it while processing an earlier skip/screenshot.
   await page.evaluate(()=>{
    window.__capLayout=null;
    const observer=new MutationObserver(()=>{
     const formula=document.querySelector('.grave-formula'),note=document.querySelector('.grave-cap-note');
     if(formula.hidden||note.hidden)return;
     window.__capLayout={formula:formula.getBoundingClientRect().bottom,panel:document.querySelector('.game-panel').getBoundingClientRect().top};observer.disconnect();
    });observer.observe(document.querySelector('.stage'),{attributes:true,childList:true,subtree:true});
   });
   const book=fixtures.find(s=>s.key==='bonus/multiplier_10').book;
   const cappedIndex=book.events.find(e=>e.type==='winInfo'&&e.wins.some(w=>w.win>0&&w.win<w.rawWin)).index;
   const ordinal=book.events.slice(0,cappedIndex).filter(e=>e.type==='updateFreeSpin').at(-1).amount;
   // Check and skip in the same event-loop turn; a delayed pointer action
   // must never skip the last spin's line cycle after the ordinal changes.
   for(let i=0;i<160;i++){
    const reached=await page.evaluate(target=>{
     if(Number(document.querySelector('#feature-counter').dataset.ordinal)>=target)return true;
     document.querySelector('.stage').click();return false;
    },ordinal);
    if(reached)break;await page.waitForTimeout(30);
   }
   await page.waitForFunction(()=>!!window.__capLayout);
   const clipped=await page.evaluate(()=>window.__capLayout);
   assert.ok(clipped.formula<=clipped.panel,name+' capped-award note is covered by controls: '+JSON.stringify(clipped));
   if(await page.locator('.grave-cap-note:not([hidden])').isVisible())await page.screenshot({path:path.join(outputDir,'bonus-cap-'+name+'.png'),fullPage:true});
  }
  if(await page.locator('body').getAttribute('data-state')==='playing')await page.click('#spin-button');
  await page.waitForFunction(()=>document.body.dataset.state==='idle');
  assert.equal(await page.locator('.bonus-hud').isVisible(),false);assert.equal(await page.locator('.dug,.grave-formula:not([hidden]),.grave-change,.mortimer-echo,.scene-transition').count(),0);
  checks.push({name:'real bonus intro, graves, formula layout and clean finish: '+name,status:'PASS'});await page.close();
 }
 const en=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'no-preference'});en.on('pageerror',e=>errors.push(e.message));
 await en.goto(baseURL+'/web/game/?lang=en',{waitUntil:'networkidle'});await en.waitForFunction(()=>document.body.dataset.state==='idle');
 await en.click('#buy-button');await en.click('#confirm-buy');await en.waitForSelector('#overlay[data-kind=bonus-entry]:not([hidden])');
 assert.equal(await en.locator('#overlay-label').textContent(),'Open Graves');assert.ok((await en.locator('.bonus-overlay-detail').textContent()).includes('Free spins'));
 assert.equal(await en.locator('.bonus-hud-name').textContent(),'Open Graves');
 // A first RAF timestamp can precede performance.now() at counter creation.
 // Force that ordering in the real credit formatter, which rejects negatives.
 await en.evaluate(()=>{const original=requestAnimationFrame.bind(window);window.requestAnimationFrame=callback=>original(timestamp=>callback(timestamp-200));});
 for(let i=0;i<220;i++){
  const ready=await en.evaluate(()=>{const el=document.querySelector('#overlay');if(!el.hidden&&el.dataset.kind==='bonus-result')return true;document.querySelector('.stage').click();return false;});
  if(ready)break;await en.waitForTimeout(25);
 }
 await en.waitForFunction(()=>document.body.dataset.state==='idle',null,{timeout:15000});
 const firstBonus=fixtures.find(s=>s.key==='bonus/ordinary_win').book;
 const payout=10000n*BigInt(firstBonus.payoutMultiplier);
 assert.equal(await en.locator('#win-output').getAttribute('data-amount'),payout.toString());
 assert.equal(await en.locator('#balance-output').getAttribute('data-amount'),(9900n*1000000n+payout).toString());
 assert.equal(await en.locator('.win-readout-label').textContent(),'Total win');
 checks.push({name:'English bonus entry, HUD and result caption',status:'PASS'});
 checks.push({name:'early RAF timestamp never creates a negative amount or stalls the real credit counter',status:'PASS'});await en.close();
 assert.deepEqual(errors,[]);return {status:'PASS',checks,consoleErrors:errors};
}
module.exports={audit};
