'use strict';
const {createNeuralService}=require('./flybrain.js');
const CHANNELS=['food','threat','same','other','obstacle','motion','prey','cover'];
const INTERNAL=['hunger','energy','speed','depth','comfort'];
const GAINS=[...CHANNELS,'drive'];
// Optional rival-approach urge derived from traits/corruption in game code.
const OPTIONAL_INTERNAL=['rage'];
const ACTIVITY=['input-layer','class-I','class-II','spn-turning','spn-forward'];
const finite=(n,lo=0,hi=1)=>typeof n==='number' && Number.isFinite(n) && n>=lo && n<=hi;
function cleanFishInput(body) {
  if(!body || typeof body.creature!=='string' || !/^[0-9]{1,16}$/.test(body.creature))return null;
  const input=body.inputs;
  if(!input || !Array.isArray(input.sectors) || input.sectors.length!==16 ||
    input.sectors.some(s=>!s || CHANNELS.some(k=>!finite(s[k]))) ||
    !input.internal || INTERNAL.some(k=>!finite(input.internal[k])) ||
    OPTIONAL_INTERNAL.some(k=>input.internal[k]!==undefined && !finite(input.internal[k])))return null;
  if(input.gains!==undefined && (!input.gains || typeof input.gains!=='object' || Array.isArray(input.gains) ||
    GAINS.some(k=>input.gains[k]!==undefined && !finite(input.gains[k],0,2))))return null;
  return {creature:body.creature,inputs:{
    sectors:input.sectors.map(s=>Object.fromEntries(CHANNELS.map(k=>[k,s[k]]))),
    internal:Object.fromEntries([...INTERNAL,...OPTIONAL_INTERNAL.filter(k=>input.internal[k]!==undefined)].map(k=>[k,input.internal[k]])),
    gains:Object.fromEntries(GAINS.map(k=>[k,input.gains?.[k] ?? 1])),
  }};
}
function cleanFishMotor(result) {
  const m=result?.motor;
  if(result?.source!=='fish-brain' || !m || ['left','right','thrust'].some(k=>!finite(m[k])) ||
    ['startle','feeding'].some(k=>typeof m[k]!=='boolean'))return null;
  const a=result.activity,activity=a && typeof a==='object' && ACTIVITY.every(k=>Array.isArray(a[k]) && a[k].length===2 && a[k].every(v=>finite(v)))?
    Object.fromEntries(ACTIVITY.map(k=>[k,[a[k][0],a[k][1]]])):null;
  return {source:'fish-brain',motor:{left:m.left,right:m.right,thrust:m.thrust,startle:m.startle,feeding:m.feeding},...(activity?{activity}:{})};
}
function createFishBrainService(options={}) {
  return createNeuralService({url:process.env.FISH_BRAIN_URL,cleanInput:cleanFishInput,cleanOutput:cleanFishMotor,
    cooldownMs:35,perCreatureCooldownMs:180,timeoutMs:800,maxActive:8,perPondBudget:90000,hourlyBudget:360000,serviceName:'fish brain',...options});
}
module.exports={CHANNELS,INTERNAL,OPTIONAL_INTERNAL,ACTIVITY,GAINS,cleanFishInput,cleanFishMotor,createFishBrainService};
