import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createScene } from '../src/scene-model.js';
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
console.log('초안 되돌리기·복구 초안 보존·정리 재시도 테스트 통과');
