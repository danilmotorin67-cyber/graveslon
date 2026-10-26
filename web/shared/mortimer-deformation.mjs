import {clamp,mix,smooth} from './mortimer-motion.mjs';

// Affine texture mapping for a small, permanent triangle mesh. Original atlases
// stay untouched: only vertices move, including the painted sleeve silhouette.
export function triangleMatrix(source,target){
 const [a,b,c]=source,[p,q,r]=target,dx=b.x-a.x,dy=b.y-a.y,ex=c.x-a.x,ey=c.y-a.y,det=dx*ey-ex*dy;
 const ux=q.x-p.x,uy=q.y-p.y,vx=r.x-p.x,vy=r.y-p.y;
 const A=(ux*ey-vx*dy)/det,B=(uy*ey-vy*dy)/det,C=(vx*dx-ux*ex)/det,D=(vy*dx-uy*ex)/det;
 return[A,B,C,D,p.x-A*a.x-C*a.y,p.y-B*a.x-D*a.y];
}
export function sleeveWarp(point,a,b,{bend=0,load=0,start=false}={}){
 const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),ux=dx/length,uy=dy/length;
 const along=(point.x-a.x)*ux+(point.y-a.y)*uy,across=-(point.x-a.x)*uy+(point.y-a.y)*ux;
 const t=clamp(along/length,0,1),weight=start?1-smooth(t/.48):smooth((t-.52)/.48);
 // Cross-sections turn towards the neighbouring bone. The bone centres stay
 // fixed; the fabric compresses on the inside and rounds over the outside.
 const angle=clamp(bend,-1.2,1.2)*weight*.28,compression=1-load*.055*Math.sin(t*Math.PI);
 const side=across*compression,offset=load*4*Math.sin(t*Math.PI);
 return{x:a.x+ux*(along-Math.sin(angle)*side)-uy*(Math.cos(angle)*side+offset),
        y:a.y+uy*(along-Math.sin(angle)*side)+ux*(Math.cos(angle)*side+offset)};
}
export function stepPendant(previous,point,dt,{reset=false}={}){
 if(reset||!previous)return{point:{...point},vx:0,vy:0,ax:0,ay:0,angle:0,velocity:0};
 dt=clamp(dt,1/240,.05);
 const vx=(point.x-previous.point.x)/dt,vy=(point.y-previous.point.y)/dt,follow=1-Math.exp(-dt*12);
 const ax=mix(previous.ax,clamp((vx-previous.vx)/dt,-1600,1600),follow),ay=mix(previous.ay,clamp((vy-previous.vy)/dt,-1600,1600),follow);
 let angle=previous.angle,velocity=previous.velocity;
 const steps=Math.ceil(dt/(1/240)),h=dt/steps;
 for(let i=0;i<steps;i++){
  velocity+=(-(4200+ay)/210*Math.sin(angle)-9.6*velocity-ax/210*Math.cos(angle))*h;
  angle=clamp(angle+velocity*h,-.065,.065);
 }
 return{point:{...point},vx,vy,ax,ay,angle,velocity};
}

export function createTextureMesh({group,defs,source,width,height,id,rows=6,columns=1,element,matrixText}){
 const triangles=[];
 for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
  const p=(i,j)=>({x:i*width/columns,y:j*height/rows}),a=p(x,y),b=p(x+1,y),c=p(x,y+1),d=p(x+1,y+1);
  for(const points of [[a,b,c],[c,b,d]]){
   const clip=element('clipPath',{id:id+'-'+triangles.length,clipPathUnits:'userSpaceOnUse'},defs);
   const centre={x:points.reduce((s,p)=>s+p.x,0)/3,y:points.reduce((s,p)=>s+p.y,0)/3};
   // Subpixel overlap avoids transparent hairlines at shared triangle edges.
   const expanded=points.map(p=>{const dx=p.x-centre.x,dy=p.y-centre.y,n=Math.hypot(dx,dy);return{x:p.x+dx/n*.28,y:p.y+dy/n*.28};});
   element('polygon',{points:expanded.map(p=>`${p.x},${p.y}`).join(' ')},clip);
   const g=element('g',{'data-mesh-triangle':'','clip-path':`url(#${clip.id})`},group);
   element('use',{href:'#'+source},g);triangles.push({points,g});
  }
 }
 group.dataset.deformed='true';
 return warp=>{for(const triangle of triangles){
  const target=triangle.points.map(warp);
  if(triangle.last&&target.every((p,i)=>Math.abs(p.x-triangle.last[i].x)<.012&&Math.abs(p.y-triangle.last[i].y)<.012))continue;
  triangle.g.setAttribute('transform',matrixText(triangleMatrix(triangle.points,target)));triangle.last=target;
 }};
}
