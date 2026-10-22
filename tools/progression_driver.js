// Controlled progression audit: real simulation steps and ordinary player actions, no rewards injected.
(() => {
  const A = window.PROGRESSION = { elapsed: 0, nextCare: 0, nextBuild: 60, samples: [], milestones: {}, actions: {}, emptySeconds: 0 };
  A.init = (policy) => {
    cancelAnimationFrame(frameId); frameId = 0; queueFrame = () => {};
    world.noSave = true; world.observe = null; world.paused = false;
    A.policy = policy; A.start = { days: world.days, points: world.game.points, eco: {...ECO}, known: [...knownList(world)], tier: world.erosion.tier };
    A.clock = performance.now(); growNext = 0;
    Math.random = mulberry32(hashString(`${world.seed}/progression`));
    A.samples.push(A.snapshot());
  };
  const use = (tool, x, y) => {
    const old = world.tool; world.tool = tool;
    const count = world.plants.length + world.pads.length + world.rocks.length + world.structures.length + world.food.length;
    try { useTool(x,y); } finally { world.tool = old; }
    const changed = count !== world.plants.length + world.pads.length + world.rocks.length + world.structures.length + world.food.length;
    if (changed) A.actions[tool] = (A.actions[tool] || 0) + 1;
    return changed;
  };
  A.tend = () => {
    const residents = world.creatures.filter(c=>c.life&&!c.leaving&&!c.dying), G = world.game;
    // Up to four targeted free pellet clicks every 20 normal-speed seconds.
    for (const c of [...residents].filter(c=>c.life.energy<.7).sort((a,b)=>a.life.energy-b.life.energy).slice(0,4)) use('feed',c.x,c.y);
    // One affordable liked object, near a resident lacking cover.
    for (const c of [...residents].sort((a,b)=>a.life.comfort-b.life.comfort)) {
      if (comfortFactors(world,c).cover>=3) continue;
      const tool=carePlant(world,c);
      if (tool && TOOLS[tool].price<=G.pearls*.3 && use(tool,c.x+rand(-12,12),c.y+rand(-12,12))) break;
    }
    if(A.elapsed<A.nextBuild)return;
    A.nextBuild=A.elapsed+60;
    const builds=Object.keys(TOOLS).filter(k=>TOOLS[k].build&&TOOLS[k].build!=='island'&&pinUsable(k)&&
      TOOLS[k].price<=G.pearls*.5&&(TOOLS[k].essence||0)<=(G.essence||0)*.5&&!world.structures.some(s=>s.kind===TOOLS[k].build));
    for (const k of builds.sort((a,b)=>TOOLS[a].price-TOOLS[b].price).slice(0,1)) {
      for(let i=0;i<20;i++){const [x,y]=openSpot();if(!canPlace(world,TOOLS[k].build,x,y)){use(k,x,y);break;}}
    }
    if(!hardMode(world)) {
      const kinds=Object.keys(SPECIES).filter(k=>SPECIES[k].spawn&&spawnable(world,k)&&spawnCost(k)<=(G.essence||0)*.5&&residents.filter(c=>c.species===k).length<2);
      if(kinds.length&&buyAnimal(kinds[0]))A.actions.spawn=(A.actions.spawn||0)+1;
    }
  };
  A.snapshot = () => {
    const cs=world.creatures.filter(c=>c.life&&!c.leaving&&!c.dying), mean=k=>cs.length?cs.reduce((s,c)=>s+c.life[k],0)/cs.length:0;
    return {seconds:Math.round(A.elapsed),day:+world.days.toFixed(2),tier:world.erosion.tier,erosion:+world.erosion.e.toFixed(3),
      fathoms:pondFathoms(world),population:cs.length,kinds:new Set(cs.map(c=>breedKey(c))).size,known:knownList(world).length,
      fullness:+mean('energy').toFixed(3),comfort:+mean('comfort').toFixed(3),hungry:cs.filter(c=>c.life.energy<.35).length,
      ready:cs.filter(c=>breedingBlock(world,c)===null).length,births:ECO.births-A.start.eco.births,departures:ECO.departures-A.start.eco.departures,eaten:ECO.eaten-A.start.eco.eaten,
      points:world.game.points,pearls:world.game.pearls,essence:world.game.essence,plants:world.plants.length+world.pads.length,structures:world.structures.length,
      width:world.W,height:world.H,earned:{...world.game.earned},depthParts:{...world.erosion.parts},actions:{...A.actions}};
  };
  A.advance = (seconds) => {
    const steps=Math.round(seconds/.05);
    for(let i=0;i<steps;i++) {
      const dt=.05;world.waveTime=waveTime(world)+dt;seaStep(world,dt);
      advanceOfferingTime(world,dt*world.opts.speed*(hardMode(world)?HARD_PACE:1),update);
      A.elapsed+=dt;A.clock+=50;growTick(A.clock);
      if(A.policy==='tend'&&A.elapsed>=A.nextCare){A.nextCare=A.elapsed+20;A.tend();}
      if(pondPopulation(world)===0)A.emptySeconds+=dt;
      if(world.erosion.tier>A.start.tier&&!A.milestones.firstDepth)A.milestones.firstDepth=+A.elapsed.toFixed(1);
      if(ECO.births>A.start.eco.births&&!A.milestones.firstBirth)A.milestones.firstBirth=+A.elapsed.toFixed(1);
      if(knownList(world).some(k=>!A.start.known.includes(k))&&!A.milestones.newKind)A.milestones.newKind=+A.elapsed.toFixed(1);
      if(i%20===0){runJobs();bakeTick(4);}
    }
    const s=A.snapshot();for(const [k,v]of Object.entries(s))if(typeof v==='number'&&!Number.isFinite(v))throw Error(`Nonfinite ${k}`);
    A.samples.push(s);return s;
  };
})();
