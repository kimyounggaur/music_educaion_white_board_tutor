export const LETTERS = Object.freeze(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
const LETTER_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
const PITCH_RE = /^([A-G])([#b]?)(-?[0-9])$/;

export function makePitch(step, acc, octave) {
  return { letter: LETTERS[step], step, acc, octave, midi: (octave + 1) * 12 + LETTER_SEMITONES[step] + acc };
}

export function parsePitch(text) {
  if (typeof text !== 'string') return null;
  const match = PITCH_RE.exec(text);
  if (!match) return null;
  const [, letter, sign, octave] = match;
  return makePitch(LETTERS.indexOf(letter), sign === '#' ? 1 : sign === 'b' ? -1 : 0, Number(octave));
}

export function accidentalText(acc) {
  return Number.isInteger(acc) && Math.abs(acc) <= 2 ? acc > 0 ? '#'.repeat(acc) : 'b'.repeat(-acc) : '';
}

export function pitchClassName(pitch) {
  return pitch.letter + accidentalText(pitch.acc);
}

export function formatPitch(pitch) {
  return pitchClassName(pitch) + pitch.octave;
}

export function diatonicIndex(pitch) {
  return pitch.octave * 7 + pitch.step;
}

export function pitchClassNumber(midi) {
  return ((midi % 12) + 12) % 12;
}

export function midiToFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function isStaffPitch(pitch) {
  if (!pitch) return false;
  const index = diatonicIndex(pitch);
  return index >= 28 && index <= 46; // Written C4 through G6, including accidentals.
}
