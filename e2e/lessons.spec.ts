import { expect, test } from "@playwright/test";
import { lessons } from "../src/lessons";
import { computeScene } from "../src/lib/script/scene";
import { goToStep, openKeyboard, openLesson, trackProblems } from "./helpers";

for (const lesson of lessons) {
  test(`${lesson.title}: 끝까지 넘기면 단계마다 자막이 계산값과 같다`, async ({ page }) => {
    const problems = trackProblems(page);
    await openLesson(page, `/lesson/${lesson.id}`);
    const total = lesson.steps.length;

    for (let i = 0; i < total; i++) {
      const scene = computeScene(lesson, i);
      await expect(page.locator(".caption")).toHaveText(scene.caption);
      await expect(page.locator(".stepno")).toHaveText(`${i + 1} / ${total}`);
      await expect(page).toHaveURL(new RegExp(`step=${i + 1}$`));
      if (i < total - 1) await page.getByRole("button", { name: "다음" }).click();
    }

    // 마지막 단계: 다음 버튼 대신 '수업 목록으로'
    await expect(page.getByRole("button", { name: "다음" })).toHaveCount(0);
    await page.getByRole("link", { name: "수업 목록으로" }).last().click();
    await expect(page).toHaveURL(/\/$/);
    expect(problems).toEqual([]);
  });
}

test("처음부터 다시 버튼과 단계 점으로 바로 이동", async ({ page }) => {
  const lesson = lessons.find((l) => l.id === "c-major-triads")!;
  await openLesson(page, `/lesson/${lesson.id}`);
  await goToStep(page, 6);
  await expect(page.locator(".stepno")).toHaveText(`6 / ${lesson.steps.length}`);
  await expect(page.locator(".caption")).toHaveText(computeScene(lesson, 5).caption);
  await page.getByRole("button", { name: "처음부터 다시" }).click();
  await expect(page.locator(".stepno")).toHaveText(`1 / ${lesson.steps.length}`);
  await expect(page.getByRole("button", { name: "이전" })).toBeDisabled();
});

test("?step=번호로 바로 그 단계에서 열린다(범위 밖 번호는 처음/끝으로)", async ({ page }) => {
  const lesson = lessons.find((l) => l.id === "c-major-scale")!;
  await openLesson(page, `/lesson/${lesson.id}?step=3`);
  await expect(page.locator(".stepno")).toHaveText(`3 / ${lesson.steps.length}`);
  await expect(page.locator(".caption")).toHaveText(computeScene(lesson, 2).caption);

  await openLesson(page, `/lesson/${lesson.id}?step=99`);
  await expect(page.locator(".stepno")).toHaveText(`${lesson.steps.length} / ${lesson.steps.length}`);

  await openLesson(page, `/lesson/${lesson.id}?step=abc`);
  await expect(page.locator(".stepno")).toHaveText(`1 / ${lesson.steps.length}`);
});

test("오선보 열 수는 장면 계산과 같고, 강조는 칠판과 건반에 같이 나온다", async ({ page }) => {
  const lesson = lessons.find((l) => l.id === "c-major-scale")!;
  await openLesson(page, `/lesson/${lesson.id}?step=3`); // 미·파 강조
  await openKeyboard(page);
  await expect(page.locator("svg.staff g.col")).toHaveCount(8);
  await expect(page.locator("svg.staff .halo-hot")).toHaveCount(2);
  const hotKeys = page.locator("svg.keyboard .key.is-hot");
  await expect(hotKeys).toHaveCount(2);
  await expect(hotKeys.nth(0)).toHaveAttribute("data-midi", "64");
  await expect(hotKeys.nth(1)).toHaveAttribute("data-midi", "65");
  // 온음/반음 표시는 켠 뒤(2단계~)에만 나온다
  await expect(page.locator("svg.staff .gap")).toHaveCount(7);
  await expect(page.locator("svg.staff .gap-semi")).toHaveCount(2);

  await openLesson(page, `/lesson/${lesson.id}?step=1`);
  await expect(page.locator("svg.staff .gap")).toHaveCount(0);
  await expect(page.locator("svg.staff .halo-hot")).toHaveCount(0);
});

test("화음 수업: 요소가 단계마다 하나씩 나타난다", async ({ page }) => {
  const lesson = lessons.find((l) => l.id === "c-major-triads")!;
  await openLesson(page, `/lesson/${lesson.id}?step=1`);
  await expect(page.locator("svg.staff g.col")).toHaveCount(8);
  await goToStep(page, 3);
  await expect(page.locator("svg.staff g.col")).toHaveCount(9);
  await expect(page.locator("svg.staff g.col-chord")).toHaveCount(1);
  await expect(page.locator("svg.staff .lab1", { hasText: "으뜸화음" })).toBeVisible();
  await goToStep(page, 7);
  await expect(page.locator("svg.staff g.col-chord")).toHaveCount(3);
  await expect(page.locator("svg.staff .lab1", { hasText: "버금딸림화음" })).toBeVisible();
  await expect(page.locator("svg.staff .lab1", { hasText: "딸림화음" }).last()).toBeVisible();
});
