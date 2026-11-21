import assert from 'node:assert/strict';
import { activeGroups, createSceneV2, defaultSteps, downgradeSceneV2, notationTemplateVersion, reconcileSteps, validateScene } from '../src/scene-model.js';
import { buildDocumentScene, checkDocumentLayout } from '../src/scene.js';

const note = (id,pitch,labelMode='none') => ({id,kind:'note',notes:[{id:`${id}-n`,pitch}],labelMode,highlightNoteIds:[]});
const make = columns => {
  const scene=createSceneV2('note-selection');
  scene.templateVersion=3;
  scene.content={key:{tonic:'C',mode:'major'},columns};
  scene.steps=defaultSteps(scene);
  return scene;
};

const interval=make([note('c1','C4','count'),note('c2','G4','count')]);
interval.content.intervals=[{id:'i1',from:'c1-n',to:'c2-n'}];
interval.steps=defaultSteps(interval);
assert.equal(validateScene(interval).valid,true);
assert.equal(notationTemplateVersion(interval),3);
assert.equal(downgradeSceneV2(interval),null);
for(const portrait of [false,true]) {
  const scene=buildDocumentScene(interval,portrait);
  assert.equal(scene.descriptions.get('interval/i1'),'완전5도');
  assert.ok(scene.groups.get('interval/i1').some(item=>item.role==='bracket'));
  assert.equal(scene.descriptions.get('label/c1-n'),'1');
  assert.equal(scene.descriptions.get('label/c2-n'),'2');
}
const incorrect=structuredClone(interval);
incorrect.steps[0].groupIds.unshift('interval/i1');
incorrect.steps.at(-1).groupIds=incorrect.steps.at(-1).groupIds.filter(id=>id!=='interval/i1');
assert.equal(validateScene(incorrect).valid,false,'음정은 양쪽 음 뒤에 그린다');
for(const change of [scene=>scene.content.intervals[0].to='missing',scene=>scene.content.intervals[0].to='c1-n',scene=>scene.content.intervals.push(...Array.from({length:4},(_,i)=>({id:'extra'+i,from:'c1-n',to:'c2-n'})))]) {
  const invalid=structuredClone(interval);change(invalid);assert.equal(validateScene(invalid).valid,false);
}
const dyad=make([{id:'d',kind:'dyad',notes:[{id:'low',pitch:'E4'},{id:'high',pitch:'F4'}],labelMode:'none',highlightNoteIds:[],showName:true}]);
assert.equal(validateScene(dyad).valid,true);
const dyadDrawing=buildDocumentScene(dyad,false);
assert.equal(dyadDrawing.descriptions.get('name/d'),'단2도');
assert.equal(dyadDrawing.groups.get('name/d').some(item=>item.role==='bracket'),false);
const heads=dyadDrawing.items.filter(item=>item.role==='head');
assert.ok(heads[1].cx>heads[0].cx,'2도 위 음은 오른쪽으로 비킨다');
const reversed=structuredClone(dyad);reversed.content.columns[0].notes.reverse();
assert.equal(validateScene(reversed).valid,false);
const split=make([note('c','D5')]);
split.content.key={tonic:'D',mode:'major'};split.content.splitSignature=true;
split.steps=defaultSteps(split);
assert.ok(activeGroups(split).includes('key-signature/1'));
assert.ok(activeGroups(split).includes('key-signature/2'));
assert.equal(activeGroups(split).includes('key-signature'),false);
assert.equal(validateScene(split).valid,true);
assert.equal(buildDocumentScene(split,false).groups.get('key-signature/2').length,1);
const wrongSignature=structuredClone(split);
const groups=wrongSignature.steps[0].groupIds;
[groups[2],groups[3]]=[groups[3],groups[2]];
assert.equal(validateScene(wrongSignature).valid,false);
const signatureOnly=make([]);signatureOnly.templateVersion=2;signatureOnly.content.key={tonic:'F',mode:'major'};signatureOnly.steps=defaultSteps(signatureOnly);
assert.equal(validateScene(signatureOnly).valid,true,'조표 읽기 첫 장면에는 음표를 강제로 추가하지 않는다');
const gap=make([note('a','F5'),note('b','G#5')]);gap.content.key={tonic:'A',mode:'minor'};gap.content.showGaps=true;gap.steps=defaultSteps(gap);
assert.equal(validateScene(gap).valid,true);
assert.equal(buildDocumentScene(gap,false).descriptions.get('gap/b'),'1음 반');
gap.templateVersion=2;assert.equal(validateScene(gap).valid,false);
const source=make([note('a','C4')]);source.content.source={cardId:'interval',cardVersion:1,params:{key:'C:major',listen:true}};
assert.equal(validateScene(source).valid,true);
const sourceDrawing=buildDocumentScene(source,false);source.content.source.params.key='G:major';assert.deepEqual(buildDocumentScene(source,false).items,sourceDrawing.items,'출처 조건은 그림이나 소리에 영향을 주지 않는다');
source.content.source.params.nested={bad:true};assert.equal(validateScene(source).valid,false);
const plain=make([note('c','C4')]);plain.templateVersion=2;
assert.equal(notationTemplateVersion(plain),2);
assert.equal(validateScene(plain).valid,true);
plain.content.splitSignature=false;
assert.equal(validateScene(plain).valid,false,'이전 템플릿은 새 필드가 든 파일을 거절한다');
delete plain.content.splitSignature;
plain.content.key={tonic:'E',mode:'minor'};
assert.equal(validateScene(plain).valid,false,'새 단조는 판 3으로만 저장한다');
const before=make([note('a','C4'),note('b','E4')]);before.content.intervals=[{id:'i',from:'a-n',to:'b-n'}];before.steps=defaultSteps(before);
before.content.columns.pop();before.content.intervals=[];before.steps=reconcileSteps(before);
assert.equal(before.steps.some(step=>step.groupIds.includes('interval/i')),false);
const collision=make([note('a','F6'),note('b','G6')]);collision.question='높은 음의 간격을 함께 세어 볼까요?';collision.content.intervals=[{id:'high',from:'a-n',to:'b-n'}];collision.steps=defaultSteps(collision);
assert.ok(checkDocumentLayout(collision).errors.some(issue=>issue.field==='content.intervals'));
for(const field of ['columns','intervals','key','source'])for(const value of [null,{},5,'bad',[null]]){const broken=make([note('a','C4')]);broken.content[field]=value;assert.doesNotThrow(()=>validateScene(broken));}
console.log('Staff template v3 validation, interval rendering, numbering and compatibility passed.');
