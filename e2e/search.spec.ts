import { expect, test } from "@playwright/test";

test("상단 검색에서 수업 제목을 찾고 결과를 선택한다", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("searchbox", { name: "수업 검색" });
  const results = page.locator(".home-search-panel");
  await expect(page.locator("header").getByRole("searchbox", { name: "수업 검색" })).toBeVisible();
  await search.fill("다장조");
  await expect(results.locator("a.home-search-result")).toHaveCount(2);
  await results.getByRole("link", { name: /다장조 주요 3화음/ }).click();
  await expect(page).toHaveURL(/\/lesson\/c-major-triads/);
  await expect(page.locator("svg.staff .stave")).toBeVisible();
});

test("설명과 수업 분류로 검색하고 없는 검색 결과를 안내한다", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("searchbox", { name: "수업 검색" });
  const results = page.locator(".home-search-panel");
  await search.fill("버금딸림화음");
  await expect(results.getByRole("link", { name: /다장조 주요 3화음/ })).toBeVisible();
  await search.fill("중학교");
  await expect(results.getByRole("link", { name: /딸림7화음과 마침꼴/ })).toBeVisible();
  await search.fill("없는 수업 이름 123");
  await expect(results).toContainText("검색 결과가 없습니다.");
  await expect(results.locator("a.home-search-result")).toHaveCount(0);
  await search.fill("사장조 시험 칠판");
  await expect(results).toContainText("검색 결과가 없습니다.");
  await search.press("Escape");
  await expect(results).toBeHidden();
});

test("검색창은 좁은 화면에서도 보이고 키보드로 수업을 시작한다", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("searchbox", { name: "수업 검색" });
  await expect(search).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await search.fill("음이름과 계이름");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/lesson\/names-and-solfege/);
});

test("한글 조합 중 Enter는 수업을 열지 않는다", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("searchbox", { name: "수업 검색" });
  await search.fill("다장조");
  await search.dispatchEvent("compositionstart", { data: "ㅎ" });
  await search.press("Enter");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".home-search-panel")).toBeVisible();
  await search.dispatchEvent("compositionend", { data: "한" });
});
