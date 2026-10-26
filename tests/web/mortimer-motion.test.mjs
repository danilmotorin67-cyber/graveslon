import test from 'node:test';
import assert from 'node:assert/strict';
import {solveArm,boneMatrix,transformPoint,gestureTracks,GESTURES,MortimerReactions} from '../../web/shared/mortimer-motion.mjs';
import {triangleMatrix,sleeveWarp,stepPendant} from '../../web/shared/mortimer-deformation.mjs';
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
test('gestures lead with attention and shoulder, hold their target, and return continuously',()=>{
 const early=gestureTracks('lantern',.1);assert.ok(early.attention>0);assert.ok(Math.abs(early.support)>0);assert.equal(early.lift,0);
 for(const t of [.55,.6,.65])near(gestureTracks('lantern',t).lift,1);
 for(const type of ['lantern','look','hat']){
  for(let i=0;i<=1000;i++)for(const key of ['lift','hat','look','support','salute'])assert.ok(Math.abs(gestureTracks(type,i/1000-1e-6)[key]-gestureTracks(type,i/1000+1e-6)[key])<1e-4);
  for(const t of [0,1])for(const key of ['lift','hat','look','support','salute'])near(gestureTracks(type,t)[key],0);
 }
});
test('deformed texture triangles keep all three corners attached to their destination',()=>{
 const source=[{x:0,y:0},{x:384,y:0},{x:0,y:100}],target=[{x:12,y:4},{x:360,y:-5},{x:-8,y:108}];
 const m=triangleMatrix(source,target);source.forEach((p,i)=>{const q=transformPoint(m,p);near(q.x,target[i].x);near(q.y,target[i].y);});
});
test('sleeve deformation bends the silhouette while preserving both joint centres',()=>{
 const a={x:145,y:68},b={x:234,y:411},settings={bend:.8,load:1};
 for(const p of [a,b]){const q=sleeveWarp(p,a,b,settings);near(p.x,q.x);near(p.y,q.y);}
 const p={x:280,y:350},q=sleeveWarp(p,a,b,settings);assert.ok(Math.hypot(p.x-q.x,p.y-q.y)>2);
});
test('the lantern stays bounded during a lift and settles after the hand stops',()=>{
 function simulate(fps){let state=null,max=0,hold=0;for(let i=0;i<=fps*5;i++){
  const t=i/fps,u=Math.min(1,t),s=u*u*u*(u*(u*6-15)+10),point={x:810-30*s,y:560-115*s};
  state=stepPendant(state,point,1/fps);max=Math.max(max,Math.abs(state.angle));if(i===fps*2)hold=Math.abs(state.angle);
 }return{state,max,hold};}
 const a=simulate(60),b=simulate(30);assert.ok(a.max>.002&&a.max<=.065);assert.ok(a.hold<.006);assert.ok(Math.abs(a.state.angle)<.0001);assert.ok(Math.abs(a.max-b.max)<.012);
 assert.equal(stepPendant(a.state,{x:0,y:0},1/60,{reset:true}).angle,0);
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
 const endLantern=GESTURES.lantern.duration+1;assert.equal(p.sample(endLantern).type,'hat');
 p.event({type:'graveMultiplierUpdate',positions:[{reel:2,row:1}],multipliers:[10]},{},{},endLantern+200);
 assert.equal(p.sample(endLantern+300).type,'hat');const endHat=endLantern+GESTURES.hat.duration+1;assert.equal(p.sample(endHat).type,'look');
 p.clear();assert.equal(p.sample(endHat+100).type,'idle');assert.equal(p.queued,null);
});
