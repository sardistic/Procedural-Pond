'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function rig(){const c=vm.createContext({Math});for(const name of ['core','depths'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',name+'.js'),'utf8'),c);return vm.runInContext('({splat,occluders,lightMap})',c);}
test('huge lights write only their visible tile, with identical falloff inside it',()=>{
  const R=rig(),M={lw:1000,lh:1000,data:new Float32Array(3000000),any:false},rect=[800,900,880,980];
  const x=2000,y=2000,radius=3000,k=.8,col=0xff947332;
  R.splat(M,x,y,radius,col,k,0,0,rect);
  let writes=0;
  for(let gy=0;gy<M.lh;gy++)for(let gx=0;gx<M.lw;gx++){
    const i=(gx+gy*M.lw)*3,lit=M.data[i];if(!lit)continue;writes++;
    assert.ok(gx>=200&&gx<=220&&gy>=225&&gy<=245,'Light leaked outside its requested tile');
    const dx=gx*4+2-x,dy=gy*4+2-y,f=(1-(dx*dx+dy*dy)/(radius*radius))**2*k;
    assert.ok(Math.abs(lit-(col&255)/255*f)<1e-7);
  }
  assert.equal(writes,21*21);assert.equal(M.any,true);
});
test('offscreen lamps do not build an unused occlusion map',()=>{
  const R=rig(),w={W:400,H:400,raster:{zBase:new Float32Array(160000),z:new Float32Array(160000),id:new Uint16Array(160000)}},M=R.lightMap(w);
  M.occWorld=w;M.occRect=[0,0,40,40];M.occReady=false;
  R.splat(M,350,350,20,0xffffffff,1,0,0,[0,0,40,40],8);
  assert.equal(M.occReady,false);assert.equal(M.occ,undefined);assert.equal(M.any,false);
  R.splat(M,20,20,20,0xffffffff,1,0,0,[0,0,40,40],8);
  assert.equal(M.occReady,true);assert.ok(M.occ);assert.equal(M.any,true);
});
test('beams and clipped lights preserve the original per-cell values',()=>{
  const R=rig(),A={lw:128,lh:128,data:new Float32Array(128*128*3)},B={lw:128,lh:128,data:new Float32Array(128*128*3)},rect=[77,91,167,183];
  for(const args of [[90,95,40,0xffcc6a35,.7,.4,2.4],[160,175,6,0xff49caff,1,1.7,0]]){R.splat(A,...args,[0,0,511,511]);R.splat(B,...args,rect);}
  for(let y=Math.floor(rect[1]/4);y<=Math.ceil(rect[3]/4);y++)for(let x=Math.floor(rect[0]/4);x<=Math.ceil(rect[2]/4);x++)for(let c=0;c<3;c++)assert.equal(A.data[(x+y*128)*3+c],B.data[(x+y*128)*3+c]);
});
