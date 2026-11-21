import assert from 'node:assert/strict';
import {DIAGRAM_CARD_DEFINITIONS,generateDiagramCard} from '../src/cards/diagram.js';
import {buildDiagramTimeline} from '../src/rhythm/diagram-audio.js';
const combinations=params=>params.reduce((all,p)=>all.flatMap(v=>(p.type==='boolean'?[false,true]:p.options.map(o=>o.value)).map(option=>({...v,[p.id]:option}))),[{}]);
let count=0;
for(const definition of DIAGRAM_CARD_DEFINITIONS)for(const options of combinations(definition.params)){
  const result=generateDiagramCard(definition.id,options),scene=result.scenes[0];count++;
  assert.equal(scene.templateId,'diagram');assert.equal(scene.templateVersion,1);
  assert.ok(scene.steps.length<=12);assert.ok(scene.content.items.length>=2&&scene.content.items.length<=7);
  assert.ok(scene.content.items.every(i=>i.label.length<=(scene.content.kind==='sequence'?6:12)&&i.sub.length<=12));
  assert.equal(new Set(scene.steps.flatMap(s=>s.groupIds)).size,scene.steps.flatMap(s=>s.groupIds).length);
  assert.equal(scene.steps.filter(s=>s.cue).length,options.listen?1:0);
  assert.deepEqual(result,generateDiagramCard(definition.id,options),'generation is pure and deterministic');
  if(options.listen)assert.equal(buildDiagramTimeline(scene,scene.steps.at(-1).cue).cursors.length,scene.content.items.length);
}
assert.equal(count,36);
assert.throws(()=>generateDiagramCard('form',{form:'unknown'}),/조건/);
console.log(`도식 카드 ${count}개 조건 조합·단계·소리·순수성 시험 통과`);
