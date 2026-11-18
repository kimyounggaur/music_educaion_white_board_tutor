import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createScene, createSceneV2, defaultSteps } from '../src/scene-model.js';

const win = new Window({url:'http://localhost/'});
const frames = new Map();
let id = 0, timestamp = 0;
Object.assign(globalThis, {
  window:win, document:win.document, innerWidth:1200, innerHeight:800, devicePixelRatio:1,
  matchMedia:()=>({matches:true}),
  requestAnimationFrame:fn => { frames.set(++id, fn); return id; },
  cancelAnimationFrame:frame => frames.delete(frame),
});
Object.defineProperty(win.document, 'hidden', {value:false, configurable:true});
const ctx = new Proxy({
  createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h}),
  measureText:s=>({width:s.length*12}), createPattern:()=>null,
  createLinearGradient:()=>({addColorStop(){}}), createRadialGradient:()=>({addColorStop(){}}),
}, {
  get(t,p) { return p in t ? t[p] : () => {}; },
  set(t,p,v) { t[p] = v; return true; },
});
win.HTMLCanvasElement.prototype.getContext = () => ctx;
const stage = document.createElement('div'), frame = document.createElement('div');
const board = document.createElement('canvas'), ink = document.createElement('div'), dust = document.createElement('canvas');
Object.defineProperty(stage,'clientWidth',{value:800});
stage.append(board,ink,dust);
frame.append(stage);
document.body.append(frame);

const { ScenePlayer } = await import('../src/player.js');
const calls = [];
const engine = {
  status:'ready',
  unlockFromGesture:()=>Promise.resolve(true),
  play:notes=>calls.push(notes),
  stop() {},
};
const player = new ScenePlayer({stage,frame,board,ink,dust,audio:engine});
player.setOption('dust', 'off');
player.resize({width:1200,height:710});

function tick(ms = 100) {
  timestamp += ms;
  const callbacks = [...frames.values()];
  frames.clear();
  for (const callback of callbacks) callback(timestamp);
}

function until(test) {
  for (let i = 0; i < 250 && !test(); i++) tick();
  assert.ok(test(), 'player did not reach the requested state');
}

const scene = createScene('text-explanation');
scene.question = '첫 번째 질문입니다.';
scene.caption = '마지막 정리입니다.';
scene.steps = defaultSteps(scene);
player.open(scene);
assert.equal(player.state, 'ready');
assert.equal(player.completed, 0);
assert.equal(stage.getAttribute('role'), 'img');
assert.ok(!stage.getAttribute('aria-label').includes(scene.question));
player.mode = 'continuous';
player.next();
assert.equal(player.completed, 1);
assert.equal(player.state, 'waiting', 'reduced motion must reveal only one step');
assert.ok(stage.getAttribute('aria-label').includes(scene.question));
assert.ok(!stage.getAttribute('aria-label').includes(scene.caption));
player.next();
assert.equal(player.completed, 2);
player.previous();
assert.equal(player.completed, 1);
assert.equal(player.state, 'waiting');
assert.equal(player.mode, 'continuous');
player.finish();
assert.equal(player.state, 'completed');
assert.equal(player.completed, scene.steps.length);
player.previous();
assert.equal(player.completed, scene.steps.length - 1);
player.restart();
assert.equal(player.state, 'ready');
assert.equal(player.completed, 0);
const snap = player.snapshot();
player.next();
player.restore(snap);
assert.equal(player.completed, 0);
assert.equal(calls.length, 0);

player.reduced = false;
const long = createScene('text-explanation');
long.content.blocks[0].text = '음악을 즐겁게 배우는 한글 문장 🎵 입니다. '.repeat(2);
long.steps = defaultSteps(long);
player.open(long);
player.next();
const firstText = player.plans[0].segs.find(seg => seg.type === 'text');
player.elapsed = firstText.t0 + firstText.dur * 0.7;
const before = player.location();
player.resize({width:600,height:850});
const after = player.location();
assert.equal(player.scene.portrait, true);
assert.equal(player.state, 'playing');
assert.equal(after.group, before.group);
assert.ok(Math.abs(after.offset - before.offset) < 0.01, 'rotation must preserve the displayed text position');
assert.equal(frames.size, 1);
player.pause();
player.resize({width:1200,height:710});
assert.equal(player.state, 'paused');
assert.equal(frames.size, 0);

const chord = createSceneV2('chord-stack');
player.open(chord);
assert.equal(player.visibleNotes().length, 0);
assert.equal(player.playAt(200, 100), false);
player.finish();
assert.equal(calls.length, 0, 'finish and rebuild must stay silent');
assert.equal(player.visibleNotes().length, 3);
player.replay();
assert.deepEqual(calls.splice(0), [[60,64,67]]);

player.mode = 'step';
player.open(chord);
player.previewFrom(1);
player.next();
until(() => player.visibleNotes().length === 3);
assert.deepEqual(calls, [[60,64,67]], 'full chord should emit once at the last head');
player.resize({width:700,height:850});
player.setOption('theme', 'white');
until(() => player.state === 'waiting');
assert.deepEqual(calls.splice(0), [[60,64,67]], 'resizing and repainting should not repeat an event');
player.previous();
player.next();
until(() => player.state === 'waiting');
assert.deepEqual(calls.splice(0), [[60,64,67]], 'explicit replay has a new execution');

player.previous();
player.next();
player.next();
assert.equal(player.state, 'waiting');
assert.equal(calls.length, 0, 'forced next must finish the current step silently');

player.reduced = true;
player.previous();
player.next();
assert.deepEqual(calls.splice(0), [[60,64,67]], 'reduced motion emits a user-triggered chord once');
player.pause();
player.setAudioEnabled(false);
assert.equal(player.replay(), false);
assert.equal(player.playNote(60), false);
assert.equal(calls.length, 0);

player.setAudioEnabled(true);
const splitChord = createSceneV2('chord-stack');
const firstNote = splitChord.steps[1].groupIds.shift();
splitChord.steps.splice(1, 0, {id:'one-note', label:'첫 음', groupIds:[firstNote], advance:'manual', holdMs:0});
player.open(splitChord);
assert.deepEqual(player.plans[1].events.map(event => event.midis), [[60]]);
assert.deepEqual(player.plans[2].events.map(event => event.midis), [[60,64,67]]);

const listen = createSceneV2('chord-stack');
listen.steps[1].cue = {type:'listen', targets:[{columnId:listen.content.columns[0].id}]};
player.open(listen);
assert.deepEqual(player.plans[1].events, [], 'the explicit listen cue replaces implicit note sound');
assert.deepEqual(player.plans[1].listens.map(notes => notes.map(note => note.midi)), [[60,64,67]]);

const practice = createSceneV2('chord-stack');
practice.steps.splice(2,0,{
  id:'practice', label:'건반 해보기', groupIds:[], advance:'auto', holdMs:0,
  cue:{type:'practice', order:'free', keyboard:{from:'C4',to:'G5'}, columnIds:[practice.content.columns[0].id]},
});
player.reduced = false;
player.mode = 'continuous';
player.open(practice);
player.previewFrom(2);
player.next();
until(() => player.state === 'waiting');
assert.equal(player.practiceCue.type, 'practice');
assert.equal(player.completed, 3);
assert.equal(player.mode, 'continuous');

let release;
engine.status = 'locked';
engine.unlockFromGesture = () => new Promise(resolve => {release = resolve;});
player.reduced = true;
player.open(chord);
player.previewFrom(1);
const ready = player.unlockFromGesture();
player.next();
player.open(scene);
engine.status = 'ready';
release(true);
await ready;
assert.equal(calls.length, 0, 'late unlock cannot fire a sound after closing its scene');

console.log('판서 단계·화면 회전·접근성·화음 발음·해보기 대기 시험 통과');
