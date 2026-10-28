import test from 'node:test';
import assert from 'node:assert/strict';
import {solveArm,boneMatrix,transformPoint,breathingAt,BREATHING_PERIOD} from '../../web/shared/mortimer-motion.mjs';
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
test('breathing loops continuously without a seam or unbounded movement',()=>{
 for(let i=-100;i<=1000;i++){
  const t=i/100,b=breathingAt(t),next=breathingAt(t+BREATHING_PERIOD);
  for(const key of ['chest','shoulders','head','arms','cloth','hips']){
   assert.ok(b[key]>=0&&b[key]<=1);near(b[key],next[key]);
   assert.ok(Math.abs(breathingAt(t-1e-6)[key]-breathingAt(t+1e-6)[key])<1e-4);
  }
 }
});
test('heavy breathing has a shorter inhale, a longer exhale and a resting interval',()=>{
 const samples=Array.from({length:481},(_,i)=>breathingAt(i/100).chest);
 const rising=samples.findIndex(v=>v>.5)/100,falling=samples.findLastIndex(v=>v>.5)/100;
 assert.ok(rising<1&&falling>3);
 for(const t of [4.45,4.6,4.79])near(breathingAt(t).chest,0);
});
test('head, arms and cloth follow the chest within the same breath',()=>{
 const inhale=breathingAt(.8);assert.ok(inhale.chest>inhale.shoulders&&inhale.shoulders>inhale.head&&inhale.arms>inhale.cloth);
 const exhale=breathingAt(3);assert.ok(exhale.chest<exhale.head&&exhale.arms<exhale.cloth);
 near(breathingAt(1.65).chest,1);assert.ok(breathingAt(1.65).cloth<breathingAt(1.65).chest);
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
test('the lantern stays bounded under hand movement and settles after it stops',()=>{
 function simulate(fps){let state=null,max=0,hold=0;for(let i=0;i<=fps*5;i++){
  const t=i/fps,u=Math.min(1,t),s=u*u*u*(u*(u*6-15)+10),point={x:810-30*s,y:560-115*s};
  state=stepPendant(state,point,1/fps);max=Math.max(max,Math.abs(state.angle));if(i===fps*2)hold=Math.abs(state.angle);
 }return{state,max,hold};}
 const a=simulate(60),b=simulate(30);assert.ok(a.max>.002&&a.max<=.065);assert.ok(a.hold<.006);assert.ok(Math.abs(a.state.angle)<.0001);assert.ok(Math.abs(a.max-b.max)<.012);
 assert.equal(stepPendant(a.state,{x:0,y:0},1/60,{reset:true}).angle,0);
});
