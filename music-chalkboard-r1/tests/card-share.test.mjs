import assert from 'node:assert/strict';
import { generateCard, materializeCard } from '../src/cards/index.js';
import { cardShareDescriptor, makeCardShareLink, readCardShareLink, CARD_LINK_PREFIX } from '../src/cards/share.js';

const make = (id, options = {}) => materializeCard(generateCard(id, options), { idPrefix: 'share-fixture', now: '2026-11-21T00:00:00.000Z', renderSeed: 230 });
const bundle = make('major-scale', { key: 'Eb:major', unit: 'lesson' });
const selected = { lesson: bundle.lesson, scenes: bundle.scenes };
const link = makeCardShareLink({ baseUrl: 'https://example.test/app?remove=1', ...selected });
assert.ok(link.includes(CARD_LINK_PREFIX)); assert.ok(link.length < 500); assert.equal(new URL(link).search, '');
const decoded = readCardShareLink(link);
assert.equal(decoded.descriptor.unit, 'lesson'); assert.equal(decoded.result.scenes.length, 6);
assert.deepEqual(decoded.result, generateCard('major-scale', { key: 'Eb:major', unit: 'lesson', ...decoded.descriptor.params }));
const changed = structuredClone(selected); changed.scenes[0].caption += ' 바꾼 문장';
assert.equal(cardShareDescriptor(changed), null); assert.equal(makeCardShareLink({ baseUrl: 'https://example.test/', ...changed }), null);
const reordered = structuredClone(selected); reordered.lesson.sceneIds.reverse(); assert.equal(cardShareDescriptor(reordered), null);
const retitled = structuredClone(selected); retitled.lesson.title = '내 수업'; assert.equal(cardShareDescriptor(retitled), null);
for (const field of ['question', 'tags', 'steps', 'content']) {
  const modified = structuredClone(selected);
  if (field === 'question') modified.scenes[0].question = '무엇일까요?';
  if (field === 'tags') modified.scenes[0].tags.push('교사');
  if (field === 'steps') modified.scenes[0].steps[0].label = '변경';
  if (field === 'content') modified.scenes[0].content.columns[0].highlightNoteIds.push(modified.scenes[0].content.columns[0].notes[0].id);
  assert.equal(cardShareDescriptor(modified), null, `${field} edits must be preserved by content sharing`);
}
for (const id of ['names-and-solfege', 'minor-scale', 'interval', 'pentatonic', 'dynamics', 'tempo', 'form']) {
  const { scenes: [scene] } = make(id);
  const single = makeCardShareLink({ baseUrl: 'https://example.test/', scene });
  assert.ok(single); assert.equal(readCardShareLink(single).result.scenes.length, 1);
}
assert.equal(readCardShareLink('https://example.test/#mwb1=legacy'), null);
assert.throws(() => readCardShareLink('https://example.test/#mwb-card2=anything'), /형식/);
assert.throws(() => readCardShareLink(link.slice(0, -1)), /형식|조건|다른 판/);
const encode = object => CARD_LINK_PREFIX + Buffer.from(JSON.stringify(object)).toString('base64url');
assert.throws(() => readCardShareLink(encode({ ...decoded.descriptor, cardVersion: 999 })), /다른 판/);
assert.throws(() => readCardShareLink(encode({ ...decoded.descriptor, params: { key: { tonic: 'C' } } })), /형식/);
assert.throws(() => readCardShareLink(encode({ ...decoded.descriptor, extra: true })), /형식/);
console.log('Compact card sharing, version mismatch, teacher edits and full lesson preview passed.');
