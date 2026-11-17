import { expect, test } from "@playwright/test";
import { lessons } from "../src/lessons";
import { openLesson, trackProblems } from "./helpers";

const key = (page: import("@playwright/test").Page, midi: number) => page.locator(`svg.keyboard .key[data-midi="${midi}"]`);

test("해보기(자유): 솔 누르기 — 틀린 음은 안내, 옥타브가 달라도 정답", async ({ page }) => {
  const problems = trackProblems(page);
  const lesson = lessons.find((l) => l.id === "names-and-solfege")!;
  await openLesson(page, `/lesson/${lesson.id}?step=6`);
  await expect(page.locator(".caption")).toHaveText("건반에서 솔을 눌러 보세요.");
  await expect(page.locator(".ask")).toHaveText("건반을 눌러 보세요.");

  await key(page, 64).click(); // 미: 틀림
  await expect(page.locator(".ask")).toContainText("그 음이 아니에요");
  await expect(key(page, 64)).toHaveClass(/is-wrong/);

  await key(page, 67).click(); // 솔: 정답
  await expect(page.locator(".ask")).toContainText("맞아요!");
  await expect(key(page, 67)).toHaveClass(/is-found/);
  await expect(page.locator(".ask.ask-ok")).toBeVisible();
  expect(problems).toEqual([]);
});

test("해보기(자유): 음이름 마(E) 누르기는 다음 단계, 정답 뒤에도 다음으로 넘어갈 수 있다", async ({ page }) => {
  const lesson = lessons.find((l) => l.id === "names-and-solfege")!;
  await openLesson(page, `/lesson/${lesson.id}?step=7`);
  await expect(page.locator(".caption")).toHaveText("이번에는 음이름 마를 눌러 보세요.");
  await key(page, 64).click();
  await expect(page.locator(".ask.ask-ok")).toContainText("맞아요!");
  await expect(page.getByRole("link", { name: "수업 목록으로" }).last()).toBeVisible();
});

test("해보기(자유): 딸림화음 세 음을 모두 눌러야 완료, 같은 음 반복은 개수가 늘지 않는다", async ({ page }) => {
  const lesson = lessons.find((l) => l.id === "c-major-triads")!;
  await openLesson(page, `/lesson/${lesson.id}?step=${lesson.steps.length}`);
  await key(page, 67).click(); // 솔(G4)
  await expect(page.locator(".ask")).toHaveText("1 / 3개 찾았어요.");
  await key(page, 67).click(); // 같은 음
  await expect(page.locator(".ask")).toContainText("이미 찾은 음이에요");
  await key(page, 71).click(); // 시(B4)
  await expect(page.locator(".ask")).toHaveText("2 / 3개 찾았어요.");
  await key(page, 74).click(); // 레(D5)
  await expect(page.locator(".ask.ask-ok")).toContainText("맞아요!");
  for (const midi of [67, 71, 74]) await expect(key(page, midi)).toHaveClass(/is-found/);
});

test("해보기(차례로): 음계를 순서대로 눌러야 하고 순서가 틀리면 안내", async ({ page }) => {
  const lesson = lessons.find((l) => l.id === "c-major-scale")!;
  await openLesson(page, `/lesson/${lesson.id}?step=${lesson.steps.length}`);
  await expect(page.locator(".ask")).toHaveText("순서대로 건반을 눌러 보세요.");
  await key(page, 60).click(); // 도
  await key(page, 64).click(); // 미(순서 틀림)
  await expect(page.locator(".ask")).toContainText("순서가 달라요");
  for (const midi of [62, 64, 65, 67, 69, 71, 72]) await key(page, midi).click();
  await expect(page.locator(".ask.ask-ok")).toContainText("맞아요!");
});

test("딸림7화음: 네 음을 모두 누르면 완료(건반 범위가 G5까지)", async ({ page }) => {
  const lesson = lessons.find((l) => l.id === "dominant-seventh-cadence")!;
  await openLesson(page, `/lesson/${lesson.id}?step=${lesson.steps.length}`);
  for (const midi of [67, 71, 74, 77]) await key(page, midi).click();
  await expect(page.locator(".ask.ask-ok")).toContainText("맞아요!");
});

test("해보기가 없는 단계에서도 건반을 누르면 소리만 난다(오류 없음)", async ({ page }) => {
  const problems = trackProblems(page);
  const lesson = lessons.find((l) => l.id === "c-major-scale")!;
  await openLesson(page, `/lesson/${lesson.id}?step=1`);
  await expect(page.locator(".ask")).toHaveCount(0);
  await key(page, 60).click();
  await key(page, 61).click(); // 검은 건반
  await expect(page.locator(".ask")).toHaveCount(0);
  expect(problems).toEqual([]);
});

test("단계를 넘기면 해보기 진행이 처음 상태로 돌아온다", async ({ page }) => {
  const lesson = lessons.find((l) => l.id === "c-major-triads")!;
  await openLesson(page, `/lesson/${lesson.id}?step=${lesson.steps.length}`);
  await key(page, 67).click();
  await expect(page.locator(".ask")).toHaveText("1 / 3개 찾았어요.");
  await page.getByRole("button", { name: "이전" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.locator(".ask")).toHaveText("건반을 눌러 보세요.");
  await expect(key(page, 67)).not.toHaveClass(/is-found/);
});
