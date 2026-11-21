import { parsePitch, pitchClassName } from './pitch.js';
import { DEFAULT_KEY, isSupportedKey, scaleInKey } from './scale.js';
import { describeDiatonicChord } from './chord.js';
import { THEORY_POLICY } from './policy.js';

const LETTER_KO = { C: '다', D: '라', E: '마', F: '바', G: '사', A: '가', B: '나' };
const FIXED_DO = { C: '도', D: '레', E: '미', F: '파', G: '솔', A: '라', B: '시' };
const SOLFEGE = Object.values(FIXED_DO);
const CHORD_NAMES = { 1: '으뜸화음', 4: '버금딸림화음', 5: '딸림화음' };
const CHORD_NUMERALS = { 1:'I', 2:'II', 3:'III', 4:'IV', 5:'V', 6:'VI', 7:'VII' };
function accidentalPrefix(pitch) { return pitch.acc === 2 ? '겹올림' : pitch.acc === -2 ? '겹내림' : pitch.acc === 1 ? '올림' : pitch.acc === -1 ? '내림' : ''; }
export function letterNameKo(pitch) { return accidentalPrefix(pitch) + LETTER_KO[pitch.letter]; }
export function letterNameEn(pitch) { return pitchClassName(pitch); }
export function scaleDegreeIndex(pitch, tonic, mode = 'major') {
  const key = { tonic,mode };
  if (!pitch || !isSupportedKey(key)) return null;
  const scale = scaleInKey(key,4,7);
  const index = scale.findIndex(note => pitchClassName(note) === pitchClassName(pitch));
  if (index >= 0) return index;
  if (mode === 'minor') {
    const raised = scale.findIndex((note,i) => [5,6].includes(i) && note.letter === pitch.letter && pitch.acc === note.acc + 1);
    if (raised >= 0) return raised;
  }
  return null;
}
export function solfegeInKey(pitch, tonic, mode = 'major') {
  const index = scaleDegreeIndex(pitch,tonic,mode);
  if (index === null) return null;
  if (mode !== 'minor') return SOLFEGE[index];
  const base = SOLFEGE[(index + (THEORY_POLICY.minorTonic === 'la' ? 5 : 0)) % 7];
  const natural = scaleInKey({ tonic,mode },4,7)[index];
  return (pitch.acc > natural.acc ? THEORY_POLICY.raisedMinorSolfegePrefix : '') + base;
}
export function keyNameKo(tonic, mode = 'major') {
  const pitch = parsePitch(tonic + '4');
  return pitch ? letterNameKo(pitch) + (mode === 'minor' ? '단조' : '장조') : '';
}
export function chordNameKo(degree, kind) { return kind === 'seventh' ? degree === 5 ? '딸림7화음' : null : CHORD_NAMES[degree] ?? null; }
export function chordNumeral(degree, kind) { return kind === 'seventh' ? degree === 5 ? 'V7' : null : CHORD_NUMERALS[degree] ?? null; }
export function formatNoteLabel(pitchOrString, mode, key = DEFAULT_KEY) {
  const pitch = typeof pitchOrString === 'string' ? parsePitch(pitchOrString) : pitchOrString;
  if (!pitch) return '';
  if (mode === 'fixed-do') return accidentalPrefix(pitch) + FIXED_DO[pitch.letter];
  if (mode === 'ko') return letterNameKo(pitch);
  if (mode === 'en') return letterNameEn(pitch).replace('#','♯').replace('b','♭');
  if (mode === 'movable-do') return solfegeInKey(pitch,key.tonic,key.mode) ?? '';
  if (mode === 'both') return [solfegeInKey(pitch,key.tonic,key.mode),letterNameKo(pitch)].filter(Boolean).join(' · ');
  return '';
}
/** Freeform prior labels are editable memory, never an unverified theory assertion. */
export function describeChord(column, key = DEFAULT_KEY, expanded = false) {
  const pitches = Array.isArray(column?.notes) ? column.notes.map(note => parsePitch(note?.pitch)) : [];
  const result = describeDiatonicChord(pitches,key);
  const match = result.warning || (!expanded && key.mode === 'major' && !result.name) ? null : result;
  const legacyName = typeof column?.legacyName === 'string' ? column.legacyName.trim() : '';
  const legacyRoman = typeof column?.legacyRoman === 'string' ? column.legacyRoman.trim() : '';
  const mismatch = (legacyName && legacyName !== match?.name) || (legacyRoman && legacyRoman !== match?.roman);
  if (mismatch) {
    const notes = pitches.map(pitch => formatNoteLabel(pitch,'fixed-do')).filter(Boolean).join('·');
    return { name: match?.name || (notes ? notes + ' · 검토 필요' : '이름 검토 필요'), roman: match?.name ? match.roman : '', warning: '이전 이름을 확인해 주세요.' };
  }
  if (match) return { name: match.name || match.qualityName, roman: match.roman, warning: '' };
  return { name:'', roman:'', warning:'이 조와 구성음의 화음 기능을 확인할 수 없습니다.' };
}
