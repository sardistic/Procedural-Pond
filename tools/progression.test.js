"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function rig(){
  const c=vm.createContext({Math});
  for(const file of ['core','ecology','game','erosion','offerings'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',file+'.js'),'utf8'),c);
  return vm.runInContext(`({eta:tierEta,advance:advanceOfferingTime,hard:hardMode,hardPace:HARD_PACE,
    w:{days:10,opts:{speed:1,dayLength:180,life:true},game:{hard:false},erosion:{e:1,tier:0,pace:.002}}})`,c);
}
test('next-depth ETA matches the actual clock across speeds, Hard mode and expiring sun offerings',()=>{
  for(const hard of [false,true])for(const speed of [.25,1,3])for(const boostSeconds of [0,100,1000]){
    const R=rig(),w=R.w;w.opts.speed=speed;w.game.hard=hard;
    w.game.offerings={sunUntil:w.days+boostSeconds/w.opts.dayLength};
    const before=JSON.stringify(w),eta=R.eta(w);assert.equal(JSON.stringify(w),before,'reading ETA mutated game state');
    let elapsed=0;
    while(w.erosion.e<2&&elapsed<4000){
      R.advance(w,.01*speed*(R.hard(w)?R.hardPace:1),dt=>{w.days+=dt/w.opts.dayLength;w.erosion.e+=w.erosion.pace*dt;});elapsed+=.01;
    }
    assert.ok(Math.abs(elapsed-eta)<.011,`${hard}/${speed}/${boostSeconds}: measured ${elapsed}, ETA ${eta}`);
  }
});
test('no ticking estimate when paused, ecology disabled, speed stopped, pace invalid or final tier reached',()=>{
  const R=rig(),w=R.w;w.paused=true;assert.equal(R.eta(w),null);w.paused=false;
  w.opts.life=false;assert.equal(R.eta(w),null);w.opts.life=true;
  for(const speed of [0,-1,NaN,Infinity]){w.opts.speed=speed;assert.equal(R.eta(w),null);}w.opts.speed=1;
  for(const pace of [0,-1,NaN,Infinity]){w.erosion.pace=pace;assert.equal(R.eta(w),null);}w.erosion.pace=.002;
  w.erosion.e=2.01;assert.equal(R.eta(w),0);w.erosion.tier=999;assert.equal(R.eta(w),null);
});
test('observed ponds do not receive the owner-only sun acceleration',()=>{
  const R=rig(),w=R.w;w.game.offerings={sunUntil:20};assert.equal(R.eta(w),250);
  w.observe={id:'visitor'};assert.equal(R.eta(w),500);
});
