import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createSceneV2,defaultSteps,validateScene } from '../src/scene-model.js';
import { openSceneEditor } from '../src/scene-editor.js';

const win=new Window({url:'http://localhost/'});
Object.assign(globalThis,{window:win,document:win.document});
const change=(node,value,type='input')=>{node.value=value;node.dispatchEvent(new win.Event(type,{bubbles:true}));};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const close=async editor=>{await editor.close();const discard=document.querySelector('[data-action="discard"]');discard?.click();await tick();};

// Preview controls are local view state; scrubbing and changing theme never edit a scene.
{
  const scene=createSceneV2(), original=structuredClone(scene);
  let drafts=0;
  const editor=openSceneEditor({scene,onDraft:()=>{drafts++;}});
  const dialog=document.querySelector('.scene-editor');
  assert.ok(dialog.querySelector('.ed-canvas-stage svg'));
  const scrubber=dialog.querySelector('#ed-preview-through');
  assert.equal(Number(scrubber.max),scene.steps.length);
  change(scrubber,'0');
  assert.match(dialog.querySelector('.ed-canvas-stage').getAttribute('aria-label'),/아직 표시한 내용/);
  change(dialog.querySelector('[data-preview-theme]'),'white','change');
  change(dialog.querySelector('[data-preview-orientation]'),'portrait','change');
  assert.equal(dialog.querySelector('.ed-canvas-stage').dataset.theme,'white');
  assert.equal(dialog.querySelector('.ed-canvas-stage').dataset.orientation,'portrait');
  assert.equal(dialog.querySelector('.ed-canvas-stage svg').getAttribute('viewBox'),'0 0 480 640');
  change(scrubber,String(scene.steps.length));
  assert.doesNotMatch(dialog.querySelector('.ed-canvas-stage').getAttribute('aria-label'),/아직 표시한 내용/);
  assert.deepEqual(editor.getSnapshot(),original);
  assert.equal(drafts,0);
  await close(editor);
}

// A pitch slider and its exact select stay synchronized, preserving accidentals and IDs.
{
  const scene=createSceneV2('note-selection');
  scene.content.columns[0].notes[0].pitch='C#4';scene.steps=defaultSteps(scene);
  const editor=openSceneEditor({scene,getLayoutFeedback:()=>({})});
  const dialog=document.querySelector('.scene-editor');
  const id=scene.content.columns[0].notes[0].id;
  const range=dialog.querySelector(`[data-pitch-slider="${id}"]`);
  range.focus();change(range,'7');
  const note=editor.getSnapshot().content.columns[0].notes[0];
  assert.equal(note.id,id);assert.equal(note.pitch,'C#5');
  assert.equal(dialog.querySelector(`[data-note="${id}"]`).value,'C5');
  assert.match(range.getAttribute('aria-valuetext'),/올림도.*C#5/);
  assert.equal(document.activeElement,range);
  change(dialog.querySelector(`[data-note="${id}"]`),'F5','change');
  assert.equal(range.value,'10');
  assert.equal(editor.getSnapshot().content.columns[0].notes[0].pitch,'F#5');
  assert.equal(scene.content.columns[0].notes[0].pitch,'C#4','원본 객체는 고치지 않습니다.');
  await close(editor);
}

// Seconds in the UI retain the portable millisecond data contract.
{
  let saved;
  const editor=openSceneEditor({scene:createSceneV2(),onSave:doc=>{saved=doc;},getLayoutFeedback:()=>({})});
  const dialog=document.querySelector('.scene-editor');
  dialog.querySelector('[data-tab="steps"]').click();
  const advance=dialog.querySelector('[data-advance]');change(advance,'auto','change');
  const range=dialog.querySelector('[data-hold]');
  assert.equal(range.type,'range');change(range,'1700');
  assert.equal(range.getAttribute('aria-valuetext'),'1.7초');
  assert.equal(range.closest('.ed-range').querySelector('output').textContent,'1.7초');
  dialog.querySelector('[data-action="save"]').click();await tick();
  assert.equal(saved.steps[0].holdMs,1700);assert.equal(saved.steps[0].advance,'auto');
  assert.equal(validateScene(saved).valid,true);
}

// Dynamics and tempo ranges update real diagram values, rather than just their labels.
{
  const editor=openSceneEditor({scene:createSceneV2('diagram'),getLayoutFeedback:()=>({})});
  const dialog=document.querySelector('.scene-editor');
  change(dialog.querySelector('[data-field="diagramKind"]'),'ladder','change');
  let range=dialog.querySelector('[data-diagram-text="level"]');change(range,'0.3');
  assert.equal(editor.getSnapshot().content.items[0].level,.3);
  assert.equal(range.getAttribute('aria-valuetext'),'30%');
  change(dialog.querySelector('[data-field="diagramKind"]'),'line','change');
  range=dialog.querySelector('[data-diagram-text="tempo"]');change(range,'132');
  assert.equal(editor.getSnapshot().content.items[0].tempo,132);
  assert.equal(range.getAttribute('aria-valuetext'),'132 BPM');
  await close(editor);
}
console.log('편집 작업 화면·실제 칠판 미리보기·음 높이·대기·세기·빠르기 슬라이더 시험 통과');
