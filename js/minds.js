'use strict';

// One owner-selected rare creature thinks at encounters; all motion stays local.
const MINDS = { next: 0, config: null, configAt: 0, pending: false, backoff: 0, flyBackoff: 0, flyNext: 0, targets: new WeakMap(), targetId: 0 };
const MIND_CONTROLLERS = {'typesafe':'TypeSafe','fly-brain':'Fly Brain'};
const FLY_ACTIVITY = ['forward','left','right','feeding','escape','reverse'];
const mindController = (c) => c.life?.mindController==='fly-brain' ? 'fly-brain' : 'typesafe';
function mindCleanActivity(activity) {
  if(!activity || FLY_ACTIVITY.some(k=>!Number.isFinite(activity[k]) || activity[k]<0 || activity[k]>10000))return null;
  return Object.fromEntries(FLY_ACTIVITY.map(k=>[k,Math.round(activity[k]*100)/100]));
}
const MIND_LABELS = {forage:'Forage',hunt:'Hunt',shelter:'Take cover',flee:'Flee',wait:'Watch',explore:'Explore',
  rest:'Rest',shoal:'Join its kind',investigate:'Investigate',avoid:'Keep distance',ambush:'Wait in ambush',camouflage:'Camouflage',ink:'Ink escape'};
function mindCleanLog(log) {
  if(!Array.isArray(log))return [];
  return log.slice(-20).flatMap(e=>{
    const source=e?.source ?? 'typesafe';
    if(!e || !Object.hasOwn(MIND_CONTROLLERS,source) || !Object.hasOwn(MIND_LABELS,e.action) ||
      !Number.isFinite(e.at) || e.at<0 || e.at>8640000000000000 || !['chosen','stale','uncertain'].includes(e.outcome))return [];
    const entry={at:e.at,action:e.action,source,outcome:e.outcome,
      target:typeof e.target==='string' && /^[a-zA-Z][a-zA-Z0-9 -]{0,39}$/.test(e.target)?e.target:null};
    if(source==='fly-brain'){
      if(!['wait','explore','flee','forage'].includes(e.action) || e.outcome==='uncertain')return [];
      const activity=mindCleanActivity(e.activity);if(!activity)return [];
      entry.activity=activity;
    } else {
      if(!Number.isFinite(e.confidence) || e.confidence<0 || e.confidence>1)return [];
      entry.confidence=e.confidence;
    }
    return [entry];
  });
}
function mindLogChoice(c,plan,confidence,outcome,source='typesafe',activity=null) {
  const log= c.life.mindLog || (c.life.mindLog=[]);
  const target=plan.prey||plan.watchPrey||plan.companion||plan.avoid||plan.threat;
  const entries=mindCleanLog([{at:Date.now(),action:plan.action,confidence,outcome,source,activity,target:target?mindSpecies(target):null}]);
  if(!entries.length)return;
  log.push(entries[0]);
  if(log.length>20)log.shift();
}
const mindTargetId = (target) => {
  if (!target) return 0;
  if (!MINDS.targets.has(target)) MINDS.targets.set(target, ++MINDS.targetId);
  return MINDS.targets.get(target);
};
const mindSupported = (c) => c instanceof Fish || c instanceof Walker || c instanceof Octopus || c instanceof Watcher;
const mindRarity = (c) => Math.max(tierOf(c.life?.traits || []), SPECIES_STATS[c.species]?.rarity || 0);
const mindEligible = (c) => mindSupported(c) && !c.ambient && c.life && mindRarity(c) >= 2 && geneBuffs(c).intellect >= 1.1;
const mindHere = (c) => c && !c.gone && !c.caught && !c.leaving && !c.dying;
const mindSpecies = (c) => /^[a-zA-Z][a-zA-Z0-9 -]{0,39}$/.test(c.species) ? c.species : 'fish';
const mindDistance = (a, b) => Math.hypot(a.x-b.x,a.y-b.y);
const mindWetRoute = (w, c, p) => p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
  (!w.shore || shoreAt(w,p.x,p.y) <= w.tide.level) &&
  (typeof islandWaterRoute !== 'function' || islandWaterRoute(w,c.x,c.y,p.x,p.y));

function awakenMind(w, c) {
  if (w.observe || !mindHere(c) || (!c.life?.mind && !mindEligible(c))) return false;
  const on = !c.life.mind;
  for (const other of w.creatures) if (other.life?.mind) { other.life.mind=false; other.mind=null; }
  if (on) {
    c.life.mindController=mindController(c);
    c.life.mind=true; c.mind={status:'Watching for an encounter', token:0};
    MINDS.next=0;
  }
  return true;
}

function setMindController(w,c,controller) {
  if(w.observe || !mindHere(c) || !Object.hasOwn(MIND_CONTROLLERS,controller) || (!c.life?.mind && !mindEligible(c)))return false;
  if(mindController(c)===controller){c.life.mindController=controller;return true;}
  c.life.mindController=controller;
  if(c.life.mind)c.mind={status:'Watching for an encounter',token:0};
  MINDS.next=0;
  return true;
}

function mindRemember(c, event, species) {
  const memory=c.life.mindMemory || (c.life.mindMemory=[]);
  if (memory.at(-1)?.event===event && memory.at(-1)?.species===species) return;
  memory.push({event,species}); if(memory.length>4)memory.shift();
}

function mindEncounter(w, c) {
  const radius=Math.min(120,c.sight || 60), neighbors=[];
  forNear(w,c.x,c.y,radius,(q,d) => {
    if(q===c || !mindHere(q) || Math.abs((q.z||0)-c.z)>14) return;
    if(Math.sqrt(d)>radius*(1-Math.min(.9,geneBuffs(q).stealth||0)*.7)) return;
    neighbors.push(q);
  });
  neighbors.sort((a,b)=>mindDistance(c,a)-mindDistance(c,b)); neighbors.length=Math.min(8,neighbors.length);
  const threat=neighbors.find(q=>q===c.threat || q===c.dread ||
    (isPredator(q) && (q.body?.w[0]||1)>(c.body.w[0]||1)*1.3 && (q.prey===c || mindDistance(c,q)<26)));
  const prey=!(c instanceof Watcher) && c.prey && neighbors.includes(c.prey) && isPredator(c) &&
    (typeof huntable!=='function' || huntable(w,c.prey)) ? c.prey : null;
  const feeds=!(c instanceof Watcher);
  const food=feeds ? w.nearestFood(c.x,c.y,radius,fd=>(!c.foodFilter||c.foodFilter(fd)) &&
    (!(c instanceof Walker || c instanceof Octopus) || fd.z<3)) || null : null;
  let cover=null;
  for(const p of w.plants) if(mindDistance(c,p)<radius && mindWetRoute(w,c,p) && (!cover||mindDistance(c,p)<mindDistance(c,cover)))cover=p;
  const options=[{action:'wait',x:c.x,y:c.y,speed:0}], add=(action,p,speed,extra={})=>{
    if(mindWetRoute(w,c,p))options.push({action,x:p.x,y:p.y,speed,...extra});
  };
  if(food && c.life.energy<.9)add('forage',food,c.maxSpeed,{food});
  if(prey)add('hunt',prey,c.maxSpeed,{prey});
  if(cover)add('shelter',cover,c.cruise,{cover});
  if(!threat && c.life.energy>=.65)options.push({action:'rest',x:c.x,y:c.y,speed:0});
  const companion=neighbors.find(q=>q.species===c.species && q!==threat && q!==prey);
  if(companion && !threat)add('shoal',companion,c.cruise*.7,{companion,spacing:10});
  const curious=neighbors.find(q=>q!==threat && q!==prey && q!==companion);
  if(curious && !threat)add('investigate',curious,c.cruise*.5,{companion:curious,spacing:18});
  const avoid=threat || neighbors.find(q=>q!==companion && mindDistance(c,q)<30);
  if(avoid){
    const away=Math.atan2(c.y-avoid.y,c.x-avoid.x);
    add('avoid',{x:clamp(c.x+Math.cos(away)*24,1,w.W-2),y:clamp(c.y+Math.sin(away)*24,1,w.H-2)},c.cruise,{avoid});
  }
  if(prey && cover)add('ambush',cover,c.cruise*.5,{cover,watchPrey:prey});
  if(c instanceof Octopus && c.jet<=0){
    options.push({action:'camouflage',x:c.x,y:c.y,speed:0});
    if(threat && typeof c.inkEscape==='function')options.push({action:'ink',x:c.x,y:c.y,speed:c.maxSpeed});
  }
  if(threat){
    const heading=Math.atan2(c.y-threat.y,c.x-threat.x);
    for(const angle of [0,.6,-.6,1.2,-1.2]){
      const p={x:clamp(c.x+Math.cos(heading+angle)*35,1,w.W-2),y:clamp(c.y+Math.sin(heading+angle)*35,1,w.H-2)};
      if(mindWetRoute(w,c,p)){add('flee',p,c.maxSpeed,{threat});break;}
    }
  }
  const angle=c.heading+.7;
  add('explore',{x:clamp(c.x+Math.cos(angle)*24,1,w.W-2),y:clamp(c.y+Math.sin(angle)*24,1,w.H-2)},c.cruise*.8);
  const levels={...(c.life.boosts||{})};
  for(const [k,v] of Object.entries(c.life.hunt||{}))levels[`hunt${k[0].toUpperCase()}${k.slice(1)}`]=v;
  const state={creature:{species:mindSpecies(c),hunger:clamp(1-c.life.energy,0,1),intellect:geneBuffs(c).intellect,
    aggression:geneBuffs(c).aggression,rarity:mindRarity(c),levels,traits:c.life.traits,
    locomotion:c instanceof Walker?'bottom walker':c instanceof Octopus?'cephalopod':c instanceof Watcher?'drifting watcher':'swimmer',
    comfort:clamp(c.life.comfort??.5,0,1),depth:clamp(depthAt(w,c.x,c.y),0,1)},
    neighbors:neighbors.map(q=>({species:mindSpecies(q),distance:Math.round(mindDistance(c,q)),
      relativeSize:Math.min(100,(q.body?.w[0]||1)/(c.body.w[0]||1)),role:q===threat?'threat':q===prey?'prey':'neighbor',
      sameSpecies:q.species===c.species,aggression:clamp(geneBuffs(q).aggression,0,10)})),
    options:options.map(o=>({action:o.action,distance:Math.round(mindDistance(c,o))})),memory:c.life.mindMemory||[]};
  // Recheck coarse needs and identities after the asynchronous decision.
  const signature=[Math.floor(state.creature.hunger*4),geneBuffs(c).intellect,geneBuffs(c).aggression,JSON.stringify(levels),
    threat?.id||0,prey?.id||0,mindTargetId(food),mindTargetId(cover),Math.floor(state.creature.comfort*4),
    ...neighbors.map(q=>q.id),...options.map(o=>o.action)].join('/');
  return {state,options,signature,threat,meaningful:!!(threat||prey||food||neighbors.length)};
}

function mindFlyInputs(w,c,encounter) {
  const radius=Math.min(120,c.sight || 60),hunger=clamp(encounter.state.creature.hunger,0,1);
  const food=encounter.options.find(o=>o.action==='forage')?.food;
  const resting=c.hold>w.t || c.state==='sit';
  return {food:food?hunger*clamp(1-mindDistance(c,food)/radius,0,1):0,
    danger:encounter.threat?clamp(1-mindDistance(c,encounter.threat)/radius,0,1):0,
    drive:c.life.energy>=.9 || resting?0:clamp(.18+hunger*.12,0,1)};
}

function mindFlyResult(result) {
  const m=result?.motor,activity=mindCleanActivity(result?.activity);
  if(result?.source!=='fly-brain' || !m || !Number.isFinite(m.drive) || m.drive<0 || m.drive>1 ||
    !Number.isFinite(m.turn) || m.turn< -1 || m.turn>1 ||
    ['feeding','escape','reverse'].some(k=>typeof m[k]!=='boolean') || !activity)return null;
  return {motor:{drive:m.drive,turn:m.turn,feeding:m.feeding,escape:m.escape,reverse:m.reverse},activity};
}

function mindFlyPlan(w,c,encounter,motor) {
  const escape=motor.escape && encounter.options.find(o=>o.action==='flee');
  if(escape)return escape;
  const food=motor.feeding && encounter.options.find(o=>o.action==='forage');
  if(food)return food;
  const wait={action:'wait',x:c.x,y:c.y,speed:0};
  if(motor.drive<=.02)return wait;
  const angle=c.heading+motor.turn*Math.PI*.5+(motor.reverse?Math.PI:0),distance=12+motor.drive*12;
  const plan={action:'explore',x:clamp(c.x+Math.cos(angle)*distance,1,w.W-2),
    y:clamp(c.y+Math.sin(angle)*distance,1,w.H-2),speed:c.maxSpeed*motor.drive};
  return mindWetRoute(w,c,plan)?plan:wait;
}

function mindDecisionSignature(w,c,encounter,controller) {
  if(controller!=='fly-brain')return encounter.signature;
  const inputs=mindFlyInputs(w,c,encounter);
  const food=encounter.options.find(o=>o.action==='forage')?.food;
  // Harmless neighbors are not neural inputs; their movement cannot stale a
  // measured motor response. Food/threat identities and sensory changes can.
  return [mindTargetId(food),mindTargetId(encounter.threat),Math.floor(inputs.food*4),
    Math.floor(inputs.danger*4),Math.floor(inputs.drive*4)].join('/');
}

async function mindThink(w,c,encounter) {
  const brain=c.mind, token=++brain.token, started=performance.now(),controller=mindController(c);
  const signature=mindDecisionSignature(w,c,encounter,controller);
  const inputs=controller==='fly-brain'?mindFlyInputs(w,c,encounter):null;
  MINDS.pending=true; brain.status=controller==='fly-brain'?'Sensing through Fly Brain':'Considering the encounter';
  try {
    if(!Net.base || !w.link?.id){brain.status='Instincts · share this pond to awaken its mind';return;}
    if(MINDS.config===null || started-MINDS.configAt>60000){
      const config=await fetch(`${Net.base}/minds`,{cache:'no-store',signal:AbortSignal.timeout(8000)});
      if(!config.ok)throw Error('unavailable');
      const capabilities=await config.json();
      MINDS.config={typesafe:capabilities.enabled===true,'fly-brain':capabilities.flyBrain===true};MINDS.configAt=performance.now();
    }
    if(!MINDS.config[controller]){brain.plan=null;brain.status=`Instincts · ${MIND_CONTROLLERS[controller]} is resting`;return;}
    // Switching controllers during capability discovery must not start the old request.
    if(w!==world || w.observe || w.paused || !c.life.mind || !mindHere(c) || !w.creatures.includes(c) ||
      c.grabbed || brain!==c.mind || token!==brain.token || controller!==mindController(c))return;
    const headers={'Content-Type':'application/json'};
    if(w.link.key)headers['X-Pond-Key']=w.link.key;
    const isFly=controller==='fly-brain';
    const body=isFly?{pond:w.link.id,creature:String(c.seed),inputs}:
      {pond:w.link.id,scenario:encounter.state};
    if(isFly)MINDS.flyNext=performance.now()+2000;
    const response=await fetch(`${Net.base}/minds/${isFly?'fly-brain':'decide'}`,{method:'POST',headers,signal:AbortSignal.timeout(8000),
      body:JSON.stringify(body)});
    if(!response.ok)throw Error('unavailable');
    const result=await response.json(),neural=isFly?mindFlyResult(result):null;
    const plan=isFly?(neural && mindFlyPlan(w,c,encounter,neural.motor)):encounter.options.find(o=>o.action===result.action);
    if(!plan || (!isFly && (!Number.isFinite(result.confidence) || result.confidence<0 || result.confidence>1)))throw Error('invalid');
    if(w!==world || w.observe || w.paused || !c.life.mind || !mindHere(c) || !w.creatures.includes(c) || brain!==c.mind || token!==brain.token ||
      controller!==mindController(c) || performance.now()-started>8000 ||
      mindDecisionSignature(w,c,mindEncounter(w,c),controller)!==signature) {
      if(w===world)mindLogChoice(c,plan,result.confidence,'stale',controller,neural?.activity);
      brain.status='Watching the changed encounter';return;
    }
    // TypeSafe confidence describes its choice distribution, not neural activity.
    if(!isFly && encounter.threat && result.confidence<.55){
      mindLogChoice(c,plan,result.confidence,'uncertain',controller);brain.status='Instincts · uncertain about the danger';return;
    }
    mindLogChoice(c,plan,result.confidence,'chosen',controller,neural?.activity);
    brain.plan={...plan,until:w.t+(isFly?3:8),energy:c.life.energy,threat:encounter.threat,controller};brain.signature=encounter.signature;
    brain.activity=isFly?neural.activity:null;
    brain.status=isFly?`Fly Brain · ${MIND_LABELS[plan.action].toLowerCase()}`:
      {forage:'Going for the food',hunt:'Pursuing its chosen prey',shelter:'Taking cover',
        flee:'Retreating from danger',wait:'Waiting and watching',explore:'Investigating nearby water',
        rest:'Resting quietly',shoal:'Joining its own kind',investigate:'Studying a nearby creature',avoid:'Keeping its distance',
        ambush:'Waiting for prey in cover',camouflage:'Blending into the pond floor',ink:'Escaping behind an ink cloud'}[plan.action];
  } catch {
    if(controller==='fly-brain')MINDS.flyBackoff=performance.now()+10000;else MINDS.backoff=performance.now()+60000;
    brain.plan=null;
    brain.status=`Instincts · ${MIND_CONTROLLERS[controller]} interrupted`;
  }
  finally {MINDS.pending=false;}
}

function mindTick(w) {
  const now=performance.now();
  if(w.paused || w.observe || document.hidden || now<MINDS.next || MINDS.pending)return;
  MINDS.next=now+1000;
  const c=w.creatures.find(c=>c.life?.mind && mindHere(c) && mindEligible(c));
  if(!c)return;
  const controller=mindController(c);
  if(now<(controller==='fly-brain'?Math.max(MINDS.flyBackoff,MINDS.flyNext):MINDS.backoff))return;
  const brain=c.mind || (c.mind={status:'Watching for an encounter',token:0});
  if(c.grabbed || now<(brain.next||0))return;
  const encounter=mindEncounter(w,c);
  if(encounter.threat)mindRemember(c,'threat',mindSpecies(encounter.threat));
  if(controller==='typesafe' && (!encounter.meaningful || encounter.options.length<2 || encounter.signature===brain.signature))return;
  brain.next=now+(controller==='fly-brain'?2000:30000); void mindThink(w,c,encounter);
}

function mindIntent(w,c) {
  const brain=c.mind,p=brain?.plan;
  if(!c.life?.mind || !p || w.observe)return null;
  if(!mindEligible(c) || c.grabbed || w.t>p.until || !mindHere(c) || !w.creatures.includes(c) ||
    (p.controller && p.controller!==mindController(c)) ||
    (c.threat && c.threat!==p.threat) || c.dread || (p.prey && (!mindHere(p.prey)||!huntable(w,p.prey)||
      c.life.satedUntil>w.t||c.life.energy>.9)) ||
    (p.companion && (!mindHere(p.companion)||!w.creatures.includes(p.companion)||mindDistance(c,p.companion)>(c.sight||60))) ||
    (p.watchPrey && (!mindHere(p.watchPrey)||!huntable(w,p.watchPrey))) ||
    (p.food && (p.food.eaten||!w.food.includes(p.food)||c.life.energy>=.95)) || (p.cover&&!w.plants.includes(p.cover))){
    if(p.food&&c.life.energy>p.energy+.05)mindRemember(c,'fed',mindSpecies(c));
    if(p.prey&&!mindHere(p.prey))mindRemember(c,'prey_lost',mindSpecies(p.prey));
    brain.plan=null;brain.status='Watching for an encounter';return null;
  }
  const target=p.food||p.prey||p.cover||p.companion||p;
  if(!mindWetRoute(w,c,target)){brain.plan=null;brain.status='Instincts · the route changed';return null;}
  // An old choice never suppresses an immediate local escape reflex.
  if(p.threat && (!mindHere(p.threat) || mindDistance(c,p.threat)<12)){
    brain.plan=null;brain.status='Instincts · danger is too close';return null;
  }
  if(p.action==='ink'){
    c.inkEscape(p.threat || c.threat);brain.plan=null;return null;
  }
  const arrived=!!((p.cover && mindDistance(c,target)<5) || (p.companion && mindDistance(c,target)<p.spacing));
  return {...p,x:arrived?c.x:target.x,y:arrived?c.y:target.y,speed:arrived?0:p.speed};
}
