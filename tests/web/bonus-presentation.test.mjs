import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {graveWinDetails} from '../../web/shared/bonus-presentation.mjs';
import {initialState,applyEvent,BookPlayer} from '../../web/animation-lab/book-player.mjs';
const fixtures=JSON.parse(readFileSync(new URL('../../web/game/demo-rounds.json',import.meta.url))).scenarios;

test('grave explanation uses padded winning positions and excludes inactive and unrelated graves',()=>{
 const graves=Array.from({length:5},()=>[0,0,0]);graves[0][0]=2;graves[1][2]=3;graves[4][0]=10;
 const win={positions:[{reel:0,row:1},{reel:1,row:3},{reel:2,row:2}],meta:{multiplier:5,winWithoutMult:10},rawWin:50,win:50};
 const original=structuredClone({graves,win}),detail=graveWinDetails(win,graves);
 assert.deepEqual(detail.positions,[{reel:0,row:1,multiplier:2},{reel:1,row:3,multiplier:3}]);
 assert.equal(detail.multiplier,5);assert.equal(detail.base,10);assert.equal(detail.credited,50);assert.equal(detail.capped,false);
 assert.deepEqual({graves,win},original);
 assert.equal(graveWinDetails(win,Array.from({length:5},()=>[0,0,0])),null);
});

test('a real capped award keeps its raw explanation separate from the credited amount',()=>{
 const book=fixtures.find(s=>s.key==='base/max_win').book;let state=initialState(),checked=false;
 for(const event of book.events){
  state=applyEvent(state,event);
  if(event.type!=='winInfo')continue;
  const win=event.wins.find(w=>w.win>0&&w.win<w.rawWin);if(!win)continue;
  const detail=graveWinDetails(win,state.graves);
  assert.ok(detail);assert.equal(detail.capped,true);assert.ok(detail.raw>detail.credited);
  assert.equal(detail.raw,win.rawWin);assert.equal(detail.credited,win.win);
  assert.equal(detail.multiplier,win.meta.multiplier);assert.equal(detail.base,win.meta.winWithoutMult);checked=true;
 }
 assert.equal(checked,true);
});

test('zero-win bonus completion restores the base scene after the result event',async()=>{
 const book=fixtures.find(s=>s.key==='bonus/loss').book;
 const end=book.events.find(e=>e.type==='freeSpinEnd');assert.equal(end.amount,0);
 let state=initialState();for(const event of book.events.slice(0,end.index))state=applyEvent(state,event);
 assert.equal(state.bonusEnded,false);state=applyEvent(state,end);assert.equal(state.bonusEnded,true);assert.equal(state.freeWin,0);
 let restored;const player=new BookPlayer({restore:s=>restored=s,async event(){}});
 await player.play(book,{fromEvent:end.index+1});assert.equal(restored.bonusEnded,true);assert.equal(player.state.total,book.payoutMultiplier);
 assert.equal(initialState().bonusEnded,false);
});
