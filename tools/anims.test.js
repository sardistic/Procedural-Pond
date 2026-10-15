'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function rig() {
  const context = vm.createContext({ world: { t: 0 }, Math });
  for (const name of ['core', 'anims']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', name + '.js'), 'utf8'), context);
  return vm.runInContext(`({
    c:{x:0,y:0,z:0,heading:0,body:new Chain(0,0,0,Array(63).fill(3.2),Array(64).fill(7.2),Math.PI/12)},
    play:playAnim, bend:animBend, restore:animUnbend, pose:animPose, world, duration:ANIM_DUR,
  })`, context);
}
const points = (c) => Array.from(c.body.x, (x, i) => [x, c.body.y[i]]);
const distance = (a, b) => Math.max(...a.map((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1])));
function frame(R, time, heading = 0) {
  R.world.t = time;
  R.c.body.place(0, 0, heading);
  const base = points(R.c);
  const bent = R.bend(R.c, time);
  const shown = points(R.c);
  if (bent) R.restore(R.c);
  assert.equal(distance(base, points(R.c)), 0, 'Render pose leaked into the physical chain');
  return {base,shown,offset:shown.map((p,i)=>[p[0]-base[i][0],p[1]-base[i][1]])};
}

test('a long swimmer keeps its attack coil side as its swimming heading crosses the target', () => {
  const R=rig();
  R.play(R.world,R.c,'attack',0.16);
  R.c.anim.side=-1;
  const t=R.c.anim.dur*0.24;
  const before=frame(R,t,0.009),after=frame(R,t,0.011);
  const jump=distance(before.offset,after.offset);
  assert.ok(jump<1,`Coil direction changed mid-strike: ${jump.toFixed(3)} world pixels`);
});

for (const kind of ['attack','eat','hit','flee']) test(`${kind} enters and leaves the swimming pose continuously`, () => {
  const R=rig();R.play(R.world,R.c,kind,0.7);
  const dur=R.c.anim.dur;
  const start=frame(R,0),end=frame(R,dur*(1-1e-8));
  assert.ok(distance(start.base,start.shown)<1e-5,`Start snaps by ${distance(start.base,start.shown).toFixed(3)} pixels`);
  assert.ok(distance(end.base,end.shown)<1e-4,`End snaps by ${distance(end.base,end.shown).toFixed(3)} pixels`);
});

test('flee has no pose step between tail-flick and recovery', () => {
  const R=rig();R.play(R.world,R.c,'flee',0);
  const d=R.c.anim.dur;
  const a=frame(R,d*(0.38-1e-7)),b=frame(R,d*(0.38+1e-7));
  assert.ok(distance(a.shown,b.shown)<0.001,`Phase transition jumps ${distance(a.shown,b.shown).toFixed(3)} pixels`);
});

test('repeated contacts cannot restart an attack or meal during recovery', () => {
  for (const kind of ['attack','eat']) {
    const R=rig();R.play(R.world,R.c,kind,0.3);const action=R.c.anim;
    R.world.t=action.dur*0.7;R.play(R.world,R.c,kind,-0.3);
    assert.equal(R.c.anim,action,`${kind} restarted before its recovery completed`);
  }
});

test('rapid feeding cannot replace an active strike with a new meal pose', () => {
  const R=rig();R.play(R.world,R.c,'attack',0.3);const action=R.c.anim;
  R.world.t=action.dur*0.6;R.play(R.world,R.c,'eat',-0.3);
  assert.equal(R.c.anim,action,'Meal interrupted an active attack');
});

test('turning past the angle wrap cannot snap the head aim', () => {
  const R=rig();R.play(R.world,R.c,'attack',Math.PI-0.001);
  const t=R.c.anim.dur*0.42;
  const a=frame(R,t,0.001),b=frame(R,t,-0.001);
  assert.ok(distance(a.offset,b.offset)<1,'Head aim flipped at the angle wrap');
});

test('non-spine attack and hit poses return to the base position', () => {
  const R=rig();R.c.body=null;R.c.R=8;
  for (const kind of ['attack','hit','eat','flee']) {
    R.c.anim=null;R.world.t=0;R.play(R.world,R.c,kind,0.3);
    const p=R.pose(R.c,R.c.anim.dur*(1-1e-8));
    assert.ok(Math.hypot(p.dx,p.dy)<1e-5 && Math.abs(p.sa-1)<1e-5 && Math.abs(p.sb-1)<1e-5,`${kind} leaves a pose offset`);
  }
});
