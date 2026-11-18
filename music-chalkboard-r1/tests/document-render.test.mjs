import assert from 'node:assert/strict';
import { createScene, TEMPLATE_IDS } from '../src/scene-model.js';
import { buildDocumentScene, hasGlyphs } from '../src/scene.js';
import { buildStepPlans } from '../src/plan.js';

for (const template of TEMPLATE_IDS) for (const portrait of [true, false]) {
  const doc = createScene(template);
  doc.question = '새로운 질문 🎵';
  // Add question without regenerating other group IDs.
  doc.steps.unshift({id:'q-step', label:'질문', groupIds:['question'], advance:'manual', holdMs:0});
  const scene = buildDocumentScene(doc, portrait);
  assert.ok(scene.items.length);
  assert.ok(scene.groups.get('question').every(x => x.type === 'text'), '한 문장 전체를 일반 글꼴로 표시');
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
console.log('장면 문서·단계 시간표·대체 문자 테스트 통과');
