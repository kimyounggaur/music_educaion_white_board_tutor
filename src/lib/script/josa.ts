/** 한국어 조사 고르기. 앞말 마지막 글자의 받침 유무로 정한다. */

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;
/** 종성 번호에서 ㄹ */
const RIEUL = 8;

export const JOSA_PAIRS = ["이/가", "은/는", "을/를", "과/와", "으로/로", "이에요/예요", "이라고/라고"] as const;

/** 마지막 글자의 종성 번호(없음 0, ㄹ 8). 한글이 아니면 null */
export function finalConsonant(word: string): number | null {
  const last = word.trim().slice(-1);
  if (!last) return null;
  const code = last.charCodeAt(0);
  if (code < HANGUL_START || code > HANGUL_END) return null;
  return (code - HANGUL_START) % 28;
}

/** word에 조사를 붙인 결과. 조사 쌍이 잘못되었거나 앞말이 한글로 끝나지 않으면 null */
export function attachJosa(word: string, pair: string): string | null {
  if (!(JOSA_PAIRS as readonly string[]).includes(pair)) return null;
  const fc = finalConsonant(word);
  if (fc === null) return null;
  const [withBatchim, without] = pair.split("/") as [string, string];
  // "으로/로"는 받침 ㄹ도 "로"를 쓴다
  const useWith = pair === "으로/로" ? fc !== 0 && fc !== RIEUL : fc !== 0;
  return word + (useWith ? withBatchim : without);
}
