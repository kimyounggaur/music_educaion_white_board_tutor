import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createScene, createSceneV2 } from '../src/scene-model.js';
import { openSceneEditor } from '../src/scene-editor.js';
const win=new Window({url:'http://localhost/'});
Object.assign(globalThis,{window:win,document:win.document});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const waitFor=async pred=>{for(let i=0;i<100;i++){if(pred())return;await delay(10);}throw Error('편집기 상태 전환 시간 초과');};
function input(dialog,value){const field=dialog.querySelector('#ed-title');field.value=value;field.dispatchEvent(new win.Event('input',{bubbles:true}));}

// A write already in progress must finish before its stale draft is deleted.
{
  const scene=createScene(), initial=scene.title; let saved=null, release, begun=false;
  const pending=new Promise(resolve=>release=resolve);
  openSceneEditor({scene,onDraft:async snapshot=>{begun=true;await pending;saved=snapshot.title;},onDiscard:async()=>{saved=null;}});
  const dialog=document.querySelector('.scene-editor');input(dialog,'임시 변경');await waitFor(()=>begun);
  input(dialog,initial);dialog.querySelector('[data-action="close"]').click();
  assert.ok(dialog.isConnected,'저장 중 정리가 끝나기 전에는 창을 닫지 않습니다.');
  release();await waitFor(()=>!dialog.isConnected);assert.equal(saved,null,'이전 자동 초안이 남지 않아야 합니다.');
}
// A recovered draft should return to its recovered content, not be deleted.
{
  const scene=createScene(), initial=scene.title;let stored=initial, discarded=false;
  openSceneEditor({scene,preserveInitialDraft:true,onDraft:async snapshot=>{stored=snapshot.title;},onDiscard:async()=>{discarded=true;stored=null;}});
  const dialog=document.querySelector('.scene-editor');input(dialog,'새 변경');await delay(850);assert.equal(stored,'새 변경');
  input(dialog,initial);await waitFor(()=>stored===initial);dialog.querySelector('[data-action="close"]').click();await waitFor(()=>!dialog.isConnected);
  assert.equal(stored,initial);assert.equal(discarded,false);
}
// Failed deletion keeps the editor open and retries on close.
{
  const scene=createScene(), initial=scene.title;let attempts=0, stored=null;
  openSceneEditor({scene,onDraft:async snapshot=>{stored=snapshot.title;},onDiscard:async()=>{attempts++;if(attempts===1)throw Error('unavailable');stored=null;}});
  const dialog=document.querySelector('.scene-editor');input(dialog,'임시');await delay(850);assert.equal(stored,'임시');
  input(dialog,initial);await waitFor(()=>attempts===1);dialog.querySelector('[data-action="close"]').click();await waitFor(()=>!dialog.isConnected);
  assert.equal(attempts,2);assert.equal(stored,null);
}

function setValue(control, value, type = 'input') {
  control.value = value;
  control.dispatchEvent(new win.Event(type, { bubbles: true }));
}
function action(dialog, name) {
  return dialog.querySelector(`[data-action="${name}"]`);
}

// A text change must retain both the next input and the first pointer target.
{
  let saved;
  openSceneEditor({ scene: createScene('text-explanation'), onSave: doc => { saved = doc; } });
  const dialog = document.querySelector('.scene-editor');
  const question = dialog.querySelector('#ed-question');
  const caption = dialog.querySelector('#ed-caption');
  const add = action(dialog, 'block-add');
  const save = action(dialog, 'save');
  setValue(question, '무슨 소리일까요?');
  question.dispatchEvent(new win.Event('change', { bubbles: true }));
  assert.ok(dialog.querySelector('#ed-caption') === caption, "입력 또는 단추 DOM을 유지해야 합니다.");
  caption.focus();
  setValue(caption, '음의 어울림을 들어 봐요.');
  setValue(dialog.querySelector('[data-block]'), '같이 연주해요.');
  dialog.querySelector('[data-block]').dispatchEvent(new win.Event('change', { bubbles: true }));
  assert.ok(action(dialog, 'block-add') === add, "입력 또는 단추 DOM을 유지해야 합니다.");
  add.click();
  assert.ok(document.activeElement === dialog.querySelectorAll('[data-block]')[1], "입력 또는 단추 DOM을 유지해야 합니다.");
  assert.ok(action(dialog, 'save') === save, "입력 또는 단추 DOM을 유지해야 합니다.");
  save.click();
  await waitFor(() => !dialog.isConnected);
  assert.equal(saved.question, '무슨 소리일까요?');
  assert.equal(saved.caption, '음의 어울림을 들어 봐요.');
  assert.equal(saved.content.blocks[0].text, '같이 연주해요.');
  assert.equal(saved.content.blocks.length, 2);
}

// Template confirmation is modal and cancel retains the previous value and focus.
{
  const editor = openSceneEditor({ scene: createSceneV2(), allowTemplateChange: true });
  const dialog = document.querySelector('.scene-editor');
  const template = dialog.querySelector('#ed-template');
  setValue(template, 'text-explanation', 'change');
  const confirmation = document.querySelector('.wb-confirm');
  assert.ok(confirmation?.open);
  assert.equal(document.activeElement.dataset.confirm, 'cancel');
  confirmation.dispatchEvent(new win.Event('cancel', { cancelable: true }));
  await waitFor(() => !confirmation.isConnected);
  assert.ok(document.activeElement === template, "입력 또는 단추 DOM을 유지해야 합니다.");
  assert.equal(template.value, 'chord-stack');
  assert.equal(editor.getSnapshot().templateId, 'chord-stack');
  setValue(template, 'text-explanation', 'change');
  document.querySelector('.wb-confirm [data-confirm="accept"]').click();
  await waitFor(() => editor.getSnapshot().templateId === 'text-explanation');
  assert.equal(template.value, 'text-explanation');
  assert.equal(editor.getSnapshot().templateVersion, 1);
  assert.equal(editor.getSnapshot().schemaVersion, 2);
  action(dialog, 'close').click();
  action(dialog, 'discard').click();
  await waitFor(() => !dialog.isConnected);
}

// V2 columns, accidentals, key changes, theory display and save all use the editor path.
{
  let saved;
  const editor = openSceneEditor({ scene: createSceneV2(), onSave: doc => { saved = doc; } });
  const dialog = document.querySelector('.scene-editor');
  const originalStepIds = editor.getSnapshot().steps.map(step => step.id);
  const originalNoteIds = editor.getSnapshot().content.columns[0].notes.map(note => note.id);
  const key = dialog.querySelector('#ed-key');
  action(dialog, 'column-note-add').click();
  const chord = dialog.querySelector('[data-column]');
  assert.equal(chord.querySelectorAll('[data-note]').length, 4);
  const notes = chord.querySelectorAll('[data-note]');
  ['G4', 'B4', 'D5', 'F5'].forEach((pitch, index) => setValue(notes[index], pitch, 'change'));
  assert.match(chord.querySelector('[data-theory-readout]').textContent, /딸림7화음.*V7/);
  action(dialog, 'column-add-note').click();
  const added = dialog.querySelectorAll('[data-column]')[1];
  assert.ok(document.activeElement === added.querySelector('[data-note]'), "입력 또는 단추 DOM을 유지해야 합니다.");
  setValue(added.querySelector('[data-note]'), 'F4', 'change');
  setValue(added.querySelector('[data-accidental]'), '#', 'change');
  assert.equal(added.querySelector('[data-label-mode]').value, 'none');
  setValue(added.querySelector('[data-label-mode]'), 'en', 'change');
  setValue(key, 'G:major', 'change');
  assert.ok(dialog.querySelector('#ed-key') === key, "입력 또는 단추 DOM을 유지해야 합니다.");
  assert.equal(editor.getSnapshot().content.columns[1].notes[0].pitch, 'F#4');
  setValue(key, 'C:major', 'change');
  const noteId = editor.getSnapshot().content.columns[1].id;
  added.querySelector('[data-action="column-up"]').click();
  const snapshot = editor.getSnapshot();
  assert.equal(snapshot.content.columns[0].id, noteId);
  assert.deepEqual(snapshot.content.columns[1].notes.slice(0, 3).map(note => note.id), originalNoteIds);
  assert.ok(originalStepIds.every(id => snapshot.steps.some(step => step.id === id)));
  action(dialog, 'save').click();
  await waitFor(() => !dialog.isConnected);
  assert.deepEqual(saved.content.columns.map(column => column.notes.map(note => note.pitch)), [['F#4'], ['G4', 'B4', 'D5', 'F5']]);
}

// Input composition is committed at compositionend, while errors and previews keep the field and modal.
{
  const editor = openSceneEditor({
    scene: createScene(),
    onPreview: async () => { throw Error('미리보기 확인 오류'); },
  });
  const dialog = document.querySelector('.scene-editor');
  const title = dialog.querySelector('#ed-title');
  title.dispatchEvent(new win.Event('compositionstart', { bubbles: true }));
  setValue(title, '도레');
  assert.notEqual(editor.getSnapshot().title, '도레');
  title.dispatchEvent(new win.Event('compositionend', { bubbles: true }));
  assert.equal(editor.getSnapshot().title, '도레');
  setValue(title, '');
  const preview = action(dialog, 'preview');
  preview.click();
  assert.ok(dialog.querySelector('#ed-title') === title, "입력 또는 단추 DOM을 유지해야 합니다.");
  assert.ok(document.activeElement === title, "입력 또는 단추 DOM을 유지해야 합니다.");
  assert.equal(title.getAttribute('aria-invalid'), 'true');
  assert.match(dialog.querySelector('.ed-errors li').textContent, /장면 제목/);
  setValue(title, '유효한 제목');
  preview.click();
  await waitFor(() => dialog.open && dialog.querySelector('.ed-status').textContent.includes('미리보기 확인 오류'));
  assert.ok(document.activeElement === preview, "입력 또는 단추 DOM을 유지해야 합니다.");
  assert.equal(title.getAttribute('aria-invalid'), null);
  action(dialog, 'close').click();
  action(dialog, 'discard').click();
  await waitFor(() => !dialog.isConnected);
}

console.log('편집기 포커스·IME·확인창·악보 작성·초안 시험 통과');
