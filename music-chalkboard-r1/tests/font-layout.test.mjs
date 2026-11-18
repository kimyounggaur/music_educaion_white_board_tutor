import assert from 'node:assert/strict';
import { createScene, defaultSteps } from '../src/scene-model.js';
import { buildDocumentScene, checkDocumentLayout, measureText, setTextFontAvailability } from '../src/scene.js';
import { graphemes } from '../src/text-layout.js';
import { Dust } from '../src/dust.js';

let creates = 0;
const calls = [];
globalThis.document = {
  createElement() {
    creates++;
    return { getContext: () => ({
      font: '',
      measureText: text => ({ width: text === '🥸' ? 0 : graphemes(text).length * 9 }),
      createRadialGradient: () => ({ addColorStop(){} }),
      fillRect(){},
      setTransform(){},
      drawImage: (...args) => calls.push(['drawImage', ...args]),
      clearRect: (...args) => calls.push(['clearRect', ...args]),
    }) };
  },
};

assert.equal(measureText('한글abc', 20, true), 45);
assert.equal(measureText('🥸', 20, true), 20);
assert.equal(creates, 1);
assert.deepEqual(graphemes('도👨‍👩‍👧‍👦나'), ['도', '👨‍👩‍👧‍👦', '나']);
const doc = createScene('text-explanation');
doc.question = '다장조 음계에서 첫째, 셋째, 다섯째 음을 고르면 어떤 화음이 될까요?';
doc.content.blocks[0].text = '온음과 반음 😊👨‍👩‍👧‍👦 뒤에 이어서 한글을 써요.';
doc.steps = defaultSteps(doc);
assert.equal(checkDocumentLayout(doc).errors.length, 0);
for (const portrait of [true, false]) {
  const scene = buildDocumentScene(doc, portrait);
  const body = scene.groups.get(`body/${doc.content.blocks[0].id}`);
  assert.ok(body.some(x => x.type === 'glyph'));
  assert.ok(body.some(x => x.type === 'text'));
  const units = graphemes(doc.content.blocks[0].text);
  for (const value of body) {
    assert.equal(units.slice(value.textStart, value.textEnd).join(''), value.ch ?? value.text);
  }
  assert.equal(scene.lineCounts['content.blocks.0.text'] > 0, true);
  assert.equal(scene.groups.get('question').find(x => x.ch === '다').textStart, 0);
}
assert.equal(creates, 1);
setTextFontAvailability(false);
assert.ok(buildDocumentScene(doc, false).groups.get('question').every(x => x.type === 'text'));
setTextFontAvailability(true);

const groups = doc.steps.flatMap(s => s.groupIds);
doc.steps = [{id:'all',label:'all',groupIds:[...groups].reverse(),advance:'manual',holdMs:0}];
assert.equal(buildDocumentScene(doc, false).items[0].groupId, groups.at(-1));
const canvas = document.createElement('canvas');
const dust = new Dust(canvas);
dust.resize(3840, 2160, false);
dust.burst(30, 40, '#fff');
dust.step(0.1);
assert.equal(calls.length, 0);
dust.setEnabled(true);
assert.ok(canvas.width * canvas.height <= 2_000_000);
dust.step(0.1);
assert.equal(calls.length, 0);
dust.burst(30, 40, '#fff', 1);
dust.step(0.1);
assert.equal(calls[0][0], 'drawImage');
dust.step(2);
const clear = calls.find(args => args[0] === 'clearRect');
assert.ok(clear && clear[3] < 30 && clear[4] < 30);
assert.equal(dust.active, false);
for (let index = 0; index < 120; index++) dust.step(.027);
assert.equal(dust.degraded, true);
dust.clear();
assert.equal(dust.degraded, false);
dust.setEnabled(false);
assert.equal(canvas.width, 1);
console.log('글꼴 폭 캐시·혼합 문자·줄 배치·가루 영역 시험 통과');
