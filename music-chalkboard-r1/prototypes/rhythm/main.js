import {BoardAudio} from '../../src/audio/engine.js';
import {SvgRenderer} from '../../src/render-svg.js';
import {CanvasRenderer} from '../../src/render-canvas.js';
import {buildRhythmPrototypeScene,buildRhythmSymbolCatalog} from '../../src/rhythm/prototype-render.js';
import {rhythmTimeline} from '../../src/theory/rhythm.js';
import {createTimelineScheduler} from '../../src/rhythm/scheduler.js';

const $=id=>document.getElementById(id),audio=new BoardAudio();
const samples={
  simple:{staff:'line',meter:{beats:4,unit:4},tempo:80,measures:[0,1].map(m=>({id:'m'+m,events:['q','e','e','q','e','e'].map((value,index)=>({id:`n${m}-${index}`,kind:'note',value}))})),show:{counts:true,strength:false,names:false}},
  compound:{staff:'line',meter:{beats:6,unit:8},tempo:80,measures:[0,1].map(m=>({id:'m'+m,events:Array.from({length:6},(_,index)=>({id:`n${m}-${index}`,kind:'note',value:'e'}))})),show:{counts:true,strength:true,names:false}},
  ties:{staff:'line',meter:{beats:4,unit:4},tempo:80,measures:[0,1].map(m=>({id:'m'+m,events:[{id:'n'+m+'a',kind:'note',value:'h',tie:true},{id:'n'+m+'b',kind:'note',value:'h'}]})),show:{counts:true,strength:false,names:false}},
};
let scene,renderer,drawing=false,drawAt=0,elapsed=0,frame=0,lastFrame=0,intervals=[],cursorLags=[],currentCursor=null;
const state={frames:intervals,cursorLags,drawing:false,playing:false,pausedByVisibility:false};
window.rhythmPrototypeState=state;
const scheduler=createTimelineScheduler(audio,{onCursor(cursor){
  currentCursor=cursor;positionCursor();
  if(cursor)cursorLags.push(Math.max(0,(audio.currentTime-scheduler.startTime-cursor.at)*1000));
},onEnd(){state.playing=false;$('status').textContent='듣기를 마쳤어요.';}});
function positionCursor(){const marker=$('cursor'),position=currentCursor&&scene?.positions[currentCursor.eventId];marker.hidden=!position;if(position){marker.style.left=100*(position.x-position.width/2)/scene.W+'%';marker.style.top=100*position.y/scene.H+'%';marker.style.width=100*position.width/scene.W+'%';}}
function currentContent(){return {...samples[$('sample').value==='catalog'?'simple':$('sample').value],tempo:Number($('tempo').value)};}
function render(){
  const board=$('board'),portrait=board.clientWidth<600;
  scene=$('sample').value==='catalog'?buildRhythmSymbolCatalog({portrait}):buildRhythmPrototypeScene(currentContent(),{portrait});
  board.style.aspectRatio=scene.W+'/'+scene.H;
  const white=$('theme').value==='white',theme={style:white?'marker':'chalk',ink:{main:white?'#151515':'#fff',accent:white?'#a13721':'#ffd873',dim:white?'#666':'#b9cabd'}};
  board.dataset.theme=$('theme').value;renderer?.destroy();
  renderer=$('method').value==='canvas'?new CanvasRenderer($('ink'),scene,theme,board.clientWidth):new SvgRenderer($('ink'),scene,theme);
  paint();positionCursor();state.writeDuration=scene.total;state.symbols=scene.items.filter(i=>i.type==='line').map(i=>i.role);$('duration').textContent=scene.total.toFixed(2)+'초';
}
function paint(){for(const item of scene.items){const progress=Math.max(0,Math.min(1,(elapsed-item.start)/(item.end-item.start)));if(item.type==='text')renderer.setPart({item,si:0},progress);else item.strokes.forEach((_,si)=>renderer.setPart({item,si},progress));}}
function stop(){drawing=false;state.drawing=false;state.playing=false;scheduler.stop();cancelAnimationFrame(frame);lastFrame=0;$('status').textContent='멈췄어요. 다시 누르면 처음부터 시작해요.';}
function loop(now){
  if(drawing){if(lastFrame)intervals.push(now-lastFrame);lastFrame=now;elapsed=(now-drawAt)/1000;paint();if(elapsed>=scene.total){drawing=false;state.drawing=false;$('status').textContent='판서를 마쳤어요. 판서 중에는 소리를 내지 않아요.';}}
  scheduler.tick();state.playing=scheduler.active;if(drawing||scheduler.active)frame=requestAnimationFrame(loop);
}
$('write').addEventListener('click',()=>{stop();elapsed=0;render();drawing=true;state.drawing=true;state.pausedByVisibility=false;drawAt=performance.now();intervals.length=0;frame=requestAnimationFrame(loop);$('status').textContent='리듬을 쓰고 있어요.';});
$('listen').addEventListener('click',async()=>{stop();if(!$('tempo').checkValidity()){$('status').textContent='빠르기는 40부터 200 사이의 정수로 넣어 주세요.';return;}if($('sample').value==='catalog'){$('status').textContent='리듬 두 마디를 고른 뒤 들어 보세요.';return;}if(!await audio.unlockFromGesture()){$('status').textContent='이 브라우저에서 소리를 시작할 수 없어요.';return;}elapsed=1e6;render();cursorLags.length=0;scheduler.start(rhythmTimeline(currentContent(),{countIn:$('countIn').checked,click:$('click').checked}));state.playing=true;state.pausedByVisibility=false;frame=requestAnimationFrame(loop);$('status').textContent='박에 맞춰 듣고 있어요.';});
$('stop').addEventListener('click',stop);
$('complete').addEventListener('click',()=>{stop();elapsed=1e6;render();$('status').textContent='완성된 리듬이에요.';});
$('sample').addEventListener('change',()=>{stop();elapsed=1e6;render();});
for(const id of ['method','theme'])$(id).addEventListener('change',render);
$('tempo').addEventListener('change',()=>{stop();if(!$('tempo').checkValidity()){$('status').textContent='빠르기는 40부터 200 사이의 정수로 넣어 주세요.';return;}render();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();state.pausedByVisibility=true;$('status').textContent='화면을 떠나서 멈췄어요. 돌아와도 자동으로 시작하지 않아요.';}});
new ResizeObserver(()=>{render();}).observe($('board'));
elapsed=1e6;render();
