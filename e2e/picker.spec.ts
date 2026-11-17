import { expect, test } from "@playwright/test";
import { lessons } from "../src/lessons";
import { openLessonMenu, trackProblems } from "./helpers";

test("상단에서 수업 4편을 골라 수업 화면으로 간다", async ({ page }) => {
  const problems = trackProblems(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "음악 칠판" })).toBeVisible();
  await expect(page.locator("main.home-board-area button, main.home-board-area a, main.home-board-area summary")).toHaveCount(0);
  await openLessonMenu(page);
  for (const lesson of lessons) {
    await expect(page.getByRole("link", { name: new RegExp(lesson.title) })).toBeVisible();
  }
  await expect(page.locator("header a.home-lesson-link")).toHaveCount(lessons.length);
  // 좁은 화면에서도 수업 선택 화면 전체가 가로로 잘리지 않아야 한다.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("link", { name: /다장조 음계/ }).click();
  await expect(page).toHaveURL(/\/lesson\/c-major-scale/);
  await expect(page.locator("svg.staff .stave")).toBeVisible();
  expect(problems).toEqual([]);
});

test("상단 사용 방법 메뉴에서 안내를 열고 닫을 수 있다", async ({ page }) => {
  await page.goto("/");
  const summary = page.locator("summary").filter({ hasText: "사용 방법" });
  const instructions = page.locator(".home-help-panel");
  await expect(instructions).toBeHidden();
  await summary.click();
  await expect(instructions).toBeVisible();
  await expect(instructions).toContainText("건반 열기");
  await summary.click();
  await expect(instructions).toBeHidden();
});

test("칠판/화이트보드 색을 바꾸면 저장되어 다시 열어도 유지된다", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "white");
  await page.getByRole("button", { name: "칠판", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "chalk");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "chalk");
  await expect(page.getByRole("button", { name: "칠판", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "화이트보드" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "white");
});

test("없는 수업 주소는 안내 화면(404)", async ({ page }) => {
  const res = await page.goto("/lesson/not-a-lesson");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("찾는 수업이 없어요")).toBeVisible();
  await page.getByRole("link", { name: "수업 목록으로" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("개발용 시험 대본은 수업 목록에 나오지 않는다", async ({ page }) => {
  await page.goto("/");
  await openLessonMenu(page);
  await expect(page.getByText("사장조 시험 칠판")).toHaveCount(0);
});
