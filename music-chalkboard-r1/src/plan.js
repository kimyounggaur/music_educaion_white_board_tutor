// 판서 계획: 장면의 항목 순서대로 "손이 들어옴 → (옮김 → 쓰기)… → 나감" 구간을 시간표로 만든다.
// 모든 구간은 이어져 있고 겹치지 않는다. 시간은 초 단위, 계획 시작을 0으로 한다.
import { clamp, easeInOut, pointAt } from "./util.js";

/** 속도별 시간표(설계서 6.7절 초기값). hop은 옮기는 시간의 배율 */
export const SPEEDS = {
  slow: { label: "느리게", cps: 7, head: 0.3, ledger: 0.1, circle: 0.4, staff: 1.0, clef: 1.2, hop: 1.6, enter: 0.3, leave: 0.4 },
  normal: { label: "보통", cps: 14, head: 0.16, ledger: 0.06, circle: 0.22, staff: 0.6, clef: 0.7, hop: 1.0, enter: 0.25, leave: 0.35 },
  fast: { label: "빠르게", cps: 24, head: 0.1, ledger: 0.04, circle: 0.14, staff: 0.4, clef: 0.45, hop: 0.7, enter: 0.25, leave: 0.35 },
};

const first = (stroke) => stroke.pts[0];
const last = (stroke) => stroke.pts[stroke.pts.length - 1];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** 장면과 속도로 계획을 만든다 */
export function buildPlan(scene, speedKey) {
  const sp = SPEEDS[speedKey] ?? SPEEDS.normal;
  const segs = [];
  let t = 0;
  let pen = [scene.W + 120, scene.H + 170]; // 판 밖(오른쪽 아래)
  let penInk = null;

  const hopTime = (d) => sp.hop * clamp(0.04 + (d / scene.W) * 0.26, 0.04, 0.22);

  const add = (seg) => {
    seg.t0 = t;
    t += seg.dur;
    seg.t1 = t;
    segs.push(seg);
  };

  const addHop = (to, ink, dur, kind = "hop") => {
    add({ type: kind, from: pen.slice(), to: to.slice(), dur, ink });
    pen = to.slice();
  };

  // 첫 구간: 손이 들어온다
  const firstItem = scene.items[0];
  const firstPt = firstItem.type === "glyph" ? first(firstItem.strokes[0]) : first(firstItem.strokes[firstItem.pen ?? 0]);
  addHop(firstPt, firstItem.ink, sp.enter, "enter");
  penInk = firstItem.ink;

  const addDraw = (item, strokeIdxs, penIdx, dur) => {
    const strokes = strokeIdxs.map((si) => item.strokes[si]);
    add({
      type: "draw",
      item,
      parts: strokeIdxs.map((si) => ({ item, si })),
      pen: penIdx,
      dur,
      ink: item.ink,
      penStroke: strokes[penIdx],
    });
    pen = last(strokes[penIdx]).slice();
    penInk = item.ink;
  };

  let prevGlyphRun = null; // 같은 글줄에서 바로 앞 글자 항목
  for (let n = 0; n < scene.items.length; n++) {
    const item = scene.items[n];
    if (item.type === "glyph") {
      const budget = 1 / sp.cps;
      const isRunStart = !prevGlyphRun || !item.id.startsWith(prevGlyphRun.id.split("/")[0] + "/") || prevGlyphRun.id.split("/")[0] !== item.id.split("/")[0];
      // 글줄의 첫 글자: 거리에 따른 별도 옮김
      const startPt = first(item.strokes[0]);
      if (isRunStart || dist(pen, startPt) > scene.W * 0.12) {
        const d = dist(pen, startPt);
        if (d > 0.5) addHop(startPt, item.ink, hopTime(d));
      }
      // 글자 안: 획 길이와 획 사이 이동 거리에 비례해 시간을 나눈다
      const parts = [];
      const hopIn = dist(pen, startPt);
      const spacePause = prevGlyphRun && prevGlyphRun.spaceAfter ? 0.35 : 0;
      if (hopIn > 0.5 || spacePause) parts.push({ k: "hop", to: startPt, w: hopIn * 0.5 + 3 + spacePause * 60 });
      let cur = pen;
      item.strokes.forEach((s, si) => {
        const st = first(s);
        if (si > 0) {
          parts.push({ k: "hop", to: st, w: dist(cur, st) * 0.5 + 3 });
        }
        parts.push({ k: "draw", si, w: s.len + 8 });
        cur = last(s);
      });
      const total = parts.reduce((a, p) => a + p.w, 0);
      for (const p of parts) {
        const dur = (p.w / total) * budget;
        if (p.k === "hop") addHop(p.to, item.ink, dur);
        else addDraw(item, [p.si], 0, dur);
      }
      prevGlyphRun = item;
    } else {
      prevGlyphRun = null;
      const penIdx = item.pen ?? 0;
      const startPt = first(item.strokes[penIdx]);
      const d = dist(pen, startPt);
      if (d > 0.5) addHop(startPt, item.ink, hopTime(d));
      const dur =
        item.role === "staff" ? sp.staff : item.role === "clef" ? sp.clef : item.role === "head" ? sp.head : item.role === "ledger" ? sp.ledger : sp.circle;
      addDraw(
        item,
        item.strokes.map((_, i) => i),
        penIdx,
        dur,
      );
    }
  }

  // 마지막: 손이 나간다
  addHop([scene.W + 120, scene.H + 170], penInk, sp.leave, "leave");

  return { segs, total: t, speed: speedKey, sp };
}

/** 구간 안에서의 진행 정도(0~1). 긴 구간은 천천히 시작해 빨라졌다가 멈춘다 */
export function segProgress(seg, t) {
  if (t <= seg.t0) return 0;
  if (t >= seg.t1) return 1;
  const lin = (t - seg.t0) / seg.dur;
  return seg.dur >= 0.12 ? easeInOut(lin) : lin;
}

/** t 시각에 손이 있어야 할 자리 */
export function penAt(plan, seg, t) {
  const p = segProgress(seg, t);
  if (seg.type === "draw") {
    const s = seg.penStroke;
    const [x, y, dx, dy] = pointAt(s.pts, s.cum, s.len * p);
    return { x, y, dx, dy, down: true, lift: 0 };
  }
  // 옮김 / 들어옴 / 나감: 부드럽게 이동하며 떠 있다
  const [fx, fy] = seg.from;
  const [tx, ty] = seg.to;
  const q = seg.type === "enter" ? 1 - (1 - p) * (1 - p) : seg.type === "leave" ? p * p : easeInOut(p);
  const dd = Math.hypot(tx - fx, ty - fy);
  let lift;
  if (seg.type === "enter") lift = 1 - p;
  else if (seg.type === "leave") lift = p;
  else lift = clamp(dd / 70, 0, 1) * Math.sin(Math.PI * p);
  const m = dd || 1;
  return { x: fx + (tx - fx) * q, y: fy + (ty - fy) * q, dx: (tx - fx) / m, dy: (ty - fy) / m, down: false, lift };
}
