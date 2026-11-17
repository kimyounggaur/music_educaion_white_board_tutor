// 화면 연결: 설정, 판서 실행(화면 갱신 반복), 프레임 측정, 시험용 손잡이.
import { buildScene, SCENES, QUESTION } from "./scene.js";
import { buildPlan, segProgress, penAt } from "./plan.js";
import { SvgRenderer } from "./render-svg.js";
import { CanvasRenderer } from "./render-canvas.js";
import { HandLayer } from "./hand.js";
import { Dust } from "./dust.js";
import { paintBoard } from "./texture.js";
import { clamp } from "./util.js";

const THEMES = {
  chalk: { style: "chalk", label: "칠판", ink: { main: "#f3efe3", accent: "#ffd45e", dim: "#b9c7bc" } },
  white: { style: "marker", label: "화이트보드", ink: { main: "#1d2a24", accent: "#e08a00", dim: "#56655d" } },
};

const $ = (s) => document.querySelector(s);
const stage = $("#stage");
const inkHost = $("#ink");
const boardTex = $("#boardTex");
const frameEl = $("#frame");
const dust = new Dust($("#dust"));
const hand = new HandLayer(stage);

const opts = { theme: "chalk", hand: "hand", dust: "on", speed: "normal", method: "svg", scene: "chord" };
const query = new URLSearchParams(location.search);
const forcedOrientation = query.get("o"); // 시험용: p | l
const autoStart = query.get("auto") !== "0"; // 시험용: 자동 시작 끄기

let run = null;
let renderer = null;
let rafId = 0;
let last = null; // 마지막 판서의 측정 결과
let resizeTimer = 0;

const computePortrait = () => (forcedOrientation ? forcedOrientation === "p" : window.innerWidth < 760);
const dustOn = () => opts.dust === "on" && THEMES[opts.theme].style === "chalk";

// ───────── 판서 시작 ─────────
function start({ instant = false, sim = false } = {}) {
  cancelAnimationFrame(rafId);
  const portrait = computePortrait();
  const theme = THEMES[opts.theme];
  document.documentElement.dataset.theme = opts.theme;
  frameEl.dataset.theme = opts.theme;
  const scene = buildScene(opts.scene, portrait);
  const plan = buildPlan(scene, opts.speed);
  stage.setAttribute("role", "img");
  stage.setAttribute("aria-label", `${theme.label}에 쓰는 내용: ${QUESTION} 오선과 음표 그림. ${SCENES[opts.scene].caption}`);
  stage.style.aspectRatio = `${scene.W} / ${scene.H}`;
  frameEl.style.setProperty("--scene-aspect", String(scene.W / scene.H));
  const cssW = stage.clientWidth;
  const cssH = (cssW * scene.H) / scene.W;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  boardTex.width = Math.max(1, Math.round(cssW * dpr));
  boardTex.height = Math.max(1, Math.round(cssH * dpr));
  paintBoard(boardTex, opts.theme);

  if (renderer) renderer.destroy();
  renderer = opts.method === "svg" ? new SvgRenderer(inkHost, scene, theme) : new CanvasRenderer(inkHost, scene, theme, cssW);

  dust.resize(cssW, cssH);
  dust.clear();
  hand.configure({ penKind: theme.style === "chalk" ? "chalk" : "marker", mode: opts.hand });
  hand.resize(cssW, cssH);
  hand.show(false);

  const itemLeft = new Map();
  for (const it of scene.items) itemLeft.set(it.index, it.strokes.length);
  run = {
    scene,
    plan,
    portrait,
    cursor: 0,
    startTs: null,
    lastTs: null,
    state: instant ? "done" : sim ? "sim" : "writing",
    gaps: [],
    big: [], // 느렸던 프레임의 시각과 그때의 구간(원인 찾기용)
    work: [],
    itemLeft,
    prevPen: null,
    angle: -8,
    hudAt: 0,
  };
  syncUI();
  if (instant) {
    renderer.completeAll();
    setStatus("완성된 화면입니다. 총 " + plan.total.toFixed(1) + "초 걸리는 판서를 건너뛰었어요.");
    return;
  }
  if (sim) return;
  setStatus("준비 중…");
  setHud("running");
  const mine = run;
  warmUp(mine).then(() => {
    if (run !== mine || mine.state !== "writing") return; // 그 사이에 다시 시작했거나 건너뛰었으면 이 시작은 버린다
    setStatus("쓰는 중…");
    rafId = requestAnimationFrame(loop);
  });
}

/** 손 그림을 한 번 미리 그려 두어, 판서 첫머리에서 화면이 끊기지 않게 한다(눈에는 거의 보이지 않음) */
function warmUp(r) {
  return new Promise((resolve) => {
    const w = stage.clientWidth;
    const h = (w * r.scene.H) / r.scene.W;
    hand.root.style.opacity = "0.02";
    hand.update(w * 0.5, h * 0.45, 0, -8);
    hand.show(true);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        hand.root.style.opacity = "";
        hand.show(false);
        resolve();
      }),
    );
  });
}

// ───────── 한 프레임 ─────────
function finalizeSeg(seg) {
  if (seg.type !== "draw") return;
  for (const part of seg.parts) {
    renderer.setPart(part, 1);
    const left = run.itemLeft.get(part.item.index) - 1;
    run.itemLeft.set(part.item.index, left);
    if (left === 0) renderer.completeItem(part.item);
  }
  // 선 하나가 끝날 때 작은 가루 뭉치(설계서 6.6)
  if (dustOn() && seg.item.type === "line") {
    const e = seg.penStroke.pts[seg.penStroke.pts.length - 1];
    const k = stage.clientWidth / run.scene.W;
    dust.burst(e[0] * k, e[1] * k, THEMES[opts.theme].ink[seg.ink]);
  }
}

function frame(t, dt) {
  const { plan, scene } = run;
  const segs = plan.segs;
  while (run.cursor < segs.length && segs[run.cursor].t1 <= t) {
    finalizeSeg(segs[run.cursor]);
    run.cursor++;
  }
  const seg = segs[run.cursor];
  const k = stage.clientWidth / scene.W; // 논리 좌표 → 화면 px
  if (!seg) {
    hand.show(false);
  } else {
    if (seg.type === "draw") {
      const p = segProgress(seg, t);
      for (const part of seg.parts) renderer.setPart(part, p);
    }
    const pen = penAt(plan, seg, t);
    const cx = pen.x * k;
    const cy = pen.y * k;
    // 기울기: 기본 −8도, 쓰는 방향에 따라 ±6도, 0.08초에 걸쳐 따라간다
    const target = -8 + 6 * clamp(pen.dx, -1, 1);
    run.angle += (target - run.angle) * (1 - Math.exp(-dt / 0.08));
    hand.setInk(THEMES[opts.theme].ink[seg.ink]);
    hand.show(true);
    hand.update(cx, cy, pen.lift, run.angle);
    if (dustOn() && pen.down && run.prevPen && run.prevPen.down) {
      const d = Math.hypot(cx - run.prevPen.x, cy - run.prevPen.y);
      dust.trail(cx, cy, d, THEMES[opts.theme].ink[seg.ink]);
    }
    run.prevPen = { x: cx, y: cy, down: pen.down };
  }
  if (dustOn() || dust.active) dust.step(dt);
}

function loop(ts) {
  if (!run || run.state !== "writing") return;
  if (run.startTs === null) run.startTs = ts;
  const t = (ts - run.startTs) / 1000;
  const dt = run.lastTs === null ? 1 / 60 : Math.min(0.1, (ts - run.lastTs) / 1000);
  const writing = t <= run.plan.total + 1e-6;
  if (run.lastTs !== null && writing) {
    const gap = ts - run.lastTs;
    run.gaps.push(gap);
    if (gap > 30 && run.big.length < 20) {
      const sg = run.plan.segs[run.cursor];
      run.big.push({ t: Math.round(t * 100) / 100, gap: Math.round(gap), seg: sg ? sg.type + ":" + (sg.item ? sg.item.id : "") : "-" });
    }
  }
  const w0 = performance.now();
  frame(t, dt);
  if (writing) run.work.push(performance.now() - w0);
  run.lastTs = ts;
  if (ts - run.hudAt > 300) {
    run.hudAt = ts;
    setHud("running");
  }
  if (t >= run.plan.total && !dust.active) {
    finishRun();
    return;
  }
  rafId = requestAnimationFrame(loop);
}

function finishRun() {
  run.state = "done";
  hand.show(false);
  dust.clear();
  last = summarize(run);
  setStatus(`다 썼어요. 쓰는 데 ${run.plan.total.toFixed(1)}초 걸렸어요.`);
  setHud("done");
  syncUI();
}

/** 프레임 간격 통계 */
function summarize(r) {
  const g = r.gaps.slice().sort((a, b) => a - b);
  const n = g.length;
  const pct = (q) => (n ? g[Math.min(n - 1, Math.floor(q * (n - 1)))] : 0);
  const sum = g.reduce((a, b) => a + b, 0);
  const w = r.work;
  return {
    frames: n,
    avgFps: n ? 1000 / (sum / n) : 0,
    p50: pct(0.5),
    p95: pct(0.95),
    p99: pct(0.99),
    max: n ? g[n - 1] : 0,
    over20: g.filter((x) => x > 20).length,
    over34: g.filter((x) => x > 34).length,
    workAvg: w.length ? w.reduce((a, b) => a + b, 0) / w.length : 0,
    workMax: w.length ? Math.max(...w) : 0,
    seconds: r.plan.total,
    big: r.big,
    opts: { ...opts },
    portrait: r.portrait,
  };
}

// ───────── 바로 완성 ─────────
function finish() {
  if (!run) return;
  cancelAnimationFrame(rafId);
  const wasWriting = run.state === "writing";
  renderer.completeAll();
  hand.show(false);
  dust.clear();
  run.state = "done";
  setStatus("바로 완성했어요.");
  if (wasWriting) setHud("skipped");
  syncUI();
}

// ───────── 화면 표시 ─────────
function setStatus(text) {
  $("#status").textContent = text;
}

const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "–");

function setHud(mode) {
  const q = (id, v) => ($(id).textContent = v);
  if (mode === "running") {
    const g = run.gaps.slice(-30);
    const avg = g.length ? g.reduce((a, b) => a + b, 0) / g.length : 0;
    q("#hudFps", avg ? fmt(1000 / avg, 0) : "–");
    q("#hudP95", "측정 중");
    q("#hudMax", "–");
    q("#hudWork", "–");
    $("#hudVerdict").textContent = "판서가 끝나면 결과가 나옵니다.";
    $("#hud").dataset.verdict = "running";
    return;
  }
  if (mode === "skipped") {
    $("#hudVerdict").textContent = "중간에 건너뛰어 이번 측정은 쓰지 않아요.";
    $("#hud").dataset.verdict = "none";
    return;
  }
  if (!last) return;
  q("#hudFps", fmt(last.avgFps, 0));
  q("#hudP95", fmt(last.p95));
  q("#hudMax", fmt(last.max, 0));
  q("#hudWork", fmt(last.workAvg, 2));
  const level = last.p95 <= 20 ? "pass" : last.p95 <= 34 ? "ok" : "fail";
  $("#hud").dataset.verdict = level;
  const detail = `프레임의 95%가 ${fmt(last.p95)}ms 이하예요. 20ms를 넘은 프레임 ${last.over20}개, 34ms를 넘은 프레임 ${last.over34}개(전체 ${last.frames}개).`;
  $("#hudVerdict").textContent =
    (level === "pass" ? "부드러워요(PC 기준 20ms 통과). " : level === "ok" ? "폰 기준(34ms)은 통과, PC 기준(20ms)은 미달. " : "끊겨 보일 수 있어요(34ms 초과). ") + detail;
}

function syncUI() {
  document.querySelectorAll(".seg").forEach((seg) => {
    const key = seg.dataset.opt;
    seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(opts[key] === b.dataset.v)));
  });
  // 가루는 칠판(분필)에서만
  const dustSeg = $('.seg[data-opt="dust"]');
  const chalk = THEMES[opts.theme].style === "chalk";
  dustSeg.querySelectorAll("button").forEach((b) => (b.disabled = !chalk));
  dustSeg.closest(".row").dataset.disabled = String(!chalk);
  $('.seg[data-opt="hand"] button[data-v="pen"]').textContent = chalk ? "분필만" : "마커만";
  document.documentElement.dataset.state = run ? run.state : "idle";
}

function bind() {
  document.querySelectorAll(".seg button").forEach((b) => {
    b.addEventListener("click", () => {
      const key = b.closest(".seg").dataset.opt;
      if (opts[key] === b.dataset.v) return;
      opts[key] = b.dataset.v;
      start();
    });
  });
  $("#btnRestart").addEventListener("click", () => start());
  $("#btnFinish").addEventListener("click", () => finish());
  // 메뉴 바깥을 누르거나 Escape를 누르면 열린 헤더 메뉴를 닫는다.
  document.addEventListener("click", (event) => {
    document.querySelectorAll(".menu[open]").forEach((menu) => {
      if (!menu.contains(event.target)) menu.open = false;
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const open = document.querySelector(".menu[open]");
    if (open) { open.open = false; open.querySelector("summary").focus(); }
  });
  if ("ResizeObserver" in window) {
    let first = true;
    new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(onResize, 150);
    }).observe(stage);
  }
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(onResize, 150);
  });
  // 화면이 가려지면 끝낸다(설계서 7.5)
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && run && run.state === "writing") finish();
  });
}

function onResize() {
  if (!run) return;
  if (computePortrait() !== run.portrait) {
    start();
    return;
  }
  const cssW = stage.clientWidth;
  const cssH = (cssW * run.scene.H) / run.scene.W;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  boardTex.width = Math.max(1, Math.round(cssW * dpr));
  boardTex.height = Math.max(1, Math.round(cssH * dpr));
  paintBoard(boardTex, opts.theme);
  dust.resize(cssW, cssH);
  hand.resize(cssW, cssH);
  if (renderer instanceof CanvasRenderer) renderer.resize(cssW);
}

// ───────── 시험용 손잡이 ─────────
/** 시간 t(초)까지를 실제 시계 없이 60분의 1초씩 흘려 보낸 모습으로 만든다(화면 캡처와 시험용) */
function seek(t, fps = 60) {
  start({ sim: true });
  const dt = 1 / fps;
  for (let k = 0; k * dt <= t + 1e-9; k++) frame(k * dt, dt);
  run.state = "paused";
  syncUI();
}

window.__r1 = {
  opts,
  start,
  finish,
  seek,
  get run() {
    return run;
  },
  get last() {
    return last;
  },
  setOptions(o) {
    Object.assign(opts, o);
    start();
  },
};

bind();
syncUI();
const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (reduce) {
  start({ instant: true });
  setStatus("기기의 '동작 줄이기'가 켜져 있어 완성된 화면을 바로 보여 드려요. '처음부터 다시 쓰기'를 누르면 판서합니다.");
} else if (autoStart) {
  setTimeout(() => start(), 500);
}
