const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

async function audit(browser,{baseURL,outputDir}){
 const checks=[],errors=[],legacyRequests=[];fs.mkdirSync(outputDir,{recursive:true});
 async function open(viewport){
  const page=await browser.newPage({viewport,reducedMotion:'no-preference'});page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(/\/characters\/mortimer_(idle|bonus|win)\.png/.test(r.url()))legacyRequests.push(r.url());});
  await page.goto(baseURL+'/web/mortimer-lab/',{waitUntil:'networkidle'});await page.waitForFunction(()=>!!window.mortimerLab);return page;
 }
 async function sample(page,duration){return page.evaluate(async duration=>{
  const rig=window.mortimerLab.rig,root=rig.svg,start=performance.now(),samples=[];
  function point(selector,x,y){return new DOMPoint(x,y).matrixTransform(root.querySelector(selector).getScreenCTM());}
  while(performance.now()-start<duration){
   await new Promise(resolve=>requestAnimationFrame(resolve));
   const left=point('[data-part=legs]',67.1,493),right=point('[data-part=legs]',310.4,492),spade=point('[data-part=shovel]',90,502);
   const grip=point('[data-part=gripL]',186,316),staff=point('[data-part=shovel]',92,52),pinch=point('[data-part=hatHand]',199,296),brim=point('[data-part=head]',100,202);
   samples.push({time:performance.now(),hat:rig.state.hat,cue:rig.state.cue,contacts:[left.x,left.y,right.x,right.y,spade.x,spade.y],gripDistance:Math.hypot(grip.x-staff.x,grip.y-staff.y),pinchDistance:Math.hypot(pinch.x-brim.x,pinch.y-brim.y),
    head:root.querySelector('[data-part=head]').getAttribute('transform'),legs:root.querySelector('[data-part=legs]').getAttribute('transform'),spade:root.querySelector('[data-part=shovel]').getAttribute('transform'),fire:root.querySelector('[data-part=fire] path').getAttribute('d'),
    wrist:{...rig.state.joints.left.wrist},textures:[...root.querySelectorAll('image')].map(im=>im.getAttribute('href'))});
  }
  return samples;
 },duration);}
 function contactsFixed(samples){
  assert.ok(samples.length>10);
  for(const s of samples)for(let i=0;i<6;i++)assert.ok(Math.abs(s.contacts[i]-samples[0].contacts[i])<.01,'a painted sole or spade tip moved');
  assert.equal(new Set(samples.map(s=>s.legs)).size,1);assert.equal(new Set(samples.map(s=>s.spade)).size,1);
  for(const s of samples)assert.deepEqual(s.textures,samples[0].textures,'whole character or texture was swapped');
 }
 for(const[name,width,height]of[['desktop',1200,1000],['phone',390,844]]){
  const page=await open({width,height});
  assert.equal(await page.locator('.mortimer-rig image').count(),14);assert.equal(await page.locator('.mortimer-echo').count(),0);
  const idle=await sample(page,900);contactsFixed(idle);assert.ok(new Set(idle.map(s=>s.head)).size>10);assert.ok(new Set(idle.map(s=>s.fire)).size>10);
  assert.ok(idle.every(s=>s.gripDistance<.2),'the hand slid off the planted shovel');
  checks.push({name:'idle head, cloth and fire with fixed painted contacts: '+name,status:'PASS'});
  await page.click('[data-cue=lantern]');const lamp=await sample(page,2850);contactsFixed(lamp);
  assert.ok(lamp.some(s=>s.cue==='lantern'));assert.ok(lamp.every(s=>s.gripDistance<.25),'lantern lift disturbed the shovel hand');
  checks.push({name:'jointed lantern gesture preserves feet and shovel grip: '+name,status:'PASS'});
  await page.click('[data-cue=hat]');const hat=await sample(page,3300);contactsFixed(hat);
  const touching=hat.filter(s=>s.hat>.995);assert.ok(touching.length>0,'hat gesture never reached its contact pose');
  assert.ok(touching.some(s=>s.pinchDistance<2),'fingers did not reach the actual painted hat brim');
  for(let i=1;i<hat.length;i++)if(hat[i].time-hat[i-1].time<70)assert.ok(Math.hypot(hat[i].wrist.x-hat[i-1].wrist.x,hat[i].wrist.y-hat[i-1].wrist.y)<55,'arm jumped between frames');
  checks.push({name:'continuous salute reaches the brim without changing textures: '+name,status:'PASS'});
  await page.click('[data-cue=look]');const looking=await sample(page,2750);contactsFixed(looking);assert.ok(looking.some(s=>s.cue==='look'));
  await page.screenshot({path:path.join(outputDir,'mortimer-rig-'+name+'.png'),fullPage:true});
  await page.check('#reduced');await page.waitForTimeout(300);const reduced=await sample(page,500);contactsFixed(reduced);
  assert.equal(new Set(reduced.map(s=>s.head)).size,1);assert.equal(new Set(reduced.map(s=>s.fire)).size,1);
  checks.push({name:'look cue and reduced-motion still frame: '+name,status:'PASS'});await page.close();
 }
 // Keep an active gesture across an ordinary round boundary instead of snapping.
 const carry=await open({width:1200,height:1000});
 await carry.evaluate(()=>window.mortimerLab.rig.trigger('hat'));await carry.waitForTimeout(1250);
 const preserved=await carry.evaluate(()=>{const rig=window.mortimerLab.rig,el=rig.svg.querySelector('[data-part=upperL]'),before=el.getAttribute('transform');rig.restore();return before===el.getAttribute('transform');});
 assert.equal(preserved,true);checks.push({name:'new rounds preserve the ongoing gesture rather than resetting the body',status:'PASS'});await carry.close();
 const game=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'no-preference'});game.on('pageerror',e=>errors.push(e.message));
 await game.goto(baseURL+'/web/game/',{waitUntil:'networkidle'});await game.waitForFunction(()=>document.body.dataset.state==='idle');
 const before=await game.locator('.mortimer').evaluate(el=>({tag:el.tagName,images:[...el.querySelectorAll('image')].map(im=>im.getAttribute('href'))}));
 await game.click('#spin-button');await game.waitForFunction(()=>document.body.dataset.state==='idle');
 assert.equal(await game.locator('.mortimer-actor').getAttribute('data-pose'),'rig');
 assert.ok(['idle','acknowledge'].includes(await game.locator('.mortimer-actor').getAttribute('data-cue')),'small payout started a large gesture');
 assert.deepEqual(await game.locator('.mortimer').evaluate(el=>({tag:el.tagName,images:[...el.querySelectorAll('image')].map(im=>im.getAttribute('href'))})),before);
 assert.equal(await game.locator('.mortimer-echo').count(),0);checks.push({name:'real small-win round keeps one rig and all original texture sources',status:'PASS'});await game.close();
 assert.deepEqual(errors,[]);assert.deepEqual(legacyRequests,[]);
 return{status:'PASS',checks,consoleErrors:errors,legacyCharacterRequests:legacyRequests};
}
module.exports={audit};
