import { expect, test } from "@playwright/test";
import { lessons } from "../src/lessons";
import { openLesson, trackProblems } from "./helpers";

const probes = [
  { id: "names-and-solfege", step: 4 },
  { id: "c-major-scale", step: 3 },
  { id: "c-major-triads", step: 9 },
  { id: "dominant-seventh-cadence", step: 7 },
];

test("가로로 넘치지 않고, 주요 조작이 화면 안에 있으며, 오선보와 건반이 충분히 크다", async ({ page }, info) => {
  const problems = trackProblems(page);
  const viewport = page.viewportSize()!;
  for (const probe of probes) {
    await openLesson(page, `/lesson/${probe.id}?step=${probe.step}`);
    await page.waitForTimeout(700);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${probe.id}: 가로 넘침`).toBeLessThanOrEqual(0);

    const bodyHeight = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(bodyHeight, `${probe.id}: 세로 스크롤이 생김`).toBeLessThanOrEqual(1);

    for (const locator of [
      page.locator(".caption"),
      page.locator(".controls .btn-primary"),
      page.getByRole("button", { name: "이전" }),
      page.locator("svg.staff"),
      page.locator("svg.keyboard"),
    ]) {
      const box = await locator.boundingBox();
      expect(box, `${probe.id}: 요소 없음`).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(-1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
    }

    const staff = (await page.locator("svg.staff").boundingBox())!;
    const keyboard = (await page.locator("svg.keyboard").boundingBox())!;
    expect(staff.width, `${probe.id}: 오선보 폭`).toBeGreaterThan(viewport.width * 0.8);
    expect(keyboard.height, `${probe.id}: 건반 높이`).toBeGreaterThan(Math.min(70, viewport.height * 0.15));

    // 오선보 글자(음 이름 등)가 화면에서 읽을 만한 크기인지: 렌더된 글자 높이 ≥ 7px
    const labelHeight = await page.evaluate(() => {
      const el = document.querySelector("svg.staff .lab1");
      return el ? el.getBoundingClientRect().height : 99;
    });
    expect(labelHeight, `${probe.id}: 오선보 글자 높이`).toBeGreaterThanOrEqual(7);
  }
  expect(problems, info.project.name).toEqual([]);
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
