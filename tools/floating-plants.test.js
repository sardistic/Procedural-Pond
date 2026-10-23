'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
function rig(wave = [0, 0]) {
  const context = vm.createContext({ waveOrbit: () => wave, FADE: new Uint8Array(65536) });
  for (const file of ['core', 'raster', 'creatures', 'plants', 'scene']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file + '.js'), 'utf8'), context);
  return vm.runInContext(`({make:(kind,w,x,y)=>kind==='lily'?new LilyPad(w,x,y):new Duckweed(x,y),
    w:{W:480,H:270,current:{x:0,y:0},shore:null}})`, context);
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('open-water motion retains current, wave orbit, individual drift and lily spin', () => {
  for (const kind of ['lily', 'duckweed']) {
    const R = rig([.2, -.1]), w = R.w, p = R.make(kind,w,240,135);
    w.current = {x:-.25,y:.15}; p.vx=.1; p.vy=-.2;
    const angle=p.ang, scale=kind==='lily'?1.5:3;
    p.update(.05,w);
    near(p.x,240+(-.25*scale+.1+.2)*.05);near(p.y,135+(.15*scale-.2-.1)*.05);
    near(p.vx,.1);near(p.vy,-.2);
    if(kind==='lily')near(p.ang,angle+p.spin*.05);
  }
});

test('saved plants already pinned at any edge escape a stronger persistent current', () => {
  for (const kind of ['lily','duckweed']) for (const [axis,dir] of [['x',-1],['x',1],['y',-1],['y',1]]) {
    const R=rig(),w=R.w,p=R.make(kind,w,240,135),margin=kind==='lily'?p.r:10,size=axis==='x'?w.W:w.H;
    w.current[axis]=dir*.5;p.vx=0;p.vy=0;p[axis]=dir<0?margin:size-margin;
    for(let i=0;i<600;i++)p.update(.05,w);
    const distance=dir<0?p[axis]-margin:size-margin-p[axis];
    assert.ok(distance>10,`${kind} pinned at ${axis}/${dir}: ${distance}`);
  }
});

test('wave-only corner impacts and a changing current stay finite and inside all boundaries', () => {
  for (const kind of ['lily','duckweed']) {
    const wave=[-1.5,-1.2],R=rig(wave),w=R.w,p=R.make(kind,w,0,0),m=kind==='lily'?p.r:10;
    p.vx=0;p.vy=0;
    for(let i=0;i<24000;i++) {
      if(i===200)assert.ok(p.x>m+10&&p.y>m+10,'Wave pinned raft');
      if(i>200){w.current.x=Math.cos(i*.003)*.7;w.current.y=Math.sin(i*.004)*.7;}
      p.update(i%2?.05:.15,w);
      assert.ok(Number.isFinite(p.vx)&&Number.isFinite(p.vy));
      assert.ok(p.x>=m&&p.x<=w.W-m&&p.y>=m&&p.y<=w.H-m);
    }
  }
});

test('shore correction cannot leave a plant outside the pond', () => {
  const R=rig(),w=R.w;
  // A locally flat dry patch uses the shoreline normal fallback.
  for (const kind of ['lily','duckweed']) {
    const p=R.make(kind,w,0,135),m=kind==='lily'?p.r:10;
    w.shore=new Uint8Array(w.W*w.H).fill(255);w.tide={level:0};w.shoreN=[1,0];
    p.x=m;p.vx=0;p.vy=0;
    p.update(.15,w);
    assert.ok(p.x>=m&&p.x<=w.W-m&&p.y>=m&&p.y<=w.H-m);
  }
});
