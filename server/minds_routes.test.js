'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const net=require('node:net');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {setTimeout:delay}=require('node:timers/promises');
let sqlite=false;try{require('node:sqlite');sqlite=true;}catch{}
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
const close=server=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections?.();});
test('Fish Brain route shares ownership/origin security, health, validation and failure handling', {skip:!sqlite},async()=>{
  let behavior='good',calls=0,received;
  const worker=http.createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json');
    if(req.url==='/health')return res.end('{"ready":true}');
    let body='';for await(const chunk of req)body+=chunk;
    received=JSON.parse(body);calls++;
    if(behavior==='slow')await delay(1100);
    if(behavior==='pending')await delay(350);
    const result={source:'fish-brain',motor:{left:.1,right:.6,thrust:.4,startle:false,feeding:false}};
    if(behavior==='invalid')result.motor.thrust=2;
    res.end(JSON.stringify(result));
  });
  const workerPort=await listen(worker),portFinder=net.createServer(),port=await listen(portFinder);await close(portFinder);
  const base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['--preserve-symlinks','--preserve-symlinks-main',path.join(__dirname,'server.js')],{
    env:{...process.env,PORT:String(port),DB_PATH:':memory:',TYPESAFE_API_KEY:'',FLY_BRAIN_URL:'',
      FISH_BRAIN_URL:`http://127.0.0.1:${workerPort}`,DISCORD_CLIENT_ID:'',DISCORD_CLIENT_SECRET:''},stdio:'ignore'});
  const call=async(route,body,key,origin=base)=>{
    const headers={'Content-Type':'application/json',Origin:origin};if(key)headers['X-Pond-Key']=key;
    const res=await fetch(`${base}/api${route}`,{method:body===undefined?'GET':'POST',headers,
      body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(3000)});
    return {status:res.status,body:await res.json()};
  };
  try{
    let ready=false;
    for(let i=0;i<50;i++){try{ready=(await call('/health')).status===200;}catch{}if(ready)break;await delay(50);}
    assert.ok(ready,'isolated API starts');
    assert.deepEqual((await call('/minds')).body,{enabled:false,flyBrain:false,fishBrain:true});
    const created=await call('/ponds',{meta:{epoch:2,board:false},save:{v:1,seed:'fish-brain-route-test',
      creatures:[],plants:[],rocks:[],size:[128,128]}});
    assert.equal(created.status,201);
    const {id,key}=created.body,body={pond:id,creature:'123456',inputs:{
      sectors:Array.from({length:16},()=>Object.fromEntries(['food','threat','same','other','obstacle','motion','prey','cover'].map(k=>[k,0]))),
      internal:{hunger:.5,energy:.5,speed:0,depth:.5,comfort:.5}}};
    const step=(input=body,owner=key,origin=base)=>call('/minds/fish-brain',input,owner,origin);
    assert.equal((await step(body,null)).status,403);
    assert.equal((await step(body,'wrong-key')).status,403);
    assert.equal((await step(body,key,'https://unrelated.example')).status,403);
    assert.equal((await step({...body,pond:'bad-id'})).status,400);
    assert.equal((await step({...body,creature:'../123'})).status,400);
    assert.equal((await step({...body,inputs:{...body.inputs,sectors:[]}})).status,400);
    assert.equal(calls,0,'rejected requests never reach the worker');
    const first=await step();assert.equal(first.status,200);assert.equal(first.body.source,'fish-brain');
    assert.equal(received.session,`${id}/123456`);
    assert.ok(!JSON.stringify(received).includes(key));
    assert.ok(!Object.hasOwn(first.body,'confidence'));
    assert.equal((await step()).status,429);
    await delay(200);behavior='pending';const before=calls,active=step();
    for(let i=0;i<30 && calls===before;i++)await delay(10);
    await delay(200);assert.equal((await step()).status,429,'same pond cannot overlap after cooldown');
    assert.equal((await active).status,200);
    await delay(200);behavior='invalid';assert.equal((await step()).status,502);
    await delay(200);behavior='slow';assert.equal((await step()).status,502,'800 ms worker timeout returns fallback');
    behavior='good';assert.equal((await step()).status,200,'capacity released after timeout');
  }finally{
    if(child.exitCode===null){const done=new Promise(resolve=>child.once('exit',resolve));child.kill();await done;}
    await close(worker);
  }
});
