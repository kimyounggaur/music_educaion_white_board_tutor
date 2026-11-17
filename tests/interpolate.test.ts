import { describe, expect, it } from "vitest";
import { resolveCaption } from "../src/lib/script/interpolate";
import { base, clone } from "./helpers";

const ok = (lesson: Parameters<typeof resolveCaption>[0], template: string) => {
  const r = resolveCaption(lesson, template);
  expect(r.errors, template).toEqual([]);
  return r.text;
};

describe("자막 자리표시자", () => {
  it("조 이름", () => {
    expect(ok(base.scale, "{key} 음계")).toBe("다장조 음계");
  });

  it("번호 없는 속성: name, numeral, count, solfege, letters", () => {
    expect(ok(base.triads, "{tonic.name}")).toBe("으뜸화음");
    expect(ok(base.triads, "{subdom.name}")).toBe("버금딸림화음");
    expect(ok(base.triads, "{dom.numeral}")).toBe("V");
    expect(ok(base.seventh, "{dom7.name}/{dom7.numeral}")).toBe("딸림7화음/V7");
    expect(ok(base.scale, "{scale.count}개")).toBe("8개");
    expect(ok(base.triads, "{tonic.solfege}")).toBe("도·미·솔");
    expect(ok(base.triads, "{dom.letters}")).toBe("사·나·라");
  });

  it("음 하나를 번호로 가리킨다(1부터)", () => {
    expect(ok(base.scale, "{scale[1].solfege}")).toBe("도");
    expect(ok(base.scale, "{scale[8].solfege}")).toBe("도");
    expect(ok(base.scale, "{scale[5].letters}")).toBe("사");
  });

  it("조사: 받침에 따라 바뀐다", () => {
    expect(ok(base.scale, "{scale[5].solfege:은/는}")).toBe("솔은");
    expect(ok(base.scale, "{scale[1].solfege:은/는}")).toBe("도는");
    expect(ok(base.triads, "{dom.name:이/가}")).toBe("딸림화음이");
    expect(ok(base.seventh, "{dom7.name:이에요/예요}")).toBe("딸림7화음이에요");
    expect(ok(base.seventh, "{tonic.name:으로/로}")).toBe("으뜸화음으로");
    expect(ok(base.scale, "{scale[4].solfege:과/와}")).toBe("파와");
  });

  it("여러 개가 섞인 문장", () => {
    expect(ok(base.scale, "{scale[3].solfege:과/와} {scale[4].solfege} 사이는 반음이에요.")).toBe(
      "미와 파 사이는 반음이에요.",
    );
  });

  it("실제 수업의 모든 자막이 오류 없이 풀린다", () => {
    for (const lesson of Object.values(base)) {
      for (const step of lesson.steps) {
        const r = resolveCaption(lesson, step.caption);
        expect(r.errors, `${lesson.id}: ${step.caption}`).toEqual([]);
        expect(r.text).not.toMatch(/[{}]/);
      }
    }
  });
});

describe("풀 수 없는 자리표시자는 한국어 오류", () => {
  const cases: Array<[string, string]> = [
    ["{nope.name}", "요소가 없어요"],
    ["{scale[9].solfege}", "9번째 음이 없어요"],
    ["{scale[0].solfege}", "0번째 음이 없어요"],
    ["{scale.numeral}", "로마 숫자"],
    ["{scale.volume}", "알 수 없어요"],
    ["{scale[1].name}", "번호를 붙인"],
    ["{scale[1].count}", "번호를 붙인"],
    ["{tonic[1].name}", "번호를 붙인"],
    ["{scale[1].letters:이다}", "조사"],
    ["{key:은/는:이/가}", "형식이 틀렸어요"],
    ["{scale}", "형식이 틀렸어요"],
    ["{}", "형식이 틀렸어요"],
  ];
  for (const [template, hint] of cases) {
    it(template, () => {
      const r = resolveCaption(base.triads, template);
      expect(r.errors.length).toBeGreaterThan(0);
      expect(r.errors.join("\n")).toContain(hint);
    });
  }

  it("닫히지 않은 중괄호", () => {
    expect(resolveCaption(base.scale, "{key 음계").errors.join()).toContain("중괄호");
    expect(resolveCaption(base.scale, "key} 음계").errors.join()).toContain("중괄호");
  });

  it("영문 이름 뒤에는 조사를 붙일 수 없다(한글로 끝나야 한다)", () => {
    const lesson = clone(base.scale);
    lesson.elements.scale = { type: "chord", pitches: ["C4", "E4", "G4"], name: "C" };
    const r = resolveCaption(lesson, "{scale.name:이/가}");
    expect(r.errors.join()).toContain("조사");
  });

  it("조 밖의 음에 계이름을 요청하면 오류", () => {
    const lesson = clone(base.scale);
    lesson.elements.scale = { type: "notes", pitches: ["C4", "F#4"] };
    const r = resolveCaption(lesson, "{scale[2].solfege}");
    expect(r.errors.join()).toContain("계이름");
  });

  it("화음에 degree도 name도 없으면 {x.name}은 오류", () => {
    const lesson = clone(base.triads);
    lesson.elements.tonic = { type: "chord", pitches: ["C4", "E4", "G4"] };
    expect(resolveCaption(lesson, "{tonic.name}").errors.join()).toContain("이름");
  });
});
