import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createScene, createSceneV2, defaultSteps } from '../src/scene-model.js';
import { activeGroups } from '../src/scene-model.js';
import { builtInLessonScenes } from '../src/lessons/index.js';
import { sourceLessons } from '../src/lessons/source-lessons.js';
import { parsePitch } from '../src/theory/pitch.js';
import { reusableGroups } from '../src/plan.js';

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

// Fake only the listening timers: animation remains controlled by tick().
const realSetTimeout = globalThis.setTimeout, realClearTimeout = globalThis.clearTimeout;
const timers = new Map();
let timerId = 0;
globalThis.setTimeout = (fn, delay) => { const id = ++timerId; timers.set(id, {fn, delay}); return id; };
globalThis.clearTimeout = id => timers.delete(id);
const flushSounds = () => {
  while (timers.size) {
    const [id, timer] = [...timers].sort((a,b) => a[1].delay - b[1].delay)[0];
    timers.delete(id);
    timer.fn();
  }
};
engine.unlockFromGesture = () => Promise.resolve(true);
try {
  // Every source listening instruction gets its original ordered notes/chords,
  // even if feedback or presentation settings cause an immediate redraw.
  let sceneIndex = 0, listeningScenes = 0;
  for (const lesson of sourceLessons) {
    for (const instruction of lesson.steps) {
      const doc = builtInLessonScenes[sceneIndex++];
      if (!instruction.play) continue;
      const plays = Array.isArray(instruction.play) ? instruction.play : [instruction.play];
      const expected = plays.flatMap(play => {
        const element = lesson.elements[play.target];
        const pitches = (play.notes ?? element.pitches.map((_,index) => index + 1))
          .map(ordinal => parsePitch(element.pitches[ordinal - 1]).midi);
        return element.type === 'chord' ? [pitches] : pitches.map(midi => [midi]);
      });
      calls.length = 0;
      player.open(doc);
      player.next();
      const epoch = player.audioEpoch;
      player.resize({width:1366 + listeningScenes,height:768});
      player.setOption('theme', listeningScenes % 2 ? 'chalk' : 'white');
      player.setOption('speed', listeningScenes % 2 ? 'normal' : 'fast');
      assert.equal(player.audioEpoch, epoch, 'presentation redraw must preserve scheduled audio');
      flushSounds();
      assert.deepEqual(calls.splice(0), expected, `${lesson.id}: ${instruction.caption}`);
      listeningScenes++;
    }
  }
  assert.ok(listeningScenes >= 14, 'all existing multi-target and single-target listening scenes are covered');

  const sequence = createSceneV2('note-selection');
  sequence.content.columns = ['C4','D4','E4'].map((pitch,index) => ({
    id:`c${index}`,kind:'note',notes:[{id:`n${index}`,pitch}],labelMode:'none',highlightNoteIds:[],
  }));
  sequence.steps = [{id:'listen-three',label:'듣기',groupIds:activeGroups(sequence),advance:'manual',holdMs:0,
    cue:{type:'listen',targets:sequence.content.columns.map(column => ({columnId:column.id}))}}];
  calls.length = 0;
  player.open(sequence);
  player.next();
  assert.deepEqual(calls, [[60]]);
  player.resize({width:390,height:844});
  player.setOption('method','canvas');
  flushSounds();
  assert.deepEqual(calls.splice(0), [[60],[62],[64]], 'resize does not cancel the remaining listening sequence');
  player.replay();
  player.resize({width:1024,height:768});
  flushSounds();
  assert.deepEqual(calls.splice(0), [[60],[62],[64]], 'manual replay also survives redraw');
  for (const interrupt of [() => player.pause(), () => player.restart(), () => player.finish(),
    () => player.open(scene), () => player.previewFrom(0), () => player.setAudioEnabled(false)]) {
    player.setAudioEnabled(true);
    player.open(sequence);
    player.next();
    assert.equal(timers.size, 2);
    interrupt();
    assert.equal(timers.size, 0, 'explicit navigation and pause cancel outstanding audio');
    calls.length = 0;
  }
} finally {
  player.stop();
  globalThis.setTimeout = realSetTimeout;
  globalThis.clearTimeout = realClearTimeout;
}

player.setAudioEnabled(true);
player.setOption('method','svg');
player.resize({width:1366,height:768});
player.reduced = false;
const beforeCarry = createSceneV2('note-selection');
beforeCarry.caption = '첫 정리예요.';
beforeCarry.steps = defaultSteps(beforeCarry);
const afterCarry = structuredClone(beforeCarry);
afterCarry.id += '-next';
afterCarry.caption = '다음 정리예요.';
afterCarry.steps = defaultSteps(afterCarry);
player.open(beforeCarry);
player.finish();
const sharedCount = player.visibleNotes().length;
calls.length = 0;
player.open(afterCarry,{carryForward:true,start:true,quiet:true});
assert.ok(player.startPosition >= 2, 'fully carried staff/note prefix is skipped');
assert.equal(player.completed, player.startPosition);
assert.equal(player.state, 'playing');
assert.equal(player.visibleNotes().length, sharedCount);
assert.ok(player.describeVisible().includes('음표'));
assert.equal(calls.length, 0, 'carried notes have no new writing sound');
assert.ok(player.plans.every(plan => plan.events.length === 0));
const carrySnapshot = player.snapshot();
player.previous();
assert.equal(player.completed, player.startPosition);
assert.equal(player.atStart, true);
const carried = [...player.carriedGroups];
player.previous();
assert.equal(player.completed, player.startPosition, 'previous cannot descend below the carried prefix');
player.resize({width:1920,height:1080});
player.setOption('theme','chalk');
assert.deepEqual([...player.carriedGroups],carried);
assert.equal(player.visibleNotes().length, sharedCount);
player.restore(carrySnapshot);
assert.equal(player.visibleNotes().length, sharedCount, 'preview restoration retains carried ink');
assert.deepEqual([...player.carriedGroups],carried);
player.restart();
assert.equal(player.startPosition,0);
assert.equal(player.carriedGroups.size,0);
assert.equal(player.visibleNotes().length,0);
assert.equal(player.visibleGroups.size,0,'restart truly clears the board');
player.open(beforeCarry,{completed:true,quiet:true});
assert.equal(player.state,'completed');
assert.equal(player.visibleNotes().length,sharedCount);
assert.equal(calls.length,0,'backward completed opening is silent');

const withActivity = structuredClone(afterCarry);
withActivity.steps[0].cue = {type:'listen',targets:[{columnId:withActivity.content.columns[0].id}]};
player.open(withActivity,{carryForward:true});
assert.equal(player.startPosition,0,'a carried activity remains a real step');
assert.ok(player.plans[0].listens.length,'carried notes are included in an explicit listen cue');
const allShared = structuredClone(beforeCarry);
player.open(beforeCarry,{completed:true,quiet:true});
player.open(allShared,{carryForward:true});
assert.equal(player.startPosition,allShared.steps.length - 1,'the final step is never skipped');
player.open(beforeCarry,{completed:true,quiet:true});
const differentSeed = {...afterCarry,renderSeed:afterCarry.renderSeed + 1};
player.open(differentSeed,{carryForward:true});
assert.equal(player.carriedGroups.has('staff'),false,'same group IDs are insufficient when strokes differ');
player.open(beforeCarry,{completed:true,quiet:true});
player.area = {width:390,height:844};
player.open(afterCarry,{carryForward:true});
assert.equal(player.carriedGroups.size,0,'different layout orientation cannot carry ink');

const artwork = (point, ink = 'main') => ({portrait:false,groups:new Map([
  ['same',[{type:'line',ink,role:'staff',strokes:[{width:2,pts:[[point,20],[50,20]]}]}]],
  ['removed',[{type:'text',ink:'main',text:'옛 장면'}]],
])});
assert.deepEqual([...reusableGroups(artwork(10.01), artwork(10.04))],['same','removed']);
assert.equal(reusableGroups(artwork(10.01),artwork(10.06)).has('same'),false);
assert.equal(reusableGroups(artwork(10.01),artwork(10.01,'accent')).has('same'),false);
player.stop();

// Diagram examples use the same bounded audio clock while the writing renderer
// remains silent. The cursor is transient and reprojects after a redraw.
const diagram = createSceneV2('diagram');
diagram.content.phrases = {A:'tune-a',B:'tune-b'};
diagram.steps = defaultSteps(diagram);
diagram.steps.push({id:'diagram-listen',label:'가락 듣기',groupIds:[],advance:'manual',holdMs:0,
  cue:{type:'listen',items:diagram.content.items.map(item => item.id)}});
engine.currentTime = 0;
const timedCalls = [];
engine.play = (midis,options) => timedCalls.push({midis,options});
player.reduced = true;
player.resize({width:1366,height:768});
player.open(diagram);
for (let i = 0; i < diagram.steps.length; i++) player.next();
assert.equal(player.state,'completed');
assert.equal(timedCalls.length,1,'only the first lookahead window is queued');
assert.equal(player.timelineScheduler.active,true);
engine.currentTime = .1;
tick(16);
assert.equal(player.timelineCursor.itemId,diagram.content.items[0].id);
assert.equal(player.playhead.hasAttribute('hidden'),false);
const scheduledStart = player.timelineScheduler.startTime;
player.resize({width:390,height:844});
player.setOption('theme','white');
assert.equal(player.timelineScheduler.startTime,scheduledStart);
assert.equal(timedCalls.length,1,'diagram re-layout adds no duplicate note');
assert.equal(player.playheadBar.getAttribute('fill'),'#a85400');
engine.currentTime = .6;
tick(16);
assert.equal(timedCalls.length,2);
assert.ok(Math.abs(timedCalls[1].options.at - .65) < 1e-9,'diagram scheduling stays on the initial audio clock');
assert.equal(player.diagramReplayTimeline().cursors.length,2);
Object.defineProperty(document,'hidden',{value:true,configurable:true});
tick(16);
assert.equal(player.timelineScheduler.active,false);
assert.equal(player.playhead.hasAttribute('hidden'),true);
Object.defineProperty(document,'hidden',{value:false,configurable:true});
tick(16);
assert.equal(timedCalls.length,2,'returning to a visible tab does not resume the stopped tune');
assert.equal(player.replay(),true);
assert.equal(player.timelineScheduler.active,true);
player.pause();
assert.equal(player.timelineScheduler.active,false);
player.stop();

console.log('판서 단계·회전·듣기 예약·이어 쓰기·도식 가락·접근성·화음·해보기 대기 시험 통과');
