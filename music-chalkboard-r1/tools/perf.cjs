// 실행 중인 앱에서 판서 프레임 간격을 기록한다. 실행 전에 npm run build와 npm run dev를 실행한다.
const { mkdir, writeFile } = require("node:fs/promises");
const { dirname, resolve } = require("node:path");
const { chromium } = require("@playwright/test");

const [outputArg, url = "http://127.0.0.1:4173/", filter = ""] = process.argv.slice(2);
if (outputArg === "--help") {
  console.log("사용법: node tools/perf.cjs [결과 JSON] [실행 중인 앱 URL] [측정 이름 필터]");
  console.log("CPU 속도 제한을 적용하려면 WHITEBOARD_PERF_CPU_RATE를 1 이상의 숫자로 지정합니다.");
  process.exit(0);
}
const output = resolve(outputArg || "out/perf.json");
const cpuRate = Number(process.env.WHITEBOARD_PERF_CPU_RATE || 1);
const viewports = [
  { name: "phone", width: 390, height: 844, scale: 3 },
  { name: "desktop", width: 1366, height: 768, scale: 1 },
  { name: "4k", width: 3840, height: 2160, scale: 1 },
];
const modes = [
  { name: "chalk-dust", theme: "chalk", method: "svg", dust: "on" },
  { name: "chalk-clean", theme: "chalk", method: "svg", dust: "off" },
  { name: "white", theme: "white", method: "svg", dust: "on" },
  { name: "canvas", theme: "chalk", method: "canvas", dust: "on" },
];

async function measure(browser, viewport, mode) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.scale,
    reducedMotion: "no-preference",
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    if (cpuRate > 1) {
      const devtools = await context.newCDPSession(page);
      await devtools.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });
    }
    await page.goto(url);
    await page.waitForFunction(() => /^0\s*\/\s*\d+/.test(document.querySelector("#progress")?.textContent));
    if (viewport.width <= 700) {
      await page.locator("#toolMenu > summary").click();
      await page.locator('[data-menu-target="viewMenu"]').click();
    } else {
      await page.locator("#viewMenu > summary").click();
    }
    await page.locator(`#viewMenu [data-opt="theme"] [data-v="${mode.theme}"]`).click();
    if (mode.theme === "chalk") {
      await page.locator(`#viewMenu [data-opt="dust"] [data-v="${mode.dust}"]`).click();
    }
    await page.locator("#method").selectOption(mode.method);
    await page.keyboard.press("Escape");
    await page.locator("#toolMenu > summary").click();
    await page.locator("#playMode").selectOption("continuous");
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      const intervals = [];
      const play = document.getElementById("togglePlay");
      let previous;
      let frame;
      const record = time => {
        if (play.getAttribute("aria-label") === "일시정지") {
          if (previous !== undefined) intervals.push(time - previous);
          previous = time;
        } else {
          previous = undefined;
        }
        frame = requestAnimationFrame(record);
      };
      frame = requestAnimationFrame(record);
      window.finishWhiteboardMeasurement = () => {
        cancelAnimationFrame(frame);
        delete window.finishWhiteboardMeasurement;
        return intervals;
      };
    });
    await page.locator("#togglePlay").click();
    await page.waitForFunction(() => document.getElementById("togglePlay").disabled, null, { timeout: 45000 });
    const intervals = await page.evaluate(() => window.finishWhiteboardMeasurement());
    if (!intervals.length) throw new Error("기록된 판서 프레임이 없습니다.");
    const sorted = intervals.slice().sort((a, b) => a - b);
    const percentile = fraction => sorted[Math.ceil(sorted.length * fraction) - 1];
    return {
      width: viewport.width, height: viewport.height, devicePixelRatio: viewport.scale, cpuRate,
      ...mode, frames: intervals.length, p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99),
      over34ms: intervals.filter(interval => interval > 34).length, errors,
    };
  } finally {
    await context.close();
  }
}

async function main() {
  if (!Number.isFinite(cpuRate) || cpuRate < 1) throw new Error("WHITEBOARD_PERF_CPU_RATE는 1 이상의 숫자여야 합니다.");
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const results = [];
  try {
    for (const viewport of viewports) {
      for (const mode of modes) {
        const label = `${viewport.name}-${mode.name}`;
        if (!label.includes(filter)) continue;
        const measurement = await measure(browser, viewport, mode);
        results.push({ ...measurement, name: label });
        console.log(label, "p50", measurement.p50.toFixed(1), "ms · p95", measurement.p95.toFixed(1), "ms");
      }
    }
    if (!results.length) throw new Error("필터와 일치하는 측정 조건이 없습니다.");
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(results, null, 2) + "\n");
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
