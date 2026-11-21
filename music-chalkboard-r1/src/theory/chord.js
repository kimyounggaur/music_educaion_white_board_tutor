import { diatonicIndex, parsePitch, pitchClassName } from './pitch.js';
import { calculateScale, isSupportedKey, scaleInKey } from './scale.js';
import { describeInterval } from './interval.js';
import { THEORY_POLICY } from './policy.js';
const asPitch = pitch => typeof pitch === 'string' ? parsePitch(pitch) : pitch;
const QUALITY_NAMES = { major: '장3화음', minor: '단3화음', diminished: '감3화음', augmented: '증3화음', dominant7: '딸림7화음꼴' };
const ROMANS = ['I','II','III','IV','V','VI','VII'];
const FUNCTIONS = { 1: '으뜸화음', 4: '버금딸림화음', 5: '딸림화음' };
export function chordInKey(key, degree, { kind = 'triad', form, octave = 4, allowDouble = false } = {}) {
  if (!Number.isInteger(degree) || degree < 1 || degree > 7 || !['triad','seventh'].includes(kind)) throw new Error('화음의 도수와 종류를 확인해 주세요.');
  const selected = form ?? (key?.mode === 'minor' ? 'harmonic' : 'major');
  const scale = (allowDouble ? calculateScale : scaleInKey)(key, octave, degree + (kind === 'seventh' ? 6 : 4), selected);
  return Array.from({ length: kind === 'seventh' ? 4 : 3 }, (_, i) => scale[degree - 1 + 2 * i]);
}
export function diatonicChord(key, degree, kind = 'triad', octave = 4, form) { return chordInKey(key, degree, { kind, octave, form }); }
export function chordQuality(values) {
  const pitches = values.map(asPitch);
  if (![3,4].includes(pitches.length) || pitches.some(p => !p)) return null;
  const [root,third,fifth,seventh] = pitches;
  if (describeInterval(root,third).degree !== 3 || describeInterval(root,fifth).degree !== 5) return null;
  const a = third.midi - root.midi, b = fifth.midi - root.midi;
  let quality = a === 4 && b === 7 ? 'major' : a === 3 && b === 7 ? 'minor' : a === 3 && b === 6 ? 'diminished' : a === 4 && b === 8 ? 'augmented' : null;
  if (seventh) quality = quality === 'major' && describeInterval(root,seventh).degree === 7 && seventh.midi - root.midi === 10 ? 'dominant7' : null;
  return quality;
}
export function describeDiatonicChord(values, key) {
  const pitches = values.map(asPitch), quality = chordQuality(pitches);
  const empty = { name: '', roman: '', degree: null, quality, qualityName: QUALITY_NAMES[quality] ?? '', warning: '이 조와 구성음의 화음 기능을 확인할 수 없습니다.' };
  if (!quality || pitches.some(p => !p) || !isSupportedKey(key)) return empty;
  const natural = calculateScale(key, 4, 7);
  const root = pitches[0];
  const degree = natural.findIndex(p => p.letter === root.letter) + 1;
  if (!degree) return empty;
  const kind = pitches.length === 4 ? 'seventh' : 'triad';
  const forms = key.mode === 'minor' ? ['harmonic','natural','melodic'] : ['major'];
  const matches = forms.filter(form => {
    const expected = chordInKey(key,degree,{ kind, octave: root.octave, form, allowDouble: true });
    return pitches.every((p,i) => pitchClassName(p) === pitchClassName(expected[i]) && diatonicIndex(p) - diatonicIndex(root) === diatonicIndex(expected[i]) - diatonicIndex(expected[0]));
  });
  if (!matches.length) return empty;
  if (kind === 'seventh' && (degree !== 5 || quality !== 'dominant7')) return empty;
  let name = FUNCTIONS[degree] ?? '';
  if (key.mode === 'minor' && degree === 5 && !matches.includes('harmonic')) name = '';
  if (kind === 'seventh') name = '딸림7화음';
  let roman = ROMANS[degree - 1];
  if (THEORY_POLICY.romanNumerals === 'quality') {
    if (quality === 'minor' || quality === 'diminished') roman = roman.toLowerCase();
    if (quality === 'diminished') roman += '°';
    if (quality === 'augmented') roman += '+';
  }
  if (kind === 'seventh') roman += '7';
  return { name, roman, degree, quality, qualityName: QUALITY_NAMES[quality], warning: '' };
}
export function classifyCadence(first, second) {
  const a = typeof first === 'number' ? { degree: first } : first;
  const b = typeof second === 'number' ? { degree: second } : second;
  const aSeventh = a?.kind === 'seventh' || a?.quality === 'dominant7' || a?.notes?.length === 4;
  const bSeventh = b?.kind === 'seventh' || b?.quality === 'dominant7' || b?.notes?.length === 4;
  if (!a || !b || bSeventh) return '';
  let name = '';
  if (a.degree === 5 && b.degree === 1) name = '바른마침';
  else if (a.degree === 4 && b.degree === 1 && !aSeventh) name = '벗어난마침';
  else if ([1,2,4,6].includes(a.degree) && b.degree === 5 && !aSeventh) name = '반마침';
  else if (a.degree === 5 && b.degree === 6) name = '거짓마침';
  if (THEORY_POLICY.cadenceTerminology === 'hanja') return ({ 바른마침:'정격 종지', 벗어난마침:'변격 종지', 반마침:'반종지', 거짓마침:'위종지' })[name] ?? '';
  return name;
}
export const cadenceName = classifyCadence;
