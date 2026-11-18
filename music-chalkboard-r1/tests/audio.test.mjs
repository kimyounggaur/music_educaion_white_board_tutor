import assert from 'node:assert/strict';
import { BoardAudio } from '../src/audio/engine.js';

const param = () => ({
  value:0,
  setValueAtTime() {},
  linearRampToValueAtTime() {},
  setTargetAtTime() {},
  cancelAndHoldAtTime() {},
});
const node = () => ({connect() {}, disconnect() {}});
class Context {
  constructor() {
    this.state = 'suspended';
    this.destination = node();
    this.currentTime = 2;
    this.oscillators = [];
  }

  resume() { this.state = 'running'; return Promise.resolve(); }
  createGain() { return {...node(), gain:param()}; }
  createDynamicsCompressor() {
    return {...node(), threshold:param(), knee:param(), ratio:param(), attack:param(), release:param()};
  }
  createBiquadFilter() { return {...node(), Q:param(), frequency:param()}; }
  createOscillator() {
    const osc = new EventTarget();
    Object.assign(osc, node(), {
      frequency:param(),
      start(at) { this.startedAt = at; },
      stop(at) { this.stoppedAt = at; },
    });
    this.oscillators.push(osc);
    return osc;
  }
}

const audio = new BoardAudio(Context);
assert.equal(audio.status, 'locked');
assert.equal(audio.play([60]), false);
assert.equal(audio.context, null, 'playback must not create an audio context');

const unlocking = audio.unlockFromGesture();
assert.ok(audio.context, 'context creation must happen inside the gesture');
assert.equal(await unlocking, true);
assert.equal(audio.status, 'ready');

assert.equal(audio.play([-1]), false);
assert.equal(audio.play([60.5]), false);
assert.equal(audio.play(null), false);
assert.equal(audio.play([60, 64, 67]), true);
const chord = audio.context.oscillators;
assert.equal(chord.length, 9);
assert.equal(new Set(chord.map(osc => osc.startedAt)).size, 1);
assert.equal(Math.round(chord[0].frequency.value * 100), 26163);
assert.equal(audio.play([69]), true);
assert.equal(audio.context.oscillators.at(-3).frequency.value, 440);

for (let i = 0; i < 20; i++) audio.play([60]);
assert.equal(audio.voices.size, 16);
audio.stop();
for (const oscillator of audio.context.oscillators) {
  assert.ok(oscillator.stoppedAt <= 2.12, 'stop must cancel the pending nodes');
  oscillator.dispatchEvent(new Event('ended'));
}
assert.equal(audio.voices.size, 0);

const noAudio = new BoardAudio(null);
assert.equal(noAudio.status, 'unavailable');
assert.equal(await noAudio.unlockFromGesture(), false);
assert.equal(noAudio.play([60]), false);
console.log('오디오 사용자 초기화·MIDI·동시 발음·중지 시험 통과');
