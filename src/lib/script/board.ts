/**
 * 장면(Scene)을 화면에 그릴 모양으로 바꾼다. 오선보 열, 건반 표시, 재생 계획, 화면 설명이 모두
 * 같은 장면에서 나오므로 보이는 것과 들리는 것이 어긋나지 않는다.
 */

import type { Lesson, LessonElement, PlaySpec } from "./schema";
import type { Scene } from "./scene";
import { parsePitch, type Pitch } from "../theory/pitch";
import { chordNameKo, chordNumeral, letterNameEn, letterNameKo, solfegeInKey } from "../theory/korean";

/** 소리 나는 음 하나를 가리킨다(요소 id + 그 요소 안에서 0부터 센 번호) */
export interface SoundRef {
  elementId: string;
  index: number;
}

export interface StaffColumn {
  key: string;
  elementId: string;
  /** 한 열에 그릴 음("C4"). 음 줄은 1개, 화음은 여러 개(아래에서 위로) */
  pitches: string[];
  hot: boolean[];
  sounding: boolean[];
  line1: string;
  line2: string;
  /** 다음 열과의 거리(음 줄 요소 안에서만) */
  gapAfter: "온음" | "반음" | null;
  isNew: boolean;
  isChord: boolean;
}

function pitchesOf(el: LessonElement): Pitch[] {
  return el.pitches.map((s) => parsePitch(s) as Pitch);
}

function hotIndexes(scene: Scene, id: string, count: number): Set<number> {
  const out = new Set<number>();
  for (const spec of scene.highlight) {
    if (spec.target !== id) continue;
    if (spec.notes) for (const n of spec.notes) out.add(n - 1);
    else for (let i = 0; i < count; i++) out.add(i);
  }
  return out;
}

function noteLabel(p: Pitch, mode: string, tonic: string): { line1: string; line2: string } {
  if (mode === "계이름") return { line1: solfegeInKey(p, tonic) ?? "", line2: "" };
  if (mode === "음이름") return { line1: letterNameKo(p), line2: letterNameEn(p) };
  if (mode === "둘 다") return { line1: solfegeInKey(p, tonic) ?? "", line2: letterNameKo(p) };
  return { line1: "", line2: "" };
}

function chordLabelText(el: Extract<LessonElement, { type: "chord" }>): { name: string; numeral: string } {
  const kind = el.kind ?? "triad";
  const name = el.degree !== undefined ? (chordNameKo(el.degree, kind) ?? "") : (el.name ?? "");
  const numeral = el.degree !== undefined ? (chordNumeral(el.degree, kind) ?? "") : "";
  return { name, numeral };
}

function chordLabel(el: Extract<LessonElement, { type: "chord" }>, mode: string): { line1: string; line2: string } {
  const { name, numeral } = chordLabelText(el);
  if (mode === "이름") return { line1: name, line2: "" };
  if (mode === "로마숫자") return { line1: numeral, line2: "" };
  if (mode === "둘 다") return { line1: name || numeral, line2: name ? numeral : "" };
  return { line1: "", line2: "" };
}

export function buildStaffColumns(
  lesson: Lesson,
  scene: Scene,
  sounding: readonly SoundRef[],
  newElements: readonly string[],
): StaffColumn[] {
  const cols: StaffColumn[] = [];
  const tonic = lesson.key.tonic;
  for (const id of scene.visible) {
    const el = lesson.elements[id];
    if (!el) continue;
    const pitches = pitchesOf(el);
    const hot = hotIndexes(scene, id, pitches.length);
    const snd = new Set(sounding.filter((r) => r.elementId === id).map((r) => r.index));
    const isNew = newElements.includes(id);
    const mode = scene.labels[id] ?? "없음";

    if (el.type === "notes") {
      pitches.forEach((p, i) => {
        const next = pitches[i + 1];
        let gapAfter: StaffColumn["gapAfter"] = null;
        if (scene.gaps[id] && next) {
          const d = Math.abs(next.midi - p.midi);
          gapAfter = d === 2 ? "온음" : d === 1 ? "반음" : null;
        }
        const { line1, line2 } = noteLabel(p, mode, tonic);
        cols.push({
          key: `${id}:${i}`,
          elementId: id,
          pitches: [el.pitches[i] as string],
          hot: [hot.has(i)],
          sounding: [snd.has(i)],
          line1,
          line2,
          gapAfter,
          isNew,
          isChord: false,
        });
      });
    } else {
      const { line1, line2 } = chordLabel(el, mode);
      cols.push({
        key: `${id}:0`,
        elementId: id,
        pitches: [...el.pitches],
        hot: pitches.map((_, i) => hot.has(i)),
        sounding: pitches.map((_, i) => snd.has(i)),
        line1,
        line2,
        gapAfter: null,
        isNew,
        isChord: true,
      });
    }
  }
  return cols;
}

/** 건반에 표시할 강조(midi 번호 집합). 칠판과 같은 장면에서 나온다. */
export function keyboardMarks(
  lesson: Lesson,
  scene: Scene,
  sounding: readonly SoundRef[],
): { hot: Set<number>; sounding: Set<number> } {
  const hot = new Set<number>();
  const snd = new Set<number>();
  const add = (set: Set<number>, elementId: string, index: number) => {
    const el = lesson.elements[elementId];
    const p = el ? parsePitch(el.pitches[index] ?? "") : null;
    if (p) set.add(p.midi);
  };
  for (const spec of scene.highlight) {
    const el = lesson.elements[spec.target];
    if (!el) continue;
    const idxs = spec.notes ? spec.notes.map((n) => n - 1) : el.pitches.map((_, i) => i);
    for (const i of idxs) add(hot, spec.target, i);
  }
  for (const ref of sounding) add(snd, ref.elementId, ref.index);
  return { hot, sounding: snd };
}

/** 칠판 그림에 붙일 읽기용 설명(스크린리더) */
export function describeBoard(lesson: Lesson, scene: Scene): string {
  const parts: string[] = [];
  for (const id of scene.visible) {
    const el = lesson.elements[id];
    if (!el) continue;
    const letters = pitchesOf(el).map(letterNameKo).join(", ");
    if (el.type === "notes") parts.push(`음 ${el.pitches.length}개(${letters})`);
    else {
      const { name } = chordLabelText(el);
      parts.push(`${name || "화음"}(${letters})`);
    }
  }
  return parts.length ? `오선보: ${parts.join(", ")}` : "오선보: 비어 있음";
}

/** 재생 시간표(초). 칠판 강조와 소리가 같은 표를 쓴다. */
export const TIMING = {
  /** 차례로: 음마다 간격 */
  noteSlot: 0.5,
  /** 차례로: 음 길이 */
  noteSound: 0.65,
  /** 동시에: 소리 길이 */
  chordSound: 1.3,
  /** 동시에: 다음 항목까지 */
  chordItem: 1.5,
  /** 차례로가 끝난 뒤 다음 항목까지 덧붙이는 쉼 */
  itemGap: 0.2,
} as const;

export interface PlayEvent {
  /** 시작 시각(초) */
  at: number;
  soundDur: number;
  /** 강조를 켜 두는 시간(초) */
  showDur: number;
  pitch: string;
  ref: SoundRef;
}

export function buildPlayPlan(lesson: Lesson, specs: readonly PlaySpec[]): { events: PlayEvent[]; total: number } {
  const events: PlayEvent[] = [];
  let t = 0;
  for (const spec of specs) {
    const el = lesson.elements[spec.target];
    if (!el) continue;
    const idxs = spec.notes ? spec.notes.map((n) => n - 1) : el.pitches.map((_, i) => i);
    if (spec.how === "차례로") {
      idxs.forEach((index, k) => {
        events.push({
          at: t + k * TIMING.noteSlot,
          soundDur: TIMING.noteSound,
          showDur: TIMING.noteSlot,
          pitch: el.pitches[index] as string,
          ref: { elementId: spec.target, index },
        });
      });
      t += idxs.length * TIMING.noteSlot + TIMING.itemGap;
    } else {
      for (const index of idxs) {
        events.push({
          at: t,
          soundDur: TIMING.chordSound,
          showDur: TIMING.chordSound,
          pitch: el.pitches[index] as string,
          ref: { elementId: spec.target, index },
        });
      }
      t += TIMING.chordItem;
    }
  }
  return { events, total: t };
}
