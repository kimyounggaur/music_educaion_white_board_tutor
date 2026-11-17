// 공용 계산 함수(모두 순수 함수). 점은 [x, y] 배열이다.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
/** 천천히 시작해 빨라졌다가 천천히 멈춘다 */
export const easeInOut = (t) => t * t * (3 - 2 * t);
export const easeOut = (t) => 1 - (1 - t) * (1 - t);
export const easeIn = (t) => t * t;

/** 씨앗값이 같으면 같은 수열을 내는 난수 */
export function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 글자열 → 씨앗값 */
export function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** 점마다 시작점에서 거기까지의 누적 길이 */
export function cumulative(pts) {
  const cum = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i++) {
    cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return cum;
}

export function polyLength(pts) {
  const c = cumulative(pts);
  return c.length ? c[c.length - 1] : 0;
}

/** 시작점에서 거리 d만큼 간 점 [x, y, 방향x, 방향y] */
export function pointAt(pts, cum, d) {
  const n = pts.length;
  if (n === 0) return [0, 0, 1, 0];
  if (n === 1) return [pts[0][0], pts[0][1], 1, 0];
  const dd = clamp(d, 0, cum[n - 1]);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= dd) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo] || 1;
  const t = (dd - cum[lo]) / seg;
  const dx = pts[hi][0] - pts[lo][0];
  const dy = pts[hi][1] - pts[lo][1];
  const m = Math.hypot(dx, dy) || 1;
  return [pts[lo][0] + dx * t, pts[lo][1] + dy * t, dx / m, dy / m];
}

/** 점 사이 간격을 고르게 다시 나눈다(처음과 끝은 그대로) */
export function resample(pts, spacing) {
  if (pts.length < 2) return pts.map((p) => p.slice());
  const cum = cumulative(pts);
  const total = cum[cum.length - 1];
  if (total < 1e-6) return [pts[0].slice(), pts[pts.length - 1].slice()];
  const n = Math.max(2, Math.ceil(total / spacing) + 1);
  const out = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const d = (total * i) / (n - 1);
    while (j < pts.length - 2 && cum[j + 1] < d) j++;
    const seg = cum[j + 1] - cum[j] || 1;
    const t = clamp((d - cum[j]) / seg, 0, 1);
    out.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * t, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * t]);
  }
  return out;
}

/** 모서리를 깎아 부드럽게(끝점은 유지) */
export function chaikin(pts, iterations = 1) {
  let cur = pts;
  for (let it = 0; it < iterations; it++) {
    if (cur.length < 3) return cur;
    const next = [cur[0]];
    for (let i = 0; i < cur.length - 1; i++) {
      const [x0, y0] = cur[i];
      const [x1, y1] = cur[i + 1];
      next.push([x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25], [x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75]);
    }
    next.push(cur[cur.length - 1]);
    cur = next;
  }
  return cur;
}

/** 찍어 둔 점을 모두 지나가는 부드러운 곡선(Catmull-Rom)을 점 목록으로 */
export function catmullRom(ctrl, perSeg = 10) {
  const n = ctrl.length;
  if (n < 3) return ctrl.map((p) => p.slice());
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)];
    const p1 = ctrl[i];
    const p2 = ctrl[i + 1];
    const p3 = ctrl[Math.min(n - 1, i + 2)];
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(ctrl[n - 1].slice());
  return out;
}

/** 선과 수직으로 조금씩 흔든다. 길이를 따라 부드럽게 변하는 잡음이라 손으로 그은 느낌이 난다. */
export function wobble(pts, amp, seed, wavelength = 70) {
  if (pts.length < 2 || amp <= 0) return pts;
  const rand = rng(seed);
  const cum = cumulative(pts);
  const total = cum[cum.length - 1];
  const knots = Math.max(3, Math.ceil(total / wavelength) + 2);
  const vals = Array.from({ length: knots }, () => rand() * 2 - 1);
  const noise = (s) => {
    const x = s / wavelength;
    const i = Math.min(knots - 2, Math.floor(x));
    const f = x - i;
    const t = (1 - Math.cos(f * Math.PI)) / 2;
    return vals[i] * (1 - t) + vals[i + 1] * t;
  };
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const m = Math.hypot(dx, dy) || 1;
    const o = noise(cum[i]) * amp;
    return [p[0] - (dy / m) * o, p[1] + (dx / m) * o];
  });
}

/** 타원을 따라 도는 점 목록. sweep은 도(°), 양수면 화면에서 시계 방향 */
export function ellipseArc(cx, cy, rx, ry, rotDeg, startDeg, sweepDeg, grow = 0, step = 6) {
  const n = Math.max(8, Math.ceil(Math.abs(sweepDeg) / step));
  const rot = (rotDeg * Math.PI) / 180;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const a = ((startDeg + sweepDeg * f) * Math.PI) / 180;
    const k = 1 + grow * f;
    const x = Math.cos(a) * rx * k;
    const y = Math.sin(a) * ry * k;
    out.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
  }
  return out;
}

export function bounds(pts) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

/** 점 목록을 SVG 경로 문자열로 */
export function toPathD(pts) {
  let d = "";
  for (let i = 0; i < pts.length; i++) {
    d += (i ? "L" : "M") + Math.round(pts[i][0] * 10) / 10 + " " + Math.round(pts[i][1] * 10) / 10;
  }
  return d;
}
