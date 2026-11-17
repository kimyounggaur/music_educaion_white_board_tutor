import { expect, test } from "@playwright/test";
import { goToStep, openLesson, trackProblems } from "./helpers";

// 조표·임시표 시험(개발용 대본). NEXT_PUBLIC_DEV_LESSONS=1로 빌드했을 때만 열린다.
test("사장조: 조표(올림표 1개)와 임시표(내림·올림·제자리)가 제대로 그려진다", async ({ page }) => {
  const problems = trackProblems(page);
  await openLesson(page, "/dev/g-major-fixture?step=1");

  // 조표: 사장조는 올림표 하나. 음자리표 + 조표 글자가 오선 쪽에 있다
  const staveGlyphs = await page.locator("svg.staff .stave text").count();
  expect(staveGlyphs).toBeGreaterThanOrEqual(2);

  // 1단계: 음계 8개, 조표 안의 F#은 임시표가 붙지 않는다 → 음 하나당 글자 1개(음표 머리)
  const perColumn = async () =>
    page.$$eval("svg.staff g.col .art", (els) => els.map((e) => e.querySelectorAll("text").length));
  expect(await perColumn()).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);

  // 임시표 단계(5단계): Bb4(내림표), C#5(올림표), F5(제자리표), F#5(조표 안이라 없음)
  await goToStep(page, 5);
  await expect(page.locator("svg.staff g.col")).toHaveCount(4);
  expect(await perColumn()).toEqual([2, 2, 2, 1]);
  expect(problems).toEqual([]);
});

test("개발용 대본은 수업 고르기에 없고, 주소로만 열린다", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("a.card")).toHaveCount(4);
  const res = await page.goto("/dev/not-a-fixture");
  expect(res?.status()).toBe(404);
});
