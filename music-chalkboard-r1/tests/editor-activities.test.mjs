import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createSceneV2, defaultSteps, validateScene } from '../src/scene-model.js';
import { openSceneEditor } from '../src/scene-editor.js';

const win = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, { window: win, document: win.document });
const change = (node, value) => { node.value = value; node.dispatchEvent(new win.Event('change', { bubbles: true })); };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const click = (dialog, action, id) => dialog.querySelector(`[data-action="${action}"]${id ? `[data-id="${id}"]` : ''}`).click();
const close = async dialog => { click(dialog, 'close'); if (dialog.isConnected) click(dialog, 'discard'); await tick(); };
const valid = scene => assert.deepEqual(validateScene(scene).errors, []);
function fixture() {
  const scene = createSceneV2('note-selection');
  scene.content = { key: { tonic: 'C', mode: 'major' }, columns: ['C4','E4','G4'].map((pitch,index) => ({ id: `c${index+1}`, kind: 'note', notes: [{ id: `n${index+1}`, pitch }], labelMode: 'none', highlightNoteIds: [] })) };
  scene.steps = defaultSteps(scene);
  return scene;
}

// A teacher can add a listening-only step, choose targets and save a valid document.
{
  let saved;
  const editor = openSceneEditor({ scene: fixture(), onSave: doc => { saved = doc; }, getLayoutFeedback: () => ({}) });
  const dialog = document.querySelector('.scene-editor');
  click(dialog, 'step-add-listen');
  const added = editor.getSnapshot().steps.at(-1);
  assert.deepEqual(added.cue.targets.map(target => target.columnId), ['c1','c2','c3']);
  const first = dialog.querySelector(`[data-cue-target="${added.id}"][value="c1"]`);
  first.checked = false; first.dispatchEvent(new win.Event('change', { bubbles: true }));
  assert.deepEqual(editor.getSnapshot().steps.at(-1).cue.targets.map(target => target.columnId), ['c2','c3']);
  assert.match(dialog.querySelector('[data-activity-summary]').textContent, /2열 → 3열/);
  click(dialog, 'save'); await tick();
  assert.ok(saved); valid(saved);
  assert.deepEqual(saved.steps.at(-1).cue.targets.map(target => target.columnId), ['c2','c3']);
}

// Two activities cannot silently replace one another when merging.
{
  const editor = openSceneEditor({ scene: fixture(), getLayoutFeedback: () => ({}) });
  const dialog = document.querySelector('.scene-editor');
  click(dialog, 'step-add-listen'); click(dialog, 'step-add-practice');
  const snapshot = editor.getSnapshot(), id = snapshot.steps.at(-2).id;
  click(dialog, 'step-merge', id);
  assert.deepEqual(editor.getSnapshot().steps, snapshot.steps);
  assert.match(dialog.querySelector('.ed-status').textContent, /두 단계 모두 활동/);
  await close(dialog);
}

// Splitting a written step moves its activity behind both sets of notes.
{
  const scene = fixture();
  const notes = scene.steps.find(step => step.groupIds.includes('note/n1'));
  notes.cue = { type: 'listen', targets: [{ columnId: 'c1' }, { columnId: 'c3' }] };
  const editor = openSceneEditor({ scene, getLayoutFeedback: () => ({}) });
  const dialog = document.querySelector('.scene-editor');
  dialog.querySelector(`[data-split="${notes.id}"][value="note/n3"]`).checked = true;
  click(dialog, 'step-split', notes.id);
  const next = editor.getSnapshot(), oldIndex = next.steps.findIndex(step => step.id === notes.id);
  assert.equal(next.steps[oldIndex].cue, undefined);
  assert.deepEqual(next.steps[oldIndex+1].cue, notes.cue); valid(next);
  await close(dialog);
}

// Reset preserves every activity in original order as a separate final step.
{
  const scene = fixture();
  scene.steps.find(step => step.groupIds.includes('note/n1')).cue = { type: 'listen', targets: [{ columnId: 'c2' }] };
  const editor = openSceneEditor({ scene, getLayoutFeedback: () => ({}) });
  const dialog = document.querySelector('.scene-editor');
  click(dialog, 'step-add-practice');
  const cues = editor.getSnapshot().steps.filter(step => step.cue).map(step => step.cue);
  click(dialog, 'reset-steps');
  document.querySelector('.wb-confirm [data-confirm="accept"]').click(); await tick();
  const result = editor.getSnapshot();
  assert.deepEqual(result.steps.slice(-2).map(step => step.cue), cues);
  assert.ok(result.steps.slice(-2).every(step => step.groupIds.length === 0)); valid(result);
  await close(dialog);
}

// Deleted answer columns remove the whole question and tell the teacher.
{
  const editor = openSceneEditor({ scene: fixture(), getLayoutFeedback: () => ({}) });
  const dialog = document.querySelector('.scene-editor');
  click(dialog, 'step-add-practice');
  click(dialog, 'column-remove', 'c2');
  assert.equal(editor.getSnapshot().steps.some(step => step.cue?.type === 'practice'), false);
  assert.match(dialog.querySelector('.ed-status').textContent, /해보기 활동을 제거/);
  await close(dialog);
}

// Practice controls produce range and order in the existing portable cue schema.
{
  const editor = openSceneEditor({ scene: fixture(), getLayoutFeedback: () => ({}) });
  const dialog = document.querySelector('.scene-editor'); click(dialog, 'step-add-practice');
  let step = editor.getSnapshot().steps.at(-1);
  assert.deepEqual(step.cue.keyboard, { from: 'C4', to: 'G4', labelMode: 'none' });
  change(dialog.querySelector(`[data-cue-order="${step.id}"]`), 'sequential');
  change(dialog.querySelector(`[data-cue-range="${step.id}"]`), 'manual');
  change(dialog.querySelector(`[data-cue-key="to"][data-id="${step.id}"]`), 'C5');
  change(dialog.querySelector(`[data-cue-label="${step.id}"]`), 'ko');
  step = editor.getSnapshot().steps.at(-1);
  assert.equal(step.cue.order, 'sequential'); assert.equal(step.cue.keyboard.to, 'C5'); assert.equal(step.cue.keyboard.labelMode, 'ko'); valid(editor.getSnapshot());
  await close(dialog);
}

// New staff controls are editable and version3 is removed when all features are removed.
{
  const editor = openSceneEditor({ scene: fixture(), getLayoutFeedback: () => ({}) });
  const dialog = document.querySelector('.scene-editor'); click(dialog, 'column-add-dyad');
  assert.equal(editor.getSnapshot().templateVersion, 3);
  assert.equal(dialog.querySelectorAll('[data-column]').length, 4);
  const dyad = editor.getSnapshot().content.columns.at(-1); assert.equal(dyad.kind, 'dyad');
  assert.match(dialog.querySelector('[data-dyad-readout]').textContent, /장3도/);
  click(dialog, 'interval-add'); assert.equal(editor.getSnapshot().content.intervals.length, 1);
  valid(editor.getSnapshot());
  click(dialog, 'interval-remove', editor.getSnapshot().content.intervals[0].id);
  click(dialog, 'column-remove', dyad.id);
  assert.equal(editor.getSnapshot().templateVersion, 2); assert.equal(editor.getSnapshot().content.intervals, undefined); valid(editor.getSnapshot());
  await close(dialog);
}

// Diagrams expose semantic inputs and listening, not irrelevant keyboard controls.
{
  const editor = openSceneEditor({ scene: createSceneV2('diagram'), getLayoutFeedback: () => ({}) });
  const dialog = document.querySelector('.scene-editor');
  change(dialog.querySelector('[data-field="diagramKind"]'), 'ladder');
  assert.ok(dialog.querySelector('[data-diagram-text="level"]'));
  const level = dialog.querySelector('[data-diagram-text="level"]'); level.value = '0.3'; level.dispatchEvent(new win.Event('input', { bubbles: true }));
  const hairpin = dialog.querySelector('[data-hairpin="up"]'); hairpin.checked = true; hairpin.dispatchEvent(new win.Event('change', { bubbles: true }));
  change(dialog.querySelector('[data-phrase="all"]'), 'tune-a');
  click(dialog, 'step-add-listen');
  assert.equal(dialog.querySelector('[data-action="step-add-practice"]'), null);
  const snapshot = editor.getSnapshot(); assert.equal(snapshot.content.items[0].level, 0.3); assert.deepEqual(snapshot.content.hairpins, ['up']); valid(snapshot);
  await close(dialog);
}

// Deleting a diagram item leaves an explicit repairable reference and blocks saving.
{
  const scene = createSceneV2('diagram');
  scene.content.items.push({ id: 'third', label: 'C', sub: '끝', ink: 'main' }); scene.content.phrases.C = 'tune-c'; scene.steps = defaultSteps(scene);
  const editor = openSceneEditor({ scene, getLayoutFeedback: () => ({}) });
  const dialog = document.querySelector('.scene-editor'); click(dialog, 'step-add-listen');
  const cueStep = editor.getSnapshot().steps.at(-1).id;
  click(dialog, 'diagram-remove', 'third');
  assert.ok(editor.getSnapshot().steps.at(-1).cue.items.includes('third'));
  assert.match(dialog.querySelector('.ed-status').textContent, /듣기 대상이 남아/);
  click(dialog, 'save'); assert.ok(dialog.isConnected); assert.match(dialog.querySelector('.ed-errors').textContent, /들을 항목/);
  const target = dialog.querySelector(`[data-cue-target="${cueStep}"][value="third"]`); assert.ok(target.checked);
  target.checked = false; target.dispatchEvent(new win.Event('change', { bubbles: true }));
  valid(editor.getSnapshot()); await close(dialog);
}

// Source provenance survives edits and canceled regeneration preserves the isolated draft.
{
  const scene = fixture(); scene.templateVersion = 3;
  scene.content.source = { cardId: 'major-scale', cardVersion: 1, params: { key: 'C:major' } };
  let regenerated, retained;
  const editor = openSceneEditor({ scene, onDraft: doc => { retained = doc; }, onRegenerate: doc => { regenerated = doc; return false; }, getLayoutFeedback: () => ({}) });
  const dialog = document.querySelector('.scene-editor');
  const title = dialog.querySelector('#ed-title'); title.value = '교사 수정'; title.dispatchEvent(new win.Event('input', { bubbles: true }));
  click(dialog, 'regenerate'); document.querySelector('.wb-confirm [data-confirm="accept"]').click(); await tick();
  assert.ok(dialog.open); assert.equal(regenerated.title, '교사 수정'); assert.equal(retained.title, '교사 수정');
  assert.deepEqual(editor.getSnapshot().content.source, scene.content.source); assert.equal(editor.getSnapshot().templateVersion, 3);
  await close(dialog);
}
console.log('활동 편집·병합·분리·복원·단계 및 오선3·도식 작성 시험 통과');
