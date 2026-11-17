import type { Page } from "@playwright/test";

/** 콘솔 오류·경고, 처리되지 않은 예외, 실패한 요청을 모은다. 시험 끝에 비어 있어야 한다. */
export function trackProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(`[${m.type()}] ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`[pageerror] ${e.message}`));
  page.on("requestfailed", (r) => problems.push(`[requestfailed] ${r.url()}`));
  // 바깥 주소로 나가는 요청이 있으면 안 된다(외부 글꼴, 추적 등)
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.hostname !== "localhost" && url.protocol.startsWith("http")) problems.push(`[external-request] ${r.url()}`);
  });
  return problems;
}

/** 소리가 실제로 시작됐는지 센다: 만들어진 오디오 컨텍스트와 시작된 발진기(oscillator) 수 */
export async function installAudioSpy(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __audio: { contexts: AudioContext[]; oscStarts: number };
      AudioContext: typeof AudioContext;
      OscillatorNode: typeof OscillatorNode;
    };
    w.__audio = { contexts: [], oscStarts: 0 };
    const Original = w.AudioContext;
    if (!Original) return;
    w.AudioContext = class extends Original {
      constructor(options?: AudioContextOptions) {
        super(options);
        w.__audio.contexts.push(this);
      }
    };
    const start = w.OscillatorNode.prototype.start;
    w.OscillatorNode.prototype.start = function (this: OscillatorNode, when?: number) {
      w.__audio.oscStarts++;
      return start.call(this, when);
    };
  });
}

export async function audioInfo(page: Page): Promise<{ oscStarts: number; states: string[] }> {
  return page.evaluate(() => {
    const a = (window as unknown as { __audio?: { contexts: AudioContext[]; oscStarts: number } }).__audio;
    return { oscStarts: a?.oscStarts ?? 0, states: (a?.contexts ?? []).map((c) => c.state) };
  });
}

/** 수업 화면이 그려질 때까지 기다린다(오선이 나타난다). */
export async function openLesson(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForSelector("svg.staff .stave");
}

/** 상단 메뉴에서 연주 및 문제 풀이용 건반을 연다. */
export async function openKeyboard(page: Page): Promise<void> {
  const toggle = page.getByRole("button", { name: "건반 열기" });
  await toggle.click();
  await page.getByRole("region", { name: "연주 건반" }).waitFor();
}

/** 첫 화면 상단에서 수업 목록을 연다. */
export async function openLessonMenu(page: Page): Promise<void> {
  await page.locator("summary").filter({ hasText: "수업 선택" }).click();
}

/** 좁은 화면은 단계 선택 목록, 넓은 화면은 단계 버튼을 사용한다. */
export async function goToStep(page: Page, step: number): Promise<void> {
  const select = page.getByLabel("수업 단계 선택");
  if (await select.isVisible()) await select.selectOption(String(step - 1));
  else await page.getByRole("button", { name: `${step}단계로 이동` }).click();
}
