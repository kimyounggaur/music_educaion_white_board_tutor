import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { CARD_DEFINITIONS,generateCard,materializeCard } from '../src/cards/index.js';
import { makeDraftPackage,recoverImportedDraft,makeScenePackage,validatePackage,openSceneStorage } from '../src/scene-storage.js';
import { makeShareLink,readShareLink } from '../src/share-link.js';
import { reconcileSteps } from '../src/scene-model.js';

const store=await openSceneStorage();
const keys=['title','tags','question','caption','templateId','templateVersion','content','steps'];
for(const card of CARD_DEFINITIONS){
  const {scenes:[scene]}=materializeCard(generateCard(card.id),{idPrefix:card.id,now:'2026-11-21T00:00:00.000Z',renderSeed:91});
  const draft={draftId:card.id,sceneId:null,baseRevision:null,editorVersion:2,updatedAt:scene.updatedAt,
    formData:Object.fromEntries(keys.map(key=>[key,structuredClone(scene[key])]))};
  await store.saveDraft(draft);
  const reread=await store.getDraft(card.id);
  assert.deepEqual(reread.formData,draft.formData);
  const recovered=recoverImportedDraft(makeDraftPackage(draft),'receiver');
  assert.deepEqual(recovered.formData,draft.formData);
  assert.deepEqual(validatePackage(makeScenePackage([scene])).scenes[0],scene);
  const url=makeShareLink({baseUrl:'https://classroom.example/',scene});
  assert.ok(url.includes('#mwb-card1='));
  const restored=readShareLink(url);
  assert.deepEqual(restored.scenes[0].content,scene.content);
  assert.deepEqual(restored.scenes[0].steps,scene.steps);
  const edited={...scene,question:'함께 들어 보세요.'};
  edited.steps=reconcileSteps(edited);
  const contentLink=makeShareLink({baseUrl:'https://classroom.example/',scene:edited});
  assert.ok(contentLink.includes('#mwb1='),'교사 수정은 추천 카드로 대체하지 않습니다.');
  assert.equal(readShareLink(contentLink).scenes[0].question,edited.question);
}
const invalid=await store.getDraft('interval');
invalid.formData.content.source.params={nested:{not:'primitive'}};
await assert.rejects(store.saveDraft(invalid),/초안/);
store.close();
console.log('주제 카드 13종의 초안·백업·추천 링크·교사 수정 내용 왕복 시험 통과');
