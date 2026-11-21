import assert from 'node:assert/strict';
import { generateCard, materializeCard, CARD_DEFINITIONS, MAJOR_KEY_OPTIONS, MINOR_KEY_OPTIONS, getCardParamOptions } from '../src/cards/index.js';
import { validateScene } from '../src/scene-model.js';
import { validateLesson } from '../src/lesson-model.js';
import { makeShareLink } from '../src/share-link.js';
import { parsePitch } from '../src/theory/pitch.js';

const boundary = { idPrefix: 'card-fixture', now: '2026-11-21T00:00:00.000Z', renderSeed: 314 };
const make = (id, options = {}) => materializeCard(generateCard(id, options), boundary);
const primary = ['names-and-solfege', 'major-scale', 'key-signature', 'primary-triads', 'dominant-cadence'];
let primaryScenes = 0;
for (const id of primary) for (const key of MAJOR_KEY_OPTIONS) {
  const options = { key: key.value };
  const raw = generateCard(id, options);
  assert.deepEqual(raw, generateCard(id, options), 'pure generation must be deterministic');
  assert.equal('id' in raw.scenes[0], false);
  assert.equal('createdAt' in raw.scenes[0], false);
  assert.equal('renderSeed' in raw.scenes[0], false);
  const result = make(id, options), scene = result.scenes[0];
  assert.equal(validateScene(scene).valid, true, `${id} ${key.value}`);
  assert.ok(scene.tags.includes('주제카드'));
  assert.ok(scene.steps.length <= 12);
  assert.equal(scene.templateVersion, 3);
  assert.equal(scene.content.source.cardId, id);
  assert.equal(result.review.status, '교사 검토 전');
  assert.ok(makeShareLink({ baseUrl: 'https://example.test/', scene }).length <= 4096, `${id} ${key.value} link`);
  const phaseOne = make(id, { ...options, includeSource: false }).scenes[0];
  assert.equal(phaseOne.templateVersion, 2);
  assert.equal(phaseOne.content.source, undefined);
  primaryScenes++;
}
assert.equal(primaryScenes, 75);
assert.deepEqual(primary.map(id => make(id).scenes[0].steps.length), [6, 8, 5, 7, 7]);
assert.equal(make('names-and-solfege', { key: 'A:major' }).scenes[0].content.columns[0].labelMode, 'movable-do');
assert.equal(make('names-and-solfege', { key: 'A:major', labels: 'both' }).scenes[0].content.columns[0].labelMode, 'both');
assert.equal(make('major-scale', { labels: 'none', practice: false }).scenes[0].steps.length, 6);

let lessons = 0, sceneCount = 0, signatureLessons = 0;
for (const id of primary) for (const key of MAJOR_KEY_OPTIONS) {
  if (id === 'key-signature' && key.value === 'C:major') continue;
  const result = make(id, { key: key.value, unit: 'lesson' });
  assert.equal(validateLesson(result.lesson, { sceneIds: result.scenes.map(s => s.id) }).valid, true);
  assert.equal(new Set(result.scenes.map(s => s.renderSeed)).size, 1);
  assert.ok(result.scenes.every(scene => validateScene(scene).valid));
  assert.ok(result.scenes.every(scene => !/[{}·]/.test(scene.caption)));
  if (id === 'key-signature') {
    signatureLessons++; assert.equal(result.scenes.length, 5);
    assert.equal(result.scenes[0].content.columns.length, 0);
    assert.deepEqual(result.scenes[0].steps[0].groupIds, ['staff', 'clef', 'key-signature', 'caption']);
  } else { lessons++; sceneCount += result.scenes.length; }
}
assert.equal(lessons, 60); assert.equal(sceneCount, 435); assert.equal(signatureLessons, 14);
assert.throws(() => generateCard('key-signature', { unit: 'lesson' }), /다장조/);
const gNames = make('names-and-solfege', { key: 'G:major', unit: 'lesson' });
assert.match(gNames.scenes[4].caption, /세 개 묶음에서 왼쪽 두 개 사이의 흰 건반/);
const dScale = make('major-scale', { key: 'D:major', unit: 'lesson' });
assert.match(dScale.scenes[2].caption, /바로 옆 건반/);
assert.ok(!dScale.scenes[2].caption.includes('검은 건반이 없어요'));

let minorCases = 0;
for (const form of ['natural', 'harmonic', 'melodic']) for (const key of MINOR_KEY_OPTIONS) {
  const unsupported = form !== 'natural' && ['G#:minor', 'D#:minor', 'A#:minor'].includes(key.value);
  if (unsupported) { assert.throws(() => make('minor-scale', { key: key.value, form }), /지원하지 않는 조합/); continue; }
  const result = make('minor-scale', { key: key.value, form });
  assert.equal(result.scenes[0].content.scaleType, form); minorCases++;
}
assert.equal(minorCases, 39);
assert.equal(getCardParamOptions('minor-scale', 'key', { form: 'natural' }).length, 15);
assert.equal(getCardParamOptions('minor-scale', 'key', { form: 'harmonic' }).length, 12);
const descending = make('minor-scale', { form: 'melodic', unit: 'lesson' });
assert.equal(descending.scenes.length, 2);
assert.deepEqual(descending.scenes[1].content.columns.map(c => c.notes[0].pitch), ['A5', 'G5', 'F5', 'E5', 'D5', 'C5', 'B4', 'A4']);
for (let degree = 2; degree <= 8; degree++) for (const presentation of ['sequential', 'simultaneous']) {
  const scene = make('interval', { degree, presentation }).scenes[0];
  assert.equal(scene.content.columns.length, presentation === 'sequential' ? degree : 1);
  assert.equal(scene.content.columns[0].kind, presentation === 'sequential' ? 'note' : 'dyad');
}
for (const key of MAJOR_KEY_OPTIONS) assert.equal(make('pentatonic', { key: key.value }).scenes[0].content.columns.length, 6);
const cadences = ['authentic', 'plagal', 'half', 'deceptive'];
for (const key of CARD_DEFINITIONS.find(c => c.id === 'cadences').params[0].options) for (const kind of cadences) {
  const scene = make('cadences', { key: key.value, kind }).scenes[0];
  const roots = scene.content.columns.map(c => parsePitch(c.notes[0].pitch).midi);
  assert.ok(Math.abs(roots[1] - roots[0]) <= 7, 'second chord uses nearest staff position');
}
assert.throws(() => generateCard('cadences', { kind: 'half', seventh: true }), /7음/);
assert.throws(() => generateCard('major-scale', { unknown: true }), /지원하지 않는 카드 조건/);
assert.throws(() => generateCard('missing'), /찾을 수/);
console.log(`Topic cards: ${primaryScenes} primary scenes, ${lessons} lessons / ${sceneCount} scenes, ${signatureLessons} signature lessons, ${minorCases} minor scales passed.`);
