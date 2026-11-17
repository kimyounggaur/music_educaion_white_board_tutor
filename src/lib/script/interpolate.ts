/**
 * 자막의 자리표시자를 데이터에서 채운다(개발 지시서 5.4).
 *   {key}                 → 조 이름(다장조)
 *   {요소.속성}            → 속성: name, numeral, solfege, letters, count
 *   {요소[번호].속성}       → 번호(1부터)번째 음 하나. solfege, letters만
 *   {…:조사}               → 조사를 붙인다(이/가, 은/는, 을/를, 과/와, 으로/로, 이에요/예요, 이라고/라고)
 * 풀 수 없는 것은 errors에 한국어 설명을 남긴다.
 */

import type { Lesson } from "./schema";
import { attachJosa } from "./josa";
import { parsePitch, type Pitch } from "../theory/pitch";
import { chordNameKo, chordNumeral, keyNameKo, letterNameKo, solfegeInKey } from "../theory/korean";

export interface CaptionResult {
  text: string;
  errors: string[];
}

const PLACEHOLDER = /\{([^{}]*)\}/g;
const REF = /^([A-Za-z][A-Za-z0-9_]*)(?:\[(\d+)\])?\.([a-z]+)$/;

export function resolveCaption(lesson: Lesson, template: string): CaptionResult {
  const errors: string[] = [];
  const text = template.replace(PLACEHOLDER, (whole: string, body: string) => {
    const parts = body.split(":");
    if (parts.length > 2) {
      errors.push(`${whole}: 형식이 틀렸어요. {요소.속성:조사} 형태로 써 주세요.`);
      return whole;
    }
    const value = resolveRef(lesson, (parts[0] ?? "").trim(), whole, errors);
    if (value === null) return whole;
    if (parts.length === 1) return value;
    const josa = (parts[1] ?? "").trim();
    const attached = attachJosa(value, josa);
    if (attached === null) {
      errors.push(
        `${whole}: "${value}" 뒤에 조사 "${josa}"를 붙일 수 없어요. 조사는 이/가, 은/는, 을/를, 과/와, 으로/로, 이에요/예요, 이라고/라고 중 하나이고, 앞말이 한글로 끝나야 해요.`,
      );
      return whole;
    }
    return attached;
  });
  if (errors.length === 0 && /[{}]/.test(text)) errors.push("닫히지 않은 중괄호가 있어요.");
  return { text, errors };
}

function resolveRef(lesson: Lesson, ref: string, whole: string, errors: string[]): string | null {
  try {
    if (ref === "key") return keyNameKo(lesson.key.tonic);

    const m = REF.exec(ref);
    if (!m) {
      errors.push(`${whole}: 형식이 틀렸어요. {요소.속성} 형태로 써 주세요.`);
      return null;
    }
    const [, id, nth, prop] = m as unknown as [string, string, string | undefined, string];
    const el = lesson.elements[id];
    if (!el) {
      errors.push(`${whole}: "${id}" 요소가 없어요.`);
      return null;
    }
    const parsed = el.pitches.map(parsePitch);
    if (parsed.some((p) => p === null)) {
      errors.push(`${whole}: "${id}" 요소의 음 표기에 오류가 있어요.`);
      return null;
    }
    const all = parsed as Pitch[];

    let list = all;
    if (nth !== undefined) {
      const n = Number(nth);
      if (n < 1 || n > all.length) {
        errors.push(`${whole}: ${n}번째 음이 없어요(${id}에는 음이 ${all.length}개 있어요).`);
        return null;
      }
      list = [all[n - 1] as Pitch];
    }

    switch (prop) {
      case "solfege": {
        const names = list.map((p) => solfegeInKey(p, lesson.key.tonic));
        if (names.some((x) => x === null)) {
          errors.push(`${whole}: 조 안에 없는 음이라 계이름을 만들 수 없어요.`);
          return null;
        }
        return names.join("·");
      }
      case "letters":
        return list.map(letterNameKo).join("·");
      case "count":
        if (nth !== undefined) break;
        return String(all.length);
      case "name": {
        if (nth !== undefined) break;
        if (el.type === "chord") {
          if (el.degree !== undefined) {
            const name = chordNameKo(el.degree, el.kind ?? "triad");
            if (name) return name;
            errors.push(`${whole}: 이 화음의 이름을 정할 수 없어요.`);
            return null;
          }
          if (el.name) return el.name;
          errors.push(`${whole}: "${id}"에는 이름이 없어요(degree나 name이 필요해요).`);
          return null;
        }
        if (el.scale === "major") return `${keyNameKo(lesson.key.tonic)} 음계`;
        errors.push(`${whole}: "${id}"에는 이름이 없어요(scale 선언이 필요해요).`);
        return null;
      }
      case "numeral": {
        if (nth !== undefined) break;
        if (el.type === "chord" && el.degree !== undefined) {
          const numeral = chordNumeral(el.degree, el.kind ?? "triad");
          if (numeral) return numeral;
        }
        errors.push(`${whole}: "${id}"에는 로마 숫자가 없어요(화음의 degree가 필요해요).`);
        return null;
      }
      default:
        errors.push(`${whole}: 속성 "${prop}"을(를) 알 수 없어요(name, numeral, solfege, letters, count).`);
        return null;
    }
    errors.push(`${whole}: 번호를 붙인 자리표시자는 solfege, letters만 쓸 수 있어요.`);
    return null;
  } catch (e) {
    errors.push(`${whole}: ${e instanceof Error ? e.message : "해석 오류"}`);
    return null;
  }
}
