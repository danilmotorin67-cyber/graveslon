// Pure joint geometry and authored gesture timing. No outcomes or money.
export const RAD=Math.PI/180;
export const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export const mix=(a,b,t)=>a+(b-a)*t;
export function smooth(t){t=clamp(t,0,1);return t*t*(3-2*t);}
export function track(keys,t){
 if(t<=keys[0][0])return keys[0][1];
 for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){
  const[a,v]=keys[i-1],[b,w]=keys[i],u=clamp((t-a)/(b-a),0,1),s=u*u*u*(u*(u*6-15)+10);
  return mix(v,w,s);
 }
 return keys.at(-1)[1];
}
const REACH=[[0,0],[.12,0],[.21,-.025],[.51,1],[.67,1],[.96,0],[1,0]];
const SUPPORT=[[0,0],[.035,0],[.15,-.1],[.36,1],[.69,1],[.9,0],[1,0]];
const ATTENTION=[[0,0],[.025,0],[.24,1],[.72,1],[.98,0],[1,0]];
export function gestureTracks(type,t,amplitude=1,target=0){
 const active=t>0&&t<1,reach=active?track(REACH,t)*amplitude:0,support=active?track(SUPPORT,t)*amplitude:0,attention=active?track(ATTENTION,t)*amplitude:0;
 const lamp=type==='lantern'||type==='look',salute=type==='hat';
 return{type,phase:t,lift:lamp?reach*(type==='look'?.56:1):0,hat:salute?Math.max(0,reach):0,
  look:type==='look'?attention*(.75+target):lamp?attention*.22:0,
  nod:type==='acknowledge'?track([[0,0],[.22,.35],[.47,1],[.83,0],[1,0]],t)*amplitude:0,
  heat:Math.max(0,reach),tension:salute?Math.max(0,-support):0,
  support:lamp?support:0,salute:salute?support:0,attention:lamp?attention:0};
}
export function rotatePoint(p,pivot,angle){const c=Math.cos(angle),s=Math.sin(angle),x=p.x-pivot.x,y=p.y-pivot.y;return{x:pivot.x+x*c-y*s,y:pivot.y+x*s+y*c};}
export function transformPoint(m,p){return{x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]};}
export function solveArm(shoulder,wrist,upper,fore,pole=1){
 const dx=wrist.x-shoulder.x,dy=wrist.y-shoulder.y,d=clamp(Math.hypot(dx,dy),Math.abs(upper-fore)+.001,upper+fore-.001);
 const direction=Math.atan2(dy,dx),angle=direction+pole*Math.acos(clamp((upper*upper+d*d-fore*fore)/(2*upper*d),-1,1));
 const elbow={x:shoulder.x+Math.cos(angle)*upper,y:shoulder.y+Math.sin(angle)*upper};
 const reachable={x:shoulder.x+Math.cos(direction)*d,y:shoulder.y+Math.sin(direction)*d};
 return{shoulder,elbow,wrist:reachable,upperAngle:angle,foreAngle:Math.atan2(reachable.y-elbow.y,reachable.x-elbow.x)};
}
export function boneMatrix(start,end,sourceStart,sourceEnd){
 const angle=Math.atan2(end.y-start.y,end.x-start.x)-Math.atan2(sourceEnd.y-sourceStart.y,sourceEnd.x-sourceStart.x);
 const scale=Math.hypot(end.x-start.x,end.y-start.y)/Math.hypot(sourceEnd.x-sourceStart.x,sourceEnd.y-sourceStart.y);
 const a=Math.cos(angle)*scale,b=Math.sin(angle)*scale;
 return[a,b,-b,a,start.x-a*sourceStart.x+b*sourceStart.y,start.y-b*sourceStart.x-a*sourceStart.y];
}
export const GESTURES=Object.freeze({
 acknowledge:{duration:1150,priority:0},lantern:{duration:3000,priority:2},look:{duration:2900,priority:4},hat:{duration:3600,priority:3},
});
export class MortimerReactions{
 constructor(){this.reset();}
 reset(){this.active=null;this.queued=null;this.lastMajor=-Infinity;this.lastHat=-Infinity;this.hatUsed=false;this.milestones=new Set();this.opened=false;}
 beginRound(){this.hatUsed=false;this.milestones.clear();this.opened=false;}
 clear(){this.active=null;this.queued=null;}
 trigger(type,now,{amplitude=1,force=false,target=0}={}){
  const spec=GESTURES[type];if(!spec)return false;
  if(!force&&type==='hat'&&now-this.lastHat<12000)return false;
  if(!force&&this.active&&now-this.active.start<this.active.duration){
   if(spec.priority<=this.active.priority)return false;
   if(this.queued&&GESTURES[this.queued.type].priority>=spec.priority)return false;
   this.queued={type,amplitude,target};if(type==='hat')this.lastHat=now;return true;
  }
  if(!force&&spec.priority>0&&now-this.lastMajor<4500&&type!=='look'&&type!=='hat')return false;
  this.active={type,start:now,duration:spec.duration,priority:spec.priority,amplitude,target};
  if(type==='hat')this.lastHat=now;
  if(spec.priority>0)this.lastMajor=now;
  return true;
 }
 event(event,before,after,now,{instant=false,cost=100}={}){
  if(instant)return false;
  if(event.type==='freeSpinTrigger')return this.trigger('lantern',now,{amplitude:.72});
  if(event.type==='freeSpinRetrigger')return this.trigger('lantern',now,{amplitude:.85});
  if(event.type==='graveMultiplierUpdate'){
   const highest=Math.max(...event.multipliers,0),first=!this.opened;this.opened=true;
   if(highest>=10&&!this.milestones.has(10)){this.milestones.add(10);return this.trigger('look',now,{amplitude:1,target:(event.positions[event.multipliers.indexOf(10)]?.row-2)/2});}
   if(highest>=5&&!this.milestones.has(5)){this.milestones.add(5);return this.trigger('lantern',now,{amplitude:.65});}
   if(first)return this.trigger('lantern',now,{amplitude:.4});
   return false;
  }
  if(event.type==='winInfo'&&event.totalWin>0){
   if(event.totalWin>=Math.max(5000,cost*2)&&!this.hatUsed){const started=this.trigger('hat',now);if(started)this.hatUsed=true;return started;}
   if(!this.active||now-this.active.start>=this.active.duration)return this.trigger('acknowledge',now,{amplitude:.65});
  }
  if(event.type==='freeSpinEnd'&&event.amount>=Math.max(5000,cost*2)&&!this.hatUsed){const started=this.trigger('hat',now);if(started)this.hatUsed=true;return started;}
  if(event.type==='finalWin'&&!after.totalFs&&event.amount>=2000&&!this.hatUsed){const started=this.trigger('hat',now);if(started)this.hatUsed=true;return started;}
  return false;
 }
 sample(now){
  let cue=this.active;
  if(cue&&now-cue.start>=cue.duration){this.active=null;const next=this.queued;this.queued=null;if(next)this.trigger(next.type,now,{...next,force:true});cue=this.active;}
  if(!cue)return gestureTracks('idle',0);
  return gestureTracks(cue.type,(now-cue.start)/cue.duration,cue.amplitude,cue.target);
 }
}
