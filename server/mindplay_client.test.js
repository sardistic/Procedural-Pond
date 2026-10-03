'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
function pond() {
  const context=vm.createContext({console,AbortSignal,Response,Date,Math,performance:{now:()=>1000},
    document:{hidden:false},Net:{base:'/api'},fetch:async()=>new Response('{}')});
  const run=code=>vm.runInContext(code,context);
  run(`
    class Creature {} class Fish extends Creature {} class Walker extends Creature {} class Octopus extends Creature {} class Watcher extends Creature {}
    const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)), rand=(a,b)=>(a+b)/2;
    const tierOf=()=>3, SPECIES_STATS={koi:{rarity:3}}, SINGULAR={koi:'Koi',pike:'Pike'}, DEEP={};
    const geneBuffs=c=>c.buffs, isPredator=q=>q.predator===true, huntLv=(c,k)=>c.life.hunt?.[k]||0, huntReach=()=>1;
    const rageOf=()=>1, enraged=()=>false, eldStage=L=>!L.genome.eld?-1:L.corruption>=1/3?1:0, widthOf=q=>Math.max(...q.body.w);
    let protectedKinds=new Set();const huntable=(w,q)=>!protectedKinds.has(q.species);
    const shoreAt=()=>0, events=[], logEvent=(w,text)=>events.push(text), who=c=>c.life.name;
    const addBlood=()=>{}, addRipple=()=>{}, startle=()=>{}, onKill=()=>{}, gainCorruption=()=>{};
    const eat=(w,c,f)=>{f.caught=true;mindReward(w,c,'kill',f);};
    const N={};const natureDay=()=>N;
    const forNear=(w,x,y,r,callback)=>w.creatures.forEach(q=>callback(q,(q.x-x)**2+(q.y-y)**2));
    const world={t:10,W:400,H:300,tide:{level:1},shore:null,food:[],plants:[],rocks:[],effects:[],creatures:[],link:{id:'p'}};
    const fish=(name,species,x,extra={})=>Object.assign(new Fish(),{id:name.length,seed:1,species,x,y:100,z:10,heading:0,speed:5,maxSpeed:10,
      body:{w:[3],x:[x],y:[100]},buffs:{aggression:1,intellect:2,vitality:1},
      life:{name,mind:false,traits:[],energy:.8,comfort:.5,genome:{}},...extra});
  `);
  run(`const SCALABLE=new Set(['koi']), GENE_LIMITS={size:[.7,1.5],speed:[.75,1.3]};let refreshed=0;const refreshBuffs=()=>refreshed++;
    const award=()=>1, floatAward=()=>{}, solid=x=>x, newId=()=>1, hexToInt=()=>0, EMISSIVE={};
    const applyScale=(c,s)=>{c.appliedScale=s;c.appliedGrown=c.life.grown||0;};`);
  run(read('js/growth.js'));
  run(read('js/minds.js'));
  run(read('js/mindplay.js'));
  return run;
}
test('fight drive rises with aggression, hunting upgrades, corruption and won fights, and stays bounded',()=>{
  const run=pond();
  const calm=run(`(()=>{const c=fish('Calm','koi',100);c.buffs.calming=.6;return mindFightDrive(world,c).value})()`);
  const savage=run(`(()=>{const c=fish('Savage','koi',100,{predator:true});c.buffs.aggression=1.8;c.life.hunter=true;
    c.life.hunt={jaws:5,devour:4};c.life.genome.eld=true;c.life.corruption=.9;c.life.mindLearn={bias:.3};
    return mindFightDrive(world,c)})()`);
  assert.ok(calm<.25,'a calm fish is too calm to pick fights');
  assert.equal(savage.value,1);
  for(const part of ['aggression','woken hunter','hunting upgrades','corruption','fights won'])
    assert.ok(savage.parts.some(([k])=>k===part),part);
});
test('rivals respect protection and size, and enter Fish Brain as approachable evidence with a rage drive',()=>{
  const run=pond();
  run(`var me=fish('Me','pike',100,{predator:true});me.buffs.aggression=1.6;me.life.mind=true;me.mind={token:0};
    var koi=fish('Koi','koi',110);koi.body.w=[2.5];var whale=fish('Whale','koi',120);whale.body.w=[9];world.creatures=[me,koi,whale];`);
  assert.equal(run('mindRivalFor(world,me,[koi,whale])===koi'),true);
  assert.equal(run('mindCanStrike(world,me,whale)'),false);
  run(`protectedKinds.add('koi');me.mind.rival=null;`);
  assert.equal(run('mindRivalFor(world,me,[koi,whale])'),null);
  run(`protectedKinds.clear();world.creatures=[me,koi];`);
  const inputs=run(`(()=>{const profile={hunger:0,depth:.3,comfort:.5,abilities:{feeds:true},weights:{food:1,danger:1,social:1,explore:1,hunt:0,shelter:1,motor:1,
    fight:2*mindFightDrive(world,me).value}};
    return mindFishInputs(world,me,{radius:60,rival:koi,neighbors:[koi],state:{creature:profile},options:[{action:'fight',rival:koi}]})})()`);
  assert.ok(inputs.sectors[0].prey>0,'rival is ahead in the prey/rival channel');
  assert.equal(inputs.sectors[0].other,0);
  assert.ok(inputs.internal.rage>.25 && inputs.internal.rage<=1);
  assert.ok(inputs.gains.prey>0);
});
test('learning: rewarded approach strengthens a channel, fights shape boldness and feelings, saves are cleaned',()=>{
  const run=pond();
  run(`var me=fish('Me','pike',100);me.life.mind=true;me.mind={token:0,ring:{sectors:Array.from({length:16},()=>({food:0,prey:0,threat:0,same:0,cover:0,other:0}))}};
    me.mind.ring.sectors[0].food=1;for(let i=0;i<20;i++)mindTrace(me,.25);mindReward(world,me,'fed',null);`);
  assert.ok(run('mindLearnedGain(me,"food")')>1);
  run(`var rival={species:'koi'};mindReward(world,me,'win',rival);mindReward(world,me,'win',rival);mindReward(world,me,'lose',{species:'pike'})`);
  assert.ok(run('mindValence(me,"koi")')>0);assert.ok(run('mindValence(me,"pike")')<0);
  assert.equal(run('me.life.mindLearn.wins'),2);assert.equal(run('me.life.mindLearn.losses'),1);
  assert.deepEqual(JSON.parse(run('JSON.stringify(me.life.mindMemory.map(m=>m.event))')),['fed','won_fight','lost_fight']);
  const fear=run(`(()=>{const pike={species:'pike'};me.life.mindLearn.sp.pike=-.8;return mindLearnedFear(me,{neighbors:[pike]}).strength})()`);
  assert.ok(fear>.35);
  const clean=run(`mindCleanLearn({g:{food:9,prey:NaN,x:1},sp:{koi:.5,'__proto__':1,'<b>':1},bias:5,wins:-3,notes:[{at:1,kind:'win',species:'koi'},{at:2,kind:'eval',species:'koi'},{at:3,kind:'lose',species:'<img>'}]})`);
  assert.deepEqual(JSON.parse(JSON.stringify(clean)),{g:{food:2},sp:{koi:.5},bias:.3,wins:0,losses:0,notes:[{at:1,kind:'win',species:'koi'}]});
});
test('strikes hurt the loser, catch much smaller rivals and cap deaths per day',()=>{
  const run=pond();
  run(`var me=fish('Me','pike',100,{predator:true});me.buffs.aggression=1.8;me.life.mind=true;me.mind={token:0};me.life.energy=1;
    var foe=fish('Foe','koi',104);foe.life.energy=.5;world.creatures=[me,foe];`);
  assert.equal(run('mindStrike(world,me,foe)'),'win');
  assert.ok(run('foe.life.hp')<1,'the loser is wounded');assert.equal(run('foe.life.energy'),.5,'hunger is separate from health');
  assert.ok(run('me.life.mindLearn.wins')===1);
  run(`var minnow=fish('Minnow','koi',103);minnow.body.w=[1];world.creatures.push(minnow);`);
  assert.equal(run('mindStrike(world,me,minnow)'),'kill');
  run(`N.mindKills=MIND_FIGHT.killsPerDay;foe.life.hp=.05;me.mind.strikeAt=-99;`);
  run('mindStrike(world,me,foe)');
  assert.equal(run('foe.dying'),undefined);
  assert.ok(run('foe.life.hp')>=.08);
});
test('meals grow an animal with diminishing returns, kills pass on only better genes, and health heals or starves',()=>{
  const run=pond();
  run(`var eater=fish('Eater','pike',100);eater.life.scale=1;eater.life.genome={size:1,speed:.9,vit:.4,iq:.8,lon:.5,fert:.5,res:.2,tol:.3};eater.maxSpeed=10;eater.cruise=5;
    var prey=fish('Prey','koi',100);prey.life.genome={size:1.3,speed:1.2,vit:.9,iq:.1,lon:.5,fert:.5,res:.2,tol:.3};`);
  run('for(let i=0;i<10;i++)mealGrowth(world,eater,{kind:"pellet"},.3)');
  const afterFood=run('eater.life.grown');assert.ok(afterFood>0 && afterFood<.05);
  run('for(let i=0;i<400;i++)mealGrowth(world,eater,{kind:"pellet"},.5)');
  assert.ok(run('eater.life.grown')<=.6);
  const gains=JSON.parse(run('JSON.stringify(absorbGenes(world,eater,prey).map(g=>g[0]))'));
  assert.deepEqual(gains.sort(),['size','speed','strength']);
  assert.equal(run('eater.life.genome.iq'),.8,'worse genes are not taken');
  assert.ok(run('eater.life.genome.speed')>.9 && run('eater.maxSpeed')>10,'speed gene speeds it up');
  assert.equal(run('eater.life.devoured.n'),1);
  run('eater.life.hp=.5;eater.life.energy=.8;eater.life.buffs={vitality:1};tickHealth(eater,10)');
  assert.ok(run('eater.life.hp')>.5);
  run('eater.life.energy=0;const g0=eater.life.grown;tickHealth(eater,10)');
  assert.ok(run('eater.life.hp')<.62);
  assert.equal(JSON.stringify(run('cleanDevoured({n:3,gains:{speed:.1,evil:5}})')),JSON.stringify({n:3,gains:{speed:.1}}));
});
