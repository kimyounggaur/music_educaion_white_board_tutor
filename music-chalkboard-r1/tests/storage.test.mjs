import assert from 'node:assert/strict';
import { createScene } from '../src/scene-model.js';
import { makeScenePackage, validatePackage, makeDraftPackage, recoverImportedDraft, reconcileSceneOrder } from '../src/scene-storage.js';

const scene = createScene('chord-stack');
const backup = makeScenePackage([scene]);
assert.equal(validatePackage(JSON.stringify(backup)).scenes[0].id, scene.id);
assert.deepEqual(reconcileSceneOrder(['b', 'b', 'missing'], [{id:'a'}, {id:'b'}]), ['b', 'a']);
assert.throws(() => validatePackage({...backup, scenes:[scene, scene]}), /중복/);
assert.throws(() => validatePackage({...backup, version:2}), /지원하지/);
assert.throws(() => validatePackage({...backup, lessons:[{}]}), /지원하지/);
assert.throws(() => validatePackage({...backup, sceneOrder:['missing']}), /순서/);
assert.throws(() => validatePackage(JSON.stringify({...backup, unknown:{constructor:'bad'}})), /허용되지/);
const draft = {draftId:'draft', sceneId:scene.id, baseRevision:1, editorVersion:1, updatedAt:new Date().toISOString(), clientId:'tab', formData:Object.fromEntries(['title','tags','question','caption','templateId','templateVersion','content','steps'].map(k=>[k,structuredClone(scene[k])]))};
draft.formData.title='';
const draftBackup = makeDraftPackage(draft);
assert.equal(draftBackup.draft.clientId, undefined);
const recovered = recoverImportedDraft(draftBackup, 'new-tab');
assert.equal(recovered.sceneId, null);
assert.equal(recovered.baseRevision, null);
assert.equal(recovered.clientId, 'new-tab');
assert.notEqual(recovered.draftId, draft.draftId);
assert.throws(() => makeDraftPackage({...draft, formData:{unknown:'x'}}), /초안/);
for (const change of [
  form=>{form.templateId='nonsense';}, form=>{form.content={};}, form=>{form.tags=null;},
  form=>{form.steps=[{id:'s',label:'',groupIds:[null],advance:'manual',holdMs:0}];},
  form=>{form.steps[0].advance='mystery';}, form=>{form.content.notes=[{id:'n',pitch:{}}];}
]) { const bad=structuredClone(draft); change(bad.formData); assert.throws(()=>makeDraftPackage(bad), /초안/); }
for (const count of [0,2,4]) {
  const malformed=structuredClone(draft);
  malformed.formData.content.notes=Array.from({length:count},(_,index)=>({id:`note-${index}`,pitch:'C4'}));
  assert.throws(()=>makeDraftPackage(malformed), /화음/, `${count}개 음으로 구성된 화음 초안은 복구 전에 거부합니다`);
}
const forged=structuredClone(draftBackup); forged.draft.formData.templateId='nonsense';
assert.throws(()=>validatePackage(forged), /초안/, '불완전 초안 패키지는 가져오기 전에 거부합니다');
const partial=structuredClone(draft); partial.formData.content.notes[0].pitch='';
partial.formData.steps[0].groupIds=['unknown/reference']; partial.formData.steps[0].label='';
assert.doesNotThrow(()=>makeDraftPackage(partial),'미완성 내용과 임시 단계 참조는 보존합니다');
for(const template of ['note-selection','text-explanation']) {
 const sample=createScene(template), data=Object.fromEntries(['title','tags','question','caption','templateId','templateVersion','content','steps'].map(k=>[k,structuredClone(sample[k])]));
 assert.doesNotThrow(()=>makeDraftPackage({...draft,formData:data}));
 const malformed=structuredClone(data); if(template==='note-selection') malformed.content.highlightNoteIds=null; else malformed.content.blocks=[{id:'b',text:'',ink:{}}];
 assert.throws(()=>makeDraftPackage({...draft,formData:malformed}), /초안/);
}
console.log('storage package tests passed');
