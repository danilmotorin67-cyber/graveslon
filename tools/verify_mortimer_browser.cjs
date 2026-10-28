const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

async function audit(browser,{baseURL,outputDir}){
 const checks=[],errors=[],legacyRequests=[];fs.mkdirSync(outputDir,{recursive:true});
 async function open(viewport,url='/web/mortimer-lab/',motion='no-preference'){
  const page=await browser.newPage({viewport,reducedMotion:motion});page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(/\/characters\/mortimer_(idle|bonus|win)\.png/.test(r.url()))legacyRequests.push(r.url());});
  await page.goto(baseURL+url,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.mortimerLab||!!window.animationLab||document.body.dataset.state==='idle');return page;
 }
 async function sample(page,duration){return page.evaluate(async duration=>{
  const rig=window.mortimerLab.rig,root=rig.svg,start=performance.now(),samples=[];
  const part=name=>root.querySelector(`[data-part=${name}]`);
  function point(el,x,y){return new DOMPoint(x,y).matrixTransform(el.getScreenCTM());}
  while(performance.now()-start<duration){
   await new Promise(resolve=>requestAnimationFrame(resolve));
   const left=point(part('legs'),67.1,493),right=point(part('legs'),310.4,492),spade=point(part('shovel'),90,502);
   const grip=point(part('gripL'),186,316),staff=point(part('shovel'),92,52),ring=point(root.querySelector('[data-bone=lantern]'),151,14),hand=point(part('gripR'),193,283);
   const chestL=point(part('torso').children[8],0,505/3),chestR=point(part('torso').children[10],382,505/3),head=point(part('head'),200,200);
   samples.push({time:performance.now(),cue:rig.state.cue,phase:rig.state.phase,breath:rig.state.breath.chest,
    contacts:[left.x,left.y,right.x,right.y,spade.x,spade.y],gripDistance:Math.hypot(grip.x-staff.x,grip.y-staff.y),ringDistance:Math.hypot(ring.x-hand.x,ring.y-hand.y),
    soleTriangles:[...part('legs').children].slice(-2).map(el=>el.getAttribute('transform')),headY:head.y,chestWidth:chestR.x-chestL.x,
    parts:['head','upperL','foreL','upperR','foreR','coatL','coatR'].map(name=>part(name).getAttribute('transform')),
    hips:part('legs').firstElementChild.getAttribute('transform'),right:structuredClone(rig.state.joints.right),
    textures:[...root.querySelectorAll('image')].map(im=>im.getAttribute('href'))});
  }
  return samples;
 },duration);}
 const range=values=>Math.max(...values)-Math.min(...values);
 for(const[name,width,height]of[['desktop',1200,1000],['phone',390,844]]){
  const page=await open({width,height});
  assert.equal(await page.locator('.mortimer-rig image').count(),13);assert.equal(await page.locator('[data-part=hatHand],button[data-cue],.mortimer-echo').count(),0);
  const samples=await sample(page,5600);assert.ok(samples.length>60);
  assert.ok(samples.every(s=>s.cue==='breathing'));assert.ok(range(samples.map(s=>s.breath))>.98);
  for(let i=0;i<7;i++)assert.ok(new Set(samples.map(s=>s.parts[i])).size>10,'a body part stayed motionless');
  assert.ok(new Set(samples.map(s=>s.hips)).size>10,'the hips did not follow the breath');
  const headRise=range(samples.map(s=>s.headY));assert.ok(headRise>(name==='desktop'?3:1)&&headRise<(name==='desktop'?10:8),name+' breathing became invisible or excessive: '+headRise);
  assert.ok(range(samples.map(s=>s.chestWidth))>(name==='desktop'?.5:.15),'the chest did not expand');
  checks.push({name:'continuous heavy breathing moves chest, shoulders, head, arms, hips and cloth: '+name,status:'PASS',headRisePixels:headRise});
  for(const s of samples){
   for(let i=0;i<6;i++)assert.ok(Math.abs(s.contacts[i]-samples[0].contacts[i])<.01,'a sole or shovel tip moved');
   assert.deepEqual(s.soleTriangles,['matrix(1 0 0 1 0 0)','matrix(1 0 0 1 0 0)'],'the painted boot mesh moved');
   assert.ok(s.gripDistance<.25,'the hand left the shovel');assert.ok(s.ringDistance<.1,'the lantern left the fingers');
   assert.deepEqual(s.textures,samples[0].textures,'a texture or whole pose changed');
  }
  assert.ok(range(samples.map(s=>s.right.wrist.y))<9,'the lantern performed a lift gesture');
  checks.push({name:'fixed painted soles and shovel, stable grips and no pose changes: '+name,status:'PASS'});
  await page.screenshot({path:path.join(outputDir,'mortimer-breathing-'+name+'.png'),fullPage:true});
  await page.check('#reduced');await page.waitForTimeout(250);
  const frozen=await page.evaluate(async()=>{const r=window.mortimerLab.rig,svg=r.svg.outerHTML,phase=r.state.phase;await new Promise(resolve=>setTimeout(resolve,450));return{unchanged:svg===r.svg.outerHTML,phase,after:r.state.phase};});
  assert.ok(frozen.unchanged);assert.equal(frozen.after,frozen.phase);
  await page.uncheck('#reduced');await page.waitForTimeout(700);const resumed=await page.evaluate(()=>window.mortimerLab.rig.state.phase);
  assert.ok(resumed>frozen.phase+.35&&resumed<frozen.phase+.9,'reduced-motion resume jumped or failed');
  checks.push({name:'reduced motion freezes the entire character and resumes its breath: '+name,status:'PASS'});await page.close();
 }
 const reduced=await open({width:1200,height:1000},'/web/mortimer-lab/','reduce');
 assert.equal(await reduced.isChecked('#reduced'),true);assert.equal(await reduced.evaluate(()=>window.mortimerLab.rig.state.phase),0);
 checks.push({name:'system reduced-motion preference starts with a static character',status:'PASS'});await reduced.close();
 const lab=await open({width:1440,height:1000},'/web/animation-lab/');
 const books=await lab.evaluate(async()=>{
  const {rig,player,scenarios}=window.animationLab,original=player.renderer.event.bind(player.renderer),types=new Set();
  const snapshot=()=>JSON.stringify({phase:rig.state.phase,parts:[...rig.svg.querySelectorAll('[data-part],[data-bone]')].map(el=>el.getAttribute('transform'))});
  const before=snapshot();let events=0;
  player.renderer.event=async(event,a,b,options)=>{types.add(event.type);await original(event,a,b,{...options,instant:true});events++;if(snapshot()!==before)throw new Error('Game event changed Mortimer: '+event.type);};
  for(const scenario of scenarios){const result=await player.play(scenario.book);if(result.state.total!==scenario.book.payoutMultiplier)throw new Error('Book total changed');}
  const eventAPI=typeof rig.event,triggerAPI=typeof rig.trigger;
  player.skip();player.finish();player.stop();if(snapshot()!==before)throw new Error('Skip reset the breath');
  const resume=scenarios.find(s=>s.key==='bonus/multiplier_10');await player.play(resume.book,{fromEvent:Math.floor(resume.book.events.length/2)});
  if(snapshot()!==before)throw new Error('Restore reset the breath');
  const {EVENT_TYPES}=await import('/web/animation-lab/book-player.mjs');
  return{books:scenarios.length,events,types:[...types].sort(),expectedTypes:[...EVENT_TYPES].sort(),eventAPI,triggerAPI};
 });
 assert.equal(books.books,10);assert.deepEqual(books.types,books.expectedTypes);assert.equal(books.eventAPI,'undefined');assert.equal(books.triggerAPI,'undefined');
 checks.push({name:'every supported event type in 10 books leaves the independent character unchanged',status:'PASS',coverage:books});
 checks.push({name:'skip, finish, stop and book restoration do not reset breathing',status:'PASS'});
 const speed=await lab.evaluate(async()=>{const r=window.animationLab.rig,t=performance.now(),phase=r.state.phase;document.querySelector('#turbo').click();await new Promise(resolve=>setTimeout(resolve,1000));return{ratio:(r.state.phase-phase)/((performance.now()-t)/1000),cue:document.querySelector('.mortimer-actor').dataset.cue};});
 assert.ok(speed.ratio>.8&&speed.ratio<1.1);assert.equal(speed.cue,'breathing');
 checks.push({name:'breathing continues after books and keeps its own speed in turbo',status:'PASS'});await lab.close();
 const game=await open({width:1440,height:1000},'/web/game/');
 await game.evaluate(()=>{window.__mortimerCues=[];new MutationObserver(()=>window.__mortimerCues.push(document.querySelector('.mortimer-actor').dataset.cue)).observe(document.querySelector('.mortimer-actor'),{attributes:true});});
 for(let i=0;i<2;i++){await game.click('#spin-button');await game.waitForFunction(()=>document.body.dataset.state==='idle');}
 await game.click('#buy-button');await game.click('#confirm-buy');await game.waitForSelector('#overlay[data-kind=bonus-entry]:not([hidden])');
 assert.equal(await game.locator('.mortimer-actor').getAttribute('data-cue'),'breathing');await game.click('#spin-button');await game.waitForFunction(()=>document.body.dataset.state==='idle');
 assert.equal(await game.locator('.mortimer-actor').getAttribute('data-reaction'),null);assert.ok((await game.evaluate(()=>window.__mortimerCues)).every(cue=>cue==='breathing'));
 checks.push({name:'real wins, losses, bonus entry and finish never trigger a character reaction',status:'PASS'});await game.close();
 assert.deepEqual(errors,[]);assert.deepEqual(legacyRequests,[]);return{status:'PASS',checks,consoleErrors:errors,legacyCharacterRequests:legacyRequests};
}
module.exports={audit};
