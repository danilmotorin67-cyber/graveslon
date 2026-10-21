// Optional browser QA: npm install --no-save playwright; npx playwright install chromium.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

async function audit(browser,{baseURL='http://127.0.0.1:8765',outputDir}={}){
  const layouts=[],errors=[],responses=[];
  for(const [name,width,height] of [['desktop',1440,1000],['phone',390,844],['mini',480,270],['landscape',844,390]]){
    const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    page.on('requestfailed',request=>errors.push(request.url()+': '+request.failure()?.errorText));
    page.on('response',response=>{if(response.status()>=400)responses.push(response.status()+' '+response.url());});
    await page.goto(baseURL+'/web/animation-lab/',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>!!window.animationLab);
    const result=await page.evaluate(async()=>{
      const lab=window.animationLab,results=[];
      for(const scenario of lab.scenarios){
        document.querySelector('#scenario').value=scenario.key;
        document.querySelector('#resume-at').value=0;
        await lab.play();
        results.push({key:scenario.key,actual:lab.player.state.total,expected:scenario.book.payoutMultiplier,phase:lab.player.state.phase});
      }
      return {results,overflow:document.documentElement.scrollWidth>innerWidth,
        panelOverlap:document.querySelector('.reels-shell').getBoundingClientRect().bottom>document.querySelector('.hud').getBoundingClientRect().top,
        badImages:[...document.images].filter(im=>im.src&&!im.complete||im.src&&im.naturalWidth===0).map(im=>im.src),
        leftovers:document.querySelectorAll('.blur-strip,.particle').length,
        stage:{width:document.querySelector('.stage').clientWidth,height:document.querySelector('.stage').clientHeight}};
    });
    result.results.forEach(r=>{assert.equal(r.actual,r.expected,r.key);assert.equal(r.phase,'complete');});
    assert.equal(result.overflow,false,name+' horizontal overflow');
    assert.equal(result.panelOverlap,false,name+' HUD overlaps reels');
    assert.deepEqual(result.badImages,[],name+' missing images');assert.equal(result.leftovers,0,name+' leaked effects');
    layouts.push({name,width,height,scenarios:result.results.length,stage:result.stage,status:'PASS'});
    if(outputDir){fs.mkdirSync(outputDir,{recursive:true});await page.screenshot({path:path.join(outputDir,name+'.png'),fullPage:true});}
    await page.close();
  }
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'no-preference'});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(baseURL+'/web/animation-lab/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.animationLab);
  await page.check('#turbo');await page.check('#disabled-turbo');
  assert.equal(await page.isDisabled('#turbo'),true);assert.equal(await page.isChecked('#turbo'),false);
  assert.equal(await page.evaluate(()=>window.animationLab.clock.factor()),1);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  const timing=await page.evaluate(async()=>{
    const lab=window.animationLab,start=performance.now(),deltas=[];let last=start;
    const playing=lab.play();
    await new Promise(resolve=>{
      function frame(now){deltas.push(now-last);last=now;if(now-start>=2000)resolve();else requestAnimationFrame(frame);}
      requestAnimationFrame(frame);
    });
    lab.player.finish();await playing;
    deltas.sort((a,b)=>a-b);
    return {cpuThrottle:4,sampleFrames:deltas.length,medianFrameMs:deltas[Math.floor(deltas.length/2)],p95FrameMs:deltas[Math.floor(deltas.length*.95)],
      finalTotal:lab.player.state.total,expected:lab.scenarios[0].book.payoutMultiplier,leftovers:document.querySelectorAll('.blur-strip,.particle').length};
  });
  assert.equal(timing.finalTotal,timing.expected);assert.equal(timing.leftovers,0);
  await page.close();assert.deepEqual(errors,[]);assert.deepEqual(responses,[]);
  return {status:'PASS',layouts,turboJurisdiction:'PASS',skipToFinal:'PASS',timing,consoleErrors:errors,httpErrors:responses,
    limits:['CPU throttling is a desktop emulator, not a physical midrange phone','No RGS, real money, audio or platform acceptance tested']};
}
module.exports={audit};
if(require.main===module){
  (async()=>{const {chromium}=require('playwright');const browser=await chromium.launch({headless:true});
    try{const result=await audit(browser,{baseURL:process.env.ANIMATION_LAB_URL||'http://127.0.0.1:8765'});console.log(JSON.stringify(result,null,2));}
    finally{await browser.close();}
  })().catch(error=>{console.error(error);process.exitCode=1;});
}
