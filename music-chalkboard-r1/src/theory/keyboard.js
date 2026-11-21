import { formatPitch, makePitch, parsePitch, pitchClassNumber } from './pitch.js';
import { isSupportedKey, keySignatureAccidentals, scaleInKey } from './scale.js';
const SHARP_SPELLING = [ [0,0],[0,1],[1,0],[1,1],[2,0],[3,0],[3,1],[4,0],[4,1],[5,0],[5,1],[6,0] ];
const FLAT_SPELLING = [ [0,0],[1,-1],[1,0],[2,-1],[2,0],[3,0],[4,-1],[4,0],[5,-1],[5,0],[6,-1],[6,0] ];
export function pitchFromMidi(midi) {
  const [step, acc] = SHARP_SPELLING[pitchClassNumber(midi)];
  return makePitch(step, acc, Math.floor(midi / 12) - 1);
}
export function keyboardPitchInKey(midi, key) {
  const physical = pitchFromMidi(midi);
  if (!isSupportedKey(key)) return physical;
  const scale = scaleInKey(key,4,7);
  const spelling = scale.find(pitch => pitchClassNumber(pitch.midi) === pitchClassNumber(midi));
  if (spelling) return makePitch(spelling.step,spelling.acc,spelling.octave + (midi - spelling.midi) / 12);
  if (physical.acc === 0) return physical;
  const flat = Object.values(keySignatureAccidentals(key.tonic,key.mode)).some(acc => acc < 0);
  const [step,acc] = (flat ? FLAT_SPELLING : SHARP_SPELLING)[pitchClassNumber(midi)];
  return makePitch(step,acc,Math.floor(midi / 12) - 1);
}
export const spellKeyboardPitch = keyboardPitchInKey;
export function buildKeyboard(from, to, key) {
  const first = parsePitch(from), last = parsePitch(to);
  if (!first || !last || first.acc !== 0 || last.acc !== 0 || first.midi < 0 || last.midi > 127 || first.midi >= last.midi || last.midi - first.midi > 24) return [];
  let whiteCount = 0;
  return Array.from({ length: last.midi - first.midi + 1 }, (_, index) => {
    const midi = first.midi + index, physical = pitchFromMidi(midi), pitch = keyboardPitchInKey(midi,key);
    const white = physical.acc === 0;
    return { midi, white, name: formatPitch(pitch), whiteIndex: white ? whiteCount++ : whiteCount - 1 };
  });
}
