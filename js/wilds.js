'use strict';
// The old beach/jungle keeps its pace. Beyond it, a separate saved clock uncovers the river settlement slowly.
const WILD_EDGE=440;
// Optional bounded p4 trailer. Named-pond and native browser saves already preserve the full game object.
function explorationState(G={}){
  const n=(v,max=1e9)=>typeof v==='number'&&Number.isFinite(v)?clamp(v,0,max):0,S=G.imps||{},F=G.wilds;
  const signals=Object.fromEntries(Object.entries(G.horizonSignals||{}).filter(([k,v])=>v&&/^(relay|neopolis|cascade|astral):-?\d{1,5}:-?\d{1,5}$/.test(k)).slice(0,24).map(([k])=>[k,true]));
  return {landReach:n(G.landReach,HINTER_MAX),impTrade:!!G.impTrade,tributeFound:!!G.tributeFound,
    imps:{seen:n(S.seen,100000),visits:n(S.visits,100000),...(S.jungle!=null?{jungle:n(S.jungle)}:{}),...(S.last!=null?{last:n(S.last)}:{}),...(S.interact?{interact:cleanImpInteractions(S.interact)}:{})},
    ...(F?{wilds:{since:n(F.since),reach:clamp(n(F.reach),WILD_EDGE,HINTER_MAX),trust:n(F.trust,20),found:[...new Set((Array.isArray(F.found)?F.found:[]).filter(v=>Number.isInteger(v)&&v>=0&&v<5))],lastTrade:F.lastTrade==null?-1:Math.max(-1,n(F.lastTrade)),...(F.bellDay!=null?{bellDay:n(F.bellDay)}:{}),whisper:!!F.whisper}}:{}),
    ...(G.offerings?{offerings:cleanOfferings(G.offerings)}:{}),
    horizonSignals:signals,...(G.horizonDawn!=null?{horizonDawn:n(G.horizonDawn)}:{})};
}
function packExplorationTrailer(writer,w){
  const G=w.game||{};if(!G.wilds&&!G.imps&&!G.horizonSignals&&!G.offerings)return;
  const bytes=new TextEncoder().encode(JSON.stringify(explorationState(G)));if(bytes.length>8192)throw Error('Exploration state too large');
  writer.u8(0x57);writer.u8(1);writer.vu(bytes.length);for(const b of bytes)writer.u8(b);
}
function unpackExplorationTrailer(reader,save){
  if(reader.u8()!==0x57||reader.u8()!==1)throw Error('Unknown exploration trailer');
  const n=linkBoundedVu(reader,8192);if(n>reader.b.length-reader.i)throw Error('Short exploration trailer');
  const data=JSON.parse(new TextDecoder().decode(reader.b.subarray(reader.i,reader.i+n)));reader.i+=n;
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid exploration trailer');
  save.game={...(save.game||{}),...explorationState(data)};
}
const wildsDay=w=>(w.days||0);
const wildsState=w=>w.game?.wilds||null;
function wildsReach(w){return Math.min(HINTER_MAX,Math.max(WILD_EDGE,wildsState(w)?.reach||WILD_EDGE));}
function updateWilds(w,dt){
  if(!w.game||w.observe||dt<=0)return;
  const G=w.game,S=impState(w),now=wildsDay(w),oldReach=30+1.3*(w.days||0)+0.8*(w.erosion?.e||0)+240*curseLevel(w);
  if(!G.wilds&&Math.max(G.landReach||0,oldReach)>=WILD_EDGE-2)G.wilds={since:now,reach:WILD_EDGE,trust:impInteractions(w).trust,found:[],lastTrade:-1};
  const F=G.wilds;if(!F)return;
  const age=Math.max(0,now-F.since),trust=Math.min(20,F.trust||0);
  F.reach=Math.max(F.reach||WILD_EDGE,Math.min(HINTER_MAX,WILD_EDGE+age*0.42+trust*1.2));
  if(S.seen>=3&&!G.impTrade){G.impTrade=true;w.gameDirty=true;if(typeof refreshSpeciesButtons==='function')refreshSpeciesButtons();}
  if(F.reach>=520&&!F.whisper){F.whisper=true;logEvent(w,'Above the river, a straight line hangs between two trees. It is not a branch.',null,{cat:'story',pri:2});}
}
function wildsPlaces(w){
  const R=HINTER.riv;if(!R)return [];
  const along=w.shoreSide<2?w.H:w.W,seed=hashString(w.seed||'pond')%991,out=[];
  const names=['The hanging bell','A shutter in the leaves','The root crossing','The masked exchange','The high lantern house'];
  for(let i=0;i<5;i++){
    const dd=490+i*64,bank=i%2?-1:1,hw=R.hw[Math.min(HINTER_MAX-1,dd)]||4;
    const u=clamp(R.uc[Math.min(HINTER_MAX-1,dd)]+bank*(hw+13+hash2(i,7,seed)*12),19,along-20);
    out.push({id:i,dd,u,name:names[i],bank,bridge:i===2||i===4});
  }
  return out;
}
function drawWildsSprites(w,dot,css){
  const H=HINTER;if(!H.geo||!H.riv||H.shown<470)return;
  const g=H.sg,s=H.geo.s,t=w.t||0,dark=w.darkness||0;
  const xy=(dd,u)=>hinterToPx(s,dd,u),line=(a,b,col,width=1)=>{g.strokeStyle=col;g.lineWidth=width;g.beginPath();g.moveTo(...xy(...a));g.lineTo(...xy(...b));g.stroke();};
  const poly=(points,col)=>{g.fillStyle=col;g.beginPath();points.forEach((p,i)=>g[i?'lineTo':'moveTo'](...xy(...p)));g.closePath();g.fill();};
  const wood=css(hexToInt('#342b24')),roof=css(hexToInt('#152b22')),rope=css(hexToInt('#5b5940')),lit=css(hexToInt('#e9b969'),true);
  for(const p of wildsPlaces(w)){
    const {dd,u}=p;if(dd>H.shown-14)continue;
    const river=H.riv.uc[dd],hw=H.riv.hw[dd];
    // A rope path and stilts disappear under leaves; windows are not a bright village reveal at once.
    line([dd-14,u-8],[dd+12,u-8],wood,2);line([dd-14,u+8],[dd+12,u+8],wood,2);
    poly([[dd-7,u-10],[dd+8,u-10],[dd+8,u+10],[dd-7,u+10]],wood);
    poly([[dd-8,u-13],[dd+2,u],[dd-8,u+13],[dd-15,u]],roof);
    line([dd+7,u-9],[dd+7,u+9],rope);
    // Clumps of leaves still hide the upper roof and the back wall.
    for(let k=0;k<7;k++){const [x,y]=xy(dd-12+Math.sin(k*1.9)*6,u+Math.cos(k*1.7)*12);g.fillStyle=css(HL.canopy[k%3]);g.fillRect(x|0,y|0,4,3);}
    const light=(Math.sin(t*0.09+p.id*3)>-0.65),[wx,wy]=xy(dd+1,u+p.bank*4);
    if(light){
      g.fillStyle=lit;g.globalAlpha=0.4+dark*0.5;g.fillRect(wx|0,wy|0,2,2);g.globalAlpha=1;
      const grad=g.createRadialGradient(wx,wy,0,wx,wy,9);grad.addColorStop(0,'rgba(225,167,73,.13)');grad.addColorStop(1,'rgba(225,167,73,0)');g.fillStyle=grad;g.fillRect(wx-9,wy-9,18,18);
    }
    if(p.bridge){
      for(let a=-hw-8;a<=hw+8;a+=2)line([dd+16,river+a],[dd+21,river+a],wood);
      for(const d of [14,23])line([dd+d,river-hw-9],[dd+d+3,river+hw+9],rope);
    }else line([dd+9,u],[dd+10,river+p.bank*(hw+2)],rope);
    // Tiny inhabitants cross, carry a wick, or stop on the river bank, then vanish under the canopy.
    const phase=(t*0.021+p.id*0.21)%1,walkU=lerp(u,river+p.bank*(hw+3),phase),[ix,iy]=xy(dd+10,walkU);
    dot(ix,iy,css(IMP_COL.skin));dot(ix,iy-1,css(IMP_COL.dark));dot(ix-1,iy-2,css(IMP_COL.horn));dot(ix+1,iy-2,css(IMP_COL.horn));
    if(p.id%2===0)dot(ix+2,iy,lit);
    // A paper boat drifts on the visible river, separate from the canopy's eyes.
    const bd=dd-((t*2+p.id*11)%35),bu=H.riv.uc[bd|0],bp=xy(bd,bu);dot(bp[0],bp[1],css(hexToInt('#9d9d83')));
  }
  g.globalAlpha=1;g.lineWidth=1;
}
function wildsClick(w,x,y){
  if(!HINTER.ready)return false;
  const [dd,u]=hinterWorldToLocal(w,x,y),p=wildsPlaces(w).find(p=>p.dd<=HINTER.shown-14&&Math.hypot(dd-p.dd,u-p.u)<23);
  if(!p)return false;
  const F=wildsState(w),texts=[
    'A hollow seed hangs from a cord. The knots are laid out like the bends in the river.',
    'The shutter closes before you can see a face. An empty cup stays on the sill.',
    'The bridge is tied around living roots. Water runs beneath it into a tunnel of leaves.',
    'Someone behind a woven mask has laid out a few warm stones. No price is written.',
    'A dim lamp hangs high among the trees. More roofs lie behind it than you first noticed.',
  ];
  if(F&&!w.observe&&!F.found.includes(p.id)){F.found.push(p.id);logEvent(w,p.name+': something has been living along the river for a very long time.',null,{cat:'story',pri:2});}
  const actions=[{label:'Watch quietly',run:()=>showTicker('For a while nothing moves. Then a small hand lifts a lamp on the opposite bank.')}];
  if(p.id===0)actions.push({label:'Answer with the bell',run:()=>{if(!F)return false;const day=Math.floor(w.days);if(F.bellDay===day){showTicker('Only the river answers now.');return false;}F.bellDay=day;F.trust=Math.min(20,(F.trust||0)+1);showTicker('Two notes from the cup. Three notes from somewhere deeper in the trees.');return true;}});
  if(p.id===1||p.id===3)actions.push({label:'Offer 12 pearls for warm stones',run:()=>{
    if(!F)return false;const day=Math.floor(w.days);if(F.lastTrade===day){showTicker('The cup is turned over. They have finished trading for today.');return false;}
    if(!spend(w,12))return false;F.lastTrade=day;F.trust=Math.min(20,(F.trust||0)+2);gainEssence(w,18,'the river exchange');showTicker('The pearls disappear. Warm stones sit where your hand had been. +18 essence.');return true;
  }});
  if(p.bridge)actions.push({label:'Read the knots',run:()=>showTicker('The cord marks the river, the shore, and a place beyond the last falling water. The last knot has not been tied.')});
  showWorldMystery(w,{title:p.name,text:texts[p.id],actions});return true;
}
function showWorldMystery(w,{title,text,actions}){
  const pondSeed=w.seed,pondInst=w.inst;
  let dialog=document.getElementById('world-mystery');if(dialog)dialog.remove();
  dialog=document.createElement('dialog');dialog.id='world-mystery';dialog.className='world-mystery';
  const h=document.createElement('h2');h.id='world-mystery-title';h.textContent=title;dialog.setAttribute('aria-labelledby',h.id);
  const p=document.createElement('p');p.textContent=text;dialog.append(h,p);
  for(const a of actions){const b=document.createElement('button');b.type='button';b.textContent=a.label;b.disabled=!!a.disabled||(w.observe&&a.label!=='Listen'&&a.label!=='Watch quietly'&&a.label!=='Read the knots');
    b.onclick=()=>{if(w!==world||w.seed!==pondSeed||w.inst!==pondInst){dialog.close();return;}if(a.run()===true){b.disabled=true;w.gameDirty=true;}};dialog.append(b);}
  const close=document.createElement('button');close.type='button';close.textContent='Leave quietly';close.onclick=()=>dialog.close();dialog.append(close);
  dialog.addEventListener('keydown',e=>e.stopPropagation());
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
}

// Objects can be built only after repeated contact. A visit to the bowl consumes an actual offering.
const WILD_OBJECTS={
  impbowl:{label:'Offering bowl',pearls:45,essence:15,size:5,dry:true,unique:true,found:'impTrade',r:30,aura:{comfort:0.02},desc:'Fill this bowl with 4 essence and invite two imps. They follow a glowing trail, dance around the bowl and leave a gift. The glowing food stays until a gift is delivered; frightened or interrupted visits do not consume it.'},
  impchimes:{label:'Knotted chimes',pearls:55,essence:12,size:5,dry:true,unique:true,found:'impTrade',r:35,aura:{aggression:-0.025},desc:'Call two imps once per pond day, for free. Watch them follow the firefly trail and dance at a filled bowl, your tribute, or these chimes. A filled bowl earns a gift; dancing at the chimes builds forest trust.'},
  wickpost:{label:'Wick lantern',pearls:30,essence:8,size:5,dry:true,found:'impTrade',r:25,aura:{comfort:0.025},desc:'Light a bright firefly path for 20 pond seconds. Imps within 60 pixels of this lantern will not flee from your pointer while the path is lit. Its ordinary warm light stays on.'},
};
for(const [kind,def]of Object.entries(WILD_OBJECTS)){
  STRUCTURES[kind]=def;STRUCT_CODES.push(kind);BUILD[kind]=s=>{s.h=kind==='wickpost'?9:kind==='impchimes'?12:3;};
  BAKE[kind]=(r,s,next)=>{
    const wood=mat('#14150e','#292d1b','#464d2b','#737a49'),id=next(wood);
    if(kind==='impbowl'){r.ellipsoid(s.x,s.y,4,3,0,0,2,wood,id);r.ellipsoid(s.x,s.y,2.8,2,0,1.6,0.2,IMP_M.horn,next(IMP_M.horn));}
    else{r.tube(s.x,s.y,0.65,0,s.x,s.y,0.4,s.h,1,wood,id);r.tube(s.x-3,s.y,0.35,s.h,s.x+3,s.y,0.35,s.h,1,wood,id);}
  };
  DRAW[kind]=(r,s,t,w)=>{
    const pulse=wildPulse(w,s),sway=pulse?Math.exp(-(w.t-pulse.since)*.25)*Math.sin((w.t-pulse.since)*12)*2:0;
    if(kind==='impchimes')for(let k=0;k<3;k++){
      r.tube(s.x+k*2-2+Math.sin(t*0.8+k)*.4+sway,s.y,.45,6-k%2,s.x+k*2-2,s.y,.25,11,.8,IMP_M.horn,s.id);
      r.dot(s.x+k*2-2+sway,s.y,7-k%2,pulse?IMP_M.eye:IMP_M.skin,pulse?wildGlowId():s.id);
    }
    if(kind==='impbowl'&&wildBowlReady(w,s))for(let k=0;k<4;k++)r.ellipsoid(s.x+Math.cos(k*TAU/4)*1.8,s.y+Math.sin(k*TAU/4)*1.3,.7,.7,0,2,.6,IMP_M.eye,wildGlowId());
    if(kind==='wickpost'){
      r.tube(s.x-2,s.y,.35,8,s.x+2,s.y,.35,8,1,IMP_M.horn,s.id);
      r.ellipsoid(s.x,s.y,1.1+(pulse ? .4 : 0),1.1,0,6,1.4,IMP_M.eye,wildGlowId());
    }
  };
}
LIGHT_STRUCTS.wickpost={r:20,col:'#e9b969',k:0.65};
LIGHT_STRUCTS.impbowl={r:14,col:'#e9b969',k:0.5};
LIGHT_STRUCTS.impchimes={r:16,col:'#e9b969',k:0.45};
function wildsObjectClick(w,s){
  if(!Object.hasOwn(WILD_OBJECTS,s.kind))return false;
  setHud(false);showObject(s);return true;
}
