// Continuous breathing and joint geometry. No game events, outcomes or money.
export const RAD=Math.PI/180;
export const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export const mix=(a,b,t)=>a+(b-a)*t;
export function smooth(t){t=clamp(t,0,1);return t*t*(3-2*t);}
const INHALE=1,HOLD=.1,EXHALE=1.65,REST=.25;
export const BREATHING_PERIOD=INHALE+HOLD+EXHALE+REST;
const ease=t=>{t=clamp(t,0,1);return clamp(t*t*t*(t*(t*6-15)+10),0,1);};
function breath(time){
 const t=((time%BREATHING_PERIOD)+BREATHING_PERIOD)%BREATHING_PERIOD;
 if(t<INHALE)return ease(t/INHALE);
 if(t<INHALE+HOLD)return 1;
 if(t<INHALE+HOLD+EXHALE)return 1-ease((t-INHALE-HOLD)/EXHALE);
 return 0;
}
export function breathingAt(time){
 return{phase:((time%BREATHING_PERIOD)+BREATHING_PERIOD)%BREATHING_PERIOD/BREATHING_PERIOD,
  chest:breath(time),shoulders:breath(time-.06),head:breath(time-.11),
  arms:breath(time-.1),cloth:breath(time-.175),hips:breath(time-.075)};
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
