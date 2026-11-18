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
// Dependencies also apply within a merged step; unrelated teacher-chosen order is preserved.
const merged = structuredClone(chord);
const all = merged.steps.flatMap(step => step.groupIds);
merged.steps = [{...merged.steps[0], groupIds:all}];
assert.equal(validateScene(merged).valid,true);
const reversedStaff = structuredClone(merged);
const staff = reversedStaff.steps[0].groupIds.indexOf('staff'), clef = reversedStaff.steps[0].groupIds.indexOf('clef');
[reversedStaff.steps[0].groupIds[staff],reversedStaff.steps[0].groupIds[clef]]=[reversedStaff.steps[0].groupIds[clef],reversedStaff.steps[0].groupIds[staff]];
assert.ok(validateScene(reversedStaff).errors.some(e=>e.message.includes('clef')&&e.message.includes('staff')));
const reversedNote = structuredClone(merged), noteId=`note/${reversedNote.content.notes[0].id}`;
let noteIndex=reversedNote.steps[0].groupIds.indexOf(noteId), staffIndex=reversedNote.steps[0].groupIds.indexOf('staff');
[reversedNote.steps[0].groupIds[noteIndex],reversedNote.steps[0].groupIds[staffIndex]]=[reversedNote.steps[0].groupIds[staffIndex],reversedNote.steps[0].groupIds[noteIndex]];
assert.equal(validateScene(reversedNote).valid,false);
const emphasisFirst=structuredClone(merged), emphasisIndex=emphasisFirst.steps[0].groupIds.indexOf('emphasis/chord');
noteIndex=emphasisFirst.steps[0].groupIds.indexOf(noteId);
[emphasisFirst.steps[0].groupIds[emphasisIndex],emphasisFirst.steps[0].groupIds[noteIndex]]=[emphasisFirst.steps[0].groupIds[noteIndex],emphasisFirst.steps[0].groupIds[emphasisIndex]];
assert.equal(validateScene(emphasisFirst).valid,false);
const duplicated = structuredClone(chord); duplicated.steps[0].groupIds.push(duplicated.steps[1].groupIds[0]);
assert.equal(validateScene(duplicated).valid, false);
const missing = structuredClone(chord); missing.steps[1].groupIds.pop();
assert.equal(validateScene(missing).valid, false);
const malformed = structuredClone(chord); malformed.question = {}; malformed.content.notes = 'invalid'; malformed.content.chordName = 3;
assert.doesNotThrow(() => validateScene(malformed));
assert.equal(validateScene(malformed).valid, false);
const noteScene = createScene('note-selection');
const mixedNotes=structuredClone(noteScene);
mixedNotes.steps=[{...mixedNotes.steps[0],groupIds:mixedNotes.steps.flatMap(s=>s.groupIds)}];
assert.equal(validateScene(mixedNotes).valid,true);
const invalidLabel=structuredClone(mixedNotes), target=invalidLabel.content.notes[0].id;
const positions=invalidLabel.steps[0].groupIds, labelIndex=positions.indexOf(`label/${target}`), targetIndex=positions.indexOf(`note/${target}`);
[positions[labelIndex],positions[targetIndex]]=[positions[targetIndex],positions[labelIndex]];
assert.equal(validateScene(invalidLabel).valid,false,'계이름은 같은 단계에서도 대상 음표 다음에 표시해야 합니다');
const oldSteps = structuredClone(noteScene.steps);
const added = {id:'extra-note',pitch:'C5'}; noteScene.content.notes.push(added);
noteScene.steps = reconcileSteps(noteScene);
assert.ok(noteScene.steps.some(s => s.groupIds.includes('note/extra-note')));
assert.ok(noteScene.steps.some(s => s.groupIds.includes('label/extra-note')));
assert.equal(validateScene(noteScene).valid, true);
assert.ok(oldSteps.every(s => !s.groupIds.includes('note/extra-note')));
// Adding a highlight must not place it in an old emphasis step before the new note.
const split = createScene('note-selection'), originalNote=split.content.notes[0].id;
split.content.highlightNoteIds=[originalNote];
const splitIds=split.content.notes.map(n=>n.id);
split.steps=[
 {...split.steps[0], id:'staff-step',groupIds:['staff','clef']},
 {...split.steps[0], id:'first-step',groupIds:[`note/${splitIds[0]}`,`label/${splitIds[0]}`,`emphasis/${splitIds[0]}`]},
 {...split.steps[0], id:'other-step',groupIds:splitIds.slice(1).flatMap(id=>[`note/${id}`,`label/${id}`])},
];
assert.equal(validateScene(split).valid,true);
const oldOrder=split.steps.map(s=>({id:s.id,groups:[...s.groupIds]}));
split.content.notes.push({id:'newly-added',pitch:'C5'});split.content.highlightNoteIds.push('newly-added');
split.steps=reconcileSteps(split);
assert.equal(validateScene(split).valid,true,'새 강조는 새 음표보다 뒤에 있어야 합니다');
for(const before of oldOrder){const after=split.steps.find(s=>s.id===before.id);assert.deepEqual(after.groupIds.filter(g=>!g.includes('newly-added')),before.groups,'기존 그룹 순서를 유지해야 합니다');}
const reinstated=structuredClone(split); const beforeRemove=reinstated.steps.find(s=>s.groupIds.includes('staff'));
beforeRemove.groupIds=beforeRemove.groupIds.filter(g=>g!=='staff');
reinstated.steps=reconcileSteps(reinstated);
assert.equal(validateScene(reinstated).valid,true,'누락된 오선을 음자리표 앞에 복원해야 합니다');
const text = createScene('text-explanation'); text.content.blocks.push({id:'new',text:'두 번째 내용',ink:'accent'}); text.steps = reconcileSteps(text);
assert.ok(text.steps.some(s => s.groupIds.includes('body/new')));
assert.equal(validateScene(text).valid, true);
console.log('scene model tests passed');
