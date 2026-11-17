import { describe, expect, it } from "vitest";
import { judgeTap, planAsk, startAsk, type AskProgress, type AskPlan } from "../src/lib/player/ask";
import { computeScene } from "../src/lib/script/scene";
import { base } from "./helpers";

function plan(lesson: typeof base.scale, stepIndex: number): AskPlan {
  const ask = computeScene(lesson, stepIndex).ask;
  if (!ask) throw new Error("해보기가 없는 단계");
  const p = planAsk(lesson, ask);
  if (!p) throw new Error("정답 요소가 없음");
  return p;
}

function tapAll(p: AskPlan, taps: number[]): AskProgress {
  return taps.reduce((progress, midi) => judgeTap(p, progress, midi), startAsk(p));
}

describe("자유 순서(정답 음을 모두 찾기)", () => {
  const p = plan(base.triads, 8); // 딸림화음 G B D

  it("순서와 상관없이 모두 찾으면 완료", () => {
    const r = tapAll(p, [71, 74, 67]);
    expect(r.done).toBe(true);
    expect(r.tone).toBe("ok");
    expect(r.message).toBe("맞아요!");
  });

  it("옥타브가 달라도 같은 음이면 인정(G3·B5·D4)", () => {
    expect(tapAll(p, [55, 83, 62]).done).toBe(true);
  });

  it("중간 진행을 알려 준다", () => {
    const r = tapAll(p, [67]);
    expect(r.done).toBe(false);
    expect(r.message).toBe("1 / 3개 찾았어요.");
    expect(r.mine).toEqual([67]);
  });

  it("틀린 음은 표시하되 진행은 그대로", () => {
    const r = tapAll(p, [67, 60]);
    expect(r.wrongMidi).toBe(60);
    expect(r.tone).toBe("bad");
    expect(r.found).toHaveLength(1);
    // 다음에 맞게 누르면 틀림 표시가 사라진다
    const next = judgeTap(p, r, 71);
    expect(next.wrongMidi).toBeNull();
    expect(next.found).toHaveLength(2);
  });

  it("같은 음을 다시 눌러도 개수가 늘지 않는다", () => {
    const r = tapAll(p, [67, 79]);
    expect(r.found).toHaveLength(1);
    expect(r.message).toBe("이미 찾은 음이에요.");
    expect(r.tone).toBe("info");
  });

  it("완료한 뒤에는 더 눌러도 상태가 바뀌지 않는다", () => {
    const done = tapAll(p, [67, 71, 74]);
    const after = judgeTap(p, done, 60);
    expect(after.done).toBe(true);
    expect(after.tone).toBe("ok");
    expect(after.found).toEqual(done.found);
  });

  it("흰 건반 사이의 검은 건반은 정답이 아니다", () => {
    expect(tapAll(p, [68]).wrongMidi).toBe(68);
  });
});

describe("차례로 누르기", () => {
  const p = plan(base.scale, 5); // 도 레 미 파 솔 라 시 도

  it("순서대로 누르면 완료(마지막 도는 한 옥타브 위)", () => {
    const r = tapAll(p, [60, 62, 64, 65, 67, 69, 71, 72]);
    expect(r.done).toBe(true);
    expect(r.message).toBe("맞아요!");
  });

  it("끝의 도는 낮은 도를 눌러도 인정(옥타브 무관)", () => {
    expect(tapAll(p, [60, 62, 64, 65, 67, 69, 71, 60]).done).toBe(true);
  });

  it("순서가 틀리면 처음 자리에서 다시", () => {
    const r = tapAll(p, [60, 64]);
    expect(r.wrongMidi).toBe(64);
    expect(r.message).toBe("순서가 달라요. 다시 눌러 보세요.");
    expect(r.nextIndex).toBe(1);
    // 틀린 뒤 맞는 음(레)을 누르면 이어서 진행
    expect(judgeTap(p, r, 62).nextIndex).toBe(2);
  });

  it("진행 개수를 알려 준다", () => {
    expect(tapAll(p, [60, 62]).message).toBe("2 / 8개 찾았어요.");
  });

  it("같은 음이 두 번 나와도(도…도) 개수는 순서 기준으로 센다", () => {
    expect(startAsk(p).total).toBe(8);
    expect(p.sequence[0]).toBe(p.sequence[7]);
  });
});

describe("계획 만들기", () => {
  it("success 문구에 자리표시자를 풀어 쓴다", () => {
    const lesson = structuredClone(base.scale);
    lesson.steps[5]!.ask = { type: "건반", answer: "scale", order: "차례로", success: "{key} 음계 완성!" };
    const ask = computeScene(lesson, 5).ask!;
    expect(planAsk(lesson, ask)!.success).toBe("다장조 음계 완성!");
  });

  it("정답 요소가 없으면 null", () => {
    expect(planAsk(base.scale, { type: "건반", answer: "nope" })).toBeNull();
  });

  it("실제 수업의 모든 해보기가 풀 수 있는 문제다(정답 음을 누르면 완료)", () => {
    for (const lesson of Object.values(base)) {
      lesson.steps.forEach((step, i) => {
        if (!step.ask) return;
        const p = plan(lesson, i);
        const el = lesson.elements[step.ask.answer]!;
        const midis = el.pitches.map((t) => {
          const m = /^([A-G])(#|b)?(\d)$/.exec(t)!;
          const base0 = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1] as "C"];
          return (Number(m[3]) + 1) * 12 + base0 + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
        });
        expect(tapAll(p, midis).done, `${lesson.id} 단계 ${i + 1}`).toBe(true);
      });
    }
  });
});
