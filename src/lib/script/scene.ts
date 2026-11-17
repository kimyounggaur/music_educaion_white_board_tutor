/**
 * 장면 계산: 0번 단계부터 지금 단계까지 show/hide/set/keyLabels를 차례로 적용한 결과가 지금 칠판이다.
 * highlight/play/ask는 지금 단계 것만 쓴다. 그래서 어느 단계로든 바로 이동할 수 있다.
 * (한 단계 안에서는 hide를 먼저, show를 나중에 적용한다. 그래서 "바꿔 놓기"가 한 단계에 된다.)
 */

import {
  asArray,
  type AskSpec,
  type HighlightSpec,
  type KeyLabelMode,
  type Lesson,
  type LessonElement,
  type PlaySpec,
} from "./schema";
import { resolveCaption } from "./interpolate";

/** 요소의 처음 표시 옵션. 화음은 degree가 있으면 이름과 로마 숫자를 함께 보여 준다. */
export function defaultLabels(el: LessonElement): string {
  if (el.labels) return el.labels;
  if (el.type === "chord") return el.degree !== undefined ? "둘 다" : el.name ? "이름" : "없음";
  return "없음";
}

export interface Scene {
  stepIndex: number;
  /** 지금 칠판에 보이는 요소(왼쪽에서 오른쪽 순서) */
  visible: string[];
  /** 요소별 글자 표시 옵션 */
  labels: Record<string, string>;
  /** 요소별 온음/반음 표시 */
  gaps: Record<string, boolean>;
  keyLabels: KeyLabelMode;
  /** 자리표시자를 채운 자막 */
  caption: string;
  highlight: HighlightSpec[];
  play: PlaySpec[];
  ask: AskSpec | null;
}

export function computeScene(lesson: Lesson, stepIndex: number): Scene {
  const last = Math.min(Math.max(Math.trunc(stepIndex), 0), lesson.steps.length - 1);
  let visible: string[] = [];
  const labels: Record<string, string> = {};
  const gaps: Record<string, boolean> = {};
  for (const [id, el] of Object.entries(lesson.elements)) {
    labels[id] = defaultLabels(el);
    gaps[id] = el.type === "notes" ? Boolean(el.gaps) : false;
  }
  let keyLabels: KeyLabelMode = "없음";

  for (let i = 0; i <= last; i++) {
    const step = lesson.steps[i]!;
    if (step.hide) visible = visible.filter((id) => !step.hide!.includes(id));
    if (step.show) for (const id of step.show) if (!visible.includes(id)) visible.push(id);
    if (step.set) {
      if (step.set.labels !== undefined) labels[step.set.target] = step.set.labels;
      if (step.set.gaps !== undefined) gaps[step.set.target] = step.set.gaps;
    }
    if (step.keyLabels) keyLabels = step.keyLabels;
  }

  const step = lesson.steps[last]!;
  return {
    stepIndex: last,
    visible,
    labels,
    gaps,
    keyLabels,
    caption: resolveCaption(lesson, step.caption).text,
    highlight: asArray(step.highlight),
    play: asArray(step.play),
    ask: step.ask ?? null,
  };
}

/** 앞 단계에 없다가 이 단계에서 새로 보이게 된 요소 */
export function newlyShown(prev: Scene | null, next: Scene): string[] {
  if (!prev) return [];
  return next.visible.filter((id) => !prev.visible.includes(id));
}
