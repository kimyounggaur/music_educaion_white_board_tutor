/**
 * 음 높이 표기("C4", "F#4", "Bb3")를 다루는 기본 도구.
 * 겹임시표는 지원하지 않는다(1단계 수업에 필요 없고, 표기 오류를 막기 위해서다).
 */

export const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
export type Letter = (typeof LETTERS)[number];
export type Accidental = -1 | 0 | 1;

/** 각 글자의 반음 위치(C=0 … B=11) */
const LETTER_SEMITONES = [0, 2, 4, 5, 7, 9, 11] as const;

export interface Pitch {
  letter: Letter;
  /** 글자 순서(C=0 … B=6) */
  step: number;
  acc: Accidental;
  octave: number;
  /** MIDI 번호(C4=60) */
  midi: number;
}

const PITCH_RE = /^([A-G])(#|b)?(-?\d)$/;

export function makePitch(step: number, acc: Accidental, octave: number): Pitch {
  const letter = LETTERS[step] as Letter;
  const midi = (octave + 1) * 12 + (LETTER_SEMITONES[step] as number) + acc;
  return { letter, step, acc, octave, midi };
}

/** "F#4" 같은 글을 해석한다. 형식이 틀리면 null. */
export function parsePitch(text: string): Pitch | null {
  const m = PITCH_RE.exec(text);
  if (!m) return null;
  const step = LETTERS.indexOf(m[1] as Letter);
  const acc: Accidental = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return makePitch(step, acc, Number(m[3]));
}

export function accidentalText(acc: Accidental): string {
  return acc === 1 ? "#" : acc === -1 ? "b" : "";
}

export function formatPitch(p: Pitch): string {
  return `${p.letter}${accidentalText(p.acc)}${p.octave}`;
}

/** 옥타브를 뺀 이름. "F#", "Bb", "C" */
export function pitchClassName(p: Pitch): string {
  return `${p.letter}${accidentalText(p.acc)}`;
}

/** 글자 기준 위치(옥타브 포함). 3도 간격 검사에 쓴다. */
export function diatonicIndex(p: Pitch): number {
  return p.octave * 7 + p.step;
}

/** 0~11. 건반에서 같은 키인지 비교할 때 쓴다(이명동음 포함, 옥타브 무관). */
export function pitchClassNumber(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

/** 평균율 A4=440Hz */
export function frequency(p: Pitch): number {
  return 440 * Math.pow(2, (p.midi - 69) / 12);
}
