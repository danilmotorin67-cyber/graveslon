const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const fixtures=JSON.parse(fs.readFileSync(path.join(ROOT,'web/animation-lab/fixtures.json'))).scenarios;

async function audit(browser,{baseURL,outputDir}){
 const checks=[],errors=[];
 async function lab(viewport={width:1440,height:1000}){
  const page=await browser.newPage({viewport,reducedMotion:'no-preference'});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(baseURL+'/web/animation-lab/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.animationLab);
  return page;
 }
 async function finish(page){
  return page.evaluate(async()=>{const lab=window.animationLab;lab.player.finish();await window.__playing;
   return {total:lab.player.state.total,active:lab.clock.active.size,leftovers:document.querySelectorAll('.blur-strip,.landing-strip,.particle,.spinning,.stopping,.anticipating').length};
  });
 }
 for(const [name,width,height] of [['desktop',1440,1000],['phone',390,844]]){
  const page=await lab({width,height});
  await page.evaluate(()=>{window.__playing=window.animationLab.play();});
  const start=await page.evaluate(()=>({spinning:document.querySelectorAll('.reel.spinning').length,
   symbols:[...document.querySelectorAll('.reel .symbol')].map(im=>im.dataset.symbol),
   hidden:[...document.querySelectorAll('.reel .symbol')].every(im=>getComputedStyle(im).visibility==='hidden')}));
  assert.equal(start.spinning,5);assert.equal(start.hidden,true);assert.ok(start.symbols.every(id=>id==='L1'),'final symbols must not replace the board before a stop');
  await page.waitForFunction(()=>!document.querySelector('.reel').classList.contains('spinning'));
  const partial=await page.evaluate(()=>({last:document.querySelectorAll('.reel')[4].classList.contains('spinning'),
   first:[...document.querySelectorAll('.reel:first-child .symbol')].map(im=>im.dataset.symbol),
   lastSymbols:[...document.querySelectorAll('.reel:last-child .symbol')].map(im=>im.dataset.symbol)}));
  const reveal=fixtures[0].book.events.find(e=>e.type==='reveal');
  assert.deepEqual(partial.first,reveal.board[0].slice(1,4).map(s=>s.name));
  assert.equal(partial.last,true);assert.deepEqual(partial.lastSymbols,['L1','L1','L1']);
  await page.waitForSelector('.reel.anticipating');
  const done=await finish(page);assert.equal(done.total,fixtures[0].book.payoutMultiplier);assert.equal(done.active,0);assert.equal(done.leftovers,0);
  checks.push({name:'progressive stops, hidden unrevealed board, anticipation and finish: '+name,status:'PASS'});await page.close();
 }
 // Observe actual intermediate DOM frames, including every line of a 20-line award.
 for(const [label,key,capped,turbo] of [['all 20 lines','base/multiplier_10',false,false],['capped credited amounts','base/max_win',true,false],['turbo line order','base/multiplier_10',false,true]]){
  const source=fixtures.find(s=>s.key===key);
  const event=source.book.events.find(e=>e.type==='winInfo'&&(capped?e.wins.some(w=>w.win<w.rawWin):e.wins.filter(w=>w.win>0).length===20));
  const paid=event.wins.filter(w=>w.win>0);
  const page=await lab();
  await page.selectOption('#scenario',key);await page.fill('#resume-at',String(event.index));if(turbo)await page.check('#turbo');
  await page.evaluate(()=>{
   window.__probe={lines:[],summary:null};let last='';
   new MutationObserver(()=>{
    const el=document.querySelector('.win-readout');
    if(el.hidden)return;
    if(el.dataset.kind==='line'&&el.dataset.line!==last){
     last=el.dataset.line;window.__probe.lines.push({line:Number(last),amount:Number(el.dataset.amount),lineCount:document.querySelectorAll('#lines polyline').length,
      positions:[...document.querySelectorAll('.cell.win')].map(cell=>({reel:Number(cell.dataset.reel),row:Number(cell.dataset.row)})),
      points:document.querySelector('#lines polyline')?.getAttribute('points')});
    }else if(el.dataset.kind==='total')window.__probe.summary=Number(el.dataset.amount);
   }).observe(document.querySelector('.stage'),{attributes:true,childList:true,subtree:true});
   window.__playing=window.animationLab.play();
  });
  await page.waitForFunction(expected=>window.__probe.lines.length>=expected,paid.length);
  await page.waitForFunction(expected=>window.__probe.summary===expected,event.totalWin);
  const actual=await page.evaluate(()=>window.__probe);
  assert.equal(actual.lines.length,paid.length,label);
  paid.forEach((win,i)=>{
   const got=actual.lines[i];assert.equal(got.line,win.meta.lineIndex);assert.equal(got.amount,win.win);assert.equal(got.lineCount,1);
   assert.deepEqual(got.positions,win.positions);assert.equal(got.points,win.positions.map(p=>`${p.reel*100+50},${(p.row-1)*100+50}`).join(' '));
  });
  const done=await finish(page);assert.equal(done.total,source.book.payoutMultiplier);assert.equal(done.active,0);assert.equal(done.leftovers,0);
  checks.push({name:label,status:'PASS',paidLines:paid.length});await page.close();
 }
 const skip=await lab();
 const source=fixtures.find(s=>s.key==='base/multiplier_10');
 const event=source.book.events.find(e=>e.type==='winInfo');
 await skip.selectOption('#scenario',source.key);await skip.fill('#resume-at',String(event.index));
 await skip.evaluate(()=>{window.__playing=window.animationLab.play();});
 await skip.waitForSelector('.win-readout[data-kind=line]:not([hidden])');
 await skip.evaluate(()=>window.animationLab.player.skip());
 await skip.waitForFunction(()=>!document.querySelector('#lines polyline')&&document.querySelector('.win-readout').dataset.kind==='total');
 const skipped=await finish(skip);assert.equal(skipped.total,source.book.payoutMultiplier);assert.equal(skipped.active,0);assert.equal(skipped.leftovers,0);
 checks.push({name:'skip a line cycle without dropping any credited events',status:'PASS'});await skip.close();
 const counter=await lab();
 const cap=fixtures.find(s=>s.key==='base/max_win');
 await counter.selectOption('#scenario',cap.key);await counter.fill('#resume-at',String(cap.book.events.find(e=>e.type==='freeSpinEnd').index));
 await counter.evaluate(()=>{window.__playing=window.animationLab.play();});
 await counter.waitForSelector('#overlay:not([hidden])');
 assert.equal(await counter.locator('#overlay-value').textContent(),'0.00×','counter must not flash the final amount before counting');
 await counter.waitForTimeout(800);
 const current=Number((await counter.locator('#overlay-value').textContent()).replace('×',''));
 assert.ok(current>0&&current<5000);
 const counted=await finish(counter);assert.equal(counted.total,500000);assert.equal(counted.active,0);
 checks.push({name:'big-win counter starts at zero and finishes at the authoritative award',status:'PASS'});await counter.close();
 const stop=await lab();
 await stop.evaluate(()=>{window.__playing=window.animationLab.play();window.animationLab.player.stop();});
 await stop.evaluate(()=>window.__playing);assert.equal(await stop.locator('.blur-strip,.landing-strip,.particle,.spinning').count(),0);
 assert.equal(await stop.evaluate(()=>window.animationLab.clock.active.size),0);
 await stop.check('#reduced-motion');await stop.evaluate(()=>window.animationLab.play());
 assert.equal(await stop.evaluate(()=>window.animationLab.player.state.total),fixtures[0].book.payoutMultiplier);
 checks.push({name:'stop during spin, cleanup and reduced-motion restart',status:'PASS'});await stop.close();
 // Show the new feedback in the actual game, at the accepted demo stake.
 fs.mkdirSync(outputDir,{recursive:true});
 for(const [name,width,height] of [['desktop',1440,1000],['phone',390,844]]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'no-preference'});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(baseURL+'/web/game/',{waitUntil:'networkidle'});await page.waitForFunction(()=>document.body.dataset.state==='idle');
  await page.click('#spin-button');await page.waitForSelector('.win-readout[data-kind=line]:not([hidden])');
  assert.equal(await page.locator('.win-readout-label').textContent(),'Линия 11');assert.equal(await page.locator('.win-readout-value').textContent(),'0,75');
  assert.equal(await page.locator('#game-status').textContent(),'Показ выигрыша');
  await page.waitForTimeout(330); // Capture after the payline has finished drawing.
  await page.screenshot({path:path.join(outputDir,'win-line-'+name+'.png'),fullPage:true});
  await page.waitForFunction(()=>document.body.dataset.state==='idle');
  await page.selectOption('#bet-select','2000000');await page.click('#language-button');
  assert.equal(await page.locator('.win-readout-label').textContent(),'Spin win');assert.equal(await page.locator('.win-readout-value').textContent(),'0.75','changing the next stake must not rescale the previous win');
  const amount=await page.locator('#win-output').getAttribute('data-amount');assert.equal(amount,'750000');
  await page.click('#spin-button');await page.waitForFunction(()=>document.body.dataset.state==='idle');assert.equal(await page.locator('.win-readout').isVisible(),false);
  checks.push({name:'game line caption, exact amount, language and zero-win reset: '+name,status:'PASS'});await page.close();
 }
 assert.deepEqual(errors,[]);return {status:'PASS',checks,consoleErrors:errors};
}
module.exports={audit};
