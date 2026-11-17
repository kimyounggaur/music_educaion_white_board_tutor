import { describe, expect, it } from "vitest";
import { lessons } from "../src/lessons";
import { fixtures } from "../src/lessons/fixtures";
import { LIMITS, validateLesson, validateLessons, type ValidationResult } from "../src/lib/script/validate";
import type { Lesson } from "../src/lib/script/schema";
import { base, clone } from "./helpers";

const codes = (r: ValidationResult) => r.errors.map((e) => e.code);
const warnCodes = (r: ValidationResult) => r.warnings.map((e) => e.code);

/** 고친 수업이 정확히 원하는 오류 코드를 내는지 본다(다른 이유로 실패한 것을 걸러낸다). */
function expectError(mutate: (l: Lesson) => void, code: string, from: Lesson = base.scale) {
  const lesson = clone(from);
  mutate(lesson);
  const r = validateLesson(lesson);
  expect(r.ok, JSON.stringify(r.errors)).toBe(false);
  expect(codes(r)).toContain(code);
  return r;
}

describe("진짜 수업은 모두 통과", () => {
  for (const lesson of [...lessons, ...fixtures]) {
    it(`${lesson.id}: 오류 0, 경고 0`, () => {
      const r = validateLesson(lesson);
      expect(r.errors, JSON.stringify(r.errors)).toEqual([]);
      expect(r.warnings, JSON.stringify(r.warnings)).toEqual([]);
      expect(r.ok).toBe(true);
    });
  }

  it("수업 id가 겹치지 않는다", () => {
    const r = validateLessons([...lessons, ...fixtures]);
    expect(r.duplicateIds).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("id가 겹치면 실패", () => {
    const r = validateLessons([base.scale, base.scale]);
    expect(r.duplicateIds).toEqual(["c-major-scale"]);
    expect(r.ok).toBe(false);
  });

  it("모든 수업은 아직 '교사 검토 전'으로 표시돼 있다(검토 완료는 사람이 바꾼다)", () => {
    for (const lesson of lessons) expect(lesson.review.status, lesson.id).toBe("교사 검토 전");
  });
});

describe("형식 오류", () => {
  it("객체가 아니면 E-FORM", () => {
    expect(codes(validateLesson(null))).toContain("E-FORM");
    expect(codes(validateLesson("수업"))).toContain("E-FORM");
  });

  it("모르는 항목이 있으면 E-FORM(오타를 놓치지 않는다)", () => {
    const l = clone(base.scale) as unknown as Record<string, unknown>;
    l.titel = "오타";
    expect(codes(validateLesson(l))).toContain("E-FORM");
  });

  it("단계가 3개 미만이거나 16개 초과면 E-FORM", () => {
    expectError((l) => void (l.steps = l.steps.slice(0, 2)), "E-FORM");
    expectError((l) => void (l.steps = Array.from({ length: 17 }, () => clone(l.steps[0]!))), "E-FORM");
  });

  it("schema 번호가 다르면 E-FORM", () => {
    const l = clone(base.scale) as unknown as Record<string, unknown>;
    l.schema = 2;
    expect(codes(validateLesson(l))).toContain("E-FORM");
  });

  it("지원하지 않는 조 E-KEY", () => {
    expectError((l) => void (l.key = { tonic: "G#", mode: "major" }), "E-KEY");
  });
});

describe("음과 음계", () => {
  it("음 표기가 틀리면 E-FORM(형식 검사에서 먼저 걸러진다)", () => {
    expectError((l) => void (l.elements.scale = { type: "notes", pitches: ["C4", "H4"] }), "E-FORM");
    expectError((l) => void (l.elements.scale = { type: "notes", pitches: ["C4", "C"] }), "E-FORM");
  });

  it("음역(C4~C6) 밖이면 E-PITCH", () => {
    expectError((l) => void (l.elements.scale = { type: "notes", pitches: ["C4", "C7"] }), "E-PITCH");
    expectError((l) => void (l.elements.scale = { type: "notes", pitches: ["B3", "C4"] }), "E-PITCH");
  });

  it("장음계 선언과 음이 다르면 E-SCALE", () => {
    const r = expectError((l) => {
      const el = l.elements.scale!;
      el.pitches = ["C4", "D4", "Eb4", "F4", "G4", "A4", "B4", "C5"];
    }, "E-SCALE");
    expect(r.errors.find((e) => e.code === "E-SCALE")!.message).toContain("C4 D4 E4 F4 G4 A4 B4 C5");
  });

  it("음이 하나 모자라도 E-SCALE", () => {
    expectError((l) => void (l.elements.scale!.pitches = ["C4", "D4", "E4", "F4", "G4", "A4", "B4"]), "E-SCALE");
  });

  it("조 밖의 음에 계이름을 붙이면 E-SOLFEGE", () => {
    expectError((l) => {
      l.elements.scale = { type: "notes", pitches: ["C4", "C#4", "D4"], labels: "계이름" };
      l.steps[0]!.play = { target: "scale", how: "차례로" };
    }, "E-SOLFEGE");
  });

  it("키 글자(keyLabels)를 계이름으로 쓸 때 건반 범위의 흰 건반이 모두 조 안이어야 한다", () => {
    expectError(
      (l) => {
        l.key = { tonic: "G", mode: "major" };
        l.keyboard = { from: "G4", to: "G5" };
        l.elements.scale = { type: "notes", pitches: ["G4", "A4", "B4", "C5", "D5", "E5", "F#5", "G5"], scale: "major" };
        l.steps[1] = { caption: "건반에 계이름을 붙여요.", keyLabels: "계이름" };
      },
      "E-SOLFEGE",
    );
  });
});

describe("화음", () => {
  it("degree 화음의 음이 틀리면 E-CHORD", () => {
    const r = expectError((l) => void (l.elements.tonic!.pitches = ["C4", "E4", "A4"]), "E-CHORD", base.triads);
    expect(r.errors.find((e) => e.code === "E-CHORD")!.message).toContain("C E G");
  });

  it("7화음 선언인데 3화음 음이면 E-CHORD", () => {
    expectError(
      (l) => void (l.elements.dom7!.pitches = ["G4", "B4", "D5"]),
      "E-CHORD",
      base.seventh,
    );
  });

  it("1단계에서 허용하지 않는 degree(2도 등)는 E-FORM", () => {
    expectError(
      (l) => {
        l.elements.tonic = { type: "chord", pitches: ["D4", "F4", "A4"], degree: 2 as 1 };
      },
      "E-FORM",
      base.triads,
    );
  });

  it("1도·4도 7화음처럼 이름이 확인되지 않은 조합은 E-CHORD", () => {
    expectError(
      (l) => {
        l.elements.tonic = { type: "chord", pitches: ["C4", "E4", "G4", "B4"], degree: 1, kind: "seventh" };
      },
      "E-CHORD",
      base.triads,
    );
  });

  it("degree와 name을 같이 쓰면 E-NAME", () => {
    expectError(
      (l) => void (l.elements.tonic = { type: "chord", pitches: ["C4", "E4", "G4"], degree: 1, name: "으뜸화음" }),
      "E-NAME",
      base.triads,
    );
  });

  it("kind만 쓰고 degree가 없으면 E-CHORD", () => {
    expectError(
      (l) => void (l.elements.tonic = { type: "chord", pitches: ["C4", "E4", "G4"], kind: "triad" }),
      "E-CHORD",
      base.triads,
    );
  });

  it("3도씩 쌓이지 않거나 아래에서 위로 오르지 않으면 E-ORDER", () => {
    expectError((l) => void (l.elements.tonic!.pitches = ["C4", "G4", "E5"]), "E-ORDER", base.triads);
    expectError(
      (l) => void (l.elements.tonic = { type: "chord", pitches: ["G4", "E4", "C4"], name: "시험" }),
      "E-ORDER",
      base.triads,
    );
  });

  it("이름을 표시하려면 degree나 name이 있어야 한다", () => {
    expectError(
      (l) => {
        l.elements.tonic = { type: "chord", pitches: ["C4", "E4", "G4"], labels: "이름" };
      },
      "E-CHORD",
      base.triads,
    );
  });
});

describe("건반", () => {
  it("끝이 검은 건반이면 E-KEYBOARD", () => {
    expectError((l) => void (l.keyboard = { from: "C#4", to: "C5" }), "E-KEYBOARD");
  });

  it("from이 to보다 높으면 E-KEYBOARD", () => {
    expectError((l) => void (l.keyboard = { from: "C5", to: "C4" }), "E-KEYBOARD");
  });

  it("흰 건반이 15개를 넘으면 E-KEYBOARD", () => {
    expectError((l) => void (l.keyboard = { from: "C4", to: "D6" }), "E-KEYBOARD");
  });

  it("음이 건반 범위 밖이면 E-KEYBOARD", () => {
    expectError((l) => void (l.keyboard = { from: "D4", to: "B4" }), "E-KEYBOARD");
  });
});

describe("단계: 참조와 번호", () => {
  it("없는 요소를 보이려 하면 E-REF", () => {
    expectError((l) => void (l.steps[0]!.show = ["nope"]), "E-REF");
  });

  it("이미 보이는 요소를 다시 보이면 E-REF", () => {
    expectError((l) => void (l.steps[2] = { caption: "다시 보여요.", show: ["scale"] }), "E-REF");
  });

  it("보이지 않는 요소를 빼려 하면 E-REF", () => {
    expectError((l) => void (l.steps[0]!.hide = ["scale"]), "E-REF", base.triads);
  });

  it("강조·재생 대상이 아직 보이지 않으면 E-REF", () => {
    expectError(
      (l) => void (l.steps[0]!.highlight = { target: "tonic" }),
      "E-REF",
      base.triads,
    );
    expectError(
      (l) => void (l.steps[0]!.play = { target: "dom", how: "동시에" }),
      "E-REF",
      base.triads,
    );
  });

  it("빼 버린 요소를 강조하면 E-REF", () => {
    expectError(
      (l) => void (l.steps[2]!.highlight = { target: "dom" }),
      "E-REF",
      base.seventh,
    );
  });

  it("음 번호가 범위를 벗어나면 E-INDEX", () => {
    expectError((l) => void (l.steps[2]!.highlight = { target: "scale", notes: [9] }), "E-INDEX");
    expectError((l) => void (l.steps[2]!.play = { target: "scale", notes: [3, 4, 20], how: "차례로" }), "E-INDEX");
  });

  it("해보기 정답 요소가 없으면 E-REF", () => {
    expectError((l) => void (l.steps[5]!.ask = { type: "건반", answer: "nope" }), "E-REF");
  });

  it("차례로 누르기는 음 줄에만 E-ASK", () => {
    expectError(
      (l) => void (l.steps[8]!.ask = { type: "건반", answer: "dom", order: "차례로" }),
      "E-ASK",
      base.triads,
    );
  });

  it("set 대상이 보이지 않으면 E-REF", () => {
    expectError((l) => void (l.steps[1]!.set = { target: "nope", labels: "계이름" }), "E-REF");
  });
});

describe("단계: 표시 옵션과 거리", () => {
  it("음 줄에 화음용 labels를 쓰면 E-FORM", () => {
    expectError((l) => void (l.steps[1]!.set = { target: "scale", labels: "로마숫자" }), "E-FORM");
  });

  it("화음에 음 줄용 labels를 쓰면 E-FORM", () => {
    expectError(
      (l) => void (l.steps[3]!.set = { target: "tonic", labels: "계이름" }),
      "E-FORM",
      base.triads,
    );
  });

  it("온음·반음이 아닌 간격에 gaps를 켜면 E-GAPS", () => {
    expectError((l) => {
      l.elements.scale = { type: "notes", pitches: ["C4", "E4", "G4"] };
      l.steps[1] = { caption: "거리를 봐요.", set: { target: "scale", gaps: true } };
    }, "E-GAPS");
  });

  it("화음에 gaps를 켜면 E-GAPS", () => {
    expectError(
      (l) => void (l.steps[3] = { caption: "거리를 봐요.", set: { target: "tonic", gaps: true } }),
      "E-GAPS",
      base.triads,
    );
  });

  it("set에 labels도 gaps도 없으면 E-FORM", () => {
    expectError((l) => void (l.steps[1]!.set = { target: "scale" }), "E-FORM");
  });
});

describe("단계: 자막과 한 번에 하나", () => {
  it("자막이 60자를 넘으면 E-CAPTION", () => {
    const r = expectError(
      (l) => void (l.steps[0]!.caption = "가".repeat(LIMITS.maxCaption + 1)),
      "E-CAPTION",
    );
    expect(r.errors.find((e) => e.code === "E-CAPTION")!.message).toContain("너무 길어요");
  });

  it("자막 길이는 자리표시자를 푼 뒤의 글자 수로 센다", () => {
    // 템플릿은 짧아도 풀면 길어지는 경우를 놓치지 않는다
    const r = validateLesson(
      (() => {
        const l = clone(base.scale);
        l.steps[0]!.caption = "{key} 음계예요. " + "가".repeat(LIMITS.maxCaption - 8);
        return l;
      })(),
    );
    expect(codes(r)).toContain("E-CAPTION");
  });

  it("45자 초과 60자 이하는 경고(W-LONG)만", () => {
    const l = clone(base.scale);
    l.steps[0]!.caption = "가".repeat(LIMITS.warnCaption + 3);
    const r = validateLesson(l);
    expect(r.ok).toBe(true);
    expect(warnCodes(r)).toContain("W-LONG");
  });

  it("풀 수 없는 자리표시자는 E-CAPTION", () => {
    expectError((l) => void (l.steps[0]!.caption = "{nope.name:이/가} 나왔어요."), "E-CAPTION");
    expectError((l) => void (l.steps[0]!.caption = "{scale[1].solfege:이다}"), "E-CAPTION");
  });

  it("해보기 성공 문구의 자리표시자도 검사한다", () => {
    expectError(
      (l) => void (l.steps[5]!.ask = { type: "건반", answer: "scale", order: "차례로", success: "{nope.name}!" }),
      "E-CAPTION",
    );
  });

  it("한 단계에 두 가지를 바꾸면 E-ONE-CHANGE", () => {
    expectError(
      (l) => void (l.steps[1] = { caption: "둘을 바꿔요.", set: { target: "scale", gaps: true }, keyLabels: "계이름" }),
      "E-ONE-CHANGE",
    );
    expectError((l) => void (l.steps[0]!.set = { target: "scale", labels: "계이름" }), "E-ONE-CHANGE");
  });

  it("같은 단계에서 빼고 보이는 것은 한 가지 바꾸기로 센다", () => {
    const r = validateLesson(base.seventh);
    expect(codes(r)).not.toContain("E-ONE-CHANGE");
  });

  it("한 번에 보이는 열이 12개를 넘으면 E-STEPS", () => {
    expectError((l) => {
      l.keyboard = { from: "C4", to: "C6" };
      l.elements.extra = {
        type: "notes",
        pitches: ["C5", "D5", "E5", "F5", "G5", "A5", "B5", "C6"],
        scale: "major",
      };
      l.steps[2] = { caption: "음이 많아요.", show: ["extra"], play: { target: "extra", how: "차례로" } };
    }, "E-STEPS");
  });
});

describe("경고", () => {
  it("새로 보인 음에 소리가 없으면 W-NOPLAY", () => {
    const l = clone(base.names);
    delete l.steps[0]!.play;
    expect(warnCodes(validateLesson(l))).toContain("W-NOPLAY");
  });

  it("마지막 단계에 해보기·소리가 없으면 W-ENDING", () => {
    const l = clone(base.scale);
    delete l.steps[5]!.ask;
    expect(warnCodes(validateLesson(l))).toContain("W-ENDING");
  });

  it("쓰지 않는 요소는 W-UNUSED", () => {
    const l = clone(base.scale);
    l.elements.spare = { type: "notes", pitches: ["C4"] };
    expect(warnCodes(validateLesson(l))).toContain("W-UNUSED");
  });

  it("경고만 있으면 통과(ok=true)", () => {
    const l = clone(base.scale);
    l.elements.spare = { type: "notes", pitches: ["C4"] };
    const r = validateLesson(l);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });
});

describe("오류 메시지는 한국어이고 위치를 알려 준다", () => {
  it("path와 message가 있다", () => {
    const l = clone(base.scale);
    l.elements.scale!.pitches = ["C4", "D4", "Eb4", "F4", "G4", "A4", "B4", "C5"];
    const r = validateLesson(l);
    for (const e of r.errors) {
      expect(e.path).toBeTruthy();
      expect(e.message).toMatch(/[가-힣]/);
    }
  });
});
