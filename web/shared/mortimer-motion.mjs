// Continuous breathing and joint geometry. No game events, outcomes or money.
export const RAD=Math.PI/180;
export const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export const mix=(a,b,t)=>a+(b-a)*t;
export function smooth(t){t=clamp(t,0,1);return t*t*(3-2*t);}
export const BREATHING_PERIOD=4.8;
const ease=t=>{t=clamp(t,0,1);return clamp(t*t*t*(t*(t*6-15)+10),0,1);};
function breath(time){
 const t=((time%BREATHING_PERIOD)+BREATHING_PERIOD)%BREATHING_PERIOD;
 if(t<1.55)return ease(t/1.55);
 if(t<1.75)return 1;
 if(t<4.4)return 1-ease((t-1.75)/2.65);
 return 0;
}
export function breathingAt(time){
 return{phase:((time%BREATHING_PERIOD)+BREATHING_PERIOD)%BREATHING_PERIOD/BREATHING_PERIOD,
  chest:breath(time),shoulders:breath(time-.1),head:breath(time-.18),
  arms:breath(time-.16),cloth:breath(time-.28),hips:breath(time-.12)};
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
