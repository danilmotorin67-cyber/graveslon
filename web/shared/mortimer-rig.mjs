import {RAD,clamp,mix,rotatePoint,transformPoint,solveArm,boneMatrix,MortimerReactions} from './mortimer-motion.mjs';
import {createTextureMesh,sleeveWarp,stepPendant} from './mortimer-deformation.mjs';
const NS='http://www.w3.org/2000/svg';
const ROOT=new URL('../../assets/runtime/characters/mortimer-rig/',import.meta.url).href;
export const RIG_TEXTURES=[ROOT+'core.png',ROOT+'limbs.png'];
const PARTS={
 coatL:{sheet:0,rect:[35,512,443,512]},coatR:{sheet:0,rect:[596,512,438,512]},
 legs:{sheet:0,rect:[1098,4,378,504]},torso:{sheet:0,rect:[586,3,382,505]},head:{sheet:0,rect:[65,3,420,353]},
 shovel:{sheet:0,rect:[1188,508,220,516]},
 upperL:{sheet:1,rect:[0,0,384,512],a:{x:275,y:65},b:{x:142,y:413}},
 foreL:{sheet:1,rect:[384,0,384,512],a:{x:219,y:85},b:{x:246,y:469}},
 gripL:{sheet:1,rect:[768,0,384,512],wrist:{x:190,y:184},grip:{x:186,y:316}},
 hatHand:{sheet:1,rect:[1152,0,384,512],wrist:{x:204,y:151},grip:{x:199,y:296}},
 upperR:{sheet:1,rect:[0,512,384,512],a:{x:145,y:68},b:{x:234,y:411}},
 foreR:{sheet:1,rect:[384,512,384,512],a:{x:217,y:76},b:{x:254,y:462}},
 gripR:{sheet:1,rect:[768,512,384,365],wrist:{x:192,y:142},grip:{x:193,y:283}},
 lantern:{sheet:1,rect:[1184,494,324,530]},
};
function svgElement(name,attrs={},parent){const el=document.createElementNS(NS,name);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,v);parent?.append(el);return el;}
const matrixText=m=>'matrix('+m.map(v=>Number(v.toFixed(5))).join(' ')+')';
function positioned(x,y,sx,sy=sx){return[sx,0,0,sy,x,y];}
function rotateMatrix(m,pivot,angle){const c=Math.cos(angle),s=Math.sin(angle),p=rotatePoint({x:m[4],y:m[5]},pivot,angle);return[c*m[0]-s*m[1],s*m[0]+c*m[1],c*m[2]-s*m[3],s*m[2]+c*m[3],p.x,p.y];}

export function createMortimerRig(actor,{motionFactor=()=>1}={}){
 const old=actor.querySelector('.mortimer');
 const svg=svgElement('svg',{class:'mortimer mortimer-rig',viewBox:'0 0 1024 1536',role:'img','aria-label':old?.getAttribute('aria-label')||old?.alt||'Mortimer',preserveAspectRatio:'xMidYMax meet'});
 old?.replaceWith(svg);if(!old)actor.append(svg);actor.dataset.pose='rig';actor.classList.add('has-rig');
 const defs=svgElement('defs',{},svg),prefix='mortimer-'+Math.random().toString(36).slice(2,9);
 const flameClip=svgElement('clipPath',{id:prefix+'-flame'},defs);
 svgElement('path',{d:'M98 199 Q156 170 221 199 L229 355 Q162 390 94 355 Z'},flameClip);
 const glow=svgElement('radialGradient',{id:prefix+'-glow'},defs);svgElement('stop',{offset:'0','stop-color':'#b9f55e','stop-opacity':'.33'},glow);svgElement('stop',{offset:'1','stop-color':'#60c235','stop-opacity':'0'},glow);
 const flameGradient=svgElement('linearGradient',{id:prefix+'-fire',x1:0,y1:1,x2:0,y2:0},defs);
 for(const[offset,color]of[['0','#e7f8a0'],['.4','#b4ec70'],['1','#51ac38']])svgElement('stop',{offset,'stop-color':color},flameGradient);
 const soften=svgElement('filter',{id:prefix+'-soft',x:'-20%',y:'-20%',width:'140%',height:'140%'},defs);svgElement('feGaussianBlur',{stdDeviation:1.25},soften);
 const contactGradient=svgElement('radialGradient',{id:prefix+'-contact'},defs);svgElement('stop',{offset:0,'stop-color':'#020707','stop-opacity':'.75'},contactGradient);svgElement('stop',{offset:1,'stop-color':'#020707','stop-opacity':0},contactGradient);
 for(const[x,y,rx,ry]of[[435,1528,75,13],[754,1526,75,13],[255,1528,33,11]])svgElement('ellipse',{cx:x,cy:y,rx,ry,fill:`url(#${prefix}-contact)`},svg);
 const parts={},meshes={},restBends={};
 function part(name){const data=PARTS[name],g=svgElement('g',{'data-part':name},svg),[x,y,w,h]=data.rect;
  const deform=['torso','coatL','coatR','upperL','foreL','upperR','foreR'].includes(name);
  const source=deform?svgElement('g',{id:prefix+'-'+name},defs):g;
  const viewport=svgElement('svg',{x:0,y:0,width:w,height:h,viewBox:`${x} ${y} ${w} ${h}`,overflow:'hidden'},source);
  svgElement('image',{href:RIG_TEXTURES[data.sheet],x:0,y:0,width:1536,height:1024},viewport);parts[name]=g;return g;
 }
 function skin(name){const[, ,width,height]=PARTS[name].rect;
  meshes[name]=createTextureMesh({group:parts[name],defs,source:prefix+'-'+name,width,height,id:prefix+'-'+name+'-mesh',element:svgElement,matrixText,rows:name.startsWith('coat')?5:6,columns:name==='torso'?2:1});
 }
 part('coatL');part('coatR');part('legs');part('shovel');part('torso');part('head');
 part('upperL');part('foreL');part('gripL');part('hatHand');part('upperR');part('foreR');
 const lamp=svgElement('g',{'data-bone':'lantern'},svg);
 const aura=svgElement('ellipse',{cx:162,cy:280,rx:190,ry:190,fill:`url(#${prefix}-glow)`},lamp);
 const lantern=part('lantern');lamp.append(lantern);
 const fire=svgElement('g',{'clip-path':`url(#${prefix}-flame)`,'data-part':'fire'},lamp);
 const fireOuter=svgElement('path',{fill:`url(#${prefix}-fire)`,opacity:'.8',filter:`url(#${prefix}-soft)`},fire),fireMiddle=svgElement('path',{fill:'#c1ee81',opacity:'.75',filter:`url(#${prefix}-soft)`},fire),fireCore=svgElement('path',{fill:'#ecffc3',opacity:'.9',filter:`url(#${prefix}-soft)`},fire);
 const sparks=[0,1,2].map(()=>svgElement('circle',{r:1.5,fill:'#defba2'},fire));
 part('gripR');
 for(const name of ['torso','coatL','coatR','upperL','foreL','upperR','foreR'])skin(name);
 // Static contact points are in model coordinates; the shovel never translates.
 const tip={x:255,y:1526},shovelScale=1.8,shovelPivot={x:90,y:502},shovelAngle=.085;
 const shovelMatrix=rotateMatrix([shovelScale,0,0,shovelScale,tip.x-shovelPivot.x*shovelScale,tip.y-shovelPivot.y*shovelScale],tip,shovelAngle);
 const staffGrip=transformPoint(shovelMatrix,{x:92,y:52}),leftHandScale=.42,rightHandScale=.43,lanternScale=.8;
 const reactions=new MortimerReactions();
 let frame=0,timer=0,lastTime=null,pendant=null,cloth=0,destroyed=false,lastReduced=false;
 const channels={lift:0,hat:0,look:0,nod:0,heat:0,tension:0,support:0,salute:0,attention:0};
 const state={cue:'idle',phase:0,contacts:{leftFoot:{x:435,y:1526},rightFoot:{x:754,y:1524.126},shovel:{...tip}},joints:{}};
 for(const[name,p]of Object.entries(state.contacts))svgElement('circle',{'data-anchor':name,cx:p.x,cy:p.y,r:1,visibility:'hidden'},svg);
 function setPart(name,m){parts[name].setAttribute('transform',matrixText(m));}
 setPart('legs',positioned(347,602,1.31,924/493));setPart('shovel',shovelMatrix);
 function hand(name,wrist,angle,scale){const p=PARTS[name].wrist,c=Math.cos(angle)*scale,s=Math.sin(angle)*scale,m=[c,s,-s,c,wrist.x-c*p.x+s*p.y,wrist.y-s*p.x-c*p.y];setPart(name,m);return m;}
 function arm(prefix,geometry,load=0){
  const upper=Math.atan2(geometry.elbow.y-geometry.shoulder.y,geometry.elbow.x-geometry.shoulder.x),fore=Math.atan2(geometry.wrist.y-geometry.elbow.y,geometry.wrist.x-geometry.elbow.x);
  const angle=Math.atan2(Math.sin(fore-upper),Math.cos(fore-upper));restBends[prefix]??=angle;
  const bend=Math.atan2(Math.sin(angle-restBends[prefix]),Math.cos(angle-restBends[prefix]));
  for(const[name,a,b,start]of[[`upper${prefix}`,geometry.shoulder,geometry.elbow,false],[`fore${prefix}`,geometry.elbow,geometry.wrist,true]]){
   setPart(name,boneMatrix(a,b,PARTS[name].a,PARTS[name].b));
   meshes[name](p=>sleeveWarp(p,PARTS[name].a,PARTS[name].b,{bend:start?-bend:bend,load,start}));
  }
 }
 function update(now,{snap=false}={}){
  const factor=motionFactor(),reduced=factor===0,dt=lastTime===null?1/60:clamp((now-lastTime)/1000,0,.035);lastTime=now;
  if(reduced)reactions.clear();
  const cue=reactions.sample(now);state.cue=cue.type;state.phase=reduced?0:now/1000;
  const t=state.phase;
  for(const key of Object.keys(channels))channels[key]=snap||reduced?0:mix(channels[key],cue[key],1-Math.exp(-dt*24));
  const {lift,hat,look,nod,heat,tension,support,salute,attention}=channels;
  const breath=reduced?0:(1-Math.cos(t*Math.PI*2/6.4))*.5;
  const torsoAngle=(reduced?0:.07*Math.sin(t*Math.PI*2/6.4)+.75*support-1.4*lift+.6*salute+4*tension)*RAD,pivot={x:550,y:625};
  const torsoMatrix=rotateMatrix(positioned(333,195,1.035,1.035),pivot,torsoAngle);setPart('torso',torsoMatrix);
  const warpTorso=p=>{const top=clamp((425-p.y)/300,0,1),right=clamp((p.x-190)/160,0,1)*top,left=clamp((190-p.x)/150,0,1)*top;
   return{x:p.x+(p.x-190)*.004*breath*top-support*3*right,y:p.y-1.5*breath*top-14*support*right-5*salute*left};};
  meshes.torso(warpTorso);
  const bodyPoint=p=>transformPoint(torsoMatrix,warpTorso({x:(p.x-333)/1.035,y:(p.y-195)/1.035}));
  cloth=reduced||snap?0:mix(cloth,torsoAngle/RAD+.45*support+.25*salute,1-Math.exp(-dt*3.6));
  for(const[name,x,sx]of[['coatL',95,.975],['coatR',582,.88]]){
   setPart(name,positioned(x,566,sx,1.79));
   meshes[name](p=>{const w=clamp(p.y/512,0,1);return{x:p.x+cloth*6*w*w,y:p.y+Math.abs(cloth)*.8*Math.sin(w*Math.PI)};});
  }
  const headRigidPivot=rotatePoint({x:545,y:273},pivot,torsoAngle),headPivot=bodyPoint({x:545,y:273});
  const headAngle=(reduced?0:.11*Math.sin(t*.45)+look*2.2+attention*.35+nod*.8-hat*.35+4*tension)*RAD;
  const headBase=rotateMatrix(positioned(369,-1,.78),pivot,torsoAngle);headBase[4]+=headPivot.x-headRigidPivot.x;headBase[5]+=headPivot.y-headRigidPivot.y;
  const headMatrix=rotateMatrix(headBase,headPivot,headAngle);setPart('head',headMatrix);
  const brim=transformPoint(headMatrix,{x:100,y:202});
  const shoulderL=bodyPoint({x:387,y:326}),shoulderR=bodyPoint({x:648,y:333});
  const gripDelta=rotatePoint({x:(PARTS.gripL.grip.x-PARTS.gripL.wrist.x)*leftHandScale,y:(PARTS.gripL.grip.y-PARTS.gripL.wrist.y)*leftHandScale},{x:0,y:0},shovelAngle);
  const restWristL={x:staffGrip.x-gripDelta.x,y:staffGrip.y-gripDelta.y};
  const handAngle=mix(shovelAngle,-Math.PI*.66,hat),pinchDelta=rotatePoint({x:(PARTS.hatHand.grip.x-PARTS.hatHand.wrist.x)*leftHandScale,y:(PARTS.hatHand.grip.y-PARTS.hatHand.wrist.y)*leftHandScale},{x:0,y:0},handAngle);
  const target={x:brim.x-pinchDelta.x,y:brim.y-pinchDelta.y};
  // Keep the wrist outside the shoulder's folding singularity. A direct path
  // through the shoulder makes the elbow whip around despite a smooth hand.
  const wristL={x:mix(restWristL.x,target.x,hat)-95*Math.sin(hat*Math.PI),y:mix(restWristL.y,target.y,hat)};
  const left=solveArm(shoulderL,wristL,170,185,-1);arm('L',left,Math.max(0,salute));
  const free=clamp(hat*7,0,1);parts.gripL.setAttribute('opacity',1-free);parts.hatHand.setAttribute('opacity',free);
  hand('gripL',left.wrist,handAngle,leftHandScale);hand('hatHand',left.wrist,handAngle,leftHandScale);
  const wristR={x:810-30*lift-6*Math.sin(clamp(lift,0,1)*Math.PI),y:500-115*lift};
  const right=solveArm(shoulderR,wristR,180,170,1);arm('R',right,Math.max(0,support));
  const rightHand=hand('gripR',right.wrist,-4*RAD*lift,rightHandScale),ringTop=transformPoint(rightHand,PARTS.gripR.grip);
  pendant=stepPendant(pendant,ringTop,dt,{reset:reduced||snap});
  const lampMatrix=rotateMatrix(positioned(ringTop.x-151*lanternScale,ringTop.y-14*lanternScale,lanternScale),ringTop,pendant.angle);
  lamp.setAttribute('transform',matrixText(lampMatrix));parts.lantern.removeAttribute('transform');
  const flicker=reduced?0:Math.sin(t*6.2)*3+Math.sin(t*9.7+1.3)*1.6;
  fireOuter.setAttribute('d',`M120 350 Q89 300 138 271 Q118 242 ${150+flicker} ${214-flicker} Q145 268 186 279 Q216 312 191 353 Z`);
  fireMiddle.setAttribute('d',`M135 351 Q117 316 154 291 Q175 269 ${169-flicker} 253 Q208 311 177 356 Z`);
  fireCore.setAttribute('d',`M148 354 Q137 331 ${160+flicker} 307 Q186 336 167 358 Z`);
  sparks.forEach((el,i)=>{const p=reduced?.5:((t*.8+i/3)%1);el.setAttribute('cx',String(152+Math.sin(t*2+i)*14));el.setAttribute('cy',String(350-p*118));el.setAttribute('opacity',String(Math.sin(p*Math.PI)*.6));});
  fire.setAttribute('opacity',reduced?'.88':String(.86+.07*Math.sin(t*7.3)+heat*.07));aura.setAttribute('opacity',String(.6+heat*.35));
  state.joints={left:left,right:right,head:headPivot,brim,ring:ringTop,staffGrip};state.hat=hat;state.lift=lift;
  state.support=support;state.attention=attention;state.gesturePhase=cue.phase;state.pendant={angle:pendant.angle,velocity:pendant.velocity};state.cloth=cloth;
  actor.dataset.cue=state.cue;
 }
 function tick(now){
  if(destroyed||!actor.isConnected)return;
  const reduced=motionFactor()===0;if(!reduced||!lastReduced)update(now);lastReduced=reduced;
  if(reduced)timer=setTimeout(()=>tick(performance.now()),200);else frame=requestAnimationFrame(tick);
 }
 update(performance.now(),{snap:true});frame=requestAnimationFrame(tick);
 async function preload(){await Promise.all(RIG_TEXTURES.map(async src=>{const im=new Image();im.src=src;await im.decode();}));}
 function restore({resume=false}={}){if(resume||motionFactor()===0){reactions.reset();for(const key of Object.keys(channels))channels[key]=0;update(performance.now(),{snap:true});}else reactions.beginRound();actor.dataset.reaction='calm';}
 function event(event,before,after,{instant=false,cost=100}={}){
  actor.dataset.reaction=event.type==='graveMultiplierUpdate'?'dig':event.type==='freeSpinRetrigger'?'retrigger':event.type==='winInfo'&&event.totalWin>0?'win':event.type==='freeSpinEnd'?'result':'calm';
  if(instant||motionFactor()===0){reactions.clear();for(const key of Object.keys(channels))channels[key]=0;update(performance.now(),{snap:true});return false;}
  return reactions.event(event,before,after,performance.now(),{cost});
 }
 function trigger(type,settings={}){return reactions.trigger(type,performance.now(),{...settings,force:true});}
 function skip(){reactions.clear();for(const key of Object.keys(channels))channels[key]=0;update(performance.now(),{snap:true});}
 function destroy(){destroyed=true;cancelAnimationFrame(frame);clearTimeout(timer);svg.remove();}
 return{svg,preload,restore,event,trigger,skip,destroy,state,reactions,update};
}
