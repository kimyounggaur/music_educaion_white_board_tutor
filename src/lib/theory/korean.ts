/** 한국어 음악 이름. 확인되지 않은 용어는 넣지 않는다(개발 지시서 10장). */

import { parsePitch, pitchClassName, type Letter, type Pitch } from "./pitch";
import { majorScale, type ChordKind } from "./scale";

/** 음이름(다 라 마 바 사 가 나) */
const LETTER_KO: Record<Letter, string> = { C: "다", D: "라", E: "마", F: "바", G: "사", A: "가", B: "나" };

/** 계이름(이동도: 조의 으뜸음이 도) */
const SOLFEGE_KO = ["도", "레", "미", "파", "솔", "라", "시"] as const;

/** 음이름. 올림표·내림표가 있으면 앞에 붙인다(올림바, 내림나). */
export function letterNameKo(p: Pitch): string {
  const base = LETTER_KO[p.letter];
  return p.acc === 1 ? `올림${base}` : p.acc === -1 ? `내림${base}` : base;
}

/** 영어 음이름(C, F#, Bb) */
export function letterNameEn(p: Pitch): string {
  return pitchClassName(p);
}

/** 장조 안에서 이 음이 몇째 음인지(0~6). 조 밖의 음이면 null. 철자까지 맞아야 한다. */
export function scaleDegreeIndex(p: Pitch, tonic: string): number | null {
  const names = majorScale(tonic, 4, 7).map(pitchClassName);
  const i = names.indexOf(pitchClassName(p));
  return i < 0 ? null : i;
}

/** 계이름. 조 밖의 음이면 null */
export function solfegeInKey(p: Pitch, tonic: string): string | null {
  const i = scaleDegreeIndex(p, tonic);
  return i === null ? null : (SOLFEGE_KO[i] as string);
}

/** 조 이름: 다장조, 사장조, 내림나장조, 올림바장조 … (장조만) */
export function keyNameKo(tonic: string): string {
  const p = parsePitch(`${tonic}4`);
  if (!p) throw new Error(`조 이름을 만들 수 없어요: ${tonic}`);
  const prefix = p.acc === 1 ? "올림" : p.acc === -1 ? "내림" : "";
  return `${prefix}${LETTER_KO[p.letter]}장조`;
}

/** 화음 이름. 1단계에서 확인된 것만: 으뜸·버금딸림·딸림화음과 딸림7화음 */
export function chordNameKo(degree: number, kind: ChordKind): string | null {
  if (kind === "seventh") return degree === 5 ? "딸림7화음" : null;
  if (degree === 1) return "으뜸화음";
  if (degree === 4) return "버금딸림화음";
  if (degree === 5) return "딸림화음";
  return null;
}

/** 로마 숫자(I, IV, V, V7) */
export function chordNumeral(degree: number, kind: ChordKind): string | null {
  const base = degree === 1 ? "I" : degree === 4 ? "IV" : degree === 5 ? "V" : null;
  if (!base) return null;
  if (kind === "seventh") return degree === 5 ? "V7" : null;
  return base;
}
