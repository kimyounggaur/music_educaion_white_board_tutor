import assert from 'node:assert/strict';
import { activeGroups, validateScene } from '../src/scene-model.js';
import { validateLesson } from '../src/lesson-model.js';
import {
  builtInLessons, builtInLessonScenes, builtInLessonReview, builtInLessonStageMap,
} from '../src/lessons/index.js';

const bySceneId = new Map(builtInLessonScenes.map(scene => [scene.id, scene]));
const stages = id => builtInLessons.find(lesson => lesson.id === `builtin:lesson-${id}`).sceneIds.map(sceneId => bySceneId.get(sceneId));
const fourth = stages('dominant-seventh-cadence');
const triads = stages('c-major-triads');
const scale = stages('c-major-scale');
const names = stages('names-and-solfege');

assert.equal(bySceneId.size, 29);
assert.deepEqual(builtInLessons.map(lesson => lesson.sceneIds.length), [7, 6, 9, 7]);
for (const lesson of builtInLessons) {
  assert.equal(validateLesson(lesson, { sceneIds: bySceneId.keys() }).valid, true, lesson.title);
  assert.equal(builtInLessonReview[lesson.id].author, 'AI');
  assert.equal(builtInLessonReview[lesson.id].status, '교사 검토 전');

  assert.deepEqual(builtInLessonStageMap[lesson.id], lesson.sceneIds.map((sceneId, index) => {
    const scene = bySceneId.get(sceneId);
    assert.equal(validateScene(scene).valid, true, scene.caption);
    assert.ok(!/[{}]/.test(scene.caption), scene.caption);
    assert.deepEqual(scene.steps[0].groupIds, activeGroups(scene));
    return { sourceStep: index + 1, sceneId, stepId: scene.steps[0].id };
  }));
}

const cue = scene => scene.steps[0].cue;
const pitches = column => column.notes.map(note => note.pitch);
assert.deepEqual(cue(fourth[3]).targets.map(target => target.columnId), ['dom7', 'tonic']);
assert.equal(fourth[1].content.columns.some(column => column.id === 'dom'), false);
assert.deepEqual(fourth[1].content.columns.map(pitches), [['G4', 'B4', 'D5', 'F5']]);
assert.deepEqual(fourth[2].content.columns[0].highlightNoteIds, ['dom7-2', 'dom7-4']);
assert.deepEqual(triads[7].content.columns.map(pitches), [
  ['C4', 'E4', 'G4'], ['F4', 'A4', 'C5'], ['G4', 'B4', 'D5'],
]);
assert.equal(scale[1].content.showGaps, true);
assert.equal(cue(scale[5]).order, 'sequential');
assert.deepEqual(cue(scale[5]).columnIds, [
  'scale-1', 'scale-2', 'scale-3', 'scale-4', 'scale-5', 'scale-6', 'scale-7', 'scale-8',
]);
assert.match(names[3].caption, /다장조에서는 도는 다, 레는 라/);
assert.deepEqual(cue(names[5]).columnIds, ['scale-5']);
assert.deepEqual(cue(names[6]).columnIds, ['scale-3']);

console.log('Built-in lessons and 29 teaching steps passed.');
