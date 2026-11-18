import assert from 'node:assert/strict';
import { activeGroups, createScene, createSceneV2, defaultSteps, downgradeSceneV2, reconcileSteps, upgradeDraftV1, upgradeSceneV1, validateScene } from '../src/scene-model.js';
import { createPracticePlan, judgePracticeTap, startPractice } from '../src/practice.js';
import { describeChord, formatNoteLabel } from '../src/theory/korean.js';
import { diatonicIndex, midiToFrequency, parsePitch } from '../src/theory/pitch.js';
import { accidentalEvents, keySignatureAccidentals, MAJOR_KEY_TONICS, majorScale, scaleInKey } from '../src/theory/scale.js';

function note(id, pitch, labelMode = 'none') {
  return { id, kind: 'note', notes: [{ id: `${id}-pitch`, pitch }], labelMode, highlightNoteIds: [] };
}

function chord(id, pitches) {
  return {
    id, kind: 'chord', notes: pitches.map((pitch, index) => ({ id: `${id}-${index}`, pitch })),
    labelMode: 'none', highlightNoteIds: [], showName: true, showRoman: true,
  };
}

function sceneWith(columns, key = { tonic: 'C', mode: 'major' }) {
  const scene = createSceneV2('note-selection');
  scene.content = { key, columns };
  scene.steps = defaultSteps(scene);
  return scene;
}

for (const template of ['chord-stack', 'note-selection', 'text-explanation']) {
  const original = createScene(template);
  const newer = upgradeSceneV1(original);
  assert.equal(newer.schemaVersion, 2);
  assert.equal(validateScene(newer).valid, true);
  assert.deepEqual(newer.steps, original.steps);
  assert.deepEqual(new Set(activeGroups(newer)), new Set(activeGroups(original)));
  assert.deepEqual(downgradeSceneV2(newer), original);
  assert.equal(validateScene(createSceneV2(template)).valid, true);
}

const inaccurate = createScene();
inaccurate.content.preset = 'custom';
inaccurate.content.roman = '';
inaccurate.content.notes.forEach((note, index) => note.pitch = ['D4', 'F4', 'A4'][index]);
inaccurate.steps = reconcileSteps(inaccurate);
const migrated = upgradeSceneV1(inaccurate);
assert.equal(validateScene(migrated).valid, true);
assert.ok(validateScene(migrated).warnings.some(warning => warning.message.includes('이전 이름')));
assert.equal(migrated.content.columns[0].legacyName, '으뜸화음');
assert.equal(describeChord(migrated.content.columns[0], migrated.content.key).name, '레·파·라 · 검토 필요');
assert.deepEqual(migrated.steps, inaccurate.steps);

const draftForm = {
  templateId: inaccurate.templateId, templateVersion: 1, content: inaccurate.content,
  steps: inaccurate.steps, title: '', tags: [], question: '', caption: '',
};
const draft = { editorVersion: 1, draftId: 'example', sceneId: inaccurate.id, baseRevision: 1, formData: draftForm };
const nextDraft = upgradeDraftV1(draft);
assert.equal(nextDraft.editorVersion, 2);
assert.equal(nextDraft.baseRevision, draft.baseRevision);
assert.equal(nextDraft.formData.title, '');
assert.deepEqual(nextDraft.formData.steps, draft.formData.steps);
assert.equal(draft.editorVersion, 1);

for (const tonic of MAJOR_KEY_TONICS) {
  const scale = majorScale(tonic);
  assert.deepEqual(scale.slice(1).map((pitch, index) => pitch.midi - scale[index].midi), [2, 2, 1, 2, 2, 2, 1]);
  assert.ok(scale.every(pitch => Math.abs(pitch.acc) <= 1));
}
assert.deepEqual(scaleInKey({ tonic: 'A', mode: 'minor' }).map(pitch => pitch.letter), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'A']);
assert.equal(keySignatureAccidentals('G').F, 1);
assert.equal(keySignatureAccidentals('F').B, -1);
assert.equal(parsePitch('Bb4').midi, 70);
assert.equal(parsePitch('F#4').midi, parsePitch('Gb4').midi);
assert.notEqual(diatonicIndex(parsePitch('F#4')), diatonicIndex(parsePitch('Gb4')));
assert.equal(midiToFrequency(69), 440);
assert.equal(formatNoteLabel('F#4', 'movable-do', { tonic: 'G', mode: 'major' }), '시');
assert.equal(formatNoteLabel('F#4', 'movable-do'), '');
assert.equal(formatNoteLabel('Bb4', 'both', { tonic: 'F', mode: 'major' }), '파 · 내림나');

const major = { tonic: 'G', mode: 'major' };
const withAccidentals = sceneWith([note('initial', 'F#4'), note('cancel', 'F4'), note('again', 'F4'), note('restored', 'F#4'), note('kept', 'F#4')], major);
const events = accidentalEvents(withAccidentals.content.columns, major);
assert.equal(events.get('initial-pitch').accidental, null);
assert.equal(events.get('cancel-pitch').accidental, '♮');
assert.equal(events.get('again-pitch').dependency, 'cancel-pitch');
assert.equal(events.get('restored-pitch').accidental, '♯');
assert.equal(events.get('kept-pitch').dependency, 'restored-pitch');
assert.equal(validateScene(withAccidentals).valid, true);
assert.equal(downgradeSceneV2(withAccidentals), null);
const notesStep = withAccidentals.steps.find(step => step.groupIds.includes('note/kept-pitch'));
notesStep.groupIds.unshift(notesStep.groupIds.pop());
assert.ok(validateScene(withAccidentals).errors.some(error => error.message.includes('restored-pitch')));

const subject = sceneWith([
  chord('V7', ['G4', 'B4', 'D5', 'F5']),
  chord('I', ['C5', 'E5', 'G5']),
]);
assert.deepEqual(describeChord(subject.content.columns[0], subject.content.key), { name: '딸림7화음', roman: 'V7', warning: '' });
assert.ok(activeGroups(subject).includes('name/V7'));
assert.equal(validateScene(subject).valid, true);
const keyStep = { id: 'try', label: '해보기', groupIds: [], advance: 'manual', holdMs: 0,
  cue: { type: 'practice', order: 'free', keyboard: { from: 'C4', to: 'G5' }, columnIds: ['V7'] } };
subject.steps.push(keyStep);
assert.equal(validateScene(subject).valid, true);
const practice = createPracticePlan(subject, keyStep.cue);
let progress = startPractice(practice);
progress = judgePracticeTap(practice, progress, 67);
progress = judgePracticeTap(practice, progress, 79);
assert.equal(progress.nextIndex, 1);
progress = judgePracticeTap(practice, progress, 60);
assert.equal(progress.nextIndex, 1);
assert.equal(progress.tone, 'bad');
for (const midi of [71, 74, 65]) progress = judgePracticeTap(practice, progress, midi);
assert.equal(progress.done, true);

const ascending = sceneWith(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'].map((pitch, i) => note(`scale-${i}`, pitch)));
const sequenceCue = { type: 'practice', order: 'sequential', keyboard: { from: 'C4', to: 'C5' },
  columnIds: ascending.content.columns.map(column => column.id) };
const scalePlan = createPracticePlan(ascending, sequenceCue);
let sequence = startPractice(scalePlan);
assert.equal(sequence.total, 8);
sequence = judgePracticeTap(scalePlan, sequence, 62);
assert.equal(sequence.nextIndex, 0);
for (const midi of [60, 62, 64, 65, 67, 69, 71, 72]) sequence = judgePracticeTap(scalePlan, sequence, midi);
assert.equal(sequence.done, true);

subject.steps.at(-1).cue.columnIds = ['missing'];
assert.equal(validateScene(subject).valid, false);
subject.steps = reconcileSteps(subject);
assert.equal(validateScene(subject).valid, true);
assert.equal(subject.steps.some(step => step.cue), false);

const unsupported = sceneWith([chord('ii', ['D4', 'F4', 'A4'])]);
assert.equal(validateScene(unsupported).valid, true);
assert.equal(validateScene(unsupported).warnings.length, 1);
unsupported.content.columns[0].chordName = '으뜸화음';
assert.equal(validateScene(unsupported).valid, false);
console.log('Notation v2, migration, theory, and keyboard practice tests passed.');
