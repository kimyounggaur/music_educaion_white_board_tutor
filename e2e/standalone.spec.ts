import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type FrameLocator, type Frame, type Page } from "@playwright/test";
import { lessons } from "../src/lessons";
import { computeScene } from "../src/lib/script/scene";
import { goToStep, installAudioSpy, openKeyboard, openLessonMenu, trackProblems } from "./helpers";

/**
 * 한 파일 배포판(dist/standalone/music-chalkboard.html) 시험. 먼저 `npm run build:standalone`이 필요하다.
 *  - 파일로 직접 열기
 *  - Claude 아티팩트처럼 샌드박스 iframe(allow-scripts만) + 엄격한 보안 규칙(CSP) 안에서 열기
 */
const FILE = path.resolve(__dirname, "..", "dist", "standalone", "music-chalkboard.html");
const FILE_URL = pathToFileURL(FILE).href;

/** 아티팩트 보안 규칙을 흉내 낸 CSP: 자기 파일과 인라인만 허용하고 바깥 요청은 모두 막는다 */
const CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data: blob:; media-src data: blob:; connect-src 'none'";

async function openSandboxed(page: Page): Promise<FrameLocator> {
  // 아티팩트처럼 진짜 주소에서 보안 규칙(CSP)을 응답 머리글로 받는 문서를 샌드박스 iframe에 넣는다
  const html = readFileSync(FILE, "utf8");
  await page.route("http://artifact.test/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", headers: { "content-security-policy": CSP }, body: html }),
  );
  await page.setContent(
    '<body style="margin:0"><iframe id="f" src="http://artifact.test/index.html" sandbox="allow-scripts" style="width:100vw;height:100vh;border:0"></iframe></body>',
  );
  return page.frameLocator("#f");
}

const notHarness = (message: string) => !message.includes("artifact.test");

function childFrame(page: Page): Frame {
  const frame = page.frames().find((f) => f !== page.mainFrame());
  if (!frame) throw new Error("iframe을 찾지 못했어요");
  return frame;
}

async function oscillatorStarts(target: Page | Frame): Promise<number> {
  return target.evaluate(() => (window as unknown as { __audio?: { oscStarts: number } }).__audio?.oscStarts ?? 0);
}

test.describe("파일로 직접 열기", () => {
  test("첫 화면 검색 결과로 수업을 연다", async ({ page }) => {
    await page.goto(FILE_URL);
    await page.getByRole("searchbox", { name: "수업 검색" }).fill("다장조 음계");
    await page.locator(".home-search-panel").getByRole("link", { name: /다장조 음계/ }).click();
    await expect(page).toHaveURL(/#c-major-scale/);
    await expect(page.locator("svg.staff .stave")).toBeVisible();
  });

  test("수업 고르기 → 수업 → 끝까지 → 목록으로 돌아오기", async ({ page }) => {
    const problems = trackProblems(page);
    await page.goto(FILE_URL);
    await expect(page.getByRole("heading", { level: 1, name: "음악 칠판" })).toBeVisible();
    await openLessonMenu(page);
    await expect(page.locator("header a.home-lesson-link")).toHaveCount(lessons.length);

    const lesson = lessons.find((l) => l.id === "c-major-scale")!;
    await page.getByRole("link", { name: /다장조 음계/ }).click();
    await expect(page).toHaveURL(/#c-major-scale/);
    await page.waitForSelector("svg.staff .stave");
    for (let i = 0; i < lesson.steps.length; i++) {
      await expect(page.locator(".caption")).toHaveText(computeScene(lesson, i).caption);
      if (i < lesson.steps.length - 1) await page.getByRole("button", { name: "다음" }).click();
    }
    await page.getByRole("link", { name: "수업 목록으로" }).last().click();
    await expect(page.getByRole("heading", { level: 1, name: "음악 칠판" })).toBeVisible();
    expect(problems).toEqual([]);
  });

  test("수업 4편이 모두 열리고 끝까지 넘어간다", async ({ page }) => {
    const problems = trackProblems(page);
    for (const lesson of lessons) {
      await page.goto(`${FILE_URL}#${lesson.id}`);
      await page.waitForSelector("svg.staff .stave");
      for (let i = 0; i < lesson.steps.length - 1; i++) await page.keyboard.press("ArrowRight");
      await expect(page.locator(".stepno")).toHaveText(`${lesson.steps.length} / ${lesson.steps.length}`);
      await expect(page.locator(".caption")).toHaveText(computeScene(lesson, lesson.steps.length - 1).caption);
    }
    expect(problems).toEqual([]);
  });

  test("없는 수업 이름은 안내 화면, 칠판/화이트보드 색은 바뀐다", async ({ page }) => {
    await page.goto(`${FILE_URL}#nothing-here`);
    await expect(page.getByText("찾는 수업이 없어요")).toBeVisible();
    await page.getByRole("link", { name: "수업 목록으로" }).click();
    await openLessonMenu(page);
    await expect(page.locator("header a.home-lesson-link").first()).toBeVisible();
    await page.getByRole("button", { name: "화이트보드" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "white");
  });

  test("건반을 누르면 소리가 시작되고 해보기가 판정된다", async ({ page }) => {
    await installAudioSpy(page);
    await page.goto(`${FILE_URL}#names-and-solfege`);
    await page.waitForSelector("svg.staff .stave");
    await goToStep(page, 6);
    await openKeyboard(page);
    await page.locator('svg.keyboard .key[data-midi="67"]').click();
    await expect(page.locator(".ask.ask-ok")).toContainText("맞아요!");
    await expect.poll(() => oscillatorStarts(page), { timeout: 3000 }).toBeGreaterThan(0);
  });

  test("바깥으로 나가는 요청이 없다(글꼴·스크립트가 모두 안에 들어 있다)", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (r) => {
      if (!r.url().startsWith("file:") && !r.url().startsWith("data:")) requests.push(r.url());
    });
    await page.goto(`${FILE_URL}#c-major-triads`);
    await page.waitForSelector("svg.staff .stave");
    await page.getByRole("button", { name: "다음" }).click();
    await page.waitForTimeout(500);
    expect(requests).toEqual([]);
  });
});

test.describe("샌드박스 iframe + 엄격한 CSP(아티팩트 환경 흉내)", () => {
  test("수업 고르기와 수업 진행, 소리, 해보기가 동작한다", async ({ page }) => {
    const problems = trackProblems(page);
    await installAudioSpy(page);
    const app = await openSandboxed(page);

    await expect(app.getByRole("heading", { level: 1, name: "음악 칠판" })).toBeVisible();
    await app.locator("summary").filter({ hasText: "수업 선택" }).click();
    await expect(app.locator("header a.home-lesson-link")).toHaveCount(lessons.length);

    await app.getByRole("link", { name: /다장조 음계/ }).click();
    await expect(app.locator("svg.staff .stave")).toBeVisible();
    await expect(app.locator(".stepno")).toHaveText(`1 / ${lessons.find((l) => l.id === "c-major-scale")!.steps.length}`);

    // 처음 열었을 때는 소리가 나지 않고(자동 재생은 단계를 넘길 때), 듣기 버튼으로 낸다
    await app.getByRole("button", { name: /듣기/ }).click();
    await expect.poll(() => oscillatorStarts(childFrame(page)), { timeout: 5000 }).toBeGreaterThan(0);
    await app.getByRole("button", { name: "다음" }).click();
    await expect(app.locator(".stepno")).toContainText("2 /");

    // 마지막 단계(해보기)로 가서 차례로 누르기
    const stepSelector = app.getByLabel("수업 단계 선택");
    if (await stepSelector.isVisible()) await stepSelector.selectOption("5");
    else await app.getByRole("button", { name: "6단계로 이동" }).click();
    await app.getByRole("button", { name: "건반 열기" }).click();
    for (const midi of [60, 62, 64, 65, 67, 69, 71, 72]) await app.locator(`svg.keyboard .key[data-midi="${midi}"]`).click();
    await expect(app.locator(".ask.ask-ok")).toContainText("맞아요!");

    await app.getByRole("link", { name: "수업 목록으로" }).last().click();
    await expect(app.getByRole("heading", { level: 1, name: "음악 칠판" })).toBeVisible();
    // 저장소(localStorage)를 쓸 수 없는 환경이어도 색 바꾸기는 그 화면에서 동작한다
    await app.getByRole("button", { name: "화이트보드" }).click();
    await expect(app.locator("html")).toHaveAttribute("data-theme", "white");
    expect(problems.filter(notHarness)).toEqual([]);
  });

  test("화음 수업(오선보 열이 늘어나는 수업)도 정상이다", async ({ page }) => {
    const problems = trackProblems(page);
    const app = await openSandboxed(page);
    await app.locator("summary").filter({ hasText: "수업 선택" }).click();
    await app.getByRole("link", { name: /주요 3화음/ }).click();
    await expect(app.locator("svg.staff .stave")).toBeVisible();
    for (let i = 0; i < 6; i++) await app.getByRole("button", { name: "다음" }).click();
    await expect(app.locator("svg.staff g.col-chord")).toHaveCount(3);
    await expect(app.locator("svg.staff .lab1", { hasText: "버금딸림화음" })).toBeVisible();
    expect(problems.filter(notHarness)).toEqual([]);
  });
});
