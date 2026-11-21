import { diatonicIndex, makePitch, parsePitch, pitchClassName } from './pitch.js';

export const MAJOR_KEY_TONICS = Object.freeze([
  'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb',
]);
export const MINOR_KEY_TONICS = Object.freeze([
  'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'D', 'G', 'C', 'F', 'Bb', 'Eb', 'Ab',
]);
export const STAFF_MINOR_KEY_TONICS = Object.freeze(MINOR_KEY_TONICS.filter(tonic => !['G#', 'D#', 'A#'].includes(tonic)));
export const DEFAULT_KEY = Object.freeze({ tonic: 'C', mode: 'major' });
export const SCALE_FORMS = Object.freeze(['major', 'natural', 'harmonic', 'melodic', 'pentatonic']);
const OFFSETS = Object.freeze({
  major: [0, 2, 4, 5, 7, 9, 11], natural: [0, 2, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11], melodic: [0, 2, 3, 5, 7, 9, 11],
  pentatonic: [0, 2, 4, 7, 9],
});
const DIATONIC = { pentatonic: [0, 1, 2, 4, 5] };

function normalizeForm(key, form) {
  return ({ 'natural-minor': 'natural', 'harmonic-minor': 'harmonic', 'melodic-minor': 'melodic', 'major-pentatonic': 'pentatonic' })[form]
    ?? form ?? (key?.mode === 'minor' ? 'natural' : 'major');
}
export function isSupportedMajorKey(tonic) { return MAJOR_KEY_TONICS.includes(tonic); }
export function isSupportedKey(key, form) {
  const selected = normalizeForm(key, form);
  if (key?.mode === 'major') return isSupportedMajorKey(key.tonic) && ['major', 'pentatonic'].includes(selected);
  if (key?.mode !== 'minor' || !MINOR_KEY_TONICS.includes(key.tonic) || !['natural', 'harmonic', 'melodic'].includes(selected)) return false;
  return selected === 'natural' || STAFF_MINOR_KEY_TONICS.includes(key.tonic);
}
export function availableScaleForms(key) { return SCALE_FORMS.filter(form => isSupportedKey(key, form)); }

/** Pure spelling calculation. Raw pitch objects may contain a double accidental. */
export function calculateScale(key, octave = 4, count = 8, form) {
  const selected = normalizeForm(key, form);
  const keyExists = key?.mode === 'major' ? MAJOR_KEY_TONICS.includes(key.tonic) : key?.mode === 'minor' && MINOR_KEY_TONICS.includes(key.tonic);
  if (!keyExists || !OFFSETS[selected] || (key.mode === 'major' ? !['major', 'pentatonic'].includes(selected) : !['natural', 'harmonic', 'melodic'].includes(selected))) throw new Error('지원하지 않는 조와 음계 종류입니다.');
  if (!Number.isInteger(octave) || octave < -1 || octave > 8 || !Number.isInteger(count) || count < 1 || count > 64) throw new Error('음계의 옥타브와 음 개수를 확인해 주세요.');
  const root = parsePitch(key.tonic + octave);
  const offsets = OFFSETS[selected];
  const letters = DIATONIC[selected] ?? [0, 1, 2, 3, 4, 5, 6];
  return Array.from({ length: count }, (_, index) => {
    const turn = Math.floor(index / offsets.length);
    const letterIndex = root.step + letters[index % offsets.length] + turn * 7;
    const step = letterIndex % 7;
    const targetOctave = root.octave + Math.floor(letterIndex / 7);
    const targetMidi = root.midi + offsets[index % offsets.length] + 12 * turn;
    return makePitch(step, targetMidi - makePitch(step, 0, targetOctave).midi, targetOctave);
  });
}

/** Staff-facing calculation rejects notation that requires deferred double signs. */
export function scaleInKey(key, octave = 4, count = 8, form) {
  if (!isSupportedKey(key, form)) throw new Error('지원하지 않는 조합입니다. 겹올림표가 필요한 음계는 아직 만들 수 없습니다.');
  const result = calculateScale(key, octave, count, form);
  if (result.some(pitch => Math.abs(pitch.acc) > 1)) throw new Error('겹변화표가 필요한 음계는 아직 만들 수 없습니다.');
  return result;
}
export function majorScale(tonic = 'C', octave = 4, count = 8) { return scaleInKey({ tonic, mode: 'major' }, octave, count); }
export function relativeMajor(keyOrTonic) {
  const tonic = typeof keyOrTonic === 'string' ? keyOrTonic : keyOrTonic?.tonic;
  if (!MINOR_KEY_TONICS.includes(tonic)) throw new Error('지원하는 단조를 선택해 주세요.');
  return { tonic: pitchClassName(calculateScale({ tonic, mode: 'minor' }, 4, 3, 'natural')[2]), mode: 'major' };
}
export const relativeMajorKey = relativeMajor;
export function keySignatureAccidentals(tonic, mode = 'major') {
  const signature = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
  const key = { tonic, mode };
  if (isSupportedKey(key)) for (const pitch of scaleInKey(key, 4, 7)) signature[pitch.letter] = pitch.acc;
  return signature;
}
export function keySignatureEntries(tonic, mode = 'major') {
  const signature = keySignatureAccidentals(tonic, mode);
  const sharp = Object.values(signature).some(acc => acc > 0);
  return (sharp ? ['F','C','G','D','A','E','B'] : ['B','E','A','D','G','C','F'])
    .filter(letter => signature[letter] !== 0).map(letter => ({ letter, acc: signature[letter] }));
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
  for (const column of columns) for (const note of column?.notes ?? []) {
    const pitch = parsePitch(note?.pitch);
    if (!pitch) continue;
    const index = diatonicIndex(pitch), last = previous.get(index), fromKey = signature[pitch.letter];
    const show = pitch.acc !== (last?.acc ?? fromKey);
    const accidental = show ? pitch.acc === 0 ? '♮' : pitch.acc === 1 ? '♯' : '♭' : null;
    const dependency = !show ? last?.sourceNoteId ?? null : null;
    events.set(note.id, { accidental, dependency });
    previous.set(index, { acc: pitch.acc, sourceNoteId: show ? note.id : last?.sourceNoteId });
  }
  return events;
}
