import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { openSceneStorage } from '../src/scene-storage.js';
import { createSceneV2 } from '../src/scene-model.js';
import { createLesson } from '../src/lesson-model.js';

const storage = await openSceneStorage();
const a = createSceneV2(), b = createSceneV2();
const lesson = createLesson({sceneIds:[a.id,b.id]});
const result = await storage.saveGeneratedLesson([a,b],lesson);
assert.deepEqual(result.lesson.sceneIds,[a.id,b.id]);
assert.deepEqual((await storage.listScenes()).map(s=>s.id),[a.id,b.id]);
assert.ok((await storage.listScenes()).every(s=>s.revision===1 && s.origin==='user' && !s.importInfo));

// The first add succeeds inside the transaction; a later collision must roll it back.
const c = createSceneV2();
const collision = createLesson({sceneIds:[c.id,a.id]});
const before = await storage.listSceneSnapshot();
await assert.rejects(storage.saveGeneratedLesson([c,a],collision));
assert.equal(await storage.getScene(c.id),undefined);
assert.deepEqual((await storage.listLessons()).map(l=>l.id),[lesson.id]);
assert.equal((await storage.listSceneSnapshot()).orderRevision,before.orderRevision);
assert.deepEqual((await storage.listScenes()).map(s=>s.id),[a.id,b.id]);

const d = createSceneV2();
const lessonCollision = {...lesson,sceneIds:[d.id]};
await assert.rejects(storage.saveGeneratedLesson([d],lessonCollision));
assert.equal(await storage.getScene(d.id),undefined);
assert.equal((await storage.listSceneSnapshot()).orderRevision,before.orderRevision);
await assert.rejects(storage.saveGeneratedLesson([d],createLesson({sceneIds:[a.id]})),/장면|수업/);
assert.equal(await storage.getScene(d.id),undefined);
storage.close();
console.log('주제 카드 수업의 장면·수업·순서 원자 저장 및 충돌 전체 되돌리기 시험 통과');
