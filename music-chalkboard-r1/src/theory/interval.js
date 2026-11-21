import { diatonicIndex, parsePitch } from './pitch.js';
const asPitch = pitch => typeof pitch === 'string' ? parsePitch(pitch) : pitch;
const BASE = [0, 2, 4, 5, 7, 9, 11];
const QUALITY_KO = { perfect: '완전', major: '장', minor: '단', augmented: '증', diminished: '감' };

export function describeInterval(first, second) {
  let a = asPitch(first), b = asPitch(second);
  const unsupported = { degree: null, semitones: null, quality: null, name: '', supported: false, warning: '이 음정의 이름을 표시할 수 없습니다.' };
  if (!a || !b || !Number.isFinite(a.midi) || !Number.isFinite(b.midi)) return unsupported;
  if (a.midi > b.midi || (a.midi === b.midi && diatonicIndex(a) > diatonicIndex(b))) [a,b] = [b,a];
  const degree = diatonicIndex(b) - diatonicIndex(a) + 1;
  const semitones = b.midi - a.midi;
  if (degree < 1) return { ...unsupported, semitones };
  const simple = (degree - 1) % 7, octaves = Math.floor((degree - 1) / 7);
  const delta = semitones - BASE[simple] - 12 * octaves;
  const perfect = [0,3,4].includes(simple);
  const quality = delta === 0 ? perfect ? 'perfect' : 'major'
    : delta === 1 ? 'augmented'
    : delta === -1 ? perfect ? 'diminished' : 'minor'
    : delta === -2 && !perfect ? 'diminished' : null;
  return { degree, semitones, quality, name: quality ? QUALITY_KO[quality] + degree + '도' : '', supported: !!quality,
    warning: quality ? '' : unsupported.warning };
}
export const intervalBetween = describeInterval;
export function intervalName(first, second) { return describeInterval(first, second).name; }
