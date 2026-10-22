import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BookPlayer} from '../../web/animation-lab/book-player.mjs';
import {BET_LEVELS,CREDIT_SCALE,DemoProvider,GameSession,formatCredits,payoutFor} from '../../web/game/session.mjs';
import {MESSAGES,translate} from '../../web/game/i18n.mjs';

const scenarios=JSON.parse(readFileSync(new URL('../../web/game/demo-rounds.json',import.meta.url))).scenarios;
const rules=JSON.parse(readFileSync(new URL('../../web/game/rules.json',import.meta.url)));
const bet=CREDIT_SCALE;
const first=scenarios.find(s=>s.key==='base/ordinary_win').book;
const bonus=scenarios.find(s=>s.key==='bonus/ordinary_win').book;
const errorCode=code=>error=>error.code===code;
function setup(provider=new DemoProvider(scenarios),event=async()=>{}){
 let session;
 const player=new BookPlayer({restore:state=>session?.display(state),event:async(e,b,a,options)=>{session?.display(a);await event(e,b,a,options);},skip(){}});
 session=new GameSession(provider,player);
 return {session,player,provider};
}

test('credit formatting and payouts preserve fractional credits and large integers',()=>{
 assert.equal(payoutFor(100_000n,1),1_000n);
 assert.equal(formatCredits(1_000n,'en'),'0.001');
 assert.equal(formatCredits(1_234_567n,'ru'),'1,234567');
 assert.equal(formatCredits(9_007_199_254_740_993_123n,'en'),'9,007,199,254,740.993123');
 assert.equal(formatCredits(-1_200_000n,'en'),'−1.20');
 assert.throws(()=>payoutFor(1n,1),errorCode('invalidBet'));
 assert.throws(()=>payoutFor(bet,-1),errorCode('invalidBook'));
});

test('demo base examples are real non-feature books; bonus examples always trigger',()=>{
 for(const label of ['ordinary_win','loss']){
  const book=scenarios.find(s=>s.key==='base/'+label).book;
  assert.equal(book.events.some(e=>e.type==='freeSpinTrigger'),false);
 }
 assert.ok(first.payoutMultiplier>0);
 assert.equal(scenarios.find(s=>s.key==='base/loss').book.payoutMultiplier,0);
 for(const scenario of scenarios.filter(s=>s.mode==='bonus'))assert.ok(scenario.book.events.some(e=>e.type==='freeSpinTrigger'));
});

test('debit, immutable book, idempotent completion and a single pending round',async()=>{
 const provider=new DemoProvider(scenarios,{balance:1_000n*bet});
 const round=await provider.play({bet,mode:'base'});
 assert.equal(provider.balance,999n*bet);
 assert.equal(round.cost,bet);
 await assert.rejects(provider.play({bet,mode:'base'}),errorCode('pendingRound'));
 round.book.payoutMultiplier=0; // A display consumer cannot rewrite the accepted award.
 const settled=await provider.complete(round.id);
 assert.equal(settled.balance,999n*bet+payoutFor(bet,first.payoutMultiplier));
 assert.equal((await provider.complete(round.id)).balance,settled.balance);
 const next=await provider.play({bet,mode:'base'});
 assert.equal(next.book.payoutMultiplier,0);
 assert.equal((await provider.complete(next.id)).balance,settled.balance-bet);
 await assert.rejects(provider.complete('unknown'),errorCode('unknownRound'));
});

test('bonus costs exactly 100 bets and insufficient funds never change the wallet',async()=>{
 const provider=new DemoProvider(scenarios,{balance:100n*bet});
 const round=await provider.play({bet,mode:'bonus'});
 assert.equal(round.cost,100n*bet);assert.equal(provider.balance,0n);
 assert.equal((await provider.complete(round.id)).balance,payoutFor(bet,bonus.payoutMultiplier));
 const poor=new DemoProvider(scenarios,{balance:99n*bet});
 await assert.rejects(poor.play({bet,mode:'bonus'}),errorCode('insufficientBalance'));
 assert.equal(poor.balance,99n*bet);assert.equal(poor.active,null);
 await assert.rejects(poor.play({bet:123n,mode:'base'}),errorCode('invalidBet'));
 await assert.rejects(poor.play({bet,mode:'other'}),errorCode('invalidMode'));
});

test('invalid books fail before any debit or sequence advance',async()=>{
 const corrupt=structuredClone(scenarios);
 corrupt.find(s=>s.key==='base/ordinary_win').book.events[0].index=5;
 const provider=new DemoProvider(corrupt,{balance:100n*bet});
 await assert.rejects(provider.play({bet,mode:'base'}));
 assert.equal(provider.balance,100n*bet);assert.equal(provider.active,null);assert.equal(provider.ordinal.base,0);
});

test('bet changes and overlapping spins are locked throughout an accepted round',async()=>{
 let release,entered;
 const blocked=new Promise(resolve=>entered=resolve);
 const {session,player,provider}=setup(undefined,async event=>{if(event.index===0){entered();await new Promise(resolve=>release=resolve);}});
 await session.initialize();session.setBet(200_000n);
 const initial=session.balance,pending=session.spin();await blocked;
 assert.equal(session.status,'playing');assert.equal(session.balance,initial-200_000n);
 assert.throws(()=>session.setBet(500_000n),errorCode('busy'));
 await assert.rejects(session.initialize(),errorCode('pendingRound'));
 await assert.rejects(session.spin(),errorCode('busy'));
 release();await pending;
 assert.equal(session.status,'idle');assert.equal(provider.serial,1);
 assert.equal(session.lastWin,payoutFor(200_000n,first.payoutMultiplier));
 assert.equal(session.balance,initial-200_000n+session.lastWin);
 assert.equal(player.running,false);
});

test('a rendering failure resumes the same round without a second debit',async()=>{
 let fail=true;
 const {session,provider}=setup(undefined,async event=>{if(event.index===1&&fail){fail=false;throw new Error('render failed');}});
 await session.initialize();const initial=session.balance;
 await session.spin();
 assert.equal(session.status,'error');assert.ok(session.active);
 assert.equal(session.balance,initial-bet);assert.equal(provider.serial,1);
 await assert.rejects(session.spin(),errorCode('busy'));
 await session.recover();
 assert.equal(session.status,'idle');assert.equal(provider.serial,1);
 assert.equal(session.balance,initial-bet+payoutFor(bet,first.payoutMultiplier));
});

test('an ambiguous completion is retried without replaying or crediting twice',async()=>{
 class InterruptedCompletion extends DemoProvider {
  async complete(id){const result=await super.complete(id);if(!this.interrupted){this.interrupted=true;throw new Error('response lost');}return result;}
 }
 let frames=0;
 const {session,provider}=setup(new InterruptedCompletion(scenarios),async()=>frames++);
 await session.initialize();const initial=session.balance;
 await session.spin();assert.equal(session.status,'error');assert.ok(session.playbackComplete);
 const played=frames;
 await session.recover();
 assert.equal(frames,played);assert.equal(provider.serial,1);assert.equal(session.status,'idle');
 assert.equal(session.balance,initial-bet+payoutFor(bet,first.payoutMultiplier));
});

test('idle insufficient-funds errors remain recoverable by choosing a lower bet',async()=>{
 const {session}=setup(new DemoProvider(scenarios,{balance:500_000n}));
 await session.initialize();await session.spin();
 assert.equal(session.error,'insufficientBalance');assert.equal(session.status,'idle');assert.equal(session.active,null);
 session.setBet(BET_LEVELS[0]);await session.spin();assert.equal(session.error,null);assert.equal(session.status,'idle');
});

test('both languages cover the same UI and display rules retain the canonical contract',()=>{
 assert.deepEqual(Object.keys(MESSAGES.ru).sort(),Object.keys(MESSAGES.en).sort());
 assert.equal(translate('en','confirmBuy',{amount:'100.00'}),'Buy for 100.00');
 assert.equal(translate('ru','freeStatus',{current:2,total:10}),'Бесплатные вращения: 2 / 10');
 assert.throws(()=>translate('en','missing'));
 assert.equal(rules.costs.bonus,100);assert.equal(rules.maxPayout,500000);assert.equal(rules.targetRtp,.962);
 assert.deepEqual(rules.graveLadder,[2,3,5,10]);assert.deepEqual(rules.paytable.M,[250,1000,5000]);
 assert.equal(Object.keys(rules.symbols).length,11);assert.equal(rules.lines.length,20);
 assert.equal(new Set(rules.lines.map(JSON.stringify)).size,20);
 assert.ok(rules.lines.every(line=>line.length===5&&line.every(row=>[0,1,2].includes(row))));
});
