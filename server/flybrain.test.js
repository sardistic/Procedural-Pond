'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {cleanFlyInput,cleanMotor,createFlyBrainService}=require('./flybrain.js');
const input=()=>({creature:'123456',inputs:{food:.7,danger:.2,drive:.5}});
const motor=()=>({source:'fly-brain',motor:{drive:.8,turn:-.2,feeding:true,escape:false,reverse:false},
  activity:{forward:80,left:30,right:50,feeding:12,escape:0,reverse:0}});
test('neural interface accepts bounded sensory values and motor readouts only',()=>{
  assert.deepEqual(cleanFlyInput({...input(),command:'bad',inputs:{...input().inputs,command:'bad'}}),input());
  for(const bad of [null,{...input(),creature:'../../etc'},{...input(),inputs:{food:NaN,danger:0,drive:0}},
    {...input(),inputs:{food:0,danger:0,drive:2}}])assert.equal(cleanFlyInput(bad),null);
  assert.deepEqual(cleanMotor({...motor(),confidence:1,coordinates:{x:1,y:2}}),motor());
  assert.equal(cleanMotor({...motor(),motor:{...motor().motor,turn:Infinity}}),null);
  assert.equal(cleanMotor({...motor(),activity:{...motor().activity,forward:-1}}),null);
});
test('readiness is actual worker health, independent of TypeSafe credentials',async()=>{
  assert.equal(await createFlyBrainService({url:''}).available(),false);
  let n=0,clock=0;
  const service=createFlyBrainService({url:'http://worker:8090',now:()=>clock,request:async()=>{n++;return{ok:true,json:async()=>({ready:n>1})}}});
  assert.equal(await service.available(),false);assert.equal(await service.available(),false);assert.equal(n,1);
  clock=5001;assert.equal(await service.available(),true);
});
test('worker receives pond-scoped state without ownership credentials',async()=>{
  let sent;
  const service=createFlyBrainService({url:'http://worker:8090',request:async(url,options)=>{sent={url,options};return{ok:true,json:async()=>motor()}}});
  const result=await service.step('owner-pond',{...input(),key:'test-only'});
  assert.equal(result.status,200);assert.deepEqual(result.body,motor());
  assert.equal(sent.url,'http://worker:8090/step');
  assert.deepEqual(JSON.parse(sent.options.body),{session:'owner-pond/123456',inputs:input().inputs});
  assert.ok(!JSON.stringify(sent).includes('test-only'));assert.equal(result.body.confidence,undefined);
});
test('reserve capacity before await, enforce budgets, and release after failure',async()=>{
  let clock=0,resolve;
  const service=createFlyBrainService({url:'http://worker:8090',now:()=>clock,hourlyBudget:2,request:()=>new Promise(r=>resolve=r)});
  const p=service.step('first',input());assert.equal((await service.step('second',input())).status,429);
  resolve({ok:false});assert.equal((await p).status,502);
  assert.equal((await service.step('first',input())).status,429);
  clock=2001;const q=service.step('first',input());resolve({ok:true,json:async()=>motor()});assert.equal((await q).status,200);
  assert.equal((await service.step('second',input())).status,429);
  clock=3600001;const reset=service.step('first',input());resolve({ok:true,json:async()=>motor()});assert.equal((await reset).status,200);
});
