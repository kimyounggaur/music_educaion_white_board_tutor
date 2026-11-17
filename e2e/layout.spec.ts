import { expect, test } from "@playwright/test";
import { lessons } from "../src/lessons";
import { openKeyboard, openLesson, trackProblems } from "./helpers";

const probes = [
  { id: "names-and-solfege", step: 4 },
  { id: "c-major-scale", step: 3 },
  { id: "c-major-triads", step: 9 },
  { id: "dominant-seventh-cadence", step: 7 },
];

test("화이트보드와 상단 도구가 화면에 표시되고 가로로 넘치지 않는다", async ({ page }, info) => {
  const problems = trackProblems(page);
  const viewport = page.viewportSize()!;
  for (const probe of probes) {
    await openLesson(page, `/lesson/${probe.id}?step=${probe.step}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${probe.id}: 가로 넘침`).toBeLessThanOrEqual(0);
    await expect(page.locator(".topbar .controls")).toBeVisible();
    await expect(page.locator(".board .caption")).toBeVisible();
    await expect(page.locator(".board svg.staff")).toBeVisible();
    await expect(page.locator(".board button, .board a")).toHaveCount(0);
    await expect(page.locator(".board-frame .marker-tray")).toBeVisible();
    await expect(page.getByRole("button", { name: "건반 열기" })).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("svg.keyboard")).toHaveCount(0);
    const staff = (await page.locator("svg.staff").boundingBox())!;
    expect(staff.width, `${probe.id}: 오선보 폭`).toBeGreaterThan(viewport.width * 0.6);
  }
  expect(problems, info.project.name).toEqual([]);
});

test("상단 건반 메뉴를 열고 닫는다", async ({ page }) => {
  await openLesson(page, "/lesson/c-major-scale");
  await openKeyboard(page);
  await expect(page.getByRole("button", { name: "건반 닫기" })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("region", { name: "연주 건반" })).toBeVisible();
  await expect(page.locator(".keyboard-menu svg.keyboard")).toBeVisible();
  await page.getByRole("button", { name: "건반 닫기" }).click();
  await expect(page.locator("svg.keyboard")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "건반 열기" })).toHaveAttribute("aria-expanded", "false");
});

test("모든 수업·모든 단계에서 오선보가 그려지고 열 수가 12 이하", async ({ page }) => {
  for (const lesson of lessons) {
    await openLesson(page, `/lesson/${lesson.id}`);
    for (let i = 0; i < lesson.steps.length; i++) {
      const cols = await page.locator("svg.staff g.col").count();
      expect(cols, `${lesson.id} ${i + 1}단계`).toBeGreaterThan(0);
      expect(cols).toBeLessThanOrEqual(12);
      if (i < lesson.steps.length - 1) await page.keyboard.press("ArrowRight");
    }
  }
});

test("흰 건반 수만큼 건반이 있고 검은 건반이 건반 이름과 맞다", async ({ page }) => {
  await openLesson(page, "/lesson/dominant-seventh-cadence"); // C4~G5
  await openKeyboard(page);
  await expect(page.locator("svg.keyboard .key-white")).toHaveCount(12);
  await expect(page.locator("svg.keyboard .key-black")).toHaveCount(8);
  await expect(page.locator('svg.keyboard .key[data-midi="60"]')).toHaveAttribute("aria-label", "C4 건반");
  await expect(page.locator('svg.keyboard .key[data-midi="79"]')).toHaveAttribute("aria-label", "G5 건반");
});

test("화이트보드 색에서도 같은 배치(넘침 없음)", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("mc-theme", "white"));
  await openLesson(page, "/lesson/c-major-triads?step=9");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "white");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
