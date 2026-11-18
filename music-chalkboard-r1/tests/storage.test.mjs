import assert from 'node:assert/strict';
import { createScene, createSceneV2, defaultSteps } from '../src/scene-model.js';
import { makeScenePackage, validatePackage, makeDraftPackage, recoverImportedDraft, reconcileSceneOrder } from '../src/scene-storage.js';
import { createLesson } from '../src/lesson-model.js';
import { makeShareLink, readShareLink, MAX_SHARE_URL_CHARS } from '../src/share-link.js';

const scene = createScene('chord-stack');
const backup = makeScenePackage([scene]);
assert.equal(validatePackage(JSON.stringify(backup)).scenes[0].id, scene.id);
assert.deepEqual(reconcileSceneOrder(['b', 'b', 'missing'], [{id:'a'}, {id:'b'}]), ['b', 'a']);
assert.throws(() => validatePackage({...backup, scenes:[scene, scene]}), /중복/);
assert.throws(() => validatePackage({...backup, version:3}), /지원하지/);
assert.equal(validatePackage({...backup, version:2}).version,2);
assert.throws(() => validatePackage({...backup, lessons:[{}]}), /지원하지/);
assert.throws(() => validatePackage({...backup, sceneOrder:['missing']}), /순서/);
assert.throws(() => validatePackage(JSON.stringify({...backup, unknown:{constructor:'bad'}})), /허용되지/);
const modern = createSceneV2('note-selection');
const settings = {viewOptions:{hand:'auto',effects:'simple'},soundEnabled:false};
assert.equal(makeScenePackage([modern], {settings}).version,2);
assert.equal(makeScenePackage([modern], {version:1}).scenes[0].schemaVersion,1);
assert.throws(() => makeScenePackage([modern], {version:1,settings}), /보기 설정/);
const builtinId = 'builtin:lesson-scene';
const builtinOnly = createLesson({sceneIds:[builtinId]});
assert.throws(() => makeScenePackage([], {lessons:[builtinOnly]}), /찾을 수 없습니다/);
assert.equal(makeScenePackage([], {lessons:[builtinOnly], builtinSceneIds:[builtinId]}).version,2);
const draft = {draftId:'draft', sceneId:scene.id, baseRevision:1, editorVersion:1, updatedAt:new Date().toISOString(), clientId:'tab', formData:Object.fromEntries(['title','tags','question','caption','templateId','templateVersion','content','steps'].map(k=>[k,structuredClone(scene[k])]))};
draft.formData.title='';
const draftBackup = makeDraftPackage(draft);
assert.equal(draftBackup.draft.clientId, undefined);
const recovered = recoverImportedDraft(draftBackup, 'new-tab');
assert.equal(recovered.editorVersion,2);
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
const upgradedPartial = recoverImportedDraft(makeDraftPackage(partial));
assert.equal(upgradedPartial.formData.content.columns[0].notes[0].pitch,'');
assert.equal(makeDraftPackage(upgradedPartial).version,2);
const missingNote = structuredClone(upgradedPartial);
missingNote.formData.content.columns[0].notes.pop();
assert.throws(() => makeDraftPackage(missingNote), /악보/);
const practice = structuredClone(upgradedPartial);
practice.formData.steps[0].cue = {
  type:'practice', order:'free', keyboard:{from:'C4',to:'G5',labelMode:'fixed-do'}, columnIds:['pending'],
};
assert.doesNotThrow(() => makeDraftPackage(practice));
practice.formData.steps[0].cue.keyboard.newField = true;
assert.throws(() => makeDraftPackage(practice), /초안/);
for(const template of ['note-selection','text-explanation']) {
 const sample=createScene(template), data=Object.fromEntries(['title','tags','question','caption','templateId','templateVersion','content','steps'].map(k=>[k,structuredClone(sample[k])]));
 assert.doesNotThrow(()=>makeDraftPackage({...draft,formData:data}));
 const malformed=structuredClone(data); if(template==='note-selection') malformed.content.highlightNoteIds=null; else malformed.content.blocks=[{id:'b',text:'',ink:{}}];
 assert.throws(()=>makeDraftPackage({...draft,formData:malformed}), /초안/);
}

const baseUrl = 'https://classroom.example/board?ignored=true#original';
const shared = {...scene, title:'도·미·솔 공유', question:'첫 줄\n둘째 줄'};
shared.steps = defaultSteps(shared);
const link = makeShareLink({scene:shared, baseUrl});
assert.ok(link.startsWith('https://classroom.example/board#mwb1='));
const received = readShareLink(link);
assert.equal(received.kind,'scene');
assert.equal(received.scenes[0].question,shared.question);
assert.deepEqual(received.scenes[0].steps,shared.steps);
assert.notEqual(received.scenes[0].id,shared.id);
assert.equal(readShareLink(makeShareLink({baseUrl,scene:modern})).scenes[0].schemaVersion,2);
const text = createScene('text-explanation');
const lesson = createLesson({title:'두 장면으로 배우기', sceneIds:[text.id,shared.id]});
const lessonShare = readShareLink(makeShareLink({baseUrl,lesson,scenes:[shared,text]}));
assert.deepEqual(lessonShare.scenes.map(item=>item.title),[text.title,shared.title]);
assert.deepEqual(lessonShare.lesson.sceneIds,lessonShare.scenes.map(item=>item.id));
assert.equal(lessonShare.bundle.version,2);
assert.equal(readShareLink('https://classroom.example/#normal'),null);
assert.throws(() => readShareLink(link.slice(0,-3)), /공유 링크/);
assert.throws(() => readShareLink('#mwb8=YWJj'), /공유 링크/);
assert.throws(() => readShareLink('#mwb1=' + 'a'.repeat(MAX_SHARE_URL_CHARS)), /길이/);
assert.throws(() => makeShareLink({scene:shared,baseUrl:'file:///tmp/index.html'}), /HTTPS/);
const veryLongUrl = 'https://classroom.example/' + 'a'.repeat(MAX_SHARE_URL_CHARS - 25);
assert.throws(() => makeShareLink({scene:shared,baseUrl:veryLongUrl}), /길이/);
const longLessonScenes = Array.from({length:8}, (_, index) => ({...modern,id:`many-${index}`}));
const longLesson = createLesson({sceneIds:longLessonScenes.map(item => item.id)});
assert.throws(() => makeShareLink({baseUrl,lesson:longLesson,scenes:longLessonScenes}), /길이/);
console.log('storage package tests passed');
