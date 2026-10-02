'use strict';

// The full connectome lives in a separate worker; this API owns authorization,
// request budgets and the bounded interface to the game's movement code.
const finite = (n, lo, hi) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
const ACTIVITY = ['forward', 'left', 'right', 'feeding', 'escape', 'reverse'];
function cleanFlyInput(body) {
  if (!body || typeof body.creature !== 'string' || !/^[0-9]{1,16}$/.test(body.creature)) return null;
  const inputs = body.inputs;
  if (!inputs || ['food', 'danger', 'drive'].some(k => !finite(inputs[k], 0, 1))) return null;
  return { creature: body.creature, inputs: { food: inputs.food, danger: inputs.danger, drive: inputs.drive } };
}
function cleanMotor(result) {
  const m = result?.motor, a = result?.activity;
  if (result?.source !== 'fly-brain' || !m || !a || !finite(m.drive, 0, 1) || !finite(m.turn, -1, 1) ||
      ['feeding','escape','reverse'].some(k => typeof m[k] !== 'boolean') || ACTIVITY.some(k => !finite(a[k],0,10000))) return null;
  return { source: 'fly-brain', motor: { drive:m.drive,turn:m.turn,feeding:m.feeding,escape:m.escape,reverse:m.reverse },
    activity:Object.fromEntries(ACTIVITY.map(k => [k,a[k]])) };
}
function createFlyBrainService({ url = process.env.FLY_BRAIN_URL, request = fetch, now = Date.now,
  hourlyBudget = 1800, perPondBudget = 600 } = {}) {
  let base = null;
  if (url) {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw Error('invalid fly-brain worker URL');
    base = u.href.replace(/\/$/, '');
  }
  let active = 0, hour = -1, used = 0, ready = false, checkedAt = -Infinity, check = null;
  const ponds = new Map();
  return {
    async available() {
      if (!base) return false;
      if (now()-checkedAt<5000) return ready;
      if (check) return check;
      check = (async() => {
        try {
          const r=await request(`${base}/health`,{signal:AbortSignal.timeout(2000)});
          ready=r.ok && (await r.json()).ready===true;
        } catch { ready=false; }
        checkedAt=now();check=null;return ready;
      })();
      return check;
    },
    async step(pond, body) {
      const clean=cleanFlyInput(body);
      if (!clean) return {status:400,body:{error:'invalid neural input'}};
      if (!base) return {status:503,body:{error:'fly brain unavailable'}};
      const t=now(),h=Math.floor(t/3600000);
      if (h!==hour){hour=h;used=0;ponds.clear();}
      const limit=ponds.get(pond)||{n:0,at:-Infinity};
      if(active || used>=hourlyBudget || limit.n>=perPondBudget || t-limit.at<2000)
        return {status:429,body:{error:'resting between neural steps'}};
      active++;used++;limit.n++;limit.at=t;ponds.set(pond,limit);
      try {
        const r=await request(`${base}/step`,{method:'POST',signal:AbortSignal.timeout(7500),
          headers:{'Content-Type':'application/json'},body:JSON.stringify({session:`${pond}/${clean.creature}`,inputs:clean.inputs})});
        const result=r.ok ? cleanMotor(await r.json()) : null;
        if (!result) return {status:502,body:{error:'neural step interrupted'}};
        return {status:200,body:result};
      } catch { return {status:502,body:{error:'neural step interrupted'}}; }
      finally {active--;}
    },
  };
}
module.exports={cleanFlyInput,cleanMotor,createFlyBrainService};
