import assert from 'node:assert/strict';
import { createScene, createSceneV2, defaultSteps, TEMPLATE_IDS } from '../src/scene-model.js';
import { buildDocumentScene, hasGlyphs } from '../src/scene.js';
import { buildStepPlans } from '../src/plan.js';

for (const template of TEMPLATE_IDS) for (const portrait of [true, false]) {
  const doc = createScene(template);
  doc.question = '새로운 질문 🎵';
  // Add question without regenerating other group IDs.
  doc.steps.unshift({id:'q-step', label:'질문', groupIds:['question'], advance:'manual', holdMs:0});
  const scene = buildDocumentScene(doc, portrait);
  assert.ok(scene.items.length);
  const question = scene.groups.get('question');
  assert.ok(question.some(x => x.type === 'glyph' && x.ch === '새'));
  assert.equal(question.filter(x => x.type === 'text').map(x => x.text).join(''), '🎵', '미지원 글자만 일반 글꼴로 표시');
  assert.equal(scene.descriptions.get('question'), doc.question);
  const plans = buildStepPlans(scene, doc.steps, 'normal');
  assert.equal(plans.length, doc.steps.length);
  assert.ok(plans.every(p => p.total > 0));
  assert.ok(plans[0].segs.some(s => s.noHand));
  assert.ok(scene.items.every((x,i) => x.index === i));
  assert.deepEqual(new Set(scene.items.map(x=>x.groupId)),new Set(doc.steps.flatMap(s=>s.groupIds)));
  const copy = structuredClone(doc); copy.id = 'new-copy';
  const cloned = buildDocumentScene(copy, portrait);
  assert.deepEqual(scene.items.map(x=>x.seedId),cloned.items.map(x=>x.seedId));
}
assert.equal(hasGlyphs('🎵'), false);
{
  const build = (tonic, pitches) => {
    const doc = createSceneV2('note-selection');
    doc.content = {key:{tonic, mode:'major'}, columns:pitches.map((pitch,index) => ({
      id:`col-${index}`, kind:'note', notes:[{id:`n-${index}`,pitch}], labelMode:'ko', highlightNoteIds:[],
    }))};
    doc.steps = defaultSteps(doc);
    return buildDocumentScene(doc, false);
  };
  const sharpNatural = build('C', ['F#4','F#4','F4','Gb4']);
  assert.deepEqual(sharpNatural.items.filter(x => x.role === 'accidental').map(x => x.symbol), ['♯','♮','♭']);
  const heads = sharpNatural.items.filter(x => x.role === 'head');
  assert.equal(heads[0].midi, heads[3].midi, '이명동음의 소리는 같다');
  assert.notEqual(heads[0].cy, heads[3].cy, '이명동음의 기보 위치는 다르다');
  assert.equal(new Set(heads.map(x => x.cx)).size, 4);
  const gMajor = build('G', ['F#4','F4','F#4']);
  assert.deepEqual(gMajor.items.filter(x => x.role === 'key-signature').map(x => x.symbol), ['♯']);
  assert.deepEqual(gMajor.items.filter(x => x.role === 'accidental').map(x => x.symbol), ['♮','♯']);
}
console.log('장면 문서·단계 시간표·대체 문자 테스트 통과');
