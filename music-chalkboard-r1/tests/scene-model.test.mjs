import assert from 'node:assert/strict';
import { createScene, activeGroups, defaultSteps, reconcileSteps, validateScene, CHORD_PRESETS } from '../src/scene-model.js';

for (const template of ['chord-stack', 'note-selection', 'text-explanation']) {
  const scene = createScene(template);
  assert.deepEqual(validateScene(scene), { valid: true, errors: [] });
  assert.deepEqual(new Set(scene.steps.flatMap(s => s.groupIds)), new Set(activeGroups(scene)));
  assert.notEqual(defaultSteps(scene)[0].id, scene.steps[0].id);
}
const chord = createScene('chord-stack');
assert.deepEqual(CHORD_PRESETS['C-major-IV'].pitches, ['F4', 'A4', 'C5']);
const badPitch = structuredClone(chord); badPitch.content.notes[1].pitch = 'C#4';
assert.equal(validateScene(badPitch).valid, false);
const wrongSpacing = structuredClone(chord); wrongSpacing.content.preset = 'custom'; wrongSpacing.content.roman = ''; wrongSpacing.content.notes[1].pitch = 'D4';
assert.equal(validateScene(wrongSpacing).valid, false);
const wrongOrder = structuredClone(chord); wrongOrder.steps.reverse();
assert.equal(validateScene(wrongOrder).valid, false);
const duplicated = structuredClone(chord); duplicated.steps[0].groupIds.push(duplicated.steps[1].groupIds[0]);
assert.equal(validateScene(duplicated).valid, false);
const missing = structuredClone(chord); missing.steps[1].groupIds.pop();
assert.equal(validateScene(missing).valid, false);
const malformed = structuredClone(chord); malformed.question = {}; malformed.content.notes = 'invalid'; malformed.content.chordName = 3;
assert.doesNotThrow(() => validateScene(malformed));
assert.equal(validateScene(malformed).valid, false);
const noteScene = createScene('note-selection');
const oldSteps = structuredClone(noteScene.steps);
const added = {id:'extra-note',pitch:'C5'}; noteScene.content.notes.push(added);
noteScene.steps = reconcileSteps(noteScene);
assert.ok(noteScene.steps.some(s => s.groupIds.includes('note/extra-note')));
assert.ok(noteScene.steps.some(s => s.groupIds.includes('label/extra-note')));
assert.equal(validateScene(noteScene).valid, true);
assert.ok(oldSteps.every(s => !s.groupIds.includes('note/extra-note')));
const text = createScene('text-explanation'); text.content.blocks.push({id:'new',text:'두 번째 내용',ink:'accent'}); text.steps = reconcileSteps(text);
assert.ok(text.steps.some(s => s.groupIds.includes('body/new')));
assert.equal(validateScene(text).valid, true);
console.log('scene model tests passed');
