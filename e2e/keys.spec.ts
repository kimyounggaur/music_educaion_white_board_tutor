import { expect, test } from "@playwright/test";
import { lessons } from "../src/lessons";
import { openLesson } from "./helpers";

const lesson = lessons.find((l) => l.id === "c-major-triads")!;
const total = lesson.steps.length;

test("방향키·PageUp/PageDown·스페이스·엔터·백스페이스·Home으로 넘긴다", async ({ page }) => {
  await openLesson(page, `/lesson/${lesson.id}`);
  const stepno = page.locator(".stepno");
  await expect(stepno).toHaveText(`1 / ${total}`);

  await page.keyboard.press("ArrowRight");
  await expect(stepno).toHaveText(`2 / ${total}`);
  await page.keyboard.press("PageDown");
  await expect(stepno).toHaveText(`3 / ${total}`);
  await page.keyboard.press("ArrowDown");
  await expect(stepno).toHaveText(`4 / ${total}`);
  await page.keyboard.press("Space");
  await expect(stepno).toHaveText(`5 / ${total}`);
  await page.keyboard.press("Enter");
  await expect(stepno).toHaveText(`6 / ${total}`);

  await page.keyboard.press("ArrowLeft");
  await expect(stepno).toHaveText(`5 / ${total}`);
  await page.keyboard.press("PageUp");
  await expect(stepno).toHaveText(`4 / ${total}`);
  await page.keyboard.press("ArrowUp");
  await expect(stepno).toHaveText(`3 / ${total}`);
  await page.keyboard.press("Backspace");
  await expect(stepno).toHaveText(`2 / ${total}`);

  await page.keyboard.press("Home");
  await expect(stepno).toHaveText(`1 / ${total}`);
  // 처음에서 이전은 아무 일도 없다
  await page.keyboard.press("ArrowLeft");
  await expect(stepno).toHaveText(`1 / ${total}`);
});

test("끝에서 다음 키를 눌러도 넘치지 않는다", async ({ page }) => {
  await openLesson(page, `/lesson/${lesson.id}?step=${total}`);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("PageDown");
  await expect(page.locator(".stepno")).toHaveText(`${total} / ${total}`);
});

test("버튼에 초점이 있을 때 스페이스는 그 버튼만 누른다(두 번 넘어가지 않는다)", async ({ page }) => {
  await openLesson(page, `/lesson/${lesson.id}`);
  const next = page.getByRole("button", { name: "다음" });
  await next.focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".stepno")).toHaveText(`2 / ${total}`);
  await page.waitForTimeout(300);
  await expect(page.locator(".stepno")).toHaveText(`2 / ${total}`);
});

test("키를 꾹 눌러도(반복 입력) 한 단계씩만 넘어간다", async ({ page }) => {
  await openLesson(page, `/lesson/${lesson.id}`);
  await page.keyboard.down("ArrowRight");
  for (let i = 0; i < 5; i++) await page.keyboard.down("ArrowRight"); // 반복 입력
  await page.keyboard.up("ArrowRight");
  await expect(page.locator(".stepno")).toHaveText(`2 / ${total}`);
});
