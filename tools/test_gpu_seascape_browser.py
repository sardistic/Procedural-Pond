"""Verify GPU scene transfer, orientation, panning, photo and failure fallbacks."""
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
class Server(ThreadingHTTPServer):
    request_queue_size=128
def run():
    server=Server(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)));Thread(target=server.serve_forever,daemon=True).start()
    try:
      with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True,args=['--mute-audio','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        try:
          page=browser.new_page(viewport={'width':1000,'height':740});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
          page.route('**/api/**',lambda r:r.fulfill(json={}));page.route('https://analytics.sardistic.com/**',lambda r:r.abort())
          page.add_init_script("localStorage.setItem('pond.skipEntry','1');localStorage.setItem('procedural-pond.opts',JSON.stringify({v:5,world:'small',habitat:'mixed',light:'night',renderer:'gpu',waves:'sdf',volumetrics:false}))")
          page.goto(f'http://127.0.0.1:{server.server_port}/index.html');page.wait_for_function("()=>typeof world!=='undefined'&&!!world.game&&!document.getElementById('entry')",timeout=60000)
          result=page.evaluate('''()=>{
            world.noSave=true;world.paused=true;setHud(false);closeWindows();view.glide=null;cam.follow=null;cam.tour=false;world.glints=[];
            world.structures.push(makeStructure('lantern',world,360,200,777));bakeBackground(world);
            const check=(v,m)=>{if(!v)throw Error(m)},baseCompose=Raster.prototype.compose,baseSea=drawSeascape;
            let cpu=0,args=null;Raster.prototype.compose=function(...a){cpu++;return baseCompose.apply(this,a)};
            drawSeascape=function(...a){args=a;return baseSea(...a)};
            const results=[];
            try{
              for(const [rotation,x,y,k] of [[0,360,200,2],[1,170,180,3],[2,560,250,2],[3,360,380,3]]){
                view.r=rotation;view.k=k;centerOn(x,y);const before=cpu;render();
                check(cpu===before,'Main scene still composed on CPU');check(SDF_GPU.sceneGPU&&!CGL.cv.hidden,'GPU scene transfer not active');
                check(CGL.x===SDF_GPU.x&&CGL.y===SDF_GPU.y&&CGL.W===SDF_GPU.W&&CGL.H===SDF_GPU.H,'Tiles disagree');
                const G=CGL,S=SDF_GPU,src=new Uint8Array(G.W*G.H*4),gpu=new Uint8Array(src.length),cpuSea=new Uint8Array(src.length);
                G.gl.readPixels(0,0,G.W,G.H,G.gl.RGBA,G.gl.UNSIGNED_BYTE,src);S.gl.readPixels(0,0,S.W,S.H,S.gl.RGBA,S.gl.UNSIGNED_BYTE,gpu);
                // Compare the cropped light texture against a full-world upload,
                // using the same real shader, raster, lights and sampling uniforms.
                const gl=G.gl,M=world.lightMap,full=new Float32Array(M.lw*M.lh*4),reference=new Uint8Array(src.length);
                for(let i=0;i<M.lw*M.lh;i++)full.set(M.data.subarray(i*3,i*3+3),i*4);
                cglPlain(gl,G,'t_light',M.lw,M.lh,gl.RGBA32F,gl.RGBA,gl.FLOAT,full);gl.useProgram(G.prog);
                gl.uniform2i(gl.getUniformLocation(G.prog,'u_lorg'),0,0);gl.uniform2i(gl.getUniformLocation(G.prog,'u_lsize'),M.lw,M.lh);
                gl.bindBuffer(gl.ARRAY_BUFFER,G.quad);gl.enableVertexAttribArray(G.qloc);gl.vertexAttribPointer(G.qloc,2,gl.FLOAT,false,0,0);gl.drawArrays(gl.TRIANGLES,0,3);
                gl.readPixels(0,0,G.W,G.H,gl.RGBA,gl.UNSIGNED_BYTE,reference);
                let lightError=0;for(let i=0;i<src.length;i++)lightError=Math.max(lightError,Math.abs(src[i]-reference[i]));
                check(lightError===0,'Cropped lighting changed scene colors: '+lightError);
                check(G.lbuf.length<=(Math.ceil(G.W/4)+3)*(Math.ceil(G.H/4)+3)*4,'Light upload scales with whole pond');
                const img=new ImageData(world.W,world.H);
                for(let row=0;row<G.H;row++)img.data.set(src.subarray((G.H-1-row)*G.W*4,(G.H-row)*G.W*4),((G.y+row)*world.W+G.x)*4);
                // Wake decay uses real time, even while paused. Reuse the same
                // wake texture for the reference so only scene transport differs.
                const wake=seaState;seaState=()=>S.state;
                try{check(baseSea(world,args[1],args[2],img),'CPU reference upload failed');}finally{seaState=wake;}
                S.gl.readPixels(0,0,S.W,S.H,S.gl.RGBA,S.gl.UNSIGNED_BYTE,cpuSea);
                let max=0,different=0;for(let i=0;i<gpu.length;i++){const d=Math.abs(gpu[i]-cpuSea[i]);max=Math.max(max,d);if(d>1)different++;}
                check(max<=1,`GPU scene upload orientation/color differs at rotation ${rotation}: max ${max}, ${different} channels`);
                check(!G.gl.getError()&&!S.gl.getError(),'WebGL error');results.push({rotation,pixels:G.W*G.H,maxChannelError:max,lightError});
              }
              world.opts.renderer='cpu';let before=cpu;render();check(cpu>before&&!SDF_GPU.sceneGPU&&CGL.cv.hidden,'CPU setting did not restore CPU scene');
              world.opts.renderer='gpu';before=cpu;render(true);check(cpu>before&&!SDF_GPU.sceneGPU,'Full-pond photo did not use CPU image');
              world.bones=true;before=cpu;render();check(cpu>before&&!SDF_GPU.sceneGPU,'Bones did not use CPU');world.bones=false;
              CGL.failed=true;before=cpu;render();check(cpu>before&&!SDF_GPU.sceneGPU,'GPU failure did not fall back');CGL.failed=false;
              SDF_GPU.failed=true;render();check(!CGL.cv.hidden&&SDF_GPU.cv.hidden,'Failed water covered the pond');SDF_GPU.failed=false;
              render();check(SDF_GPU.sceneGPU,'GPU scene did not resume');
            }finally{Raster.prototype.compose=baseCompose;drawSeascape=baseSea;}
            return {views:results,cpuFallback:true,photo:true,bones:true,failedContexts:true};
          }''')
          page.set_viewport_size({'width':390,'height':844})
          page.evaluate('''()=>{view.r=0;view.k=3;centerOn(world.W/2,world.H*.6);render();if(!SDF_GPU.sceneGPU||VOL.failed)throw Error('Phone GPU scene failed');}''')
          assert not errors,errors
          (ROOT/'dist').mkdir(exist_ok=True);page.screenshot(path=str(ROOT/'dist/gpu-seascape-phone.png'))
          print(json.dumps({**result,'phone':True,'errors':errors},indent=2))
        finally:browser.close()
    finally:server.shutdown();server.server_close()
if __name__=='__main__':run()
