import { describe, expect, it } from "vitest";
import { attachJosa, finalConsonant, JOSA_PAIRS } from "../src/lib/script/josa";

describe("받침 판정", () => {
  it("받침 없음은 0, ㄹ은 8", () => {
    expect(finalConsonant("도")).toBe(0);
    expect(finalConsonant("솔")).toBe(8);
    expect(finalConsonant("화음")).not.toBe(0);
  });
  it("한글이 아니면 null", () => {
    expect(finalConsonant("C")).toBeNull();
    expect(finalConsonant("7")).toBeNull();
    expect(finalConsonant("")).toBeNull();
    expect(finalConsonant("도)")).toBeNull();
  });
});

describe("조사 붙이기", () => {
  it("이/가, 은/는, 을/를", () => {
    expect(attachJosa("딸림화음", "이/가")).toBe("딸림화음이");
    expect(attachJosa("도", "이/가")).toBe("도가");
    expect(attachJosa("솔", "은/는")).toBe("솔은");
    expect(attachJosa("레", "은/는")).toBe("레는");
    expect(attachJosa("시", "을/를")).toBe("시를");
    expect(attachJosa("딸림7화음", "을/를")).toBe("딸림7화음을");
  });

  it("과/와", () => {
    expect(attachJosa("솔", "과/와")).toBe("솔과");
    expect(attachJosa("도", "과/와")).toBe("도와");
    expect(attachJosa("미", "과/와")).toBe("미와");
  });

  it("으로/로: 받침 ㄹ은 '로'", () => {
    expect(attachJosa("으뜸화음", "으로/로")).toBe("으뜸화음으로");
    expect(attachJosa("솔", "으로/로")).toBe("솔로");
    expect(attachJosa("도", "으로/로")).toBe("도로");
    expect(attachJosa("딸림7화음", "으로/로")).toBe("딸림7화음으로");
  });

  it("이에요/예요, 이라고/라고", () => {
    expect(attachJosa("딸림화음", "이에요/예요")).toBe("딸림화음이에요");
    expect(attachJosa("도", "이에요/예요")).toBe("도예요");
    expect(attachJosa("솔", "이라고/라고")).toBe("솔이라고");
    expect(attachJosa("레", "이라고/라고")).toBe("레라고");
  });

  it("앞말이 한글로 끝나지 않거나 조사 쌍이 틀리면 null", () => {
    expect(attachJosa("C", "이/가")).toBeNull();
    expect(attachJosa("V7", "은/는")).toBeNull();
    expect(attachJosa("도", "이가")).toBeNull();
    expect(attachJosa("도", "")).toBeNull();
  });

  it("지원하는 조사 쌍이 모두 동작한다", () => {
    for (const pair of JOSA_PAIRS) {
      expect(attachJosa("도", pair), pair).not.toBeNull();
      expect(attachJosa("솔", pair), pair).not.toBeNull();
    }
  });
});
