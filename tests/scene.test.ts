import { describe, expect, it } from "vitest";
import { computeScene, newlyShown } from "../src/lib/script/scene";
import { buildPlayPlan, buildStaffColumns, describeBoard, keyboardMarks, TIMING } from "../src/lib/script/board";
import { lessons } from "../src/lessons";
import { fixtures } from "../src/lessons/fixtures";
import { base } from "./helpers";

describe("장면 계산", () => {
  it("보이는 요소는 0번 단계부터 쌓인다", () => {
    const l = base.triads;
    expect(computeScene(l, 0).visible).toEqual(["scale"]);
    expect(computeScene(l, 1).visible).toEqual(["scale"]);
    expect(computeScene(l, 2).visible).toEqual(["scale", "tonic"]);
    expect(computeScene(l, 4).visible).toEqual(["scale", "tonic", "subdom"]);
    expect(computeScene(l, 6).visible).toEqual(["scale", "tonic", "subdom", "dom"]);
    expect(computeScene(l, 8).visible).toEqual(["scale", "tonic", "subdom", "dom"]);
  });

  it("어느 단계로 바로 건너뛰어도 차례대로 간 것과 같다", () => {
    for (const lesson of [...lessons, ...fixtures]) {
      lesson.steps.forEach((_, i) => {
        const direct = computeScene(lesson, i);
        // 한 단계씩 다시 계산해도 같은 값이 나와야 한다(순수 함수)
        for (let j = 0; j <= i; j++) computeScene(lesson, j);
        expect(computeScene(lesson, i)).toEqual(direct);
      });
    }
  });

  it("한 단계에서 빼고 보이면 바뀐 상태가 된다", () => {
    const s = computeScene(base.seventh, 1);
    expect(s.visible).toEqual(["dom7"]);
    expect(computeScene(base.seventh, 3).visible).toEqual(["dom7", "tonic"]);
  });

  it("표시 옵션(labels)은 바꾼 단계부터 이어진다", () => {
    const l = base.names;
    expect(computeScene(l, 0).labels.scale).toBe("없음");
    expect(computeScene(l, 1).labels.scale).toBe("계이름");
    expect(computeScene(l, 2).labels.scale).toBe("음이름");
    expect(computeScene(l, 3).labels.scale).toBe("둘 다");
    expect(computeScene(l, 6).labels.scale).toBe("둘 다");
  });

  it("건반 글자(keyLabels)는 바꾼 단계에서만 바뀐다", () => {
    const l = base.names;
    expect(computeScene(l, 3).keyLabels).toBe("없음");
    expect(computeScene(l, 4).keyLabels).toBe("음이름");
    expect(computeScene(l, 5).keyLabels).toBe("없음");
  });

  it("처음부터 계이름이 붙어 있는 음계와 화음의 기본 표시", () => {
    expect(computeScene(base.scale, 0).labels.scale).toBe("계이름");
    expect(computeScene(base.triads, 2).labels.tonic).toBe("둘 다");
    expect(computeScene(base.seventh, 0).labels.dom).toBe("둘 다");
  });

  it("거리(gaps)는 켠 단계부터 이어진다", () => {
    expect(computeScene(base.scale, 0).gaps.scale).toBe(false);
    expect(computeScene(base.scale, 1).gaps.scale).toBe(true);
    expect(computeScene(base.scale, 5).gaps.scale).toBe(true);
  });

  it("강조·재생·해보기는 지금 단계 것만 쓴다", () => {
    const l = base.scale;
    expect(computeScene(l, 1).highlight).toEqual([]);
    expect(computeScene(l, 2).highlight).toEqual([{ target: "scale", notes: [3, 4] }]);
    expect(computeScene(l, 3).highlight).toEqual([{ target: "scale", notes: [7, 8] }]);
    expect(computeScene(l, 2).ask).toBeNull();
    expect(computeScene(l, 5).ask?.answer).toBe("scale");
    expect(computeScene(l, 5).play).toEqual([]);
  });

  it("자막은 자리표시자를 푼 글이다", () => {
    expect(computeScene(base.scale, 0).caption).toBe("다장조 음계예요. 도에서 시작해 한 음씩 올라가요.");
    expect(computeScene(base.scale, 2).caption).toContain("미와 파 사이는 반음이에요");
    expect(computeScene(base.scale, 3).caption).toContain("시와 도 사이도 반음이에요");
    expect(computeScene(base.triads, 2).caption).toBe("세 음을 쌓아 함께 울리면 으뜸화음이 돼요.");
    expect(computeScene(base.seventh, 2).caption).toContain("으뜸화음으로 가고 싶어 해요");
  });

  it("범위를 벗어난 단계 번호는 끝으로 맞춘다", () => {
    const l = base.scale;
    expect(computeScene(l, -3).stepIndex).toBe(0);
    expect(computeScene(l, 99).stepIndex).toBe(l.steps.length - 1);
  });

  it("새로 나타난 요소를 찾는다", () => {
    const l = base.triads;
    expect(newlyShown(null, computeScene(l, 2))).toEqual([]);
    expect(newlyShown(computeScene(l, 1), computeScene(l, 2))).toEqual(["tonic"]);
    expect(newlyShown(computeScene(l, 2), computeScene(l, 3))).toEqual([]);
    // 뒤로 가면 새로 생긴 것이 없다
    expect(newlyShown(computeScene(l, 4), computeScene(l, 3))).toEqual([]);
  });
});

describe("오선보 열", () => {
  it("음 줄은 음마다 한 열, 화음은 요소 하나가 한 열", () => {
    const cols = buildStaffColumns(base.triads, computeScene(base.triads, 8), [], []);
    expect(cols).toHaveLength(8 + 3);
    expect(cols.filter((c) => c.isChord)).toHaveLength(3);
    expect(cols.find((c) => c.elementId === "dom")!.pitches).toEqual(["G4", "B4", "D5"]);
  });

  it("온음/반음 표시는 켠 단계에서만, 반음은 미-파·시-도 두 곳", () => {
    const off = buildStaffColumns(base.scale, computeScene(base.scale, 0), [], []);
    expect(off.every((c) => c.gapAfter === null)).toBe(true);

    const on = buildStaffColumns(base.scale, computeScene(base.scale, 1), [], []);
    expect(on.map((c) => c.gapAfter)).toEqual(["온음", "온음", "반음", "온음", "온음", "온음", "반음", null]);
  });

  it("계이름·음이름 글자 줄", () => {
    const names = base.names;
    const none = buildStaffColumns(names, computeScene(names, 0), [], []);
    expect(none[0]!.line1).toBe("");

    const solfege = buildStaffColumns(names, computeScene(names, 1), [], []);
    expect(solfege.map((c) => c.line1)).toEqual(["도", "레", "미", "파", "솔", "라", "시", "도"]);

    const letters = buildStaffColumns(names, computeScene(names, 2), [], []);
    expect(letters.map((c) => c.line1)).toEqual(["다", "라", "마", "바", "사", "가", "나", "다"]);
    expect(letters.map((c) => c.line2)).toEqual(["C", "D", "E", "F", "G", "A", "B", "C"]);

    const both = buildStaffColumns(names, computeScene(names, 3), [], []);
    expect(both[4]!.line1).toBe("솔");
    expect(both[4]!.line2).toBe("사");
  });

  it("화음 글자 줄: 이름과 로마 숫자", () => {
    const cols = buildStaffColumns(base.triads, computeScene(base.triads, 8), [], []);
    const dom = cols.find((c) => c.elementId === "dom")!;
    expect(dom.line1).toBe("딸림화음");
    expect(dom.line2).toBe("V");
    const sev = buildStaffColumns(base.seventh, computeScene(base.seventh, 1), [], []);
    expect(sev[0]!.line1).toBe("딸림7화음");
    expect(sev[0]!.line2).toBe("V7");
  });

  it("강조와 소리 표시가 음 번호에 정확히 붙는다", () => {
    const scene = computeScene(base.scale, 2); // 3번·4번째 음 강조
    const cols = buildStaffColumns(base.scale, scene, [{ elementId: "scale", index: 3 }], []);
    expect(cols.map((c) => c.hot[0])).toEqual([false, false, true, true, false, false, false, false]);
    expect(cols.map((c) => c.sounding[0])).toEqual([false, false, false, true, false, false, false, false]);
  });

  it("화음 안에서 일부 음만 강조한다", () => {
    const scene = computeScene(base.seventh, 2); // dom7의 2번·4번째 음
    const cols = buildStaffColumns(base.seventh, scene, [], []);
    expect(cols).toHaveLength(1);
    expect(cols[0]!.hot).toEqual([false, true, false, true]);
  });

  it("새 요소 표시", () => {
    const scene = computeScene(base.triads, 2);
    const cols = buildStaffColumns(base.triads, scene, [], ["tonic"]);
    expect(cols.find((c) => c.elementId === "tonic")!.isNew).toBe(true);
    expect(cols.find((c) => c.elementId === "scale")!.isNew).toBe(false);
  });

  it("모든 수업·모든 단계에서 열이 12개 이하", () => {
    for (const lesson of [...lessons, ...fixtures]) {
      lesson.steps.forEach((_, i) => {
        const cols = buildStaffColumns(lesson, computeScene(lesson, i), [], []);
        expect(cols.length, `${lesson.id} ${i}`).toBeLessThanOrEqual(12);
      });
    }
  });
});

describe("건반 표시", () => {
  it("강조는 같은 장면의 음과 같다(미·파 = MIDI 64·65)", () => {
    const m = keyboardMarks(base.scale, computeScene(base.scale, 2), []);
    expect([...m.hot].sort()).toEqual([64, 65]);
    expect(m.sounding.size).toBe(0);
  });

  it("화음 전체 강조는 화음의 모든 음", () => {
    const l = base.triads;
    const m = keyboardMarks(l, computeScene(l, 7), []);
    // 으뜸(C E G) + 버금딸림(F A C) + 딸림(G B D): 겹치는 음은 한 번만
    expect([...m.hot].sort((a, b) => a - b)).toEqual([60, 64, 65, 67, 69, 71, 72, 74]);
  });

  it("소리 나는 음", () => {
    const l = base.scale;
    const m = keyboardMarks(l, computeScene(l, 0), [{ elementId: "scale", index: 4 }]);
    expect([...m.sounding]).toEqual([67]);
  });
});

describe("재생 계획", () => {
  it("차례로: 음마다 TIMING.noteSlot 간격", () => {
    const { events, total } = buildPlayPlan(base.scale, computeScene(base.scale, 0).play);
    expect(events).toHaveLength(8);
    expect(events.map((e) => e.pitch)).toEqual(["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"]);
    events.forEach((e, i) => expect(e.at).toBeCloseTo(i * TIMING.noteSlot, 9));
    expect(total).toBeCloseTo(8 * TIMING.noteSlot + TIMING.itemGap, 9);
  });

  it("동시에: 한 시각에 모든 음", () => {
    const { events } = buildPlayPlan(base.triads, computeScene(base.triads, 2).play);
    expect(events.map((e) => e.pitch)).toEqual(["C4", "E4", "G4"]);
    expect(new Set(events.map((e) => e.at)).size).toBe(1);
    expect(events[0]!.soundDur).toBe(TIMING.chordSound);
  });

  it("여러 항목은 앞 항목이 끝난 뒤에 이어진다", () => {
    const { events, total } = buildPlayPlan(base.triads, computeScene(base.triads, 7).play);
    const starts = [...new Set(events.map((e) => e.at))];
    expect(starts).toEqual([0, TIMING.chordItem, 2 * TIMING.chordItem]);
    expect(total).toBeCloseTo(3 * TIMING.chordItem, 9);
  });

  it("notes로 고른 음만 소리 낸다", () => {
    const { events } = buildPlayPlan(base.scale, computeScene(base.scale, 2).play);
    expect(events.map((e) => e.pitch)).toEqual(["E4", "F4"]);
    expect(events.map((e) => e.ref.index)).toEqual([2, 3]);
  });

  it("소리 없는 단계는 빈 계획", () => {
    const { events, total } = buildPlayPlan(base.scale, computeScene(base.scale, 1).play);
    expect(events).toEqual([]);
    expect(total).toBe(0);
  });

  it("가장 긴 재생도 10초 안쪽(교실 진행 속도)", () => {
    for (const lesson of lessons) {
      lesson.steps.forEach((_, i) => {
        const { total } = buildPlayPlan(lesson, computeScene(lesson, i).play);
        expect(total, `${lesson.id} ${i}`).toBeLessThan(10);
      });
    }
  });
});

describe("화면 설명(스크린리더)", () => {
  it("보이는 요소를 말로 풀어 준다", () => {
    expect(describeBoard(base.triads, computeScene(base.triads, 0))).toContain("음 8개");
    expect(describeBoard(base.triads, computeScene(base.triads, 2))).toContain("으뜸화음");
    expect(describeBoard(base.names, computeScene(base.names, 5))).toContain("오선보");
  });
});
