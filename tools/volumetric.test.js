'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function rig(){const c=vm.createContext({Math,metaNow:w=>w.fog||null});for(const name of ['core','volumetric'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',name+'.js'),'utf8'),c);return vm.runInContext('({volumeWeather,volumeMotion})',c);}
test('cloud motion remains continuous in old ponds when wind changes, pauses or resumes',()=>{
  const R=rig(),w={},old={};R.volumeMotion(w,0,[.25,.1]);R.volumeMotion(old,1e7,[.25,.1]);
  for(let i=1;i<=60;i++){
    const wind=[.25+i*.001,.1-i*.001];R.volumeMotion(w,i/60,wind);R.volumeMotion(old,1e7+i/60,wind);
  }
  assert.ok(Math.abs(w.volMotion.x-old.volMotion.x)<1e-8);assert.ok(Math.abs(w.volMotion.y-old.volMotion.y)<1e-8);
  const before={...old.volMotion};R.volumeMotion(old,before.at,[30,-30]);assert.deepEqual({...old.volMotion},before);
  R.volumeMotion(old,before.at+100,[30,-30]);assert.ok(Math.hypot(old.volMotion.x-before.x,old.volMotion.y-before.y)<=.200001,'Long absence must not teleport mist');
  R.volumeMotion(old,0,[0,0]);assert.equal(old.volMotion.x,0);assert.equal(old.volMotion.phase,0);
});
test('humidity follows simulation time rather than FPS, and stays still while paused',()=>{
  const R=rig(),make=()=>({t:0,clock:.5,darkness:0,weather:{rain:1,gust:0},tide:{surf:0}}),a=make(),b=make();
  R.volumeWeather(a);R.volumeWeather(b);
  for(let i=1;i<=600;i++){a.t=i/60;R.volumeWeather(a);}
  for(let i=1;i<=150;i++){b.t=i/15;R.volumeWeather(b);}
  assert.ok(Math.abs(a.volWet-b.volWet)<1e-10);
  const wet=a.volWet;for(let i=0;i<600;i++)R.volumeWeather(a);assert.equal(a.volWet,wet);
  a.weather.rain=0;a.t+=5;R.volumeWeather(a);assert.ok(a.volWet<wet);
});
test('calm weather is sparse and even thick fog has a restrained opacity budget',()=>{
  const R=rig(),w={t:0,clock:.5,darkness:0,weather:{rain:0,gust:0},tide:{surf:0}},calm=R.volumeWeather(w);
  assert.ok(calm.hum<=.1);assert.ok(calm.veilCap<=.12);
  w.clock=.27;const dawn=R.volumeWeather(w);assert.ok(dawn.hum>calm.hum&&dawn.hum<.5);
  w.weather.rain=1;w.weather.gust=2;const storm=R.volumeWeather(w);assert.ok(storm.veilCap<=.18);
  w.fog='thick';const fog=R.volumeWeather(w);assert.ok(fog.veilCap<=.22);assert.ok(fog.hum<1.8);
});
