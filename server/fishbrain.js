'use strict';
const {createNeuralService}=require('./flybrain.js');
const CHANNELS=['food','threat','same','other','obstacle','motion','prey','cover'];
const INTERNAL=['hunger','energy','speed','depth','comfort'];
const GAINS=[...CHANNELS,'drive'];
const finite=(n,lo=0,hi=1)=>typeof n==='number' && Number.isFinite(n) && n>=lo && n<=hi;
function cleanFishInput(body) {
  if(!body || typeof body.creature!=='string' || !/^[0-9]{1,16}$/.test(body.creature))return null;
  const input=body.inputs;
  if(!input || !Array.isArray(input.sectors) || input.sectors.length!==16 ||
    input.sectors.some(s=>!s || CHANNELS.some(k=>!finite(s[k]))) ||
    !input.internal || INTERNAL.some(k=>!finite(input.internal[k])))return null;
  if(input.gains!==undefined && (!input.gains || typeof input.gains!=='object' || Array.isArray(input.gains) ||
    GAINS.some(k=>input.gains[k]!==undefined && !finite(input.gains[k],0,2))))return null;
  return {creature:body.creature,inputs:{
    sectors:input.sectors.map(s=>Object.fromEntries(CHANNELS.map(k=>[k,s[k]]))),
    internal:Object.fromEntries(INTERNAL.map(k=>[k,input.internal[k]])),
    gains:Object.fromEntries(GAINS.map(k=>[k,input.gains?.[k] ?? 1])),
  }};
}
function cleanFishMotor(result) {
  const m=result?.motor;
  if(result?.source!=='fish-brain' || !m || ['left','right','thrust'].some(k=>!finite(m[k])) ||
    ['startle','feeding'].some(k=>typeof m[k]!=='boolean'))return null;
  return {source:'fish-brain',motor:{left:m.left,right:m.right,thrust:m.thrust,startle:m.startle,feeding:m.feeding}};
}
function createFishBrainService(options={}) {
  return createNeuralService({url:process.env.FISH_BRAIN_URL,cleanInput:cleanFishInput,cleanOutput:cleanFishMotor,
    cooldownMs:180,timeoutMs:800,maxActive:8,perPondBudget:18000,hourlyBudget:72000,serviceName:'fish brain',...options});
}
module.exports={CHANNELS,INTERNAL,GAINS,cleanFishInput,cleanFishMotor,createFishBrainService};
