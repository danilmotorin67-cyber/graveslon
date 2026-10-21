import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BookPlayer,initialState,applyEvent,validateBook,EVENT_TYPES} from '../../web/animation-lab/book-player.mjs';
const fixtures=JSON.parse(readFileSync(new URL('../../web/animation-lab/fixtures.json',import.meta.url))).scenarios;
const renderer=()=>({seen:[],restore(s){this.restored=structuredClone(s);},async event(e){this.seen.push(e.index);},skip(){}});

test('every real QA book replays to its authoritative total, including zero and cap',async()=>{
  const covered=new Set();
  for(const fixture of fixtures){
    const display=renderer(),player=new BookPlayer(display);
    const result=await player.play(fixture.book);
    assert.equal(result.state.total,fixture.book.payoutMultiplier);
    assert.equal(result.state.phase,'complete');
    assert.deepEqual(display.seen,fixture.book.events.map(e=>e.index));
    fixture.book.events.forEach(e=>covered.add(e.type));
  }
  assert.deepEqual(covered,EVENT_TYPES);
});

test('resume at every event boundary restores the same final state and grave map',async()=>{
  for(const fixture of fixtures){
    const full=validateBook(fixture.book);
    for(let cursor=0;cursor<=fixture.book.events.length;cursor++){
      const display=renderer(),player=new BookPlayer(display);
      const result=await player.play(fixture.book,{fromEvent:cursor});
      assert.deepEqual(result.state,full,fixture.key+' @ '+cursor);
      assert.equal(display.restored.index,cursor-1);
      assert.deepEqual(display.seen,fixture.book.events.slice(cursor).map(e=>e.index));
    }
  }
});

test('graves persist beneath replacement symbols and round totals replace, not accumulate',()=>{
  let s=initialState();
  s=applyEvent(s,{index:0,type:'graveMultiplierUpdate',positions:[{reel:4,row:3}],multipliers:[10]});
  const reveal=structuredClone(fixtures[0].book.events.find(e=>e.type==='reveal'));
  reveal.index=1;s=applyEvent(s,reveal);
  assert.equal(s.graves[4][2],10);
  s=applyEvent(s,{index:2,type:'setTotalWin',amount:125});
  s=applyEvent(s,{index:3,type:'setTotalWin',amount:250});
  assert.equal(s.total,250);
});

test('new rounds reset grave state and free-spin counters',async()=>{
  const p=new BookPlayer(renderer());
  await p.play(fixtures.find(f=>f.label==='multiplier_10').book);
  let snapshot;
  p.renderer.restore=s=>snapshot=s;
  await p.play(fixtures[0].book);
  assert.deepEqual(snapshot,initialState());
});

test('finish skips effects while processing every remaining event exactly once',async()=>{
  const display=renderer();let release;
  display.event=async function(e,b,a,{instant}){
    this.seen.push(e.index);
    if(e.index===0)await new Promise(resolve=>release=resolve);
    else assert.equal(instant,true);
  };
  display.skip=()=>release?.();
  const p=new BookPlayer(display),book=fixtures[0].book,pending=p.play(book);
  p.finish();const result=await pending;
  assert.deepEqual(display.seen,book.events.map(e=>e.index));
  assert.equal(result.state.total,book.payoutMultiplier);
});

test('stop interrupts cleanly and a subsequent play starts from a clean state',async()=>{
  const display=renderer();let release;
  display.event=async()=>new Promise(resolve=>release=resolve);
  display.skip=()=>release?.();
  const p=new BookPlayer(display),pending=p.play(fixtures[0].book);
  p.stop();assert.equal((await pending).aborted,true);
  p.renderer=renderer();
  assert.equal((await p.play(fixtures[0].book)).state.phase,'complete');
});

test('invalid books fail before displaying a frame; unsupported events are never silently ignored',async()=>{
  for(const change of [b=>b.events[0].index=5,b=>b.events[0].board[0][1].name='INVALID',b=>b.payoutMultiplier++,b=>b.events[0].type='unknown']){
    const bad=structuredClone(fixtures[0].book);change(bad);
    const display=renderer();await assert.rejects(new BookPlayer(display).play(bad));assert.deepEqual(display.seen,[]);
  }
  assert.throws(()=>applyEvent(initialState(),{index:0,type:'graveMultiplierUpdate',positions:[{reel:0,row:0}],multipliers:[2]}));
});
