'use strict';
// The far reaches are appended: old species codes, depth gates and sea bands retain their meaning.
const HORIZONS = [
  ['prism', 'The prismatic abyss', 'The fractured well', '#10142b', '#465878', '#70f3ff', 0],
  ['auroral', 'The aurora chasms', 'The luminous roots', '#151029', '#54406f', '#d58aff', 0],
  ['relay', 'The silent relay sea', 'The antenna marsh', '#10242c', '#426b75', '#58ffdc', 1],
  ['neopolis', 'The uninhabited tomorrow', 'The glasswater city', '#142131', '#648a9c', '#ff71bd', 2],
  ['cascade', 'The last cascade', 'The river beyond the world', '#101c2b', '#5c9ba8', '#72eaff', 3],
  ['astral', 'The galactic archipelago', 'The skyborne delta', '#0b0b21', '#555176', '#b9a3ff', 4],
].map(([key,salt,fresh,floor,ridge,glow,city],i)=>({key,salt,fresh,floor:hexToInt(floor),ridge:hexToInt(ridge),glow,city,tier:24+i}));
for (const f of HORIZONS) {
  FRONTIERS.push(f); FRONTIER_BY_KEY[f.key]=f;
  PRE_NAMES.salt[f.tier-9]=f.salt; PRE_NAMES.fresh[f.tier-9]=f.fresh;
  Object.assign(DEPTH_TIERS[f.tier],{salt:f.salt,fresh:f.fresh,biome:f.key});
  SEA_KINDS[f.key]={name:f.salt.toLowerCase(),glow:[f.glow]};
  FRONTIER_MATS[f.key]=mat('#080d1b','#1d3049','#52667c',f.glow);
  FRONTIER_MOTES[f.key]=solid(f.glow);
}
const HORIZON_BY_KEY=Object.fromEntries(HORIZONS.map(f=>[f.key,f]));
const HORIZON_DESIGNS=[
  F({kind:'prismkite',label:'Prism kite',hab:'both',tier:24,unlock:6000,deep:0.82,stats:[4,5,0.6,860],z:[8,28],cruise:3.2,light:{r:19,col:'#70f3ff'},note:'Glass fins split its light into thin, moving ribs.',look:{len:30,depth:0.28,nb:11,tail:'fan',fins:1.6,base:[205,0.45,0.13],acc:[180,0.8,0.62],pat:'netted',extras:['wings','glowspots','filaments'],glow:'#70f3ff'}}),
  C({kind:'facetwalker',label:'Facet walker',hab:'both',tier:24,unlock:6100,deep:0.82,stats:[4,5,0.6,860],cruise:1.8,light:{r:15,col:'#9ebaff'},note:'Each transparent knee reflects a different piece of the dark.',look:{segs:5,w:2.7,legs:4,leg:4,reach:4.8,claws:true,antennae:5,base:[225,0.35,0.18],acc:[195,0.8,0.65],pat:'bars'}}),
  D({kind:'auroraveil',label:'Aurora veil',hab:'both',tier:25,unlock:6500,deep:0.82,stats:[4,5,0.6,900],z:[12,32],light:{r:22,col:'#c28aff'},note:'A folded curtain whose violet light moves against the current.',look:{R:8,bell:[270,0.5,0.16],tent:[290,0.7,0.65],gonad:[175,0.85,0.6],lobes:11,tentLen:2.7,glow:true}}),
  F({kind:'helixribbon',label:'Helix ribbon',hab:'both',tier:25,unlock:6700,deep:0.82,stats:[5,5,0.6,900],z:[8,28],cruise:3.5,light:{r:18,col:'#ff87da'},note:'Two luminous seams wind around an impossibly narrow spine.',look:{len:48,depth:0.06,nb:20,tail:'long',fins:0.4,base:[280,0.35,0.12],acc:[325,0.85,0.65],pat:'bars',extras:['glowspots','filaments'],glow:'#ff87da'}}),
  F({kind:'relayneedle',label:'Relay needle',hab:'both',tier:26,unlock:7100,deep:0.68,stats:[3,5,0.6,940],z:[10,30],school:true,group:[2,4],cruise:5,light:{r:15,col:'#58ffdc'},note:'Its throat answers the shore antennae with three green flashes.',look:{len:24,depth:0.09,nb:12,tail:'fork',fins:0.7,base:[175,0.45,0.16],acc:[155,0.8,0.6],pat:'dotline',extras:['glowspots','barbels'],glow:'#58ffdc'}}),
  C({kind:'circuitcrab',label:'Circuit crab',hab:'both',tier:26,unlock:7300,deep:0.68,stats:[4,5,0.6,940],cruise:2.2,light:{r:16,col:'#ffe58a'},note:'Gold tracks under its shell join and separate as it walks.',look:{segs:6,w:3.2,legs:5,leg:2.6,reach:3.8,claws:true,antennae:7,shell:[190,0.4,0.15],base:[190,0.4,0.12],acc:[45,0.9,0.65],pat:'netted'}}),
  F({kind:'glassmanta',label:'Glasswater manta',hab:'both',tier:27,unlock:7800,deep:0.65,stats:[5,5,0.6,980],z:[12,32],cruise:2.7,light:{r:23,col:'#ff71bd'},note:'A wide silhouette passes beneath the empty towers; the windows answer pink.',look:{len:39,depth:0.32,nb:12,tail:'long',fins:2,base:[220,0.35,0.14],acc:[325,0.9,0.65],pat:'twotone',extras:['wings','glowspots'],glow:'#ff71bd'}}),
  D({kind:'signalmedusa',label:'Signal medusa',hab:'both',tier:27,unlock:8100,deep:0.65,stats:[4,5,0.6,980],z:[14,34],light:{r:20,col:'#6cecff'},note:'Its bell is divided into little windows, lit in no human alphabet.',look:{R:7,bell:[205,0.55,0.17],tent:[185,0.7,0.6],gonad:[330,0.85,0.65],lobes:12,tentLen:2.2,glow:true}}),
  F({kind:'fallskimmer',label:'Fall skimmer',hab:'both',tier:28,unlock:8600,deep:0.65,stats:[4,5,0.6,1020],z:[18,38],cruise:5,light:{r:19,col:'#72eaff'},note:'It holds its fins against the pull of water that has nowhere left to land.',look:{len:34,depth:0.12,nb:14,tail:'lyre',fins:1.5,base:[195,0.4,0.18],acc:[175,0.9,0.7],pat:'bars',extras:['wings','filaments','glowspots'],glow:'#72eaff'}}),
  D({kind:'horizonbell',label:'Horizon bell',hab:'both',tier:28,unlock:8800,deep:0.65,stats:[5,5,0.6,1020],z:[12,32],light:{r:22,col:'#d8f6ff'},note:'A pale rim keeps its shape where the waterfall folds out of sight.',look:{R:9,bell:[200,0.2,0.25],tent:[190,0.55,0.7],gonad:[220,0.8,0.7],lobes:5,tentLen:2.8,glow:true}}),
  F({kind:'constellationeel',label:'Constellation eel',hab:'both',tier:29,unlock:9400,deep:0.68,stats:[5,5,0.6,1100],z:[12,34],cruise:3.2,light:{r:24,col:'#b9a3ff'},note:'The lights along its spine look almost like a map of the cities above.',look:{len:56,depth:0.07,nb:24,tail:'long',fins:0.6,base:[250,0.4,0.1],acc:[270,0.8,0.65],pat:'dotline',extras:['glowspots','crown','filaments'],glow:'#b9a3ff'}}),
  C({kind:'orbitkeeper',label:'Orbit keeper',hab:'both',tier:29,unlock:9800,deep:0.68,stats:[5,5,0.6,1100],cruise:1.6,light:{r:18,col:'#ffd596'},note:'A many-jointed custodian carrying a warm, enclosed light.',look:{segs:8,w:3.4,legs:5,leg:4.2,reach:5,claws:true,antennae:8,base:[255,0.3,0.14],acc:[35,0.8,0.65],pat:'bars'}}),
];
for(const d of HORIZON_DESIGNS){registerDesign(d);if(d.shape!=='drift')BREED[d.kind]={clutch:[1,2],hatch:55,cap:5,eggs:'floor',needs:true};}

const HORIZON_STONE={stone:mat('#070e1b','#142d3e','#29475d','#526b80'),top:mat('#233843','#385963','#60868a','#95b4b0'),glass:mat('#050d17','#0e1c2c','#20364d','#426079')};
function horizonFloor(c,f,x,y,grain){
  let k=grain*0.13;
  if(f.key==='prism')k=Math.abs(Math.sin(x*0.041+y*0.023)*Math.sin(y*0.039-x*0.017))>0.81?0.75:k;
  else if(f.key==='auroral')k=Math.pow(0.5+0.5*Math.sin(x*0.019+Math.sin(y*0.013)*3),6)*0.48;
  else if(f.key==='relay'||f.key==='neopolis')k=((x&63)<2||(y&63)<2||((x+y)&127)<2)?0.6:k;
  else if(f.key==='cascade')k=Math.sin(x*0.023+y*0.031+Math.sin(y*0.009))>0.92?0.37:k;
  else if(f.key==='astral')k=Math.pow(fbm(x*0.007,y*0.007,81),3)*0.36;
  return mixColor(c,mixColor(f.floor,f.ridge,k),0.92);
}
// Sites use the same bounded grid for shore, bake, lights, hit testing and the GPU emitters.
function horizonSites(w,rect=null){
  if((w.erosion?.tier||0)<24||!w.depth)return [];
  const C=176,[ox,oy]=originOf(w),sample=frontierSampler(w),seed=hashString(w.seed||'pond')%997;
  const box=rect||[0,0,w.W-1,w.H-1],sites=[];
  for(let gy=Math.floor((box[1]-64-oy)/C);gy*C+oy<=box[3]+64;gy++)for(let gx=Math.floor((box[0]-64-ox)/C);gx*C+ox<=box[2]+64;gx++){
    const h=hash2(gx,gy,seed+73),x=ox+(gx+0.32+h*0.35)*C,y=oy+(gy+0.32+hash2(gx,gy,seed+74)*0.35)*C;
    if(x<26||y<26||x>w.W-26||y>w.H-26)continue;
    const f=sample(x,y,(x|0)+(y|0)*w.W);if(!HORIZON_BY_KEY[f.key])continue;
    // Player buildings and islands keep their ground and silhouette.
    if((w.structures||[]).some(s=>Math.hypot(s.x-x,s.y-y)<(s.kind==='island'?islandRadius(w,s):STRUCTURES[s.kind]?.size||10)+38))continue;
    sites.push({x,y,f,h,key:`${f.key}:${gx}:${gy}`,radius:f.city?18+h*7:6,seed:hash2(gx,gy,seed+75)});
  }
  return sites;
}
function stampHorizons(w){
  if(!w.shore||!w.depth||(w.erosion?.tier||0)<26)return;
  for(const s of horizonSites(w)){
    if(!s.f.city||s.f.city===4)continue;
    const R=s.radius;
    for(let y=Math.max(0,Math.floor(s.y-R));y<=Math.min(w.H-1,s.y+R);y++)for(let x=Math.max(0,Math.floor(s.x-R));x<=Math.min(w.W-1,s.x+R);x++){
      const q=Math.hypot((x-s.x)/R,(y-s.y)/(R*0.72));if(q>1)continue;
      const p=x+y*w.W;w.shore[p]=Math.max(w.shore[p],Math.round(255*(0.92+0.08*(1-q))));w.depth[p]=0;
    }
  }
}
const horizonTop=s=>s.f.city===4?SURFACE_Z+12:0;
function horizonBuildings(s){
  return Array.from({length:s.f.city>1?5:2},(_,k)=>{const a=k*2.4+s.h*TAU;
    return {x:s.x+Math.cos(a)*s.radius*0.44,y:s.y+Math.sin(a)*s.radius*0.35,h:8+hash2(k,3,(s.seed*997)|0)*21,w:2.4+k%2};});
}
function horizonBlock(r,b,z,m,id){
  const [cx0,cy0,cx1,cy1]=r.clip;
  for(let y=Math.max(cy0,Math.floor(b.y-b.w));y<=Math.min(cy1,b.y+b.w);y++)for(let x=Math.max(cx0,Math.floor(b.x-b.w));x<=Math.min(cx1,b.x+b.w);x++){
    const edge=Math.max(Math.abs(x-b.x),Math.abs(y-b.y))/b.w;
    r.put(x,y,z+b.h-(edge>0.78?0.8:0),m,edge>0.78?0.3:0,edge>0.78?0.4:0,edge>0.78?0.6:1,id);
  }
}
function bakeHorizons(w,r,next,rect){
  for(const s of horizonSites(w,rect)){
    const {x,y,f,h}=s,m=FRONTIER_MATS[f.key],id=next(HORIZON_STONE.stone),top=horizonTop(s);
    if(f.city){
      r.ellipsoid(x,y,s.radius,s.radius*0.72,h,top,4,HORIZON_STONE.stone,id);
      r.ellipsoid(x,y,s.radius-2,(s.radius-2)*0.72,h,top+3,1,HORIZON_STONE.top,id);
      for(const b of horizonBuildings(s)){
        horizonBlock(r,b,top+4,HORIZON_STONE.glass,next(HORIZON_STONE.glass));
        r.tube(b.x,b.y,0.55,top+4+b.h,b.x,b.y,0.25,top+b.h+8,0.7,m,next(m));
      }
      if(f.city===1)r.tube(x-8,y,0.5,4,x+8,y,0.5,4,1,HORIZON_STONE.top,id);
    }else if(f.key==='prism'){
      for(let k=0;k<4;k++){const a=h*TAU+k*1.4;r.tube(x,y,2,0,x+Math.cos(a)*8,y+Math.sin(a)*8,0.1,8+k*4,0.7,m,next(m));}
    }else{
      for(let k=0;k<6;k++){const a=k/6*TAU;r.tube(x+Math.cos(a)*9,y+Math.sin(a)*9,0.5,0,x+Math.cos(a)*9,y+Math.sin(a)*9,0.2,12,0.8,m,next(m));}
    }
  }
}
let HORIZON_LIGHT_ID=0;
function horizonId(){if(!HORIZON_LIGHT_ID){HORIZON_LIGHT_ID=newId(hexToInt('#08101e'));EMISSIVE[HORIZON_LIGHT_ID]=2;}return HORIZON_LIGHT_ID;}
function drawHorizons(r,w,rect){
  if((w.erosion?.tier||0)<24)return;
  const id=horizonId(),t=w.t||0,alpha=r.alpha,shadow=r.castShadows;r.castShadows=false;
  // Stars are behind the inhabitants, resolved by the normal height buffer.
  const sample=frontierSampler(w),[ox,oy]=originOf(w);
  for(let gy=Math.floor((rect[1]-oy)/27);gy*27+oy<=rect[3];gy++)for(let gx=Math.floor((rect[0]-ox)/27);gx*27+ox<=rect[2];gx++){
    const h=hash2(gx,gy,89),x=ox+(gx+h)*27,y=oy+(gy+hash2(gx,gy,90))*27;
    if(x<0||y<0||x>=w.W||y>=w.H)continue;
    const f=sample(x,y,(x|0)+(y|0)*w.W);if(f.key==='astral'&&!isDry(w,x,y))r.dot(x,y,0.2,FRONTIER_MOTES.astral,id);
  }
  for(const s of horizonSites(w,rect)){
    const {x,y,f}=s,m=FRONTIER_MOTES[f.key],top=horizonTop(s),active=!!w.game?.horizonSignals?.[s.key];
    if(!f.city){
      if(f.key==='prism')for(let k=0;k<4;k++){const a=s.h*TAU+k*1.4;r.tube(x,y,0.18,1,x+Math.cos(a)*8,y+Math.sin(a)*8,0.12,9+k*4,0.6,m,id);}
      else{
        r.alpha=0.22;
        for(let k=0;k<8;k++){const a=k/8*TAU+t*0.035,b=a+TAU/8,rad=12+Math.sin(t*0.17+k)*2;
          r.tube(x+Math.cos(a)*rad,y+Math.sin(a)*rad,0.8,10+Math.sin(a*2+t*0.2)*5,x+Math.cos(b)*rad,y+Math.sin(b)*rad,0.6,10+Math.sin(b*2+t*0.2)*5,1.4,m,id);
        }
        r.alpha=alpha;
      }
      continue;
    }
    for(const b of horizonBuildings(s)){
      const z=top+b.h+5,half=b.w;
      for(const side of [-1,1])r.tube(b.x-half,b.y+side*half,0.22,z,b.x+half,b.y+side*half,0.22,z,0.65,m,id);
      r.tube(b.x-half,b.y-half,0.22,z,b.x-half,b.y+half,0.22,z,0.65,m,id);
      if(active){r.alpha=0.18+0.06*Math.sin(t*0.5+b.h);r.tube(b.x,b.y,0.8,z,b.x,b.y,0.12,z+15,0.6,m,id);r.alpha=alpha;}
    }
    if(f.city===4){
      r.alpha=0.28;r.ellipsoid(x,y,s.radius+5,(s.radius+5)*0.72,0,top-3,0.2,m,id);r.alpha=alpha;
      for(let k=0;k<8;k++){const a=k/8*TAU+t*0.025;r.dot(x+Math.cos(a)*(s.radius+8),y+Math.sin(a)*(s.radius+8)*0.7,top-2,m,id);}
    }
  }
  // The far lip is inside the final water band. It moves with expansion, on every shore orientation.
  if((w.erosion?.tier||0)>=28){
    const into=intoOf(w),axis=deepAxisX(w.shoreSide),size=axis?w.W:w.H,cross=axis?w.H:w.W,shift=deepShifts(w.shoreSide),edge=shift?80:size-81;
    const m=FRONTIER_MOTES.cascade,star=FRONTIER_MOTES.astral;
    const lo=Math.max(0,Math.floor((axis?rect[1]:rect[0])/6)*6),hi=Math.min(cross,axis?rect[3]:rect[2]);
    for(let u=lo;u<=hi;u+=6){
      const x=axis?edge:u,y=axis?u:edge;
      if(into(x,y)<(w.expandPx||0)-160)continue;
      const h=hash2(u,2,37),flow=(t*0.45+h)%1;r.alpha=0.42;
      r.tube(x,y,1.5,SURFACE_Z+3,x+(axis?(shift?-1:1)*(18+flow*40):0),y+(axis?0:(shift?-1:1)*(18+flow*40)),0.5,3,0.8,m,id);
      r.alpha=alpha;
      r.tube(x,y,0.35,SURFACE_Z+4,x+(axis?0:6),y+(axis?6:0),0.35,SURFACE_Z+4,0.7,m,id);
      for(let k=0;k<3;k++){const v=12+hash2(u,k,53)*57,xx=x+(axis?(shift?-1:1)*v:Math.sin(k+u)*3),yy=y+(axis?Math.sin(k+u)*3:(shift?-1:1)*v);r.dot(xx,yy,1,star,id);}
    }
  }
  r.alpha=alpha;r.castShadows=shadow;
}
function horizonLights(M,w,rect){
  for(const s of horizonSites(w,rect)){
    const on=w.game?.horizonSignals?.[s.key],col=hexToInt(s.f.glow);
    splat(M,s.x,s.y,26+(on?8:0),col,on?0.85:0.4,0,0,rect,s.f.city===4?58:10);M.any=true;
  }
}
// At most eight local sources, independent of total pond size. Read-only; the GPU consumes these each frame.
function exoticEmitters(w,rect){
  const cx=(rect[0]+rect[2])/2,cy=(rect[1]+rect[3])/2,out=[];
  for(const s of horizonSites(w,rect))out.push({x:s.x,y:s.y,z:s.f.city===4?58:13,r:16,col:s.f.glow,k:0.55});
  for(const c of w.creatures||[]){const d=DEEP[c.species],l=LIGHT_SPECIES[c.species];if(!l||!l.col||(d?.tier||0)<15||c.gone)continue;
    if(c.x<rect[0]-32||c.y<rect[1]-32||c.x>rect[2]+32||c.y>rect[3]+32)continue;
    out.push({x:c.x,y:c.y,z:Math.min(28,c.z||6),r:Math.min(20,l.r||12),col:l.col,k:0.35*(c.alpha??1)});
  }
  if((w.erosion?.tier||0)>=28){
    const axis=deepAxisX(w.shoreSide),shift=deepShifts(w.shoreSide),edge=shift?80:(axis?w.W:w.H)-81;
    for(let u=Math.floor((axis?rect[1]:rect[0])/96)*96;u<=(axis?rect[3]:rect[2]);u+=96){const x=axis?edge:u,y=axis?u:edge;
      if(x<rect[0]-32||y<rect[1]-32||x>rect[2]+32||y>rect[3]+32)continue;
      out.push({x,y,z:32,r:23,col:'#72eaff',k:0.45});
    }
  }
  return out.sort((a,b)=>(a.x-cx)**2+(a.y-cy)**2-((b.x-cx)**2+(b.y-cy)**2)).slice(0,8);
}
function horizonClick(w,x,y){
  const site=horizonSites(w,[x-25,y-25,x+25,y+25]).find(s=>Math.hypot(s.x-x,s.y-y)<s.radius+5);
  if(!site||!site.f.city)return false;
  showWorldMystery(w,{title:site.f.city===4?'A city without a shore':'The silent buildings',text:'No doors face the water. A narrow band of light travels through the windows, pauses, and begins again.',actions:[
    {label:'Listen',run:()=>showTicker('Three low notes travel through the stone. Something distant answers a little too late.')},
    {label:w.game?.horizonSignals?.[site.key]?'Signal attuned':'Attune the relay · 20 essence',disabled:!!w.game?.horizonSignals?.[site.key],run:()=>{
      if(w.observe)return false;
      const signals=w.game.horizonSignals||(w.game.horizonSignals={});if(Object.keys(signals).length>=24){showTicker('The pond is holding as many signals as it can.');return false;}
      if(signals[site.key]||!spendEssence(w,20))return false;
      signals[site.key]=true;w.gameDirty=true;showTicker('The windows answer. The relay will gather a little essence at dawn.');return true;
    }}]});return true;
}
function updateHorizons(w){
  if(w.observe||!w.game)return;
  const count=Object.keys(w.game.horizonSignals||{}).length,day=Math.floor(w.days||0);
  if(!count||w.game.horizonDawn===day)return;
  if(w.game.horizonDawn!=null)gainEssence(w,Math.min(12,count*2),'the relays');w.game.horizonDawn=day;
}
