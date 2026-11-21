import assert from 'node:assert/strict';
import {buildRhythmPrototypeScene,buildRhythmSymbolCatalog,rhythmSymbol} from '../src/rhythm/prototype-render.js';
import {stemDirection} from '../src/theory/rhythm.js';
const content={staff:'line',meter:{beats:4,unit:4},tempo:80,measures:[0,1].map(m=>({id:'m'+m,events:['q','e','e','q','e','e'].map((value,i)=>({id:m+'e'+i,kind:'note',value}))})),show:{counts:true,strength:false,names:false}};
for(const portrait of [false,true]){
  const scene=buildRhythmPrototypeScene(content,{portrait});
  assert.ok(scene.total<8,`two measures plan is ${scene.total}s`);
  assert.equal(Object.keys(scene.positions).length,12);
  assert.ok(scene.items.filter(i=>i.type==='line').every(i=>i.strokes.every(s=>s.pts.every(([x,y])=>x>=0&&x<=scene.W&&y>scene.H*.1&&y<scene.H))), 'all strokes fit below signature');
  const catalog=buildRhythmSymbolCatalog({portrait});
  assert.ok(['head','head-filled','stem','flag','rest-block','rest-q','rest-e','rest-s'].every(role=>catalog.items.some(i=>i.role===role)));
  assert.ok(catalog.items.filter(i=>i.type==='line').every(i=>i.strokes.every(s=>s.pts.every(([x,y])=>x>=0&&x<=catalog.W&&y>=0&&y<=catalog.H))));
}
const whole=rhythmSymbol({kind:'rest',value:'w'},0,0,1)[0],half=rhythmSymbol({kind:'rest',value:'h'},0,0,1)[0];
assert.ok(whole.points[0][1]>0&&half.points[0][1]<0,'whole rests hang below, half rests sit above the line');
assert.equal(stemDirection('A4'),'up');assert.equal(stemDirection('B4'),'down');assert.equal(stemDirection('C5'),'down');
assert.equal(stemDirection('A4',['C4','B4']),'up');
const overflow={...content,measures:Array.from({length:4},(_,m)=>({id:'m'+m,events:Array.from({length:8},(_,i)=>({id:m+'-'+i,kind:'note',value:'e'}))}))};
assert.throws(()=>buildRhythmPrototypeScene(overflow,{portrait:true}),/나누어/);
console.log('리듬 기호·두 방향 배치·8초 계획·넘침 시험 통과');
