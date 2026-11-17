// 버튼 조작 시험: 쓰는 도중 바꾸기, 바로 완성, 화면 방향 바뀜, 동작 줄이기 설정.
const path = require("path");
const fs = require("fs");
// 브라우저 검증에는 프로젝트에서 접근 가능한 @playwright/test와 Chrome이 필요하다.
const { chromium } = require("@playwright/test");
const file = path.resolve(process.argv[2] || "dist/index.html");
const outDir = path.resolve("out/interact");
fs.mkdirSync(outDir, { recursive: true });
let fails = 0;
const check = (name, ok, extra = "") => {
  if (!ok) fails++;
  console.log((ok ? "통과 " : "실패 ") + name + (extra ? "  " + extra : ""));
};
const seg = (opt, v) => `.seg[data-opt="${opt}"] button[data-v="${v}"]`;

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("file://" + file + "?auto=0");
  await page.waitForFunction(() => window.__r1);
  const state = () => page.evaluate(() => window.__r1.run && window.__r1.run.state);
  const stageShot = async (name) => {
    const el = await page.$("#stage");
    const buf = await el.screenshot({ path: path.join(outDir, name + ".png") });
    return buf;
  };

  // 모든 보기 설정은 헤더 메뉴 안에 있다. 각 조작 후 메뉴를 닫아
  // 판서 화면 비교 이미지에 드롭다운이 겹치지 않게 한다.
  const settings = page.locator("header .menu:not(.menu-info)");
  const choose = async (option, value) => {
    if (!(await settings.evaluate((el) => el.open))) await settings.locator("summary").click();
    await page.locator(seg(option, value)).click();
    if (await settings.evaluate((el) => el.open)) await settings.locator("summary").click();
  };
  check("판서 보드에 버튼 없음", (await page.locator("main button, main summary").count()) === 0);
  check("판서 설정과 재생 조작은 헤더에 있음", (await page.locator("header .seg[data-opt]").count()) === 6
    && await page.locator("header #btnRestart").count() === 1
    && await page.locator("header #btnFinish").count() === 1);

  // 1) 시작 버튼
  await page.tap("#btnRestart");
  await page.waitForTimeout(800);
  check("다시 쓰기 버튼으로 시작", (await state()) === "writing");

  // 2) 쓰는 도중 판 바꾸기 → 다시 시작
  await choose("theme", "white");
  await page.waitForTimeout(600);
  check("도중에 화이트보드로 바꾸면 새로 시작", (await state()) === "writing" && (await page.evaluate(() => window.__r1.opts.theme)) === "white");
  check("화이트보드면 가루 버튼이 잠김", await page.$eval(seg("dust", "on"), (b) => b.disabled));
  check("화이트보드면 '마커만' 표시", (await page.$eval(seg("hand", "pen"), (b) => b.textContent)) === "마커만");
  await choose("theme", "chalk");
  await page.waitForTimeout(400);
  check("칠판으로 돌아오면 가루 버튼이 풀림", !(await page.$eval(seg("dust", "on"), (b) => b.disabled)));

  // 3) 바로 완성
  await page.tap("#btnFinish");
  await page.waitForTimeout(300);
  check("바로 완성 → 끝난 상태", (await state()) === "done");
  const shotFinish = await stageShot("finish-svg");

  // 4) 끝까지 쓴 결과와 '바로 완성' 결과가 같은지
  await page.tap("#btnRestart");
  await page.waitForFunction(() => window.__r1.run.state === "done" && window.__r1.last, null, { timeout: 30000, polling: 250 });
  await page.waitForTimeout(300);
  const shotNatural = await stageShot("natural-svg");
  const p = (b) => b.length;
  check("A: 바로 완성 = 끝까지 쓴 화면", Buffer.compare(shotFinish, shotNatural) === 0, `(${p(shotFinish)} / ${p(shotNatural)} bytes)`);

  // 같은 비교를 방식 B에서
  await choose("method", "canvas");
  await page.waitForTimeout(400);
  await page.tap("#btnFinish");
  await page.waitForTimeout(300);
  const finB = await stageShot("finish-canvas");
  await page.tap("#btnRestart");
  await page.waitForFunction(() => window.__r1.run.state === "done" && window.__r1.last, null, { timeout: 30000, polling: 250 });
  await page.waitForTimeout(300);
  const natB = await stageShot("natural-canvas");
  check("B: 바로 완성 = 끝까지 쓴 화면", Buffer.compare(finB, natB) === 0, `(${p(finB)} / ${p(natB)} bytes)`);

  // 5) 속도와 장면 바꾸기
  await choose("speed", "fast");
  await page.waitForFunction(() => window.__r1.run.state === "done" && window.__r1.last, null, { timeout: 30000, polling: 250 });
  const fastTotal = await page.evaluate(() => window.__r1.last.seconds);
  check("빠르게는 보통보다 짧다", fastTotal < 6, `(${fastTotal.toFixed(1)}초)`);
  await choose("scene", "notes");
  await page.waitForTimeout(500);
  check("장면 ②로 바꾸면 새로 시작", (await state()) === "writing" && (await page.evaluate(() => window.__r1.run.scene.key)) === "notes");
  await page.tap("#btnFinish");

  // 6) 화면 방향 바뀜(세로 → 가로) 도중
  await page.tap("#btnRestart");
  await page.waitForTimeout(700);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(900);
  const orient = await page.evaluate(() => ({ portrait: window.__r1.run.portrait, state: window.__r1.run.state }));
  check("가로로 돌리면 가로 장면으로 다시 시작", orient.portrait === false && orient.state === "writing", JSON.stringify(orient));
  await page.screenshot({ path: path.join(outDir, "landscape-after-rotate.png") });
  await page.tap("#btnFinish");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(700);
  check("다시 세로로 돌리면 세로 장면", (await page.evaluate(() => window.__r1.run.portrait)) === true);

  // 7) 화면이 가려지면 끝난 상태로
  await page.tap("#btnRestart");
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(200);
  check("화면이 가려지면 끝낸 상태", (await state()) === "done");
  await page.evaluate(() => Object.defineProperty(document, "hidden", { value: false, configurable: true }));

  check("페이지 오류 없음", errors.length === 0, errors.slice(0, 3).join(" | "));
  await ctx.close();

  // 8) 동작 줄이기
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
  const page2 = await ctx2.newPage();
  const errors2 = [];
  page2.on("pageerror", (e) => errors2.push(e.message));
  await page2.goto("file://" + file);
  await page2.waitForTimeout(1200);
  const st2 = await page2.evaluate(() => window.__r1.run && window.__r1.run.state);
  check("동작 줄이기: 처음부터 완성된 화면", st2 === "done");
  await page2.screenshot({ path: path.join(outDir, "reduced-motion.png") });
  check("동작 줄이기: 오류 없음", errors2.length === 0);
  await ctx2.close();

  await browser.close();
  console.log(fails ? `\n실패 ${fails}건` : "\n모두 통과");
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
