'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function rig() {
  const c = vm.createContext({ Math, logEvent() {} });
  for (const name of ['core', 'game', 'erosion', 'offerings']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), c);
  return vm.runInContext(`({w:{days:10,seed:'test',inst:'owner',opts:{dayLength:180},game:{...newGame(),pearls:10000,points:30000,inv:{build:1000},invested:1000},erosion:{e:0,acc:0,tier:0}},
    available:offeringsAvailable, tick:updateOfferings, quote:offeringQuote, buy:makeOffering, rate:offeringTimeRate,
    advance:advanceOfferingTime, clean:cleanOfferings, dividend:dividendOf, tension:offeringTension})`, c);
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
test('wealth and low reinvestment gates unlock permanently; observers do not mutate', () => {
  const R = rig(), w = R.w;
  w.game.pearls = 4999; w.game.points = 1000; assert.equal(R.available(w), false);
  w.game.pearls = 5000; assert.equal(R.available(w), true);
  w.observe = {}; R.tick(w, 1); assert.equal(w.game.offerings, undefined);
  w.observe = null; R.tick(w, 1); w.game.pearls = 0; assert.equal(R.available(w), true);
  delete w.game.offerings; w.game.pearls = 1000; w.game.points = 25000; w.game.invested = 6250;
  assert.equal(R.available(w), false); w.game.invested--; assert.equal(R.available(w), true);
  w.game.pearls = 999; assert.equal(R.available(w), false);
});
test('percentage burns have no refund, score, essence, corruption or investment credit', () => {
  const R = rig(), w = R.w;
  const before = JSON.stringify({points:w.game.points,inv:w.game.inv,invested:w.game.invested,essence:w.game.essence});
  assert.equal(R.buy(w, 'sun'), true); assert.equal(w.game.pearls, 8500);
  assert.equal(w.game.offerings.sacrificed, 1500); assert.equal(w.game.offerings.anger, 28);
  assert.equal(JSON.stringify({points:w.game.points,inv:w.game.inv,invested:w.game.invested,essence:w.game.essence}), before);
  assert.equal(w.game.corruption, undefined); assert.equal(R.buy(w, 'sun'), false);
  assert.equal(R.quote(w, 'deep').cost, 1700);
  w.game.pearls = 5000.75; assert.equal(R.quote(w, 'sun').cost, 751);
  w.game.offerings.sunUntil = 0; w.game.pearls = 749; assert.equal(R.buy(w, 'sun'), false);
  assert.equal(R.buy(w, 'unknown'), false);
  assert.equal(R.buy(w, 'toString'), false); assert.equal(R.buy(w, '__proto__'), false);
  assert.equal(w.game.pearls, 749);
});
test('deep offerings respect the next edge and daily cooldown; ecology pause guards spending', () => {
  const R = rig(), w = R.w;
  // Points erosion is already accounted for by a settled pond.
  w.game.points = 0; w.erosion.e = 1.95; w.erosion.acc = 1.95;
  assert.equal(R.buy(w, 'deep'), true); near(w.erosion.acc, 2);
  near(w.erosion.parts.offerings, .05); assert.equal(R.buy(w, 'deep'), false);
  w.days++; assert.equal(R.buy(w, 'deep'), false); // pending tier still cannot be skipped
  w.erosion.tier = 1; w.erosion.e = 2;
  assert.equal(R.buy(w, 'deep'), true); near(w.erosion.acc, 2.24);
  w.days++; w.opts.life = false; assert.equal(R.buy(w, 'deep'), false);
});
test('anger affects actual dividends and local tension, fades, and can be appeased', () => {
  const R = rig(), w = R.w;
  w.game.offerings = {unlocked:true,anger:100};
  near(R.dividend(w)[0], 26); near(R.dividend(w)[1], 26/25);
  w.W = 2; w.H = 1; w.depth = new Uint8Array([0,255]);
  near(R.tension(w,0,0), .06); near(R.tension(w,1,0), .30);
  R.tick(w, 180); near(w.game.offerings.anger, 97);
  assert.equal(R.buy(w,'soothe'), true); near(w.game.offerings.anger, 72);
  w.game.offerings.anger = 2; assert.equal(R.buy(w,'soothe'), true); near(w.game.offerings.anger, 0);
  assert.equal(R.buy(w,'soothe'), false); near(R.dividend(w)[0],40);
  w.observe = {}; const before = JSON.stringify(w.game);
  assert.equal(R.buy(w, 'sun'), false); R.tick(w,180); assert.equal(JSON.stringify(w.game), before);
});
test('hastened time advances every subsystem with bounded steps and exact expiry', () => {
  const R = rig(), w = R.w; R.buy(w,'sun'); const start = w.days;
  let seconds = 0, calls = [];
  const step = dt => { calls.push(dt); seconds += dt; w.days += dt / 180; R.tick(w,dt); };
  R.advance(w, .15, step); near(seconds,.30); near(w.days,start+.30/180);
  assert.ok(calls.every(dt=>dt<=.05+1e-9)); near(w.game.offerings.anger,28-.30/180*3);
  w.game.offerings.sunUntil = w.days + .04/180; seconds = 0; calls = [];
  R.advance(w,.10,step); near(seconds,.12); assert.equal(R.rate(w),1);
  seconds = 0; R.advance(w,.10,step); near(seconds,.10);
  w.observe = {}; w.game.offerings.sunUntil = w.days+3; assert.equal(R.rate(w),1);
  seconds = 0; R.advance(w,NaN,step); R.advance(w,-1,step); near(seconds,0);
});
test('saved ritual data is bounded and malformed values cannot poison the economy', () => {
  const R = rig();
  const S = R.clean({unlocked:true,anger:Infinity,sunUntil:-1,deepReady:'99',count:2.8,sacrificed:NaN,other:'ignored'});
  assert.equal(S.unlocked,true); assert.equal(S.anger,0); assert.equal(S.sunUntil,0);
  assert.equal(S.deepReady,0); assert.equal(S.count,2); assert.equal(S.sacrificed,0); assert.equal(S.other,undefined);
  assert.equal(R.clean({anger:999}).anger,100);
});
