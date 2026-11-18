import { parsePitch, pitchClassName } from './pitch.js';
import { DEFAULT_KEY, diatonicChordNames, isSupportedKey, majorScale } from './scale.js';

const LETTER_KO = { C: '다', D: '라', E: '마', F: '바', G: '사', A: '가', B: '나' };
const FIXED_DO = { C: '도', D: '레', E: '미', F: '파', G: '솔', A: '라', B: '시' };
const SOLFEGE = Object.values(FIXED_DO);
const CHORD_NAMES = { 1: '으뜸화음', 4: '버금딸림화음', 5: '딸림화음' };
const CHORD_NUMERALS = { 1: 'I', 4: 'IV', 5: 'V' };

function accidentalPrefix(pitch) {
  return pitch.acc === 1 ? '올림' : pitch.acc === -1 ? '내림' : '';
}

export function letterNameKo(pitch) {
  return accidentalPrefix(pitch) + LETTER_KO[pitch.letter];
}

export function letterNameEn(pitch) {
  return pitchClassName(pitch);
}

export function scaleDegreeIndex(pitch, tonic, mode = 'major') {
  if (mode !== 'major' || !isSupportedKey({ tonic, mode })) return null;
  const name = pitchClassName(pitch);
  const index = majorScale(tonic, 4, 7).findIndex(note => pitchClassName(note) === name);
  return index < 0 ? null : index;
}

export function solfegeInKey(pitch, tonic, mode = 'major') {
  const index = scaleDegreeIndex(pitch, tonic, mode);
  return index === null ? null : SOLFEGE[index];
}

export function keyNameKo(tonic, mode = 'major') {
  const pitch = parsePitch(tonic + '4');
  if (!pitch) return '';
  return letterNameKo(pitch) + (mode === 'minor' ? '단조' : '장조');
}

export function chordNameKo(degree, kind) {
  if (kind === 'seventh') return degree === 5 ? '딸림7화음' : null;
  return CHORD_NAMES[degree] ?? null;
}

export function chordNumeral(degree, kind) {
  if (kind === 'seventh') return degree === 5 ? 'V7' : null;
  return CHORD_NUMERALS[degree] ?? null;
}

export function formatNoteLabel(pitchOrString, mode, key = DEFAULT_KEY) {
  const pitch = typeof pitchOrString === 'string' ? parsePitch(pitchOrString) : pitchOrString;
  if (!pitch) return '';
  if (mode === 'fixed-do') return accidentalPrefix(pitch) + FIXED_DO[pitch.letter];
  if (mode === 'ko') return letterNameKo(pitch);
  if (mode === 'en') return letterNameEn(pitch).replace('#', '♯').replace('b', '♭');
  if (mode === 'movable-do') return solfegeInKey(pitch, key.tonic, key.mode) ?? '';
  if (mode === 'both') {
    return [solfegeInKey(pitch, key.tonic, key.mode), letterNameKo(pitch)].filter(Boolean).join(' · ');
  }
  return '';
}

function describeSupportedChord(pitches, key) {
  if (pitches.some(pitch => !pitch) || !isSupportedKey(key) || key.mode !== 'major') return null;
  const kind = pitches.length === 4 ? 'seventh' : pitches.length === 3 ? 'triad' : null;
  if (!kind) return null;
  const degree = scaleDegreeIndex(pitches[0], key.tonic, key.mode);
  if (degree === null) return null;
  const name = chordNameKo(degree + 1, kind);
  const roman = chordNumeral(degree + 1, kind);
  if (!name || !roman) return null;
  const actual = pitches.map(pitchClassName);
  const expected = diatonicChordNames(key.tonic, degree + 1, kind);
  if (!actual.every((pitch, index) => pitch === expected[index])) return null;
  return { name, roman };
}

/** Prior freeform text is available for editing and never becomes a theory assertion. */
export function describeChord(column, key = DEFAULT_KEY) {
  const pitches = Array.isArray(column?.notes) ? column.notes.map(note => parsePitch(note?.pitch)) : [];
  const match = describeSupportedChord(pitches, key);
  const legacyName = typeof column?.legacyName === 'string' ? column.legacyName.trim() : '';
  const legacyRoman = typeof column?.legacyRoman === 'string' ? column.legacyRoman.trim() : '';
  const mismatch = (legacyName && legacyName !== match?.name) || (legacyRoman && legacyRoman !== match?.roman);
  if (mismatch) {
    const notes = pitches.map(pitch => formatNoteLabel(pitch, 'fixed-do')).filter(Boolean).join('·');
    return { name: match?.name ?? (notes ? notes + ' · 검토 필요' : '이름 검토 필요'), roman: match?.roman ?? '', warning: '이전 이름을 확인해 주세요.' };
  }
  if (match) return { ...match, warning: '' };
  return { name: '', roman: '', warning: '이 조와 구성음의 화음 기능을 확인할 수 없습니다.' };
}
