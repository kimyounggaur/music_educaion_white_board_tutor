// 프레임 간격 측정: 실제 시간(rAF)으로 판서를 돌리고 앱이 계산한 통계를 읽는다.
// 사용: node tools/perf.cjs [출력json] [dist/index.html] [필터문자열]
const path = require("path");
const fs = require("fs");
const { chromium } = require("/home/claude/music-chalkboard/node_modules/@playwright/test");

const outFile = path.resolve(process.argv[2] || "out/perf.json");
const file = path.resolve(process.argv[3] || "dist/index.html");
const filter = process.argv[4] || "";

const PHONE = { width: 390, height: 844, dpr: 2 };
const PC = { width: 1280, height: 800, dpr: 1 };

const combos = [];
const add = (label, vp, opts, rates) => rates.forEach((r) => combos.push({ label: `${label} @${r}x`, vp, opts, rate: r }));
add("폰 칠판 A 가루켬", PHONE, { theme: "chalk", method: "svg", dust: "on" }, [1, 4]);
add("폰 칠판 B 가루켬", PHONE, { theme: "chalk", method: "canvas", dust: "on" }, [1, 4]);
add("폰 화이트 A", PHONE, { theme: "white", method: "svg" }, [1, 4]);
add("폰 화이트 B", PHONE, { theme: "white", method: "canvas" }, [1, 4]);
add("폰 칠판 A 가루끔", PHONE, { theme: "chalk", method: "svg", dust: "off" }, [1, 4]);
add("폰 칠판 A 분필만", PHONE, { theme: "chalk", method: "svg", hand: "pen" }, [4]);
add("폰 칠판 A 장면2", PHONE, { theme: "chalk", method: "svg", scene: "notes" }, [1, 4]);
add("PC 칠판 A 가루켬", PC, { theme: "chalk", method: "svg", dust: "on" }, [1, 4]);
add("PC 칠판 B 가루켬", PC, { theme: "chalk", method: "canvas", dust: "on" }, [1, 4]);
add("PC 화이트 A", PC, { theme: "white", method: "svg" }, [1, 4]);
add("PC 화이트 B", PC, { theme: "white", method: "canvas" }, [1, 4]);

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const results = [];
  for (const c of combos) {
    if (filter && !c.label.includes(filter)) continue;
    const ctx = await browser.newContext({ viewport: { width: c.vp.width, height: c.vp.height }, deviceScaleFactor: c.vp.dpr });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("file://" + file + "?auto=0");
    await page.waitForFunction(() => window.__r1);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: c.rate });
    await page.waitForTimeout(400);
    const total = await page.evaluate((o) => {
      Object.assign(window.__r1.opts, { scene: "chord", theme: "chalk", hand: "hand", dust: "on", speed: "normal", method: "svg" }, o);
      window.__r1.start();
      return window.__r1.run.plan.total;
    }, c.opts);
    try {
      await page.waitForFunction(() => window.__r1.run && window.__r1.run.state === "done" && window.__r1.last, null, { timeout: (total + 4) * 1000 * Math.max(1, c.rate) + 20000, polling: 250 });
      const last = await page.evaluate(() => window.__r1.last);
      results.push({ label: c.label, ...last, errors });
      console.log(
        c.label.padEnd(26),
        `총${last.seconds.toFixed(1)}s 프레임${String(last.frames).padStart(4)}`,
        `평균${last.avgFps.toFixed(0).padStart(3)}fps`,
        `p50 ${last.p50.toFixed(1).padStart(5)}`,
        `p95 ${last.p95.toFixed(1).padStart(5)}`,
        `p99 ${last.p99.toFixed(1).padStart(5)}`,
        `max ${last.max.toFixed(0).padStart(4)}`,
        `>20ms ${String(last.over20).padStart(3)}`,
        `>34ms ${String(last.over34).padStart(3)}`,
        `계산평균 ${last.workAvg.toFixed(2)}ms 최대 ${last.workMax.toFixed(1)}ms`,
        errors.length ? "오류:" + errors[0] : "",
      );
    } catch (e) {
      console.log(c.label, "시간 초과", String(e).slice(0, 80));
      results.push({ label: c.label, timeout: true, errors });
    }
    await ctx.close();
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(results, null, 1));
  await browser.close();
})();
