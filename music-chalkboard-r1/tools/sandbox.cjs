// 아티팩트와 같은 조건 흉내: 샌드박스 iframe(allow-scripts만) + 엄격한 보안 규칙(CSP)에서 처음부터 끝까지 돌려 본다.
// 사용: node tools/sandbox.cjs [dist/index.html] [캡처 폴더]
const path = require("path");
const fs = require("fs");
const { chromium } = require("/home/claude/music-chalkboard/node_modules/@playwright/test");

const file = path.resolve(process.argv[2] || "/home/claude/r1-prototype/dist/index.html");
const outDir = path.resolve(process.argv[3] || "/home/claude/r1-prototype/out/sandbox");
fs.mkdirSync(outDir, { recursive: true });
const html = fs.readFileSync(file, "utf8");
const CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data: blob:; media-src data: blob:; connect-src 'none'";

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  let bad = 0;
  for (const [name, vp, dpr, opts] of [
    ["phone-chalk-svg", { width: 390, height: 844 }, 2, {}],
    ["phone-chalk-canvas", { width: 390, height: 844 }, 2, { method: "canvas" }],
    ["pc-white-svg", { width: 1280, height: 800 }, 1, { theme: "white" }],
  ]) {
    const context = await browser.newContext({ viewport: vp, deviceScaleFactor: dpr, isMobile: vp.width < 600, hasTouch: vp.width < 600 });
    const page = await context.newPage();
    const problems = [];
    const outside = [];
    page.on("console", (m) => {
      if (["error", "warning"].includes(m.type())) problems.push(m.type() + ": " + m.text());
    });
    page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
    page.on("request", (r) => {
      const u = r.url();
      if (!u.startsWith("http://artifact.test/") && !u.startsWith("data:") && !u.startsWith("blob:") && u !== "about:blank") outside.push(u);
    });
    await page.route("http://artifact.test/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", headers: { "content-security-policy": CSP }, body: html }),
    );
    await page.setContent(
      '<meta name="viewport" content="width=device-width, initial-scale=1"><body style="margin:0"><iframe id="f" src="http://artifact.test/index.html" sandbox="allow-scripts" style="width:100vw;height:100vh;border:0;display:block"></iframe></body>',
    );
    const frame = await (await page.waitForSelector("#f")).contentFrame();
    await frame.waitForFunction(() => window.__r1, null, { timeout: 15000 });
    if (Object.keys(opts).length) {
      await frame.evaluate((o) => window.__r1.setOptions(o), opts);
    }
    await page.waitForTimeout(3300);
    await page.screenshot({ path: path.join(outDir, `${name}-mid.png`) });
    await frame.waitForFunction(() => window.__r1.run && window.__r1.run.state === "done" && window.__r1.last, null, { timeout: 40000, polling: 250 });
    const last = await frame.evaluate(() => window.__r1.last);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, `${name}-end.png`) });
    const ok = problems.length === 0 && outside.length === 0;
    if (!ok) bad++;
    console.log(
      name.padEnd(20),
      ok ? "OK" : "문제",
      `p95 ${last.p95.toFixed(1)}ms 평균 ${last.avgFps.toFixed(0)}fps`,
      problems.length ? "\n  콘솔: " + problems.slice(0, 4).join("\n  ") : "",
      outside.length ? "\n  바깥 요청: " + outside.slice(0, 4).join(", ") : "",
    );
    await context.close();
  }
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
