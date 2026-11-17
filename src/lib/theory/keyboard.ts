/** 건반 배치 계산. 흰 건반 양 끝으로 범위를 정하고, 사이의 검은 건반을 모두 포함한다. */

import { formatPitch, makePitch, pitchClassNumber, type Accidental, type Pitch } from "./pitch";

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];

/** 반음 번호(0~11) → [글자 순서, 임시표]. 검은 건반은 올림표로 적는다. */
const SHARP_SPELLING: Array<[number, Accidental]> = [
  [0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0], [3, 1], [4, 0], [4, 1], [5, 0], [5, 1], [6, 0],
];

export function pitchFromMidi(midi: number): Pitch {
  const [step, acc] = SHARP_SPELLING[pitchClassNumber(midi)] as [number, Accidental];
  return makePitch(step, acc, Math.floor(midi / 12) - 1);
}

export function isWhiteMidi(midi: number): boolean {
  return WHITE_PCS.includes(pitchClassNumber(midi));
}

export interface KeyDef {
  midi: number;
  white: boolean;
  /** "C4", "C#4" */
  name: string;
  /** 흰 건반이면 자기 순번, 검은 건반이면 왼쪽 흰 건반의 순번 */
  whiteIndex: number;
}

export function keyboardKeys(fromMidi: number, toMidi: number): KeyDef[] {
  const keys: KeyDef[] = [];
  let whiteCount = 0;
  for (let midi = fromMidi; midi <= toMidi; midi++) {
    const white = isWhiteMidi(midi);
    keys.push({
      midi,
      white,
      name: formatPitch(pitchFromMidi(midi)),
      whiteIndex: white ? whiteCount : whiteCount - 1,
    });
    if (white) whiteCount++;
  }
  return keys;
}

export function countWhiteKeys(fromMidi: number, toMidi: number): number {
  let n = 0;
  for (let midi = fromMidi; midi <= toMidi; midi++) if (isWhiteMidi(midi)) n++;
  return n;
}
