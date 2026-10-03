'use strict';

// Up to five owner-selected creatures; controller descriptors compose lanes.
const MIND_LIMIT = 5;
const MINDS = { next: 0, config: null, configAt: 0, configPending: null, configError: false, configRetryAt: 0,
  pending: false, flyPending:false, backoff: 0, choiceNext:0, flyBackoff: 0, flyNext: 0, fishPending:false, fishBackoff:0, fishNext:0, cursors:{},
  targets: new WeakMap(), targetId: 0 };
const MIND_MODES = {
  typesafe:{label:'TypeSafe',lanes:['choice'],defaultLane:'choice',allowed:c=>mindSupported(c),
    thinking:'Considering the encounter',status:action=>({forage:'Going for the food',hunt:'Pursuing its chosen prey',shelter:'Taking cover',
      flee:'Retreating from danger',wait:'Waiting and watching',explore:'Investigating nearby water',rest:'Resting quietly',
      shoal:'Joining its own kind',investigate:'Studying a nearby creature',avoid:'Keeping its distance',
      ambush:'Waiting for prey in cover',camouflage:'Blending into the pond floor',ink:'Escaping behind an ink cloud',
      fight:'Picking a fight',stalk:'Stalking its prey',gang:'Hunting with its kin'}[action])},
  'fly-brain':{label:'Fly Brain',lanes:['fly'],defaultLane:'fly',allowed:c=>mindSupported(c),
    note:'Fly Brain · experimental control from food, danger and movement signals.'},
  'fish-brain':{label:'Fish Brain',lanes:['fish'],defaultLane:'fish',allowed:c=>mindSupported(c),motor:true,
    note:'Fish Brain · measured Fish1 hindbrain circuit with modeled dynamics and sensory coupling. Not a full zebrafish brain.'},
  'hybrid-brain':{label:'Higher Brain + Fish Brain',lanes:['fish','choice'],defaultLane:'fish',allowed:c=>mindSupported(c),motor:true,higher:true,
    note:'Jev chooses goals; the Fish1 hindbrain circuit supplies steering and thrust through modeled sensory coupling. Not a full zebrafish brain.'},
};
const MIND_CONTROLLERS = Object.fromEntries(Object.entries(MIND_MODES).map(([k,v])=>[k,v.label]));
const FLY_ACTIVITY = ['forward','left','right','feeding','escape','reverse','grooming'];
const mindController = (c) => Object.hasOwn(MIND_MODES,c.life?.mindController) ? c.life.mindController : 'typesafe';
const mindControllerAllowed = (c,controller=mindController(c)) => MIND_MODES[controller]?.allowed(c)===true;
function mindAvailability(controller) {
  if(MINDS.configPending)return 'checking';
  if(MINDS.configError)return 'unknown';
  if(MINDS.config===null)return 'checking';
  return MINDS.config[controller]?'ready':'unavailable';
}
function mindAvailabilityText(controller,state=mindAvailability(controller)) {
  const name=MIND_CONTROLLERS[controller];
  if(state==='checking')return `Checking ${name} connection. Using instincts.`;
  if(state==='unknown')return `Couldn't check the ${name} connection. Using instincts.`;
  if(state==='unavailable')return `${name} isn't connected on this server. Using instincts.`;
  return '';
}
function mindSyncAvailability(w) {
  for(const c of w.creatures)if(c.life?.mind){
    const brain=c.mind || (c.mind={status:'Watching for an encounter',token:0}),state=mindAvailability(mindController(c));
    if(state==='ready'){
      if(brain.availability && brain.availability!=='ready'){
        brain.status='Watching for an encounter';
        if(!MINDS.pending){brain.next=0;MINDS.next=0;}
      }
    } else {brain.plan=null;brain.motor=null;brain.goal=null;brain.status=mindAvailabilityText(mindController(c),state);}
    if(MIND_MODES[mindController(c)].higher && !MINDS.config?.typesafe){
      brain.goal=null;brain.higherStatus='Jev unavailable; Fish Brain instincts';
    }
    brain.availability=state;
  }
}
async function mindCheckCapabilities(force=false) {
  const now=performance.now();
  if(MINDS.configPending)return MINDS.configPending;
  if(!force && (now<MINDS.configRetryAt || (!MINDS.configError && MINDS.config!==null && now-MINDS.configAt<60000))){
    mindSyncAvailability(world);return MINDS.config;
  }
  MINDS.configPending=(async()=>{
    // Defer synchronous failures until the pending promise has been assigned.
    await Promise.resolve();
    try{
      if(!Net.base)throw Error('unavailable');
      const response=await fetch(`${Net.base}/minds`,{cache:'no-store',signal:AbortSignal.timeout(5000)});
      if(!response.ok)throw Error('unavailable');
      const capabilities=await response.json();
      if(typeof capabilities?.enabled!=='boolean' || ['flyBrain','fishBrain'].some(k=>capabilities[k]!==undefined && typeof capabilities[k]!=='boolean'))throw Error('invalid');
      MINDS.config={typesafe:capabilities.enabled,'fly-brain':capabilities.flyBrain===true,
        'fish-brain':capabilities.fishBrain===true,'hybrid-brain':capabilities.fishBrain===true};
      MINDS.configAt=performance.now();MINDS.configError=false;MINDS.configRetryAt=0;
    }catch{MINDS.configError=true;MINDS.configRetryAt=performance.now()+10000;}
    finally{MINDS.configPending=null;mindSyncAvailability(world);}
    return MINDS.config;
  })();
  mindSyncAvailability(world);
  return MINDS.configPending;
}
function mindCleanActivity(activity) {
  if(!activity || FLY_ACTIVITY.some(k=>k!=='grooming' && !Number.isFinite(activity[k]) ||
    (activity[k]!==undefined && (!Number.isFinite(activity[k]) || activity[k]<0 || activity[k]>10000))))return null;
  return Object.fromEntries(FLY_ACTIVITY.filter(k=>activity[k]!==undefined).map(k=>[k,Math.round(activity[k]*100)/100]));
}
const MIND_LABELS = {forage:'Forage',hunt:'Hunt',shelter:'Take cover',flee:'Flee',wait:'Watch',explore:'Explore',
  rest:'Rest',shoal:'Join its kind',investigate:'Investigate',avoid:'Keep distance',ambush:'Wait in ambush',camouflage:'Camouflage',ink:'Ink escape',fight:'Fight',stalk:'Stalk',gang:'Hunt as a pack'};
function mindCleanLog(log) {
  if(!Array.isArray(log))return [];
  return log.slice(-20).flatMap(e=>{
    const source=e?.source ?? 'typesafe';
    if(!e || !Object.hasOwn(MIND_CONTROLLERS,source) || !Object.hasOwn(MIND_LABELS,e.action) ||
      !Number.isFinite(e.at) || e.at<0 || e.at>8640000000000000 || !['chosen','stale','uncertain'].includes(e.outcome))return [];
    const entry={at:e.at,action:e.action,source,outcome:e.outcome,
      target:typeof e.target==='string' && /^[a-zA-Z][a-zA-Z0-9 -]{0,39}$/.test(e.target)?e.target:null};
    if(source==='fly-brain'){
      if(!['wait','explore','flee','forage','hunt','rest','avoid','ink','fight','stalk','gang'].includes(e.action) || e.outcome==='uncertain')return [];
      const activity=mindCleanActivity(e.activity);if(!activity)return [];
      entry.activity=activity;
    } else if(MIND_MODES[source].motor && e.confidence===undefined){
      const motor=mindFishResult({source:'fish-brain',motor:e.motor});if(!motor || e.outcome==='uncertain')return [];
      entry.motor=motor.motor;
    } else {
      if(source==='fish-brain')return [];
      if(!Number.isFinite(e.confidence) || e.confidence<0 || e.confidence>1)return [];
      entry.confidence=e.confidence;
    }
    return [entry];
  });
}
function mindLogChoice(c,plan,confidence,outcome,source='typesafe',activity=null,motor=null) {
  const log= c.life.mindLog || (c.life.mindLog=[]);
  const target=plan.prey||plan.watchPrey||plan.companion||plan.avoid||plan.threat;
  const entries=mindCleanLog([{at:Date.now(),action:plan.action,confidence,outcome,source,activity,motor,target:target?mindSpecies(target):null}]);
  if(!entries.length)return;
  log.push(entries[0]);
  if(log.length>20)log.shift();
}
const mindTargetId = (target) => {
  if (!target) return 0;
  if (!MINDS.targets.has(target)) MINDS.targets.set(target, ++MINDS.targetId);
  return MINDS.targets.get(target);
};
// Every animal with a life record can take a mind; ambient island and shore life has none.
const mindSupported = (c) => !!c?.life && !c.ambient;
// Bodies whose own movement code asks for the mind's intent; the rest are steered by mindSteer.
const mindNative = (c) => c instanceof Fish || c instanceof Walker || c instanceof Octopus || c instanceof Watcher;
function mindLocomotion(c) {
  if (c instanceof Walker) return 'bottom walker';
  if (c instanceof Octopus) return 'cephalopod';
  if (c instanceof Watcher) return 'drifting watcher';
  if (c instanceof Fish) return 'swimmer';
  // (Script-scope classes are not globalThis properties; test each name for itself.)
  if (typeof Frog !== 'undefined' && c instanceof Frog) return 'hopper';
  if (typeof Jelly !== 'undefined' && c instanceof Jelly) return 'drifter';
  if (typeof Duck !== 'undefined' && c instanceof Duck) return 'surface swimmer';
  if (typeof Dragonfly !== 'undefined' && c instanceof Dragonfly) return 'flier';
  return 'crawler';
}
const mindRarity = (c) => Math.max(tierOf(c.life?.traits || []), SPECIES_STATS[c.species]?.rarity || 0);
const mindEligible = (c) => mindSupported(c);
// A finite top speed for any body (dragonflies and jellies have no maxSpeed).
const mindTop = (c) => Number.isFinite(c.maxSpeed) && c.maxSpeed > 0 ? c.maxSpeed : Number.isFinite(c.cruise) && c.cruise > 0 ? c.cruise * 1.6 : 10;
const mindHere = (c) => c && !c.gone && !c.caught && !c.leaving && !c.dying;
const mindControlled = (w) => w.creatures.filter(c=>c.life?.mind && mindHere(c));
const mindSpecies = (c) => /^[a-zA-Z][a-zA-Z0-9 -]{0,39}$/.test(c.species) ? c.species : 'fish';
const mindDistance = (a, b) => Math.hypot(a.x-b.x,a.y-b.y);
const mindWetRoute = (w, c, p) => p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
  (!w.shore || shoreAt(w,p.x,p.y) <= w.tide.level) &&
  (typeof islandWaterRoute !== 'function' || islandWaterRoute(w,c.x,c.y,p.x,p.y));

function awakenMind(w, c) {
  if (w.observe || !w.creatures.includes(c) || !mindHere(c) || (!c.life?.mind && (!mindEligible(c)||!mindControllerAllowed(c)))) return false;
  const on = !c.life.mind;
  if(on){
    if(mindControlled(w).length>=MIND_LIMIT)return false;
    void mindCheckCapabilities();if(mindAvailability(mindController(c))!=='ready')return false;
  }
  c.life.mind=false;c.mind=null;
  if (on) {
    c.life.mindController=mindController(c);
    c.life.mind=true; c.mind={status:'Watching for an encounter', token:0};
    MINDS.next=0;
    void mindCheckCapabilities();
  }
  return true;
}

function setMindController(w,c,controller) {
  if(w.observe || !mindHere(c) || !Object.hasOwn(MIND_CONTROLLERS,controller) || !mindControllerAllowed(c,controller) || (!c.life?.mind && !mindEligible(c)))return false;
  if(mindController(c)===controller){c.life.mindController=controller;void mindCheckCapabilities();return true;}
  c.life.mindController=controller;
  if(c.life.mind)c.mind={status:'Watching for an encounter',token:0};
  MINDS.next=0;
  void mindCheckCapabilities();
  return true;
}

const MIND_MEMORY_EVENTS=['fed','threat','prey_lost','won_fight','lost_fight'];
function mindRemember(c, event, species) {
  const memory=c.life.mindMemory || (c.life.mindMemory=[]);
  if (memory.at(-1)?.event===event && memory.at(-1)?.species===species) return;
  memory.push({event,species}); if(memory.length>4)memory.shift();
}

function mindProfile(w,c) {
  const b=geneBuffs(c),L=c.life,lv=k=>typeof huntLv==='function'?huntLv(c,k):0;
  const predator=isPredator(c),hunter=!!L.hunter,enragedNow=typeof enraged==='function' && enraged(w,c);
  const stance=w.game?.stance?.[c.species==='tadpole'?'frog':c.species] || 'neutral';
  const feeds=!(c instanceof Watcher),canHunt=feeds && (predator||enragedNow) &&
    !(L.satedUntil>w.t) && (enragedNow || L.energy<= (typeof huntThreshold==='function'?
      huntThreshold(c,Math.min(.92,.6*b.aggression*(typeof rageOf==='function'?rageOf(w,c):1)*
        (.4+.6*(typeof activity==='function'?activity(w,c):1)))):.9));
  const tags=[...new Set([...(L.traits||[]),...(L.warps||[]),...(L.quirks||[]),
    ...(predator?['predator']:[]),...(hunter?['hunter']:[]),...(typeof forageTier==='function'?[FORAGE_TIERS[forageTier(c)].name]:[]),...(enragedNow?['enraged']:[]),
    ...(L.safe?['kept safe']:[]),...(stance!=='neutral'?[stance]:[]),...(L.paragon?['paragon']:[])])].slice(0,24);
  const weights={
    food:feeds?clamp((b.appetite||1)*(.8+.04*lv('hunger')), .4,2):0,
    danger:clamp((.8+.25*b.intellect)*(1-.35*(b.resilience||0)),.4,2),
    hunt:canHunt?clamp(b.aggression*(1+.08*lv('hunger')+.04*lv('jaws')+.04*lv('maw')), .4,3):0,
    explore:clamp(b.intellect*(1-.3*(b.territory||1)),.25,2),
    social:clamp((1+(b.calming||0))/(.6+b.aggression),.25,2),
    shelter:clamp(.7+(b.stealth||0)+.3*(1-(L.comfort??.5)),.4,2),
    motor:clamp(.65+.35*L.energy+.02*lv('tenacity'),.4,1),
    turn:clamp(.75+.25*b.intellect,.5,1.5),
    fight:typeof mindFightDrive==='function'?clamp(2*mindFightDrive(w,c).value,0,2):0,
  };
  return {tags,weights,abilities:{feeds,canHunt,camouflage:c instanceof Octopus && c.jet<=0,
    ink:c instanceof Octopus && c.jet<=0 && typeof c.inkEscape==='function'},
    combat:{predator,hunter,enraged:enragedNow,protected:typeof huntable==='function'?!huntable(w,c):false,
      keptSafe:!!L.safe,stance,fightDrive:weights.fight/2}};
}

const mindProfileSignature = (profile) => JSON.stringify([profile.tags,profile.abilities,profile.combat,
  Object.values(profile.weights).map(v=>Math.floor(v*4))]);

function mindEncounter(w, c) {
  // (Dragonflies, jellies and other bodies without cruise/max speeds still get finite option speeds.)
  const top=mindTop(c),cruise=Number.isFinite(c.cruise)&&c.cruise>0?c.cruise:top*.6;
  const profile=mindProfile(w,c),radius=Math.min(180,(c.sight || 60)*(typeof huntRange==='function'?huntRange(c):1)), neighbors=[];
  forNear(w,c.x,c.y,radius,(q,d) => {
    if(q===c || !mindHere(q) || Math.abs((q.z||0)-c.z)>14) return;
    if(Math.sqrt(d)>radius*(1-Math.min(.9,geneBuffs(q).stealth||0)*.7*(typeof huntSees==='function'?huntSees(c):1))) return;
    neighbors.push(q);
  });
  neighbors.sort((a,b)=>mindDistance(c,a)-mindDistance(c,b)); neighbors.length=Math.min(8,neighbors.length);
  const threat=neighbors.find(q=>q===c.threat || q===c.dread ||
    (isPredator(q) && (q.body?.w[0]||1)>(c.body.w[0]||1)*1.3 && (q.prey===c || mindDistance(c,q)<26)));
  const prey=profile.abilities.canHunt && c.prey && neighbors.includes(c.prey) &&
    (typeof huntable!=='function' || huntable(w,c.prey)) ? c.prey : null;
  const feeds=!(c instanceof Watcher);
  const food=feeds ? w.nearestFood(c.x,c.y,radius,fd=>(!c.foodFilter||c.foodFilter(fd)) &&
    (!(c instanceof Walker || c instanceof Octopus) || fd.z<3)) || null : null;
  const rival=typeof mindRivalFor==='function'?mindRivalFor(w,c,neighbors.filter(q=>q!==prey)):null;
  let cover=null;
  for(const p of w.plants) if(mindDistance(c,p)<radius && mindWetRoute(w,c,p) && (!cover||mindDistance(c,p)<mindDistance(c,cover)))cover=p;
  const options=[{action:'wait',x:c.x,y:c.y,speed:0}], add=(action,p,speed,extra={})=>{
    if(mindWetRoute(w,c,p))options.push({action,x:p.x,y:p.y,speed,...extra});
  };
  if(food && c.life.energy<.9)add('forage',food,top,{food});
  if(prey)add('hunt',prey,top,{prey});
  if(rival)add('fight',rival,top,{rival});
  // Experience opens more ways in (forage.js): a stalker's slow approach, a pack hunter's call to its kin.
  const tier=typeof forageTier==='function'?forageTier(c):0;
  if(rival && tier>=2)add('stalk',rival,cruise*.4,{rival});
  if(rival && tier>=3 && neighbors.some(q=>q!==rival && q.species===c.species))add('gang',rival,top,{rival});
  if(cover)add('shelter',cover,cruise,{cover});
  if(!threat && c.life.energy>=.65)options.push({action:'rest',x:c.x,y:c.y,speed:0});
  const companion=neighbors.find(q=>q.species===c.species && q!==threat && q!==prey && q!==rival);
  if(companion && !threat)add('shoal',companion,cruise*.7,{companion,spacing:10});
  const curious=neighbors.find(q=>q!==threat && q!==prey && q!==companion && q!==rival);
  if(curious && !threat)add('investigate',curious,cruise*.5,{companion:curious,spacing:18});
  const avoid=threat || neighbors.find(q=>q!==companion && mindDistance(c,q)<30);
  if(avoid){
    const away=Math.atan2(c.y-avoid.y,c.x-avoid.x);
    add('avoid',{x:clamp(c.x+Math.cos(away)*24,1,w.W-2),y:clamp(c.y+Math.sin(away)*24,1,w.H-2)},cruise,{avoid});
  }
  if(prey && cover)add('ambush',cover,cruise*.5,{cover,watchPrey:prey});
  if(c instanceof Octopus && c.jet<=0){
    options.push({action:'camouflage',x:c.x,y:c.y,speed:0});
    if(threat && typeof c.inkEscape==='function')options.push({action:'ink',x:c.x,y:c.y,speed:top});
  }
  if(threat){
    const heading=Math.atan2(c.y-threat.y,c.x-threat.x);
    for(const angle of [0,.6,-.6,1.2,-1.2]){
      const p={x:clamp(c.x+Math.cos(heading+angle)*35,1,w.W-2),y:clamp(c.y+Math.sin(heading+angle)*35,1,w.H-2)};
      if(mindWetRoute(w,c,p)){add('flee',p,top,{threat});break;}
    }
  }
  const angle=c.heading+.7;
  add('explore',{x:clamp(c.x+Math.cos(angle)*24,1,w.W-2),y:clamp(c.y+Math.sin(angle)*24,1,w.H-2)},cruise*.8);
  const levels={...(c.life.boosts||{})};
  for(const [k,v] of Object.entries(c.life.hunt||{}))levels[`hunt${k[0].toUpperCase()}${k.slice(1)}`]=v;
  const state={creature:{species:mindSpecies(c),hunger:clamp(1-c.life.energy,0,1),intellect:geneBuffs(c).intellect,
    aggression:geneBuffs(c).aggression,rarity:clamp(mindRarity(c),0,5),levels,traits:c.life.traits,
    locomotion:mindLocomotion(c),
    comfort:clamp(c.life.comfort??.5,0,1),depth:clamp(depthAt(w,c.x,c.y),0,1),...profile,
    vitality:clamp(geneBuffs(c).vitality,0,10),stealth:clamp(geneBuffs(c).stealth||0,0,1)},
    neighbors:neighbors.map(q=>({species:mindSpecies(q),distance:Math.round(mindDistance(c,q)),
      relativeSize:Math.min(100,(q.body?.w[0]||1)/(c.body.w[0]||1)),role:q===threat?'threat':q===prey?'prey':q===rival?'rival':'neighbor',
      sameSpecies:q.species===c.species,aggression:clamp(geneBuffs(q).aggression,0,10),
      protected:typeof huntable==='function'?!huntable(w,q):false,
      stance:w.game?.stance?.[q.species==='tadpole'?'frog':q.species]||'neutral',
      ...(typeof forageValue==='function' && q.life?(V=>({value:Math.round(clamp(V.value,-2,2)*100)/100,risk:Math.round(V.harm*100)/100,tries:V.tries}))(forageValue(w,c,q)):{})})),
    environment:{darkness:clamp(w.darkness||0,0,1),pollution:clamp(typeof pollutionAt==='function'?pollutionAt(w,c.x,c.y):0,0,1),
      mismatch:clamp(typeof mismatch==='function'?mismatch(w,c):0,0,1),aggression:clamp(typeof aggressionAt==='function'?aggressionAt(w,c.x,c.y):0,0,1),
      current:clamp(w.current?.s||0,0,1)},
    options:options.map(o=>({action:o.action,distance:Math.round(mindDistance(c,o)),weight:clamp((
      profile.weights[{forage:'food',flee:'danger',avoid:'danger',ambush:'hunt',shoal:'social',investigate:'explore',rest:'shelter',camouflage:'shelter',ink:'danger',stalk:'fight',gang:'fight'}[o.action]||o.action] ?? 1)*
      (typeof mindLearnedOption==='function'?mindLearnedOption(c,o):1),0,3)})),memory:c.life.mindMemory||[]};
  // Recheck coarse needs and identities after the asynchronous decision.
  const signature=[Math.floor(state.creature.hunger*4),geneBuffs(c).intellect,geneBuffs(c).aggression,JSON.stringify(levels),
    threat?.id||0,prey?.id||0,rival?.id||0,mindTargetId(food),mindTargetId(cover),Math.floor(state.creature.comfort*4),
    mindProfileSignature(profile),JSON.stringify(Object.values(state.environment).map(v=>Math.floor(v*4))),
    ...neighbors.map(q=>q.id).sort((a,b)=>a-b),...options.map(o=>o.action)].join('/');
  return {state,options,signature,threat,rival,neighbors,radius,meaningful:!!(threat||prey||rival||food||neighbors.length||state.environment.pollution>.2||state.environment.mismatch>.3)};
}

function mindFlyInputs(w,c,encounter) {
  const radius=encounter.radius,hunger=clamp(encounter.state.creature.hunger,0,1),{weights}=encounter.state.creature;
  const food=encounter.options.find(o=>o.action==='forage')?.food;
  const prey=encounter.options.find(o=>o.action==='hunt')?.prey;
  const companion=encounter.options.find(o=>o.action==='shoal')?.companion;
  const rival=encounter.options.find(o=>o.action==='fight')?.rival,fury=(weights.fight||0)/2;
  const target=encounter.threat || (rival && fury>hunger?rival:null) || prey || food || rival || companion;
  const fear=typeof mindLearnedFear==='function'?mindLearnedFear(c,encounter):null;
  const bearing=target?Math.sin(Math.atan2(target.y-c.y,target.x-c.x)-c.heading)*(encounter.threat?-1:1):0;
  const near=q=>q?clamp(1-mindDistance(c,q)/radius,0,1):0;
  const env=encounter.state.environment;
  const ahead={x:c.x+Math.cos(c.heading)*12,y:c.y+Math.sin(c.heading)*12};
  const blocked=ahead.x<1 || ahead.y<1 || ahead.x>w.W-2 || ahead.y>w.H-2 || !mindWetRoute(w,c,ahead);
  const resting=c.hold>w.t || c.state==='sit';
  const learned=k=>typeof mindLearnedGain==='function'?mindLearnedGain(c,k):1;
  return {food:clamp(Math.max(hunger*near(food)*weights.food*learned('food'),hunger*near(prey)*weights.hunt*learned('prey'),
      fury*near(rival)*learned('prey')),0,1),
    danger:clamp(Math.max(near(encounter.threat)*weights.danger*learned('threat'),fear?near(fear.creature)*fear.strength:0),0,1),
    drive:resting?0:clamp((.12+.3*Math.max(hunger,fury)+.18*near(prey)*weights.hunt+.25*near(rival)*fury+.12*near(companion)*weights.social)*weights.explore*weights.motor,0,1),
    bitter:clamp(Math.max(env.pollution,env.mismatch)*(1-(geneBuffs(c).tolerance||0)),0,1),
    odor:clamp(env.pollution*(1-(geneBuffs(c).resilience||0)),0,1),
    touch:clamp((blocked?1:0)+env.current*.25+encounter.state.neighbors.filter(n=>n.distance<12).length*.15,0,1),
    turn:clamp(bearing*near(target),-1,1)};
}

function mindFlyResult(result) {
  const m=result?.motor,activity=mindCleanActivity(result?.activity);
  if(result?.source!=='fly-brain' || !m || !Number.isFinite(m.drive) || m.drive<0 || m.drive>1 ||
    !Number.isFinite(m.turn) || m.turn< -1 || m.turn>1 ||
    ['feeding','escape','reverse'].some(k=>typeof m[k]!=='boolean') ||
    (m.grooming!==undefined && typeof m.grooming!=='boolean') || !activity)return null;
  return {motor:{drive:m.drive,turn:m.turn,feeding:m.feeding,escape:m.escape,reverse:m.reverse,grooming:m.grooming===true},activity};
}

function mindFlyPlan(w,c,encounter,motor) {
  const weights=encounter.state.creature.weights;
  const escape=motor.escape && encounter.options.find(o=>o.action==='ink' || o.action==='flee');
  if(escape)return escape;
  const fight=encounter.options.find(o=>o.action==='fight');
  if(motor.feeding && fight && (weights.fight||0)/2>=encounter.state.creature.hunger)return fight;
  const food=motor.feeding && (encounter.options.find(o=>o.action==='hunt') || encounter.options.find(o=>o.action==='forage') || fight);
  if(food)return food;
  const wait={action:'wait',x:c.x,y:c.y,speed:0};
  if(motor.grooming && !encounter.threat)return encounter.options.find(o=>o.action==='rest') || wait;
  if(motor.reverse && encounter.threat)return encounter.options.find(o=>o.action==='avoid') || wait;
  if(motor.drive<=.02 && Math.abs(motor.turn)<=.02)return wait;
  const drive=motor.drive*weights.motor;
  const angle=c.heading+clamp(motor.turn*weights.turn,-1,1)*Math.PI*.5+(motor.reverse?Math.PI:0),distance=12+drive*12;
  const plan={action:'explore',x:clamp(c.x+Math.cos(angle)*distance,1,w.W-2),
    y:clamp(c.y+Math.sin(angle)*distance,1,w.H-2),speed:mindTop(c)*drive};
  return mindWetRoute(w,c,plan)?plan:wait;
}

function mindDecisionSignature(w,c,encounter,controller) {
  if(controller!=='fly-brain')return encounter.signature;
  const inputs=mindFlyInputs(w,c,encounter);
  const food=encounter.options.find(o=>o.action==='forage')?.food;
  // Ordering alone is not an input. Changed targets, close crowding, abilities
  // and coarse sensory values invalidate a measured motor response.
  return [mindTargetId(food),mindTargetId(encounter.threat),mindTargetId(encounter.rival),
    mindTargetId(encounter.options.find(o=>o.action==='hunt')?.prey),
    ...Object.values(inputs).map(v=>Math.floor(v*4)),mindProfileSignature(encounter.state.creature),
    ...encounter.options.map(o=>o.action)].join('/');
}

const FISH_CHANNELS=['food','threat','same','other','obstacle','motion','prey','cover'];
const FISH_GOAL_GAINS={
  forage:{food:1.8,prey:.4,same:.5}, hunt:{prey:1.8,food:.25,same:.3,drive:1.3}, fight:{prey:2,food:.2,same:.2,drive:1.6},
  stalk:{prey:1.6,food:.1,drive:.45,cover:1.3}, gang:{prey:2,same:1.4,drive:1.6},
  flee:{threat:1.8,food:.1,prey:0,same:.1,drive:1.5}, ink:{threat:1.8,food:.1,prey:0,drive:1.5},
  shoal:{same:1.8,other:.2}, investigate:{other:1.8}, explore:{other:1.4,drive:1.2},
  shelter:{cover:1.8,drive:.5}, avoid:{threat:1.6,other:0}, ambush:{cover:1.8,prey:1.2,drive:.1},
  rest:{drive:.05,food:0,prey:0,other:0}, wait:{drive:.05,food:0,prey:0,other:0},
  camouflage:{drive:.05,food:0,prey:0,other:0},
};
function mindFishGoal(w,c,encounter) {
  const goal=c.mind?.goal;
  if(!goal)return null;
  if(mindAvailability('typesafe')!=='ready' || performance.now()>goal.until ||
    !encounter.options.some(o=>o.action===goal.action)){
    c.mind.goal=null;c.mind.higherStatus='Jev has no current goal; Fish Brain instincts';return null;
  }
  return goal;
}
function mindFishInputs(w,c,encounter) {
  const sectors=Array.from({length:16},()=>Object.fromEntries(FISH_CHANNELS.map(k=>[k,0]))),radius=encounter.radius;
  const put=(p,key,strength=1)=>{
    const distance=mindDistance(c,p);if(distance>radius)return;
    const angle=Math.atan2(p.y-c.y,p.x-c.x)-c.heading;
    const index=((Math.round(angle/(Math.PI*2)*16)%16)+16)%16;
    sectors[index][key]=clamp(sectors[index][key]+clamp(1-distance/radius,0,1)*strength,0,1);
  };
  const profile=encounter.state.creature,prey=encounter.options.find(o=>o.action==='hunt')?.prey;
  const rival=encounter.options.find(o=>o.action==='fight')?.rival,fury=clamp((profile.weights.fight||0)/2,0,1);
  const fear=typeof mindLearnedFear==='function'?mindLearnedFear(c,encounter):null;
  if(profile.abilities.feeds && c.life.energy<.95)for(const fd of w.food){
    if(!fd.eaten && Math.abs((fd.z||0)-c.z)<14 && (!c.foodFilter||c.foodFilter(fd)) && mindWetRoute(w,c,fd))put(fd,'food');
  }
  forNear(w,c.x,c.y,radius,(q,d)=>{
    if(q===c || !mindHere(q) || Math.abs((q.z||0)-c.z)>14 ||
      Math.sqrt(d)>radius*(1-Math.min(.9,geneBuffs(q).stealth||0)*.7*(typeof huntSees==='function'?huntSees(c):1)))return;
    const threat=q===c.threat || q===c.dread || q.prey===c || (isPredator(q) &&
      (q.body?.w[0]||1)>(c.body.w[0]||1)*1.3 && Math.sqrt(d)<26);
    if(q===rival && !threat)put(q,'prey',.4+.6*fury);
    else put(q,threat?'threat':q===prey?'prey':q.species===c.species?'same':'other');
    if(fear && q===fear.creature && !threat)put(q,'threat',fear.strength);
    const vx=(q.speed||0)*Math.cos(q.heading||0)-(c.speed||0)*Math.cos(c.heading);
    const vy=(q.speed||0)*Math.sin(q.heading||0)-(c.speed||0)*Math.sin(c.heading);
    put(q,'motion',clamp(Math.hypot(vx,vy)/Math.max(1,mindTop(c)*2),0,1));
  });
  for(const p of w.plants)if(mindWetRoute(w,c,p))put(p,'cover');
  for(const p of w.rocks||[])put(p,'obstacle',.5);
  for(let i=0;i<16;i++)for(const distance of [6,14,28]){
    const angle=c.heading+i*Math.PI*2/16,p={x:c.x+Math.cos(angle)*distance,y:c.y+Math.sin(angle)*distance};
    if(p.x<1 || p.y<1 || p.x>w.W-2 || p.y>w.H-2 || !mindWetRoute(w,c,p))
      sectors[i].obstacle=Math.max(sectors[i].obstacle,1-distance/36);
  }
  const weights=profile.weights,gains={food:weights.food,threat:weights.danger,same:weights.social,
    other:weights.explore*.2,obstacle:1.5,motion:1,prey:Math.max(weights.hunt,rival?weights.fight||0:0),cover:weights.shelter,drive:weights.motor*weights.explore};
  if(typeof mindLearnedGain==='function')for(const key of ['food','threat','same','other','prey','cover'])gains[key]*=mindLearnedGain(c,key);
  const goal=MIND_MODES[mindController(c)].higher?mindFishGoal(w,c,encounter):null;
  for(const key of Object.keys(gains))gains[key]=clamp(gains[key]*(goal?FISH_GOAL_GAINS[goal.action]?.[key]??1:1),0,2);
  if(c.hold>w.t || c.state==='sit')gains.drive=0;
  return {sectors,internal:{hunger:profile.hunger,energy:clamp(c.life.energy,0,1),speed:clamp((c.speed||0)/mindTop(c),0,1),
    depth:profile.depth,comfort:profile.comfort,...(rival?{rage:fury}:{})},gains};
}
function mindFishResult(result) {
  const m=result?.motor;
  if(result?.source!=='fish-brain' || !m || ['left','right','thrust'].some(k=>!Number.isFinite(m[k]) || m[k]<0 || m[k]>1) ||
    ['startle','feeding'].some(k=>typeof m[k]!=='boolean'))return null;
  const a=result.activity,activity=a && FISH_ACTIVITY.every(k=>Array.isArray(a[k]) && a[k].length===2 &&
    a[k].every(v=>Number.isFinite(v) && v>=0 && v<=1))?Object.fromEntries(FISH_ACTIVITY.map(k=>[k,[a[k][0],a[k][1]]])):null;
  return {motor:{left:m.left,right:m.right,thrust:m.thrust,startle:m.startle,feeding:m.feeding},...(activity?{activity}:{})};
}
const FISH_ACTIVITY=['input-layer','class-I','class-II','spn-turning','spn-forward'];
function mindMotorIntent(w,c) {
  const output=c.mind?.motor;
  if(output && performance.now()>output.until){c.mind.motor=null;c.mind.status='Instincts · waiting for Fish Brain';return null;}
  if(!output || !c.life?.mind || !mindEligible(c) || !mindControllerAllowed(c) || w.paused || w.observe || document.hidden ||
    c.grabbed || !mindHere(c) || !w.creatures.includes(c) || output.controller!==mindController(c) || performance.now()>output.until ||
    mindAvailability(mindController(c))!=='ready')return null;
  const v=output.value,turn=v.right-v.left;
  // Bodies other than swimming Fish take the motor output as a short steering target and speed
  // through their own movement code (Fish integrate turn and thrust directly).
  const angle=c.heading+clamp(turn,-1,1)*Math.PI*.5,distance=12+v.thrust*12;
  let x=clamp(c.x+Math.cos(angle)*distance,1,w.W-2),y=clamp(c.y+Math.sin(angle)*distance,1,w.H-2),speed=mindTop(c)*(v.startle?1:v.thrust);
  if(!(c instanceof Fish) && !mindWetRoute(w,c,{x,y})){x=c.x;y=c.y;speed=0;}
  return {motor:true,...v,turn,action:c.mind.action,x,y,speed};
}
function mindMotorMeal(w,c) {
  const reach=(c.widths?.[0] ?? c.body?.w?.[0] ?? 1)+1.2,prey=c.prey;
  if(prey && mindProfile(w,c).abilities.canHunt && mindHere(prey) && huntable(w,prey) &&
    mindDistance(c,prey)<(reach+prey.body.w[0])*(typeof huntReach==='function'?huntReach(c):1) && Math.abs(prey.z-c.z)<8){eat(w,c,prey);return;}
  const food=w.nearestFood(c.x,c.y,reach,fd=>(!c.foodFilter||c.foodFilter(fd)) && Math.abs((fd.z||0)-c.z)<8 && mindWetRoute(w,c,fd));
  if(food && c.life.energy<.95)eat(w,c,food);
}

function mindApplyPlan(w,c,e,result,controller,started,duration) {
  const brain=c.mind;
  brain.plan={...result.plan,until:w.t+duration,energy:c.life.energy,threat:e.threat,controller};
  brain.signature=e.signature;brain.activity=result.activity||null;brain.action=result.plan.action;
  brain.status=MIND_MODES[controller].status?.(result.plan.action) || `${MIND_CONTROLLERS[controller]} · ${MIND_LABELS[result.plan.action].toLowerCase()}`;
}
function mindApplyChoice(w,c,e,result,controller,started) {
  if(MIND_MODES[controller].higher){
    c.mind.goal={action:result.plan.action,until:performance.now()+45000};
    c.mind.higherStatus=`Jev goal: ${MIND_LABELS[result.plan.action].toLowerCase()}`;
  } else mindApplyPlan(w,c,e,result,controller,started,8);
}
function mindApplyMotor(w,c,e,result,controller,started) {
  const brain=c.mind;
  brain.motor={value:result.motor,controller,until:started+600};brain.activity=result.activity||null;brain.action=result.plan.action;
  brain.status=`${MIND_CONTROLLERS[controller]} · ${MIND_LABELS[result.plan.action].toLowerCase()}`;
  if(MIND_MODES[controller].higher)brain.status+=` · ${brain.higherStatus||'Fish Brain instincts; Jev has no current goal'}`;
}
const mindNeuralBody = (w,c,inputs)=>({pond:w.link.id,creature:String(c.seed),inputs});
const MIND_LANES={
  choice:{path:'decide',interval:30000,spacing:1100,reserve:'choiceNext',poll:1000,timeout:8000,pending:'pending',backoff:'backoff',next:'next',token:'token',retry:60000,
    ready:()=>mindAvailability('typesafe')==='ready',inputs:(w,c,e)=>e.state,
    body:(w,c,inputs)=>({pond:w.link.id,creature:String(c.seed),scenario:inputs}),signature:(w,c,e)=>e.signature,
    decode:(w,c,e,r)=>Number.isFinite(r?.confidence) && r.confidence>=0 && r.confidence<=1 &&
      e.options.some(o=>o.action===r.action)?{plan:e.options.find(o=>o.action===r.action),confidence:r.confidence}:null,
    apply:mindApplyChoice,clear:(brain,mode)=>{if(mode.higher){brain.goal=null;brain.higherStatus='Jev unavailable; Fish Brain instincts';}else brain.plan=null;}},
  fly:{path:'fly-brain',interval:2000,poll:1000,timeout:8000,pending:'flyPending',backoff:'flyBackoff',reserve:'flyNext',next:'next',token:'token',retry:10000,
    ready:()=>mindAvailability('fly-brain')==='ready',inputs:mindFlyInputs,body:mindNeuralBody,
    signature:(w,c,e)=>mindDecisionSignature(w,c,e,'fly-brain'),
    decode:(w,c,e,r)=>{const neural=mindFlyResult(r);return neural?{plan:mindFlyPlan(w,c,e,neural.motor),activity:neural.activity}:null;},
    apply:(w,c,e,r,controller,started)=>mindApplyPlan(w,c,e,r,controller,started,3),clear:brain=>{brain.plan=null;}},
  fish:{path:'fish-brain',interval:200,poll:0,timeout:1000,maxAge:600,pending:'fishPending',backoff:'fishBackoff',reserve:'fishNext',next:'motorNext',token:'motorToken',retry:2000,
    ready:()=>mindAvailability('fish-brain')==='ready',inputs:mindFishInputs,body:mindNeuralBody,
    signature:(w,c,e)=>[mindProfileSignature(e.state.creature),mindTargetId(e.threat),mindTargetId(e.options.find(o=>o.action==='hunt')?.prey),mindTargetId(e.rival),
      MIND_MODES[mindController(c)].higher?mindFishGoal(w,c,e)?.action||'':null].join('/'),
    decode:(w,c,e,r)=>{const neural=mindFishResult(r);return neural?{motor:neural.motor,activity:neural.activity,plan:{action:
      neural.motor.startle?'flee':neural.motor.feeding?(e.options.some(o=>o.action==='fight') && (e.state.creature.weights.fight||0)/2>=e.state.creature.hunger?'fight':
        e.options.some(o=>o.action==='hunt')?'hunt':'forage'):neural.motor.thrust>.02?'explore':'wait'}}:null;},
    apply:mindApplyMotor,clear:brain=>{brain.motor=null;}},
};
function mindRequestCurrent(w,c,brain,controller,lane,token) {
  return w===world && !w.observe && !w.paused && !document.hidden && c.life?.mind && mindHere(c) &&
    w.creatures.includes(c) && !c.grabbed && brain===c.mind && token===brain[lane.token] && controller===mindController(c) &&
    mindEligible(c) && mindControllerAllowed(c) && mindAvailability(controller)==='ready' && lane.ready();
}
async function mindThink(w,c,encounter,laneName=MIND_MODES[mindController(c)].defaultLane) {
  const controller=mindController(c),mode=MIND_MODES[controller],lane=MIND_LANES[laneName],brain=c.mind;
  if(!brain || !mode.lanes.includes(laneName) || MINDS[lane.pending])return;
  const token=brain[lane.token]=(brain[lane.token]||0)+1,started=performance.now();
  const signature=lane.signature(w,c,encounter),inputs=lane.inputs(w,c,encounter);
  MINDS[lane.pending]=true;
  try {
    await mindCheckCapabilities();
    if(mindAvailability(controller)!=='ready' || !lane.ready()){lane.clear(brain,mode);brain.status=mindAvailabilityText(controller);return;}
    if(!w.link?.id){brain.status='Instincts · share this pond to awaken its mind';return;}
    if(!mindRequestCurrent(w,c,brain,controller,lane,token))return;
    if(!mode.higher)brain.status=mode.thinking || `Sensing through ${MIND_CONTROLLERS[controller]}`;
    const headers={'Content-Type':'application/json'};if(w.link.key)headers['X-Pond-Key']=w.link.key;
    if(lane.reserve)MINDS[lane.reserve]=performance.now()+
      (lane.spacing ?? (laneName==='fish'?lane.interval/Math.max(1,mindControlled(w).filter(q=>MIND_MODES[mindController(q)].lanes.includes('fish')).length):lane.interval));
    const response=await fetch(`${Net.base}/minds/${lane.path}`,{method:'POST',headers,signal:AbortSignal.timeout(lane.timeout),
      body:JSON.stringify(lane.body(w,c,inputs))});
    if(!response.ok)throw Error('unavailable');
    const result=lane.decode(w,c,encounter,await response.json());if(!result)throw Error('invalid');
    if(!mindRequestCurrent(w,c,brain,controller,lane,token) || performance.now()-started>(lane.maxAge||lane.timeout) ||
      lane.signature(w,c,mindEncounter(w,c))!==signature){
      if(w===world && !result.motor)mindLogChoice(c,result.plan,result.confidence,'stale',controller,result.activity);
      if(!mode.motor && brain===c.mind && controller===mindController(c))brain.status='Watching the changed encounter';
      return;
    }
    if(result.confidence!==undefined && encounter.threat && result.confidence<.55){
      mindLogChoice(c,result.plan,result.confidence,'uncertain',controller);lane.clear(brain,mode);
      if(!mode.higher)brain.status='Instincts · uncertain about the danger';return;
    }
    // Continuous motor samples are displayed live; history samples at 1 Hz or
    // behavioral changes, so 5 Hz control does not erase every higher-level goal.
    if(!result.motor || started-(brain.motorLogAt||0)>=1000 || brain.motorLogAction!==result.plan.action){
      mindLogChoice(c,result.plan,result.confidence,'chosen',controller,result.activity,result.motor);
      if(result.motor){brain.motorLogAt=started;brain.motorLogAction=result.plan.action;}
    }
    lane.apply(w,c,encounter,result,controller,started);brain.senses=inputs;
  } catch {
    brain[lane.backoff]=performance.now()+lane.retry;
    lane.clear(brain,mode);
    if(!mode.higher || laneName===mode.defaultLane)brain.status=`Instincts · ${MIND_CONTROLLERS[controller]} interrupted`;
  } finally {MINDS[lane.pending]=false;}
}

function mindTick(w) {
  const now=performance.now();
  if(w.paused || w.observe || document.hidden || now<MINDS.next)return;
  const creatures=mindControlled(w).filter(c=>mindEligible(c) && mindControllerAllowed(c)).slice(0,MIND_LIMIT);
  if(!creatures.length)return;
  MINDS.next=now+Math.min(...creatures.flatMap(c=>MIND_MODES[mindController(c)].lanes.map(k=>MIND_LANES[k].poll)));
  void mindCheckCapabilities();
  for(const [name,lane] of Object.entries(MIND_LANES)){
    if(!lane.ready() || MINDS[lane.pending] || now<(MINDS[lane.reserve]||0))continue;
    for(let offset=0;offset<creatures.length;offset++){
      const index=((MINDS.cursors[name]||0)+offset)%creatures.length,c=creatures[index],mode=MIND_MODES[mindController(c)];
      if(c.grabbed || !mode.lanes.includes(name) || mindAvailability(mindController(c))!=='ready')continue;
      const brain=c.mind || (c.mind={status:'Watching for an encounter',token:0});
      const nextKey=mode.higher && name==='choice'?'higherNext':lane.next;
      if(now<Math.max(brain[lane.backoff]||0,brain[nextKey]||0))continue;
      const encounter=mindEncounter(w,c);if(name==='choice' && encounter.options.length<2)continue;
      if(encounter.threat)mindRemember(c,'threat',mindSpecies(encounter.threat));
      brain[nextKey]=now+lane.interval;MINDS.cursors[name]=(index+1)%creatures.length;
      void mindThink(w,c,encounter,name);break;
    }
  }
}

function mindIntent(w,c) {
  if(MIND_MODES[mindController(c)].motor)return mindMotorIntent(w,c);
  const brain=c.mind,p=brain?.plan;
  if(!c.life?.mind || !p || w.observe)return null;
  if(!mindEligible(c) || c.grabbed || w.t>p.until || !mindHere(c) || !w.creatures.includes(c) ||
    (p.controller && p.controller!==mindController(c)) ||
    (c.threat && c.threat!==p.threat) || c.dread || (p.prey && (!mindHere(p.prey)||!huntable(w,p.prey)||
      c.life.satedUntil>w.t||!mindProfile(w,c).abilities.canHunt)) ||
    (p.companion && (!mindHere(p.companion)||!w.creatures.includes(p.companion)||mindDistance(c,p.companion)>(c.sight||60))) ||
    (p.rival && (typeof mindCanStrike!=='function' || !mindCanStrike(w,c,p.rival))) ||
    (p.watchPrey && (!mindHere(p.watchPrey)||!huntable(w,p.watchPrey)||!mindProfile(w,c).abilities.canHunt)) ||
    (p.food && (p.food.eaten||!w.food.includes(p.food)||c.life.energy>=.95)) || (p.cover&&!w.plants.includes(p.cover))){
    if(p.food&&c.life.energy>p.energy+.05)mindRemember(c,'fed',mindSpecies(c));
    if(p.prey&&!mindHere(p.prey))mindRemember(c,'prey_lost',mindSpecies(p.prey));
    brain.plan=null;brain.status='Watching for an encounter';return null;
  }
  const target=p.food||p.prey||p.rival||p.cover||p.companion||p;
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
