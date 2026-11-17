/**
 * 해보기(건반으로 답하기) 판정. 옥타브와 상관없이 같은 음 이름(건반의 같은 키)이면 맞는 것으로 본다.
 *   자유: 순서와 상관없이 정답 음을 모두 찾으면 완료
 *   차례로: 순서대로 눌러야 완료
 * 학생 정보나 기록은 어디에도 남기지 않는다(이 상태는 화면이 닫히면 사라진다).
 */

import type { AskSpec, Lesson } from "../script/schema";
import { resolveCaption } from "../script/interpolate";
import { parsePitch, pitchClassNumber } from "../theory/pitch";

export interface AskPlan {
  order: "자유" | "차례로";
  /** 정답 음의 음 이름 번호(0~11), 문제에 나온 순서 */
  sequence: number[];
  /** 중복을 뺀 정답 */
  unique: number[];
  success: string;
}

export interface AskProgress {
  /** 자유: 찾은 음 이름 번호 */
  found: number[];
  /** 차례로: 다음에 눌러야 할 순서(0부터) */
  nextIndex: number;
  total: number;
  done: boolean;
  /** 맞게 누른 건반(midi) */
  mine: number[];
  /** 방금 틀리게 누른 건반(midi) */
  wrongMidi: number | null;
  message: string;
  tone: "info" | "ok" | "bad";
}

export function planAsk(lesson: Lesson, ask: AskSpec): AskPlan | null {
  const el = lesson.elements[ask.answer];
  if (!el) return null;
  const sequence = el.pitches.map((s) => pitchClassNumber((parsePitch(s) as { midi: number }).midi));
  const unique = [...new Set(sequence)];
  const order = ask.order ?? "자유";
  const success = ask.success ? resolveCaption(lesson, ask.success).text : "맞아요!";
  return { order, sequence, unique, success };
}

export function startAsk(plan: AskPlan): AskProgress {
  return {
    found: [],
    nextIndex: 0,
    total: plan.order === "차례로" ? plan.sequence.length : plan.unique.length,
    done: false,
    mine: [],
    wrongMidi: null,
    message: "",
    tone: "info",
  };
}

export function judgeTap(plan: AskPlan, progress: AskProgress, tappedMidi: number): AskProgress {
  if (progress.done) return { ...progress, wrongMidi: null };
  const pc = pitchClassNumber(tappedMidi);

  if (plan.order === "차례로") {
    if (pc === plan.sequence[progress.nextIndex]) {
      const nextIndex = progress.nextIndex + 1;
      const done = nextIndex >= plan.sequence.length;
      return {
        ...progress,
        nextIndex,
        done,
        mine: [...progress.mine, tappedMidi],
        wrongMidi: null,
        message: done ? plan.success : `${nextIndex} / ${progress.total}개 찾았어요.`,
        tone: done ? "ok" : "info",
      };
    }
    return { ...progress, wrongMidi: tappedMidi, message: "순서가 달라요. 다시 눌러 보세요.", tone: "bad" };
  }

  if (!plan.unique.includes(pc)) {
    return { ...progress, wrongMidi: tappedMidi, message: "그 음이 아니에요. 다시 눌러 보세요.", tone: "bad" };
  }
  if (progress.found.includes(pc)) {
    return { ...progress, wrongMidi: null, message: "이미 찾은 음이에요.", tone: "info" };
  }
  const found = [...progress.found, pc];
  const done = found.length >= plan.unique.length;
  return {
    ...progress,
    found,
    done,
    mine: [...progress.mine, tappedMidi],
    wrongMidi: null,
    message: done ? plan.success : `${found.length} / ${progress.total}개 찾았어요.`,
    tone: done ? "ok" : "info",
  };
}
