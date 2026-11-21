import assert from 'node:assert/strict';
import { activeGroups, createSceneV2, defaultSteps, downgradeSceneV2, reconcileSteps, validateScene } from '../src/scene-model.js';
import { buildDocumentScene, checkDocumentLayout } from '../src/scene.js';
import { buildDiagramScene } from '../src/cards/diagram.js';

const wrap = raw => ({...createSceneV2('diagram'),...raw});
const diagrams=[];
for(const range of ['two','six'])for(const hairpins of [false,true])for(const listen of [false,true])diagrams.push(buildDiagramScene('dynamics',{range,hairpins,listen}));
for(const words of ['ko','italian'])for(const count of ['three','five'])for(const listen of [false,true])diagrams.push(buildDiagramScene('tempo',{words,count,listen}));
for(const form of ['binary','small-ternary','ternary','rondo','variation'])for(const subtitles of [false,true])for(const listen of [false,true])diagrams.push(buildDiagramScene('form',{form,subtitles,listen}));
assert.equal(diagrams.length,36);
for(const raw of diagrams) {
  const doc=wrap(raw);
  assert.equal(validateScene(doc).valid,true,JSON.stringify(validateScene(doc).errors));
  assert.equal(downgradeSceneV2(doc),null);
  assert.deepEqual(checkDocumentLayout(doc).errors,[]);
  for(const portrait of [false,true]){
    const drawing=buildDocumentScene(doc,portrait);
    assert.equal(drawing.diagramItems.length,doc.content.items.length);
    assert.equal(new Set(drawing.items.map(item=>item.groupId)).size,activeGroups(doc).length);
    assert.ok(drawing.items.every(item=>['line','glyph','text'].includes(item.type)));
    for(const item of drawing.items.filter(item=>item.groupId!=='caption')) {
      const ys=item.strokes?.flatMap(stroke=>stroke.pts.map(point=>point[1])) ?? [];
      assert.ok(ys.every(y=>y>=(portrait?172:168) && y<=(portrait?471:467)),`${doc.title} ${item.groupId} stays in the diagram body`);
    }
  }
}
for(const kind of ['sequence','ladder','line'])for(let count=2;count<=7;count++) {
  const doc=createSceneV2('diagram');doc.content={kind,items:Array.from({length:count},(_,index)=>({id:'b'+index,label:kind==='sequence'?'ABCDEF':'보통 빠르게',sub:'처음 가락',ink:index%2?'accent':'main'})),arrows:kind==='sequence',hairpins:kind==='ladder'?['up','down']:[]};doc.steps=defaultSteps(doc);
  assert.equal(validateScene(doc).valid,true);
  assert.deepEqual(checkDocumentLayout(doc).errors,[]);
  assert.deepEqual(checkDocumentLayout(doc).warnings,[]);
  for(const portrait of [false,true]){
    const drawing=buildDocumentScene(doc,portrait);
    for(const item of drawing.diagramItems)assert.ok(item.y0>=(portrait?173:169)&&item.y1<=(portrait?470:466));
  }
}
const arrow=createSceneV2('diagram');
const [first,second]=arrow.content.items;
arrow.steps=[{id:'all',label:'한 번에',advance:'manual',holdMs:0,groupIds:activeGroups(arrow)}];
assert.equal(validateScene(arrow).valid,true);
arrow.steps[0].groupIds.unshift(arrow.steps[0].groupIds.pop());
assert.equal(validateScene(arrow).valid,false,'화살표는 앞 상자와 대상 상자보다 먼저 그릴 수 없다');
const cue=createSceneV2('diagram');cue.steps.push({id:'listen',label:'듣기',advance:'manual',holdMs:0,groupIds:[],cue:{type:'listen',items:[first.id]}});
assert.equal(validateScene(cue).valid,false,'다른 장면 항목 참조는 거절한다');
cue.steps.at(-1).cue.items=[cue.content.items[0].id];assert.equal(validateScene(cue).valid,true);
cue.content.items.shift();cue.steps=reconcileSteps(cue);assert.equal(cue.steps.some(step=>step.cue),true);assert.equal(validateScene(cue).valid,false,'삭제된 듣기 대상은 초안에 남아 교사가 해결한다');
for(const change of [d=>d.content.items[0].id='bad/id',d=>d.content.items[0].label='일곱글자입니다',d=>d.content.items[0].level=0,d=>d.content.items[0].tempo=201,d=>d.content.phrases={A:'external-song'},d=>d.content.items.push(...Array.from({length:6},(_,i)=>({id:'extra'+i,label:'A',ink:'main'})))]) {
  const invalid=createSceneV2('diagram');change(invalid);assert.equal(validateScene(invalid).valid,false);
}
const ordered=createSceneV2('diagram');const answerOrder=ordered.content.items.map(item=>item.id);ordered.steps.push({id:'hear-order',label:'듣기',advance:'manual',holdMs:0,groupIds:[],cue:{type:'listen',items:answerOrder}});ordered.content.items.reverse();ordered.steps=reconcileSteps(ordered);assert.deepEqual(ordered.steps.at(-1).cue.items,answerOrder,'항목 이동은 듣기의 ID 순서를 바꾸지 않는다');
const missingPhrase=createSceneV2('diagram');delete missingPhrase.content.phrases;missingPhrase.steps.push({id:'hear',label:'듣기',advance:'manual',holdMs:0,groupIds:[],cue:{type:'listen',items:[missingPhrase.content.items[0].id]}});assert.equal(validateScene(missingPhrase).valid,false,'듣기에는 실제 내장 가락 참조가 필요하다');
console.log('Diagram model, semantic dependencies and 36 card layout combinations passed.');
