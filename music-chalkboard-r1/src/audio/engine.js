// Web Audio synthesis based on commit 6804a36, src/lib/audio/engine.ts.
import { midiToFrequency } from '../theory/pitch.js';

const MAX_VOICES = 16;
const PARTIALS = [['triangle', 1, 1], ['sine', 2, 0.32], ['sine', 3, 0.1]];

export class BoardAudio {
  constructor(Context = globalThis.AudioContext || globalThis.webkitAudioContext || globalThis.window?.AudioContext || globalThis.window?.webkitAudioContext) {
    this.Context = Context;
    this.context = null;
    this.output = null;
    this.voices = new Set();
  }

  get status() {
    if (!this.Context) return 'unavailable';
    return this.context?.state === 'running' ? 'ready' : 'locked';
  }

  unlockFromGesture() {
    if (!this.Context) return Promise.resolve(false);
    if (this.status === 'ready') return Promise.resolve(true);
    try {
      if (!this.context || this.context.state === 'closed') {
        this.context = new this.Context({ latencyHint:'interactive' });
        this.output = this.context.createGain();
        this.output.gain.value = 0.75;
        const comp = this.context.createDynamicsCompressor();
        comp.threshold.value = -16;
        comp.knee.value = 24;
        comp.ratio.value = 5;
        comp.attack.value = 0.003;
        comp.release.value = 0.25;
        this.output.connect(comp);
        comp.connect(this.context.destination);
      }
      return Promise.resolve(this.context.resume()).then(() => this.status === 'ready', () => false);
    } catch {
      return Promise.resolve(false);
    }
  }

  play(midis, { duration = Array.isArray(midis) && midis.length > 1 ? 1.3 : 0.65 } = {}) {
    if (this.status !== 'ready' || !Array.isArray(midis) || !midis.length ||
        midis.length > MAX_VOICES || !midis.every(midi => Number.isInteger(midi) && midi >= 0 && midi <= 127) ||
        !Number.isFinite(duration) || duration <= 0) return false;
    const pitches = [...new Set(midis)];
    for (const voice of this.voices) {
      if (this.voices.size + pitches.length <= MAX_VOICES) break;
      this.release(voice, true);
    }
    const start = this.context.currentTime + 0.005;
    for (const midi of pitches) {
      this.playVoice(midi, start, duration, 0.34 / Math.sqrt(pitches.length));
    }
    return true;
  }

  playVoice(midi, start, duration, level) {
    const ctx = this.context;
    const end = start + Math.max(0.12, duration);
    const frequency = midiToFrequency(midi);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(level, start + 0.012);
    gain.gain.setTargetAtTime(level * 0.42, start + 0.012, 0.32);
    gain.gain.setTargetAtTime(0.0001, end, 0.11);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.6;
    filter.frequency.setValueAtTime(Math.min(frequency * 9, 7000), start);
    filter.frequency.setTargetAtTime(Math.min(frequency * 3, 2600), start, 0.25);
    filter.connect(gain);
    gain.connect(this.output);

    const oscillators = [];
    const overtones = [];
    for (const [type, harmonic, level] of PARTIALS) {
      const oscillator = ctx.createOscillator();
      const overtone = ctx.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency * harmonic;
      overtone.gain.value = level;
      oscillator.connect(overtone);
      overtone.connect(filter);
      oscillators.push(oscillator);
      overtones.push(overtone);
    }
    const voice = { gain, filter, oscillators, overtones };
    this.voices.add(voice);
    oscillators[0].addEventListener('ended', () => {
      this.voices.delete(voice);
      for (const node of [...oscillators, ...overtones, filter, gain]) node.disconnect();
    }, { once:true });
    for (const oscillator of oscillators) {
      oscillator.start(start);
      oscillator.stop(end + 0.9);
    }
  }

  release(voice, immediate = false) {
    if (!immediate && voice.releasing) return;
    voice.releasing = true;
    if (immediate) this.voices.delete(voice);
    const now = this.context.currentTime;
    const volume = voice.gain.gain;
    if (typeof volume.cancelAndHoldAtTime === 'function') {
      volume.cancelAndHoldAtTime(now);
    } else {
      volume.cancelScheduledValues(now);
    }
    if (immediate) volume.setValueAtTime(0.0001, now);
    else volume.setTargetAtTime(0.0001, now, 0.02);
    for (const oscillator of voice.oscillators) oscillator.stop(immediate ? now : now + 0.12);
  }

  stop() {
    for (const voice of this.voices) this.release(voice);
  }
}
