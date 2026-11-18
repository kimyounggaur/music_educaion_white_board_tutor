import { formatPitch, makePitch, parsePitch, pitchClassNumber } from './pitch.js';

const SHARP_SPELLING = [
  [0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0], [3, 1], [4, 0], [4, 1], [5, 0], [5, 1], [6, 0],
];

export function pitchFromMidi(midi) {
  const [step, acc] = SHARP_SPELLING[pitchClassNumber(midi)];
  return makePitch(step, acc, Math.floor(midi / 12) - 1);
}

export function buildKeyboard(from, to) {
  const first = parsePitch(from);
  const last = parsePitch(to);
  if (!first || !last || first.acc !== 0 || last.acc !== 0 || first.midi < 0 || last.midi > 127 || first.midi >= last.midi || last.midi - first.midi > 24) return [];
  let whiteCount = 0;
  return Array.from({ length: last.midi - first.midi + 1 }, (_, index) => {
    const midi = first.midi + index;
    const pitch = pitchFromMidi(midi);
    const white = pitch.acc === 0;
    const whiteIndex = white ? whiteCount++ : whiteCount - 1;
    return { midi, white, name: formatPitch(pitch), whiteIndex };
  });
}
