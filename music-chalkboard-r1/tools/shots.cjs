// 화면 캡처: 정해진 시각의 모습을 PNG로 저장한다. 사용: node tools/shots.cjs <출력폴더> [dist/index.html]
const path = require("path");
const fs = require("fs");
const { chromium } = require("/home/claude/music-chalkboard/node_modules/@playwright/test");

const outDir = path.resolve(process.argv[2] || "out/shots");
const file = path.resolve(process.argv[3] || "dist/index.html");
fs.mkdirSync(outDir, { recursive: true });

const cases = [
  // [이름, 뷰포트, 옵션, 시각(초) 목록; "end" = 끝]
  ["p-chord-chalk-svg", { width: 390, height: 844, dpr: 2 }, {}, [0.4, 2.2, 4.0, "end"]],
  ["p-chord-white-svg", { width: 390, height: 844, dpr: 2 }, { theme: "white" }, [3.0, "end"]],
  ["p-chord-chalk-canvas", { width: 390, height: 844, dpr: 2 }, { method: "canvas" }, [3.0, "end"]],
  ["p-notes-chalk-svg", { width: 390, height: 844, dpr: 2 }, { scene: "notes" }, [3.5, "end"]],
  ["l-chord-chalk-svg", { width: 1280, height: 800, dpr: 1 }, {}, [3.0, "end"]],
  ["l-notes-white-canvas", { width: 1280, height: 800, dpr: 1 }, { scene: "notes", theme: "white", method: "canvas" }, [3.5, "end"]],
  ["p-pen-only", { width: 390, height: 844, dpr: 2 }, { hand: "pen" }, [3.0]],
];

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const [name, vp, opt, times] of cases) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text());
    });
    await page.goto("file://" + file + "?auto=0");
    await page.waitForFunction(() => window.__r1);
    for (const t of times) {
      const total = await page.evaluate(
        ([o, tt]) => {
          Object.assign(window.__r1.opts, o);
          window.__r1.seek(tt === "end" ? 999 : tt);
          return window.__r1.run.plan.total;
        },
        [opt, t],
      );
      await page.waitForTimeout(120);
      const f = path.join(outDir, `${name}-${t}.png`);
      await page.screenshot({ path: f, fullPage: false });
      console.log(name, t, "total", total.toFixed(2), errors.length ? errors : "");
    }
    await ctx.close();
  }
  await browser.close();
})();
