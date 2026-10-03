'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {CHANNELS,INTERNAL,cleanFishInput,cleanFishMotor,createFishBrainService}=require('./fishbrain.js');
const input=()=>({creature:'123456',inputs:{sectors:Array.from({length:16},()=>Object.fromEntries(CHANNELS.map(k=>[k,.2]))),
  internal:Object.fromEntries(INTERNAL.map(k=>[k,.5]))}});
const output=()=>({source:'fish-brain',motor:{left:.1,right:.7,thrust:.5,startle:false,feeding:true}});

test('only bounded 16-sector sensory fields, internal state and gains reach the worker',()=>{
  const body=input();body.inputs.goal='hunt';body.inputs.sectors[0].coordinates={x:5};body.key='test-only';
  const clean=cleanFishInput(body);
  assert.equal(clean.inputs.goal,undefined);assert.equal(clean.inputs.sectors[0].coordinates,undefined);
  assert.equal(clean.inputs.gains.food,1);assert.equal(clean.key,undefined);
  for(const mutate of [b=>b.inputs.sectors.pop(),b=>b.inputs.sectors.push(b.inputs.sectors[0]),
    b=>b.inputs.sectors[0].threat=NaN,b=>b.inputs.sectors[0].food=true,b=>delete b.inputs.sectors[0].motion,
    b=>b.inputs.internal.energy=2,b=>b.inputs.gains={drive:2.01},b=>b.inputs.gains=[],b=>b.creature='../file']){
    const bad=input();mutate(bad);assert.equal(cleanFishInput(bad),null);
  }
});
test('motor response has continuous normalized drive and strict boolean reflexes',()=>{
  const result=output();result.motor.x=100;result.action='hunt';
  assert.deepEqual(cleanFishMotor(result),output());
  for(const bad of [null,{...output(),source:'fly-brain'}, {...output(),motor:{...output().motor,thrust:NaN}},
    {...output(),motor:{...output().motor,left:-.1}}, {...output(),motor:{...output().motor,startle:1}}])assert.equal(cleanFishMotor(bad),null);
});
test('Fish Brain readiness is cached/coalesced worker health and independent of Jev',async()=>{
  assert.equal(await createFishBrainService({url:''}).available(),false);
  let calls=0,t=0,resolve;
  const service=createFishBrainService({url:'http://fish:8091',now:()=>t,request:()=>{calls++;return new Promise(r=>resolve=r)}});
  const a=service.available(),b=service.available();assert.equal(calls,1);
  resolve({ok:true,json:async()=>({ready:true})});assert.equal(await a,true);assert.equal(await b,true);
  assert.equal(await service.available(),true);assert.equal(calls,1);
  t=5001;const c=service.available();resolve({ok:false});assert.equal(await c,false);
});
test('persistent sessions are pond-scoped, credentials isolated, 200 ms sampling stays within budget',async()=>{
  let sent,t=0;
  const service=createFishBrainService({url:'http://fish:8091',now:()=>t,perPondBudget:2,
    request:async(url,options)=>{sent={url,...JSON.parse(options.body)};return{ok:true,json:async()=>output()}}});
  assert.equal((await service.step('owner-pond',{...input(),key:'test-only'})).status,200);
  assert.equal(sent.session,'owner-pond/123456');assert.equal(sent.url,'http://fish:8091/step');
  assert.ok(!JSON.stringify(sent).includes('test-only'));assert.equal(sent.inputs.sectors.length,16);
  assert.equal((await service.step('owner-pond',input())).status,429);
  t=200;assert.equal((await service.step('owner-pond',input())).status,200);
  t=400;assert.equal((await service.step('owner-pond',input())).status,429);
  t=3600000;assert.equal((await service.step('owner-pond',input())).status,200);
});
test('timeout/failure releases in-flight capacity and returns a fallback error, never a motor command',async()=>{
  let t=0,calls=0;
  const service=createFishBrainService({url:'http://fish:8091',timeoutMs:20,now:()=>t,request:(url,options)=>{
    calls++;if(calls>1)return Promise.resolve({ok:true,json:async()=>output()});
    return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason)));
  }});
  // Keep the test process alive while AbortSignal.timeout's unref timer runs.
  const keepAlive=setInterval(()=>{},1000);
  try{
    const pending=service.step('pond',input());t=1000;
    assert.equal((await service.step('pond',input())).status,429);
    const failure=await pending;assert.equal(failure.status,502);assert.equal(failure.body.motor,undefined);
    assert.equal((await service.step('pond',input())).status,200);
  }finally{clearInterval(keepAlive);}
  assert.equal((await createFishBrainService({url:''}).step('pond',input())).status,503);
});
test('hour rollover cannot remove a pending pond reservation',async()=>{
  let t=3599800,finish;
  const service=createFishBrainService({url:'http://fish:8091',now:()=>t,request:()=>new Promise(resolve=>{
    finish=()=>resolve({ok:true,json:async()=>output()});
  })});
  const active=service.step('pond',input());t=3600001;
  assert.equal((await service.step('pond',input())).status,429);
  finish();assert.equal((await active).status,200);
});

test('five Fish sessions can sample at 5 Hz each with bounded identity slots',async()=>{
  let t=0;
  const sessions=[];
  const service=createFishBrainService({url:'http://fish:8091',now:()=>t,request:async(url,options)=>{
    sessions.push(JSON.parse(options.body).session);return {ok:true,json:async()=>output()};
  }});
  for(let i=0;i<50;i++){
    assert.equal((await service.step('pond',{...input(),creature:String(i%5)})).status,200);
    t+=40;
  }
  assert.equal(new Set(sessions).size,5);
  assert.equal((await service.step('pond',{...input(),creature:'9'})).status,429);
  t+=120000;
  assert.equal((await service.step('pond',{...input(),creature:'9'})).status,200);
});

test('switching Fish identities cannot bypass creature cooldown or an in-flight pond request',async()=>{
  let t=0,finish;
  const service=createFishBrainService({url:'http://fish:8091',now:()=>t,request:()=>new Promise(resolve=>{
    finish=()=>resolve({ok:true,json:async()=>output()});
  })});
  const first=service.step('pond',input());t=40;
  assert.equal((await service.step('pond',{...input(),creature:'2'})).status,429);
  finish();await first;
  assert.equal((await service.step('pond',input())).status,429);
  const second=service.step('pond',{...input(),creature:'2'});finish();assert.equal((await second).status,200);
});
test('optional rage input and measured population activity are bounded; older shapes still pass',()=>{
  const body=input();body.inputs.internal.rage=.7;
  assert.equal(cleanFishInput(body).inputs.internal.rage,.7);
  assert.equal(cleanFishInput(input()).inputs.internal.rage,undefined);
  body.inputs.internal.rage=1.2;assert.equal(cleanFishInput(body),null);
  const activity={'input-layer':[.1,.2],'class-I':[0,0],'class-II':[.3,.1],'spn-turning':[.02,.05],'spn-forward':[.04,.04]};
  assert.deepEqual(cleanFishMotor({...output(),activity}),{...output(),activity});
  assert.deepEqual(cleanFishMotor({...output(),activity:{...activity,'class-I':[2,0]}}),output());
  assert.deepEqual(cleanFishMotor({...output(),activity:{...activity,extra:[0,0]}}).activity,activity);
});
