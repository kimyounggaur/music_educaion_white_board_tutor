import { expect, test } from "@playwright/test";
import { lessons } from "../src/lessons";
import { audioInfo, installAudioSpy, openKeyboard, openLesson, trackProblems } from "./helpers";

const scaleLesson = lessons.find((l) => l.id === "c-major-scale")!;

test("다음을 누르면 소리가 켜지고(running) 발진기가 시작되며, 칠판에 소리 나는 음이 표시된다", async ({ page }) => {
  const problems = trackProblems(page);
  await installAudioSpy(page);
  await openLesson(page, `/lesson/${scaleLesson.id}?step=2`);
  await openKeyboard(page);
  expect((await audioInfo(page)).oscStarts).toBe(0);

  await page.getByRole("button", { name: "다음" }).click(); // 3단계: 미·파 재생
  await expect.poll(async () => (await audioInfo(page)).oscStarts, { timeout: 5000 }).toBeGreaterThanOrEqual(6); // 음 2개 × 배음 3개
  await expect.poll(async () => (await audioInfo(page)).states, { timeout: 5000 }).toContain("running");
  await expect(page.locator("svg.staff .halo-sound").first()).toBeVisible({ timeout: 3000 });
  await expect(page.locator("svg.keyboard .key.is-sound").first()).toBeVisible({ timeout: 3000 });
  // 재생이 끝나면 표시가 꺼진다
  await expect(page.locator("svg.staff .halo-sound")).toHaveCount(0, { timeout: 5000 });
  expect(problems).toEqual([]);
});

test("차례로 재생: 음마다 순서대로 표시가 옮겨 간다", async ({ page }) => {
  await installAudioSpy(page);
  await openLesson(page, `/lesson/${scaleLesson.id}?step=1`);
  await openKeyboard(page);
  await page.getByRole("button", { name: /듣기/ }).click();
  const seen = new Set<string>();
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && seen.size < 8) {
    const midis = await page.$$eval("svg.keyboard .key.is-sound", (els) => els.map((e) => e.getAttribute("data-midi") ?? ""));
    midis.forEach((m) => seen.add(m));
    await page.waitForTimeout(40);
  }
  // 도·레·미·파·솔·라·시·도(8개 소리, 건반 기준 서로 다른 7개)가 모두 한 번씩 켜졌다
  for (const midi of ["60", "62", "64", "65", "67", "69", "71", "72"]) expect([...seen]).toContain(midi);
});

test("자동 재생을 끄면 단계를 넘겨도 소리가 나지 않고, 듣기 버튼으로는 난다", async ({ page }) => {
  await installAudioSpy(page);
  await openLesson(page, `/lesson/${scaleLesson.id}?step=2`);
  await openKeyboard(page);
  const toggle = page.getByRole("button", { name: /자동 재생/ });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("button", { name: "다음" }).click();
  await page.waitForTimeout(800);
  expect((await audioInfo(page)).oscStarts).toBe(0);

  await page.getByRole("button", { name: /듣기/ }).click();
  await expect.poll(async () => (await audioInfo(page)).oscStarts, { timeout: 5000 }).toBeGreaterThan(0);

  // 선택은 이 기기에 저장된다
  await page.reload();
  await expect(page.getByRole("button", { name: /자동 재생/ })).toHaveAttribute("aria-pressed", "false");
});

test("단계를 넘기면 앞 단계의 소리 표시가 바로 꺼진다", async ({ page }) => {
  await installAudioSpy(page);
  await openLesson(page, `/lesson/${scaleLesson.id}?step=1`);
  await openKeyboard(page);
  await page.getByRole("button", { name: /듣기/ }).click();
  await expect(page.locator("svg.keyboard .key.is-sound").first()).toBeVisible({ timeout: 3000 });
  await page.getByRole("button", { name: "다음" }).click();
  // 새 단계(소리 없음)로 넘어가면 앞 단계의 표시가 남지 않는다
  await expect(page.locator("svg.staff .halo-sound")).toHaveCount(0, { timeout: 1000 });
});

test("건반을 누르면 소리가 난다", async ({ page }) => {
  await installAudioSpy(page);
  await openLesson(page, `/lesson/${scaleLesson.id}?step=1`);
  await openKeyboard(page);
  await page.locator('svg.keyboard .key[data-midi="60"]').click();
  await expect.poll(async () => (await audioInfo(page)).oscStarts, { timeout: 3000 }).toBe(3);
  await page.locator('svg.keyboard .key[data-midi="61"]').click();
  await expect.poll(async () => (await audioInfo(page)).oscStarts, { timeout: 3000 }).toBe(6);
  await expect.poll(async () => (await audioInfo(page)).states).toContain("running");
});

test("수업 카드를 누르는 순간 소리가 미리 켜져서 수업 화면에서 바로 난다", async ({ page }) => {
  await installAudioSpy(page);
  await page.goto("/");
  await page.getByRole("link", { name: /다장조 음계/ }).click();
  await page.waitForSelector("svg.staff .stave");
  await expect.poll(async () => (await audioInfo(page)).states).toContain("running");
  // 좁은 화면에서는 버튼 글자가 "듣기"로 줄어든다. 넓은 화면에서는 소리가 꺼져 있을 때만 "소리 켜고 듣기"가 나온다.
  await expect(page.getByRole("button", { name: /듣기/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /소리 켜고/ })).toHaveCount(0);
});
