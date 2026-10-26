import test from 'node:test';
import assert from 'node:assert/strict';
import {solveArm,boneMatrix,transformPoint,envelope,MortimerReactions} from '../../web/shared/mortimer-motion.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('two-bone arms reach a fixed grip while keeping both segment lengths',()=>{
 for(const pole of [-1,1])for(const wrist of [{x:220,y:500},{x:440,y:230},{x:750,y:260}]){
  const shoulder={x:450,y:330},a=solveArm(shoulder,wrist,205,165,pole);
  near(Math.hypot(a.elbow.x-shoulder.x,a.elbow.y-shoulder.y),205);
  near(Math.hypot(a.wrist.x-a.elbow.x,a.wrist.y-a.elbow.y),165);
  near(a.wrist.x,wrist.x);near(a.wrist.y,wrist.y);
 }
});
test('unreachable arm targets are clamped without breaking bones or generating NaN',()=>{
 for(const wrist of [{x:0,y:0},{x:5000,y:3000}]){
  const a=solveArm({x:0,y:0},wrist,205,165);
  near(Math.hypot(a.elbow.x,a.elbow.y),205);near(Math.hypot(a.wrist.x-a.elbow.x,a.wrist.y-a.elbow.y),165);
  assert.ok(Object.values(a.wrist).every(Number.isFinite));
 }
});
test('texture joint matrices map both painted joint centers to the skeleton',()=>{
 for(const end of [{x:30,y:220},{x:-180,y:80},{x:120,y:-200}]){
  const start={x:40,y:50},from={x:180,y:80},to={x:230,y:430},m=boneMatrix(start,end,from,to);
  const a=transformPoint(m,from),b=transformPoint(m,to);near(a.x,start.x);near(a.y,start.y);near(b.x,end.x);near(b.y,end.y);
 }
});
test('gesture curves join continuously through preparation, action, hold and return',()=>{
 for(const boundary of [0,.16,.46,.61,1])assert.ok(Math.abs(envelope(boundary-1e-6)-envelope(boundary+1e-6))<1e-4);
 assert.equal(envelope(0),0);assert.equal(envelope(1),0);assert.ok(envelope(.08)<0);assert.ok(envelope(.5)>.99);
});
test('repeated small payouts never trigger large arm gestures',()=>{
 const p=new MortimerReactions();
 for(let i=0;i<30;i++){
  const now=i*500;p.sample(now);p.event({type:'winInfo',totalWin:75},{},{},now);
  const s=p.sample(now+100);assert.ok(['idle','acknowledge'].includes(s.type));assert.equal(s.lift,0);assert.equal(s.hat,0);
 }
});
test('a large-win salute is limited per round and across rapid round restarts',()=>{
 const p=new MortimerReactions(),event={type:'winInfo',totalWin:5000};
 assert.equal(p.event(event,{},{},100),true);p.sample(4000);
 p.event(event,{},{},4500);assert.notEqual(p.sample(4600).type,'hat');
 p.beginRound();p.sample(7000);assert.equal(p.event(event,{},{},7000),false);
 assert.equal(p.event(event,{},{},13000),true);assert.equal(p.sample(13100).type,'hat');
});
test('a bonus purchase does not salute a payout below its purchase cost',()=>{
 const p=new MortimerReactions();p.event({type:'winInfo',totalWin:6000},{},{},0,{cost:10000});assert.notEqual(p.sample(100).type,'hat');
 p.sample(2000);assert.equal(p.event({type:'winInfo',totalWin:25000},{},{},3000,{cost:10000}),true);assert.equal(p.sample(3100).type,'hat');
});
test('important reactions wait for a gesture return and pending cues clear on skip',()=>{
 const p=new MortimerReactions();p.trigger('lantern',0);
 p.event({type:'winInfo',totalWin:8000},{},{},600);assert.equal(p.sample(1000).type,'lantern');
 assert.equal(p.sample(2401).type,'hat');
 p.event({type:'graveMultiplierUpdate',positions:[{reel:2,row:1}],multipliers:[10]},{},{},2600);
 assert.equal(p.sample(2700).type,'hat');assert.equal(p.sample(5300).type,'look');
 p.clear();assert.equal(p.sample(5400).type,'idle');assert.equal(p.queued,null);
});
