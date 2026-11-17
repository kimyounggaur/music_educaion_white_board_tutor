/**
 * 검산기(개발 지시서 6장). 형식을 확인하고, 음악 이론 사실은 theory 모듈로 계산해 대본의 선언과 맞춰 본다.
 * 오류가 하나라도 있으면 그 수업은 보여 주지 않는다(빌드와 테스트가 실패한다).
 */

import {
  asArray,
  CHORD_LABELS,
  lessonSchema,
  NOTES_LABELS,
  type HighlightSpec,
  type Lesson,
  type LessonElement,
  type PlaySpec,
} from "./schema";
import { resolveCaption } from "./interpolate";
import { defaultLabels } from "./scene";
import { countWhiteKeys, isWhiteMidi, pitchFromMidi } from "../theory/keyboard";
import { chordNameKo, keyNameKo, solfegeInKey } from "../theory/korean";
import { diatonicChordNames, isSupportedMajorKey, majorScale } from "../theory/scale";
import { diatonicIndex, formatPitch, parsePitch, pitchClassName, type Pitch } from "../theory/pitch";

export interface Issue {
  code: string;
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
}

export const LIMITS = {
  maxCaption: 60,
  warnCaption: 45,
  maxColumns: 12,
  /** 높은음자리표 오선과 덧줄 한두 줄 안: C4~C6 */
  minMidi: 60,
  maxMidi: 84,
  maxWhiteKeys: 15,
} as const;

export function validateLesson(input: unknown): ValidationResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const err = (code: string, path: string, message: string) => void errors.push({ code, path, message });
  const warn = (code: string, path: string, message: string) => void warnings.push({ code, path, message });
  const finish = (): ValidationResult => ({ ok: errors.length === 0, errors, warnings });

  // 1. 형식
  const parsed = lessonSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      err("E-FORM", issue.path.map(String).join(".") || "(최상위)", issue.message);
    }
    return finish();
  }
  const lesson: Lesson = parsed.data;

  // 2. 조와 건반
  const tonic = lesson.key.tonic;
  if (!isSupportedMajorKey(tonic)) {
    err("E-KEY", "key.tonic", `지원하지 않는 장조예요: ${tonic}`);
    return finish();
  }
  const keyName = keyNameKo(tonic);

  const kFrom = parsePitch(lesson.keyboard.from);
  const kTo = parsePitch(lesson.keyboard.to);
  let range: { from: number; to: number } | null = null;
  if (!kFrom || !kTo || kFrom.acc !== 0 || kTo.acc !== 0) {
    err("E-KEYBOARD", "keyboard", "건반의 양 끝은 흰 건반(C4, D4 …)이어야 해요.");
  } else if (kFrom.midi >= kTo.midi) {
    err("E-KEYBOARD", "keyboard", "from은 to보다 낮은 음이어야 해요.");
  } else if (countWhiteKeys(kFrom.midi, kTo.midi) > LIMITS.maxWhiteKeys) {
    err("E-KEYBOARD", "keyboard", `흰 건반은 ${LIMITS.maxWhiteKeys}개 이하여야 해요.`);
  } else {
    range = { from: kFrom.midi, to: kTo.midi };
  }

  // 표시 옵션 검사(요소의 처음 옵션과 set 단계가 함께 쓴다)
  const checkLabelMode = (id: string, el: LessonElement, mode: string, path: string) => {
    if (el.type === "notes") {
      if (!(NOTES_LABELS as readonly string[]).includes(mode)) {
        err("E-FORM", path, `음 줄 요소의 labels는 ${NOTES_LABELS.join("/")} 중 하나예요(받은 값: ${mode}).`);
        return;
      }
      if (mode === "계이름" || mode === "둘 다") {
        for (const text of el.pitches) {
          const p = parsePitch(text);
          if (p && solfegeInKey(p, tonic) === null) {
            err("E-SOLFEGE", path, `${text}은(는) ${keyName} 안의 음이 아니라서 계이름을 붙일 수 없어요("${id}").`);
            return;
          }
        }
      }
      return;
    }
    if (!(CHORD_LABELS as readonly string[]).includes(mode)) {
      err("E-FORM", path, `화음 요소의 labels는 ${CHORD_LABELS.join("/")} 중 하나예요(받은 값: ${mode}).`);
      return;
    }
    const wantsName = mode === "이름" || mode === "둘 다";
    const wantsNumeral = mode === "로마숫자" || mode === "둘 다";
    if (wantsName && el.degree === undefined && !el.name) {
      err("E-CHORD", path, `이름을 표시하려면 "${id}"에 degree나 name이 필요해요.`);
    }
    if (wantsNumeral && el.degree === undefined) {
      err("E-CHORD", path, `로마 숫자를 표시하려면 "${id}"에 degree가 필요해요.`);
    }
  };

  const checkGaps = (id: string, el: Extract<LessonElement, { type: "notes" }>, path: string) => {
    if (el.pitches.length < 2) {
      err("E-GAPS", path, `"${id}"의 음이 2개 이상이어야 거리를 표시할 수 있어요.`);
      return;
    }
    for (let i = 0; i < el.pitches.length - 1; i++) {
      const a = parsePitch(el.pitches[i] as string);
      const b = parsePitch(el.pitches[i + 1] as string);
      if (!a || !b) return;
      const d = Math.abs(b.midi - a.midi);
      if (d !== 1 && d !== 2) {
        err("E-GAPS", path, `${el.pitches[i]}과 ${el.pitches[i + 1]} 사이는 온음(2)이나 반음(1)이 아니라서 표시할 수 없어요.`);
        return;
      }
    }
  };

  // 3. 요소
  for (const [id, el] of Object.entries(lesson.elements)) {
    const base = `elements.${id}`;
    const ps: Pitch[] = [];
    el.pitches.forEach((text, i) => {
      const p = parsePitch(text);
      if (!p) {
        err("E-PITCH", `${base}.pitches[${i}]`, `음 표기가 틀렸어요: ${text}`);
        return;
      }
      if (p.midi < LIMITS.minMidi || p.midi > LIMITS.maxMidi) {
        err("E-PITCH", `${base}.pitches[${i}]`, `${text}은(는) 음역(C4~C6)을 벗어나요.`);
      }
      if (range && (p.midi < range.from || p.midi > range.to)) {
        err("E-KEYBOARD", `${base}.pitches[${i}]`, `${text}이(가) 건반 범위(${lesson.keyboard.from}~${lesson.keyboard.to}) 밖이에요.`);
      }
      ps.push(p);
    });
    if (ps.length !== el.pitches.length) continue;

    if (el.type === "notes") {
      if (el.scale === "major") {
        const expected = majorScale(tonic, (ps[0] as Pitch).octave, 8).map(formatPitch);
        const actual = ps.map(formatPitch);
        if (actual.length !== expected.length || actual.some((a, i) => a !== expected[i])) {
          err(
            "E-SCALE",
            `${base}.pitches`,
            `장음계 선언과 음이 달라요. ${keyName} 음계는 ${expected.join(" ")}이에요(적힌 음: ${actual.join(" ")}).`,
          );
        }
      }
      if (el.labels !== undefined) checkLabelMode(id, el, el.labels, `${base}.labels`);
      if (el.gaps) checkGaps(id, el, `${base}.gaps`);
    } else {
      if (el.degree !== undefined) {
        const kind = el.kind ?? "triad";
        const kindText = kind === "seventh" ? "7화음" : "3화음";
        if (chordNameKo(el.degree, kind) === null) {
          err("E-CHORD", `${base}.kind`, `1단계에서는 ${el.degree}도 ${kindText}을 쓸 수 없어요(허용: 1·4·5도 3화음, 5도 7화음).`);
        } else {
          const expected = diatonicChordNames(tonic, el.degree, kind);
          const actual = ps.map(pitchClassName);
          if (actual.length !== expected.length || actual.some((a, i) => a !== expected[i])) {
            err(
              "E-CHORD",
              `${base}.pitches`,
              `${keyName}의 ${el.degree}도 ${kindText}은 ${expected.join(" ")}이에요(적힌 음: ${actual.join(" ")}).`,
            );
          }
        }
        if (el.name !== undefined) err("E-NAME", `${base}.name`, "degree가 있으면 name을 직접 쓸 수 없어요(이름은 앱이 계산해요).");
      } else if (el.kind !== undefined) {
        err("E-CHORD", `${base}.kind`, "kind는 degree와 함께 써야 해요.");
      }
      for (let i = 1; i < ps.length; i++) {
        const prev = ps[i - 1] as Pitch;
        const cur = ps[i] as Pitch;
        const bad = el.degree !== undefined ? diatonicIndex(cur) - diatonicIndex(prev) !== 2 : cur.midi <= prev.midi;
        if (bad) {
          err(
            "E-ORDER",
            `${base}.pitches`,
            el.degree !== undefined ? "화음 음은 아래에서 위로 3도씩 쌓아야 해요." : "화음 음은 아래에서 위로 올라가야 해요.",
          );
          break;
        }
      }
      if (el.labels !== undefined) checkLabelMode(id, el, el.labels, `${base}.labels`);
    }
    // 처음 옵션이 기본값일 때도 검사한다(화음의 기본은 "둘 다")
    if (el.labels === undefined && el.type === "chord") checkLabelMode(id, el, defaultLabels(el), `${base}.labels`);
  }

  // 4. 단계
  let visible: string[] = [];
  const columnsOf = (id: string) => {
    const el = lesson.elements[id];
    return el ? (el.type === "notes" ? el.pitches.length : 1) : 0;
  };

  lesson.steps.forEach((step, si) => {
    const sp = `steps[${si}]`;

    const cap = resolveCaption(lesson, step.caption);
    for (const m of cap.errors) err("E-CAPTION", `${sp}.caption`, m);
    if (cap.errors.length === 0) {
      const len = Array.from(cap.text).length;
      if (len > LIMITS.maxCaption) err("E-CAPTION", `${sp}.caption`, `자막이 너무 길어요(${len}자, 최대 ${LIMITS.maxCaption}자).`);
      else if (len > LIMITS.warnCaption) warn("W-LONG", `${sp}.caption`, `자막이 길어요(${len}자). ${LIMITS.warnCaption}자 안쪽을 권해요.`);
    }

    for (const id of step.hide ?? []) {
      if (!lesson.elements[id]) err("E-REF", `${sp}.hide`, `"${id}" 요소가 없어요.`);
      else if (!visible.includes(id)) err("E-REF", `${sp}.hide`, `"${id}"은(는) 보이지 않는데 빼려고 했어요.`);
      else visible = visible.filter((v) => v !== id);
    }
    for (const id of step.show ?? []) {
      if (!lesson.elements[id]) err("E-REF", `${sp}.show`, `"${id}" 요소가 없어요.`);
      else if (visible.includes(id)) err("E-REF", `${sp}.show`, `"${id}"은(는) 이미 보이는데 다시 보이려고 했어요.`);
      else visible.push(id);
    }

    if (step.set) {
      const { target, labels, gaps } = step.set;
      const el = lesson.elements[target];
      if (labels === undefined && gaps === undefined) err("E-FORM", `${sp}.set`, "set에는 labels나 gaps가 있어야 해요.");
      if (!el) {
        err("E-REF", `${sp}.set.target`, `"${target}" 요소가 없어요.`);
      } else {
        if (!visible.includes(target)) err("E-REF", `${sp}.set.target`, `"${target}"은(는) 보이지 않아서 표시 옵션을 바꿀 수 없어요.`);
        if (labels !== undefined) checkLabelMode(target, el, labels, `${sp}.set.labels`);
        if (gaps !== undefined) {
          if (el.type !== "notes") err("E-GAPS", `${sp}.set.gaps`, "gaps는 음 줄 요소에만 쓸 수 있어요.");
          else if (gaps) checkGaps(target, el, `${sp}.set.gaps`);
        }
      }
    }

    if (step.keyLabels === "계이름" && range) {
      for (let m = range.from; m <= range.to; m++) {
        if (!isWhiteMidi(m)) continue;
        const p = pitchFromMidi(m);
        if (solfegeInKey(p, tonic) === null) {
          err("E-SOLFEGE", `${sp}.keyLabels`, `${formatPitch(p)} 건반은 ${keyName} 안의 음이 아니라서 계이름을 붙일 수 없어요.`);
          break;
        }
      }
    }

    const checkSpec = (spec: HighlightSpec | PlaySpec, path: string) => {
      const el = lesson.elements[spec.target];
      if (!el) {
        err("E-REF", `${path}.target`, `"${spec.target}" 요소가 없어요.`);
        return;
      }
      if (!visible.includes(spec.target)) {
        err("E-REF", `${path}.target`, `"${spec.target}"은(는) 이 단계에서 보이지 않아요. 보이는 요소만 강조하거나 재생할 수 있어요.`);
      }
      for (const n of spec.notes ?? []) {
        if (n > el.pitches.length) {
          err("E-INDEX", `${path}.notes`, `${n}번째 음이 없어요("${spec.target}"에는 음이 ${el.pitches.length}개 있어요).`);
        }
      }
    };
    asArray(step.highlight).forEach((h, i) => checkSpec(h, `${sp}.highlight[${i}]`));
    asArray(step.play).forEach((p, i) => checkSpec(p, `${sp}.play[${i}]`));

    if (step.ask) {
      const el = lesson.elements[step.ask.answer];
      if (!el) err("E-REF", `${sp}.ask.answer`, `"${step.ask.answer}" 요소가 없어요.`);
      else if (step.ask.order === "차례로" && el.type !== "notes") {
        err("E-ASK", `${sp}.ask.order`, "차례로 누르기는 음 줄 요소에만 쓸 수 있어요.");
      }
      if (step.ask.success) for (const m of resolveCaption(lesson, step.ask.success).errors) err("E-CAPTION", `${sp}.ask.success`, m);
    }

    const changes = (step.show || step.hide ? 1 : 0) + (step.set ? 1 : 0) + (step.keyLabels ? 1 : 0);
    if (changes > 1) {
      err("E-ONE-CHANGE", sp, "한 단계에는 한 가지만 바꿔야 해요(요소 보이기·빼기, 표시 옵션 바꾸기, 건반 글자 바꾸기 중 하나).");
    }

    const columns = visible.reduce((sum, id) => sum + columnsOf(id), 0);
    if (columns > LIMITS.maxColumns) err("E-STEPS", sp, `한 번에 보이는 열이 너무 많아요(${columns}개, 최대 ${LIMITS.maxColumns}개).`);

    if (step.show && !step.play && !step.ask) warn("W-NOPLAY", sp, "새로 보여 주는 음에 소리가 없어요.");
  });

  const lastIndex = lesson.steps.length - 1;
  const last = lesson.steps[lastIndex];
  if (last && !last.ask && !last.play) warn("W-ENDING", `steps[${lastIndex}]`, "마지막 단계에 해보기나 소리가 없어요.");

  const used = new Set<string>();
  for (const s of lesson.steps) {
    for (const id of s.show ?? []) used.add(id);
    if (s.ask) used.add(s.ask.answer);
  }
  for (const id of Object.keys(lesson.elements)) {
    if (!used.has(id)) warn("W-UNUSED", `elements.${id}`, "어느 단계에서도 쓰지 않는 요소예요.");
  }

  return finish();
}

/** 여러 수업을 한꺼번에 검사한다. id가 겹치면 오류. */
export function validateLessons(list: readonly unknown[]): {
  ok: boolean;
  results: Array<{ id: string; result: ValidationResult }>;
  duplicateIds: string[];
} {
  const seen = new Set<string>();
  const duplicateIds: string[] = [];
  const results = list.map((item, i) => {
    const id = typeof (item as { id?: unknown })?.id === "string" ? (item as { id: string }).id : `(${i}번째 수업)`;
    if (seen.has(id)) duplicateIds.push(id);
    seen.add(id);
    return { id, result: validateLesson(item) };
  });
  return { ok: duplicateIds.length === 0 && results.every((r) => r.result.ok), results, duplicateIds };
}
