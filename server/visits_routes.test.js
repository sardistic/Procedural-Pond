'use strict';
// Visitors acting on a pond: only what its owner allows, checked and rate-limited, queued for the owner's page.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const net=require('node:net');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {setTimeout:delay}=require('node:timers/promises');
let sqlite=false;try{require('node:sqlite');sqlite=true;}catch{}
const freePort=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});

test('visitors plant and give minds only where the owner allows; the owner takes them once', {skip:!sqlite},async()=>{
  const port=await freePort(),base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,[path.join(__dirname,'server.js')],{
    env:{...process.env,PORT:String(port),DB_PATH:':memory:',TYPESAFE_API_KEY:'',FLY_BRAIN_URL:'',FISH_BRAIN_URL:'',DISCORD_CLIENT_ID:'',DISCORD_CLIENT_SECRET:''},stdio:'ignore'});
  const call=async(route,body,{key,origin=base,method}={})=>{
    const headers={'Content-Type':'application/json',Origin:origin};if(key)headers['X-Pond-Key']=key;
    const res=await fetch(`${base}/api${route}`,{method:method||(body===undefined?'GET':'POST'),headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(3000)});
    return {status:res.status,body:await res.json()};
  };
  const save={v:1,seed:'visit-route-test',creatures:[],plants:[],rocks:[],size:[128,128]};
  try{
    let ready=false;
    for(let i=0;i<50;i++){try{ready=(await call('/health')).status===200;}catch{}if(ready)break;await delay(50);}
    assert.ok(ready,'isolated API starts');
    const created=await call('/ponds',{meta:{epoch:2,board:false},save});
    assert.equal(created.status,201);
    const {id,key}=created.body,plant={kind:'plant',plant:'lotus',x:40,y:50},mind={kind:'mind',seed:12345,controller:'fly-brain'};
    // Closed by default.
    assert.equal((await call(`/ponds/${id}/visit`,plant)).status,403);
    // The owner opens it to planting only.
    assert.equal((await call(`/ponds/${id}`,{meta:{epoch:2,board:false,visit:{plant:true}},save},{key,method:'PUT'})).status,200);
    assert.deepEqual((await call(`/ponds/${id}`)).body.meta.visit,{plant:true,minds:false});
    assert.equal((await call(`/ponds/${id}/visit`,plant)).status,201);
    assert.equal((await call(`/ponds/${id}/visit`,mind)).status,403,'minds not allowed');
    assert.equal((await call(`/ponds/${id}/visit`,{...plant,plant:'<b>'})).status,400);
    assert.equal((await call(`/ponds/${id}/visit`,{...plant,x:-5})).status,400);
    assert.equal((await call(`/ponds/${id}/visit`,plant,{origin:'https://unrelated.example'})).status,403);
    // Minds too.
    await call(`/ponds/${id}`,{meta:{epoch:2,board:false,visit:{plant:true,minds:true}},save},{key,method:'PUT'});
    assert.equal((await call(`/ponds/${id}/visit`,mind)).status,201);
    assert.equal((await call(`/ponds/${id}/visit`,{...mind,controller:'bogus'})).status,400);
    // Only the owner takes them, once.
    assert.equal((await call(`/ponds/${id}/visits`,{})).status,403);
    assert.equal((await call(`/ponds/${id}/visits`,{},{key:'wrong-key-wrong-key'})).status,403);
    const took=await call(`/ponds/${id}/visits`,{},{key});
    assert.equal(took.status,200);
    assert.deepEqual(took.body.acts.map((a)=>a.kind),['plant','mind']);
    assert.equal(took.body.acts[0].plant,'lotus');assert.equal(took.body.acts[1].controller,'fly-brain');
    assert.deepEqual((await call(`/ponds/${id}/visits`,{},{key})).body.acts,[]);
    // One visitor can only plant so much an hour.
    let last=0;for(let i=0;i<14;i++)last=(await call(`/ponds/${id}/visit`,plant)).status;
    assert.equal(last,429);
  }finally{child.kill();}
});
