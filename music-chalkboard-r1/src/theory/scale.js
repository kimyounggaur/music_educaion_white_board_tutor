import { diatonicIndex, makePitch, parsePitch, pitchClassName } from './pitch.js';

export const MAJOR_KEY_TONICS = Object.freeze([
  'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb',
]);
export const MINOR_KEY_TONICS = Object.freeze(['A']);
export const DEFAULT_KEY = Object.freeze({ tonic: 'C', mode: 'major' });
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const NATURAL_MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];

export function isSupportedMajorKey(tonic) {
  return MAJOR_KEY_TONICS.includes(tonic);
}

export function isSupportedKey(key) {
  if (key?.mode === 'major') return isSupportedMajorKey(key.tonic);
  return key?.mode === 'minor' && MINOR_KEY_TONICS.includes(key.tonic);
}

export function scaleInKey(key, octave = 4, count = 8) {
  if (!isSupportedKey(key)) throw new Error('지원하지 않는 조입니다.');
  const root = parsePitch(key.tonic + octave);
  const offsets = key.mode === 'minor' ? NATURAL_MINOR_STEPS : MAJOR_STEPS;
  return Array.from({ length: count }, (_, index) => {
    const letterIndex = root.step + index;
    const step = letterIndex % 7;
    const targetOctave = root.octave + Math.floor(letterIndex / 7);
    const targetMidi = root.midi + offsets[index % 7] + 12 * Math.floor(index / 7);
    const accidental = targetMidi - makePitch(step, 0, targetOctave).midi;
    return makePitch(step, accidental, targetOctave);
  });
}

export function majorScale(tonic = 'C', octave = 4, count = 8) {
  return scaleInKey({ tonic, mode: 'major' }, octave, count);
}

export function keySignatureAccidentals(tonic, mode = 'major') {
  const signature = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
  const key = { tonic, mode };
  if (isSupportedKey(key)) {
    for (const pitch of scaleInKey(key, 4, 7)) signature[pitch.letter] = pitch.acc;
  }
  return signature;
}

export function diatonicChordNames(tonic, degree, kind) {
  const scale = majorScale(tonic, 4, 15);
  return Array.from({ length: kind === 'seventh' ? 4 : 3 }, (_, index) => pitchClassName(scale[degree - 1 + 2 * index]));
}

/** Measureless teaching staves carry signs across the same letter and octave. */
export function accidentalEvents(columns, key = DEFAULT_KEY) {
  const signature = keySignatureAccidentals(key.tonic, key.mode);
  const previous = new Map();
  const events = new Map();
  for (const column of columns) {
    for (const note of column?.notes ?? []) {
      const pitch = parsePitch(note?.pitch);
      if (!pitch) continue;
      const index = diatonicIndex(pitch);
      const last = previous.get(index);
      const fromKey = signature[pitch.letter];
      const show = pitch.acc !== (last?.acc ?? fromKey);
      const accidental = show ? pitch.acc === 0 ? '♮' : pitch.acc === 1 ? '♯' : '♭' : null;
      const dependency = !show ? last?.sourceNoteId ?? null : null;
      events.set(note.id, { accidental, dependency });
      previous.set(index, { acc: pitch.acc, sourceNoteId: show ? note.id : last?.sourceNoteId });
    }
  }
  return events;
}
