/** 장음계와 조 안의 화음을 계산한다. 수업 대본의 이론 사실은 모두 여기서 검산한다. */

import {
  makePitch,
  parsePitch,
  pitchClassName,
  type Accidental,
  type Letter,
  type Pitch,
} from "./pitch";

/** 으뜸음에서 각 음까지의 반음 수(장음계: 온 온 반 온 온 온 반) */
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11] as const;

/** 겹임시표 없이 쓸 수 있는 15개 장조의 으뜸음 */
export const MAJOR_KEY_TONICS = [
  "C", "G", "D", "A", "E", "B", "F#", "C#", "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb",
] as const;

export function isSupportedMajorKey(tonic: string): boolean {
  return (MAJOR_KEY_TONICS as readonly string[]).includes(tonic);
}

/**
 * tonic에서 시작하는 장음계. count 기본값 8은 한 옥타브(으뜸음 포함 8개)다.
 * 글자는 한 칸씩 올라가고 임시표로 반음 위치를 맞춘다(예: 사장조의 일곱째 음은 F#).
 */
export function majorScale(tonic: string, octave = 4, count = 8): Pitch[] {
  const root = isSupportedMajorKey(tonic) ? parsePitch(`${tonic}${octave}`) : null;
  if (!root) throw new Error(`지원하지 않는 장조: ${tonic}`);
  const out: Pitch[] = [];
  for (let k = 0; k < count; k++) {
    const letterIndex = root.step + k;
    const step = letterIndex % 7;
    const oct = root.octave + Math.floor(letterIndex / 7);
    const target = root.midi + (MAJOR_STEPS[k % 7] as number) + 12 * Math.floor(k / 7);
    const acc = target - makePitch(step, 0, oct).midi;
    if (acc < -1 || acc > 1) throw new Error(`겹임시표가 필요한 조: ${tonic}`);
    out.push(makePitch(step, acc as Accidental, oct));
  }
  return out;
}

/** 조표가 정하는 글자별 임시표(예: 사장조는 F가 +1) */
export function keySignatureAccidentals(tonic: string): Record<Letter, Accidental> {
  const out = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 } as Record<Letter, Accidental>;
  for (const p of majorScale(tonic, 4, 7)) out[p.letter] = p.acc;
  return out;
}

export type ChordKind = "triad" | "seventh";

/**
 * 조의 degree(1~7)번째 음 위에 3도씩 쌓은 화음의 음 이름(옥타브 없이, 아래에서 위로).
 * 예: 다장조 5도 7화음 → ["G","B","D","F"]
 */
export function diatonicChordNames(tonic: string, degree: number, kind: ChordKind): string[] {
  const scale = majorScale(tonic, 4, 15);
  const count = kind === "seventh" ? 4 : 3;
  return Array.from({ length: count }, (_, i) => pitchClassName(scale[degree - 1 + 2 * i] as Pitch));
}
