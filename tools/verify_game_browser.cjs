const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..');
const fixtures=JSON.parse(fs.readFileSync(path.join(ROOT,'web/game/demo-rounds.json'))).scenarios;
const first=BigInt(fixtures.find(s=>s.key==='base/ordinary_win').book.payoutMultiplier);
const bonus=BigInt(fixtures.find(s=>s.key==='bonus/ordinary_win').book.payoutMultiplier);
const SCALE=1000000n;
const initial=10000n*SCALE;
const amount=async(page,id)=>BigInt(await page.locator(id).getAttribute('data-amount'));
const idle=page=>page.waitForFunction(()=>document.body.dataset.state==='idle');
const decode=page=>page.evaluate(()=>Promise.all([...document.images].filter(im=>im.src&&!im.loading?.includes('lazy')).map(im=>im.decode())));

async function audit(browser,{baseURL='http://127.0.0.1:8767',outputDir=path.join(ROOT,'.cache/frontend-screenshots')}={}){
 const results=[],errors=[],httpErrors=[];
 fs.mkdirSync(outputDir,{recursive:true});
 async function open(viewport={width:1440,height:1000},motion='reduce',lang='ru'){
  const page=await browser.newPage({viewport,reducedMotion:motion});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('response',r=>{if(r.status()>=400)httpErrors.push(r.status()+' '+r.url());});
  await page.goto(baseURL+'/web/game/?lang='+lang,{waitUntil:'networkidle'});await idle(page);return page;
 }
 // Same actual controls and settled balances on desktop, tablet and both phone orientations.
 for(const [name,width,height]of [['desktop',1440,1000],['phone',390,844],['small-phone',320,568],['tablet',768,1024],['landscape',844,390]]){
  const page=await open({width,height});
  assert.equal(await amount(page,'#balance-output'),initial);
  assert.equal(await page.locator('.demo-badge').textContent(),'ДЕМО');
  const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,spinWidth:document.querySelector('#spin-button').getBoundingClientRect().width}));
  assert.equal(layout.overflow,false,name+' horizontal overflow');assert.ok(layout.spinWidth>=44,name+' spin touch target');
  await page.locator('#bet-select').selectOption('100000');
  assert.equal(await page.locator('#bet-select').inputValue(),'100000');
  await page.click('#spin-button');await idle(page);
  assert.equal(await amount(page,'#balance-output'),initial-100000n+1000n*first);
  assert.equal(await amount(page,'#win-output'),1000n*first);
  await page.click('#spin-button');await idle(page);
  assert.equal(await amount(page,'#win-output'),0n);
  assert.equal(await amount(page,'#balance-output'),initial-200000n+1000n*first);
  await page.click('#buy-button');
  const before=await amount(page,'#balance-output');
  assert.equal(await page.evaluate(()=>document.activeElement.hasAttribute('autofocus')),true);
  await page.keyboard.press('Escape');assert.equal(await amount(page,'#balance-output'),before);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'buy-button');
  await decode(page);await page.screenshot({path:path.join(outputDir,name+'.png'),fullPage:true});
  await page.locator('.stage').screenshot({path:path.join(outputDir,name+'-stage.png')});
  results.push({name,width,height,status:'PASS',checks:['initial balance','bet selection','credited win','zero win','cancel purchase','focus return','layout']});
  await page.close();
 }
 const page=await open({width:1440,height:1000},'no-preference');
 await page.click('#spin-button');await page.waitForFunction(()=>document.body.dataset.state==='playing');
 assert.equal(await page.locator('#bet-select').isDisabled(),true);
 assert.equal(await page.locator('#buy-button').isDisabled(),true);
 await page.click('#spin-button');await idle(page);
 assert.equal(await amount(page,'#balance-output'),initial-SCALE+10000n*first);
 results.push({name:'in-flight locking and finish',status:'PASS'});
 // The buy quote changes no balance until confirmation and uses the locked bet.
 await page.click('#buy-button');assert.equal(await page.locator('#purchase-cost').textContent(),'100,00');
 await page.screenshot({path:path.join(outputDir,'buy-ru.png'),fullPage:true});
 await page.click('#confirm-buy');
 await page.waitForSelector('#overlay:not([hidden])');
 assert.equal(await page.locator('#overlay-label').textContent(),'Разрытые могилы');
 assert.equal(await page.locator('#overlay-art').isVisible(),false);
 await page.click('#spin-button');await idle(page);
 assert.equal(await amount(page,'#balance-output'),initial-SCALE+10000n*first-100n*SCALE+10000n*bonus);
 results.push({name:'bonus confirmation, 100x debit and localized overlay',status:'PASS'});
 await page.click('#language-button');assert.equal(await page.locator('html').getAttribute('lang'),'en');
 assert.equal(await page.locator('#buy-button strong').textContent(),'Buy bonus');
 await page.click('#rules-button');
 await page.click('#tab-paytable');assert.equal(await page.locator('.pay-card').count(),11);
 assert.equal(await page.locator('.pay-card h3').first().textContent(),'Mortimer');
 await page.screenshot({path:path.join(outputDir,'paytable-en.png'),fullPage:true});
 await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#tab-lines').getAttribute('aria-selected'),'true');
 assert.equal(await page.locator('.line-button').count(),20);await page.locator('.line-button').last().click();
 assert.equal(await page.locator('.line-button').last().getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('#line-preview polyline').getAttribute('points'),'10,30 35,10 60,10 85,10 110,30');
 await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'rules-button');
 results.push({name:'English rules, all symbols, 20 paylines and keyboard tabs',status:'PASS'});
 await page.click('#settings-button');
 await page.check('#turbo-setting');await page.check('#motion-setting');
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('#turbo-button').getAttribute('aria-pressed'),'true');
 await page.reload({waitUntil:'networkidle'});await idle(page);
 assert.equal(await page.locator('html').getAttribute('lang'),'en');
 assert.equal(await amount(page,'#balance-output'),initial); // Only visual preferences persist.
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('midnight-plots.preferences.v1')));
 assert.deepEqual(Object.keys(saved).sort(),['language','reducedMotion','turbo']);
 results.push({name:'settings persist, wallet does not persist',status:'PASS'});
 // Stop a series during an animated round: the accepted round completes once.
 await page.click('#settings-button');await page.uncheck('#motion-setting');await page.keyboard.press('Escape');
 await page.click('#auto-button');await page.click('#start-auto');
 await page.waitForFunction(()=>document.body.dataset.state==='playing');
 await page.click('#auto-button');await page.click('#spin-button');await idle(page);
 const stopped=await amount(page,'#balance-output');
 assert.equal(stopped,initial-SCALE+10000n*first);
 await page.waitForTimeout(800);assert.equal(await amount(page,'#balance-output'),stopped);
 assert.equal(await page.locator('#auto-button').getAttribute('aria-pressed'),'false');
 results.push({name:'autoplay stop completes one accepted round',status:'PASS'});
 await page.close();
 const restart=await open();
 await restart.click('#auto-button');await restart.click('#start-auto');
 await restart.waitForFunction(expected=>document.querySelector('#balance-output').dataset.amount===expected,(initial-SCALE+10000n*first).toString());
 await restart.click('#auto-button');await restart.click('#auto-button');await restart.click('#start-auto');
 await restart.waitForFunction(()=>document.querySelector('#auto-button').getAttribute('aria-pressed')==='false');
 assert.equal(await amount(restart,'#balance-output'),initial-5n*SCALE+20000n*first+5000n*SCALE);
 await restart.waitForTimeout(800);
 assert.equal(await amount(restart,'#balance-output'),initial-5n*SCALE+20000n*first+5000n*SCALE);
 results.push({name:'autoplay restart cancels the previous timer and stops on bonus',status:'PASS'});await restart.close();
 const low=await open();
 await low.selectOption('#bet-select','100000000');
 await low.click('#buy-button');await low.click('#confirm-buy');await idle(low);
 assert.equal(await amount(low,'#balance-output'),1000000n*bonus);
 assert.equal(await low.locator('#buy-button').isDisabled(),true);
 results.push({name:'insufficient bonus balance disables purchase',status:'PASS'});await low.close();
 // A failed content request has a working retry, without starting any round.
 const fault=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await fault.route('**/web/game/rules.json',route=>route.abort());
 await fault.goto(baseURL+'/web/game/',{waitUntil:'networkidle'});
 await fault.waitForSelector('#error-panel:not([hidden])');
 assert.equal(await fault.locator('#spin-button').isDisabled(),true);
 await fault.unroute('**/web/game/rules.json');await fault.click('#retry-button');await idle(fault);
 assert.equal(await amount(fault,'#balance-output'),initial);
 results.push({name:'content failure and retry',status:'PASS'});await fault.close();
 assert.deepEqual(errors,[]);assert.deepEqual(httpErrors,[]);
 const motion=await require('./verify_motion_browser.cjs').audit(browser,{baseURL,outputDir});
 const bonusReport=await require('./verify_bonus_browser.cjs').audit(browser,{baseURL,outputDir});
 return {status:'PASS',results,motion,bonus:bonusReport,consoleErrors:errors,httpErrors,limitations:['Demo credits and fixed illustrative books only','RGS, audio and physical-device testing deferred']};
}
module.exports={audit};
if(require.main===module){
 (async()=>{
  let server;
  const baseURL=process.env.GAME_URL||'http://127.0.0.1:8767';
  if(!process.env.GAME_URL){
   server=spawn('python3',['-m','http.server','8767','--bind','127.0.0.1'],{cwd:ROOT,stdio:'ignore'});
   let ready=false;
   for(let attempt=0;attempt<40;attempt++){
    if(server.exitCode!==null)throw new Error('Test HTTP server exited');
    try{const r=await fetch(baseURL+'/web/game/rules.json');if(r.ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
   }
   if(!ready){server.kill();throw new Error('Test HTTP server did not become ready');}
  }
  let browser;
  try{
   const {chromium}=require('playwright');
   browser=await chromium.launch({headless:true,...(process.env.GAME_BROWSER_PATH?{executablePath:process.env.GAME_BROWSER_PATH,args:['--no-sandbox']}:{})});
   const result=await audit(browser,{baseURL});
   fs.mkdirSync(path.join(ROOT,'.cache'),{recursive:true});
   fs.writeFileSync(path.join(ROOT,'.cache/frontend-browser.json'),JSON.stringify(result,null,2)+'\n');
   console.log(JSON.stringify(result,null,2));
  }finally{await browser?.close();server?.kill();}
 })().catch(error=>{console.error(error);process.exitCode=1;});
}
