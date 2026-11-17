/**
 * 오선보 가로 배치 계산(그림 단위 기준). 열마다 글자 폭을 헤아려 겹치지 않게 칸 폭을 정하고,
 * 수업 전체에서 가장 넓은 단계에 맞춰 폭을 한 번만 정한다(단계마다 크기가 변하지 않게).
 */

import type { Lesson } from "../../lib/script/schema";
import { computeScene } from "../../lib/script/scene";
import { buildStaffColumns, type StaffColumn } from "../../lib/script/board";
import { diatonicIndex, parsePitch } from "../../lib/theory/pitch";

export const LABEL_SIZE = { line1: 15, line2: 12 } as const;
export const NOTE_SLOT_MIN = 40;
export const CHORD_SLOT_MIN = 56;
export const MIN_WIDTH = 440;
/** 맨 윗줄(F5)의 글자 순서 번호 */
const F5_INDEX = 5 * 7 + 3;

/** 글자 폭 어림(한글·한자 전각은 글자 크기, 영문·숫자는 약 0.58배) */
export function textUnits(text: string, size: number): number {
  let w = 0;
  for (const ch of text) w += /[ᄀ-ᇿ㄰-㆏가-힣]/.test(ch) ? size : size * 0.58;
  return w;
}

export function slotWidth(col: StaffColumn): number {
  const min = col.isChord ? CHORD_SLOT_MIN : NOTE_SLOT_MIN;
  const need = Math.max(textUnits(col.line1, LABEL_SIZE.line1), textUnits(col.line2, LABEL_SIZE.line2)) + 12;
  return Math.max(min, Math.ceil(need));
}

/** 수업의 모든 단계 중 열이 가장 많이 차지하는 폭 */
export function widestStep(lesson: Lesson): number {
  let widest = 0;
  lesson.steps.forEach((_, i) => {
    const cols = buildStaffColumns(lesson, computeScene(lesson, i), [], []);
    widest = Math.max(widest, cols.reduce((sum, c) => sum + slotWidth(c), 0));
  });
  return widest;
}

/** 오선 위로 삐져나오는 음의 높이(그림 단위). 덧줄이 필요한 높은 음이 있을 때만 커진다. */
export function extentAboveStaff(lesson: Lesson): number {
  let steps = 0;
  for (const el of Object.values(lesson.elements)) {
    for (const text of el.pitches) {
      const p = parsePitch(text);
      if (p) steps = Math.max(steps, diatonicIndex(p) - F5_INDEX);
    }
  }
  return steps * 5;
}
