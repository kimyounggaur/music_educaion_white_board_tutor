// R1 시제품용 글씨 자료 만들기: 글꼴의 글자 윤곽에서 "쓰는 길(획)"을 뽑아 JSON으로 저장한다.
// 사용: node tools/build-glyphs.mjs <글꼴 파일> <글자 목록 파일> <출력 json>
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);
const opentype = require("opentype.js");
const TraceSkeleton = require("skeleton-tracing-js");

const [, , fontPath, textPath, outJson] = process.argv;

const buf = fs.readFileSync(fontPath);
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const UPM = font.unitsPerEm;
const ASC = font.ascender;
const DESC = font.descender;

const LINES = fs.readFileSync(textPath, "utf8").split("\n").filter(Boolean);

const PX_PER_EM = 220;
const S = PX_PER_EM / UPM;
const PAD = 6;

function flatten(commands) {
  const contours = [];
  let cur = null;
  let x = 0;
  let y = 0;
  const N = 10;
  for (const c of commands) {
    if (c.type === "M") {
      if (cur && cur.length > 1) contours.push(cur);
      cur = [[c.x, c.y]];
      x = c.x;
      y = c.y;
    } else if (c.type === "L") {
      cur.push([c.x, c.y]);
      x = c.x;
      y = c.y;
    } else if (c.type === "Q") {
      for (let i = 1; i <= N; i++) {
        const t = i / N;
        const u = 1 - t;
        cur.push([u * u * x + 2 * u * t * c.x1 + t * t * c.x, u * u * y + 2 * u * t * c.y1 + t * t * c.y]);
      }
      x = c.x;
      y = c.y;
    } else if (c.type === "C") {
      for (let i = 1; i <= N; i++) {
        const t = i / N;
        const u = 1 - t;
        cur.push([
          u * u * u * x + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
          u * u * u * y + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y,
        ]);
      }
      x = c.x;
      y = c.y;
    } else if (c.type === "Z") {
      if (cur && cur.length > 1) {
        cur.push(cur[0]);
        contours.push(cur);
      }
      cur = null;
    }
  }
  if (cur && cur.length > 1) contours.push(cur);
  return contours;
}

function rasterize(contours, adv) {
  const w = Math.ceil(adv * S) + PAD * 2;
  const h = Math.ceil((ASC - DESC) * S) + PAD * 2;
  const grid = new Uint8Array(w * h);
  const toFontX = (i) => (i + 0.5 - PAD) / S;
  const toFontY = (j) => (j + 0.5 - PAD) / S - ASC;
  for (let j = 0; j < h; j++) {
    const yy = toFontY(j);
    const hits = [];
    for (const c of contours) {
      for (let k = 0; k < c.length - 1; k++) {
        const [x0, y0] = c[k];
        const [x1, y1] = c[k + 1];
        if (y0 === y1) continue;
        if (y0 <= yy && yy < y1) hits.push([x0 + ((yy - y0) / (y1 - y0)) * (x1 - x0), 1]);
        else if (y1 <= yy && yy < y0) hits.push([x0 + ((yy - y0) / (y1 - y0)) * (x1 - x0), -1]);
      }
    }
    hits.sort((a, b) => a[0] - b[0]);
    let wind = 0;
    for (let k = 0; k < hits.length - 1; k++) {
      wind += hits[k][1];
      if (wind !== 0) {
        const i0 = Math.max(0, Math.ceil(hits[k][0] * S + PAD - 0.5));
        const i1 = Math.min(w - 1, Math.floor(hits[k + 1][0] * S + PAD - 0.5));
        for (let i = i0; i <= i1; i++) grid[j * w + i] = 1;
      }
    }
  }
  return { grid, w, h, toFontX, toFontY };
}

/** 두 번 훑는 거리 변환(가장 가까운 바탕까지의 거리, 픽셀 단위 어림) */
function distanceTransform(grid, w, h) {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = grid[i] ? INF : 0;
  const D1 = 1;
  const D2 = Math.SQRT2;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const p = j * w + i;
      if (!d[p]) continue;
      if (i > 0) d[p] = Math.min(d[p], d[p - 1] + D1);
      if (j > 0) d[p] = Math.min(d[p], d[p - w] + D1);
      if (i > 0 && j > 0) d[p] = Math.min(d[p], d[p - w - 1] + D2);
      if (i < w - 1 && j > 0) d[p] = Math.min(d[p], d[p - w + 1] + D2);
    }
  for (let j = h - 1; j >= 0; j--)
    for (let i = w - 1; i >= 0; i--) {
      const p = j * w + i;
      if (!d[p]) continue;
      if (i < w - 1) d[p] = Math.min(d[p], d[p + 1] + D1);
      if (j < h - 1) d[p] = Math.min(d[p], d[p + w] + D1);
      if (i < w - 1 && j < h - 1) d[p] = Math.min(d[p], d[p + w + 1] + D2);
      if (i > 0 && j < h - 1) d[p] = Math.min(d[p], d[p + w - 1] + D2);
    }
  return d;
}

const len = (pl) => {
  let L = 0;
  for (let i = 1; i < pl.length; i++) L += Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]);
  return L;
};
const dirAt = (pl, atEnd) => {
  const n = pl.length;
  const a = atEnd ? pl[Math.max(0, n - 4)] : pl[Math.min(n - 1, 3)];
  const b = atEnd ? pl[n - 1] : pl[0];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const m = Math.hypot(dx, dy) || 1;
  return [dx / m, dy / m];
};

/** 갈림목에서 끊긴 조각을, 방향이 자연스럽게 이어지면 한 획으로 잇는다 */
function mergeStrokes(polys, joinDist) {
  const list = polys.map((p) => p.slice());
  let merged = true;
  while (merged) {
    merged = false;
    let best = null;
    for (let a = 0; a < list.length; a++)
      for (let b = 0; b < list.length; b++) {
        if (a === b) continue;
        for (const ea of [0, 1])
          for (const eb of [0, 1]) {
            const pa = ea ? list[a][list[a].length - 1] : list[a][0];
            const pb = eb ? list[b][list[b].length - 1] : list[b][0];
            const dist = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
            if (dist > joinDist) continue;
            const da = dirAt(list[a], Boolean(ea));
            const db = dirAt(list[b], Boolean(eb));
            // a의 끝에서 나가는 방향과 b의 끝에서 나가는 방향이 서로 반대여야 곧게 이어진다
            const straight = -(da[0] * db[0] + da[1] * db[1]);
            if (straight < 0.8) continue;
            if (!best || straight > best.straight) best = { a, b, ea, eb, straight };
          }
      }
    if (best) {
      const A = best.ea ? list[best.a] : list[best.a].slice().reverse();
      const B = best.eb ? list[best.b].slice().reverse() : list[best.b];
      const joined = A.concat(B);
      const keep = list.filter((_, i) => i !== best.a && i !== best.b);
      keep.push(joined);
      list.length = 0;
      list.push(...keep);
      merged = true;
    }
  }
  return list;
}

function simplify(pl, tol) {
  if (pl.length < 3) return pl;
  const first = pl[0];
  const last = pl[pl.length - 1];
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 1.5 && pl.length > 4) {
    let far = 1;
    let fd = 0;
    for (let i = 1; i < pl.length - 1; i++) {
      const dd = Math.hypot(pl[i][0] - first[0], pl[i][1] - first[1]);
      if (dd > fd) {
        fd = dd;
        far = i;
      }
    }
    const a = simplifyOpen(pl.slice(0, far + 1), tol);
    const b = simplifyOpen(pl.slice(far), tol);
    return a.concat(b.slice(1));
  }
  return simplifyOpen(pl, tol);
}

function simplifyOpen(pl, tol) {
  if (pl.length < 3) return pl;
  const keep = new Uint8Array(pl.length);
  keep[0] = keep[pl.length - 1] = 1;
  const stack = [[0, pl.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let worst = -1;
    let wd = tol;
    const [ax, ay] = pl[a];
    const [bx, by] = pl[b];
    const L = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = a + 1; i < b; i++) {
      const dd = Math.abs((bx - ax) * (ay - pl[i][1]) - (ax - pl[i][0]) * (by - ay)) / L;
      if (dd > wd) {
        wd = dd;
        worst = i;
      }
    }
    if (worst > 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return pl.filter((_, i) => keep[i]);
}

// ── 한글 구조(초성·중성·종성)로 쓰는 순서를 어림한다
const VOWEL_KIND = "vvvvvvvvhmmmhhmmmhhmv"; // ㅏㅐㅑㅒㅓㅔㅕㅖ(세로) ㅗ(가로) ㅘㅙㅚ(섞임) ㅛㅜ(가로) ㅝㅞㅟ(섞임) ㅠㅡ(가로) ㅢ(섞임) ㅣ(세로)
function hangulInfo(ch) {
  const code = ch.codePointAt(0) - 0xac00;
  if (code < 0 || code > 11171) return null;
  const jong = code % 28;
  const jung = Math.floor(code / 28) % 21;
  return { kind: VOWEL_KIND[jung], hasFinal: jong !== 0 };
}

function orderStrokes(strokes, ch, box) {
  const info = hangulInfo(ch);
  const centroid = (pl) => {
    let sx = 0;
    let sy = 0;
    for (const p of pl) {
      sx += p[0];
      sy += p[1];
    }
    return [sx / pl.length, sy / pl.length];
  };
  const region = (pl) => {
    if (!info) return 0;
    const [cx, cy] = centroid(pl);
    const u = (cx - box.x0) / Math.max(1, box.x1 - box.x0);
    const v = (cy - box.y0) / Math.max(1, box.y1 - box.y0);
    if (info.hasFinal && v > 0.66) return 3; // 종성
    const top = info.hasFinal ? 0.66 : 1;
    if (info.kind === "v") return u < 0.56 ? 0 : 1;
    if (info.kind === "h") return v < top * 0.52 ? 0 : 1;
    if (u >= 0.6) return 2; // 섞임: 오른쪽 세로 모음
    return v < top * 0.5 ? 0 : 1;
  };
  // 획의 시작점을 정한다: 가로획은 왼쪽, 세로획은 위에서 시작
  const oriented = strokes.map((pl) => {
    const a = pl[0];
    const b = pl[pl.length - 1];
    const startScore = (p) => p[1] * 1.0 + p[0] * 0.7;
    return startScore(a) <= startScore(b) ? pl : pl.slice().reverse();
  });
  return oriented
    .map((pl) => ({ pl, r: region(pl) }))
    .sort((p, q) => p.r - q.r || p.pl[0][1] - q.pl[0][1] || p.pl[0][0] - q.pl[0][0])
    .map((o) => o.pl);
}

function coverage(grid, w, h, strokesPx, radius) {
  const mask = new Uint8Array(w * h);
  for (const pl of strokesPx)
    for (let k = 0; k < Math.max(1, pl.length - 1); k++) {
      const [x0, y0] = pl[k];
      const [x1, y1] = pl[Math.min(pl.length - 1, k + 1)];
      const minX = Math.max(0, Math.floor(Math.min(x0, x1) - radius));
      const maxX = Math.min(w - 1, Math.ceil(Math.max(x0, x1) + radius));
      const minY = Math.max(0, Math.floor(Math.min(y0, y1) - radius));
      const maxY = Math.min(h - 1, Math.ceil(Math.max(y0, y1) + radius));
      const dx = x1 - x0;
      const dy = y1 - y0;
      const L2 = dx * dx + dy * dy || 1;
      for (let j = minY; j <= maxY; j++)
        for (let i = minX; i <= maxX; i++) {
          const t = Math.max(0, Math.min(1, ((i + 0.5 - x0) * dx + (j + 0.5 - y0) * dy) / L2));
          const ddx = i + 0.5 - (x0 + t * dx);
          const ddy = j + 0.5 - (y0 + t * dy);
          if (ddx * ddx + ddy * ddy <= radius * radius) mask[j * w + i] = 1;
        }
    }
  let ink = 0;
  let hit = 0;
  for (let p = 0; p < w * h; p++)
    if (grid[p]) {
      ink++;
      if (mask[p]) hit++;
    }
  return ink ? hit / ink : 1;
}

/** 획이 한 번도 지나가지 않는 잉크 덩어리(연결 성분)를 찾아 그 가운데에 짧은 획을 만든다 */
function dotStrokes(grid, w, h, strokes) {
  const label = new Int32Array(w * h);
  const comps = [];
  for (let p0 = 0; p0 < w * h; p0++) {
    if (!grid[p0] || label[p0]) continue;
    const id = comps.length + 1;
    const stack = [p0];
    label[p0] = id;
    let sx = 0;
    let sy = 0;
    let n = 0;
    while (stack.length) {
      const p = stack.pop();
      const i = p % w;
      const j = (p - i) / w;
      sx += i;
      sy += j;
      n++;
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= w * h || !grid[q] || label[q]) continue;
        if ((q === p - 1 && i === 0) || (q === p + 1 && i === w - 1)) continue;
        label[q] = id;
        stack.push(q);
      }
    }
    comps.push({ id, cx: sx / n, cy: sy / n, n, touched: false });
  }
  for (const pl of strokes)
    for (const [x, y] of pl) {
      const id = label[Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)))];
      if (id) comps[id - 1].touched = true;
    }
  return comps.filter((c) => !c.touched && c.n > 6).map((c) => [[c.cx - 0.6, c.cy], [c.cx + 0.6, c.cy]]);
}

const cache = new Map();
const t0 = performance.now();
function analyze(ch) {
  if (cache.has(ch)) return cache.get(ch);
  const glyph = font.charToGlyph(ch);
  const adv = glyph.advanceWidth ?? UPM;
  const p = glyph.getPath(0, 0, UPM);
  const contours = flatten(p.commands);
  const { x1, y1, x2, y2 } = p.getBoundingBox();
  const bbox = [Math.floor(x1), Math.floor(y1), Math.ceil(x2), Math.ceil(y2)];
  const out = { ch, adv, bbox, strokes: [], cover: 1, stem: 0 };
  if (contours.length) {
    const { grid, w, h } = rasterize(contours, adv);
    const dist = distanceTransform(grid, w, h);
    const traced = TraceSkeleton.fromBoolArray(Array.from(grid), w, h).polylines.filter((pl) => pl.length > 1);
    // 뼈대 위의 굵기(가장 가까운 바탕까지 거리의 2배)
    const widths = [];
    for (const pl of traced)
      for (const [x, y] of pl) {
        const v = dist[Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)))];
        if (v > 0) widths.push(v * 2);
      }
    widths.sort((a, b) => a - b);
    const stemPx = widths.length ? widths[Math.floor(widths.length * 0.6)] : 8;
    let strokes = mergeStrokes(traced, stemPx * 0.9);
    strokes = strokes.filter((pl) => len(pl) >= stemPx * 0.6 || strokes.length === 1).map((pl) => simplify(pl, 0.6));
    strokes.push(...dotStrokes(grid, w, h, strokes));
    const xs = strokes.flatMap((pl) => pl.map((q) => q[0]));
    const ys = strokes.flatMap((pl) => pl.map((q) => q[1]));
    const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    strokes = orderStrokes(strokes, ch, box);
    out.stem = stemPx / S;
    out.cover = coverage(grid, w, h, strokes, (stemPx * 1.9) / 2);
    out.strokes = strokes.map((pl) => pl.map(([x, y]) => [Math.round((x + 0.5 - PAD) / S), Math.round((y + 0.5 - PAD) / S - ASC)]));
  }
  cache.set(ch, out);
  return out;
}

const cmap = font.tables.cmap.glyphIndexMap;
const allowed = cp => (cp >= 0xac00 && cp <= 0xd7a3)
  || (cp >= 0x21 && cp <= 0x7e)
  || [0xb7, 0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2026, 0x266d, 0x266e, 0x266f].includes(cp);
const codePoints = new Set(Object.keys(cmap).map(Number).filter(cp => cmap[cp] && allowed(cp)));
const requested = [...new Set(LINES.join("").normalize("NFC").replace(/\s/g, ""))];
for (const ch of requested) {
  if (cmap[ch.codePointAt(0)]) codePoints.add(ch.codePointAt(0));
}
const results = [...codePoints].sort((a, b) => a - b).map(cp => analyze(String.fromCodePoint(cp)));
const glyphs = Object.create(null);
for (const r of results) {
  // Each tuple holds advance, bounds, centerline strokes and typical thickness.
  if (r.strokes.length) glyphs[r.ch] = [Math.round(r.adv), r.bbox, r.strokes.map(points => points.flat()), Math.round(r.stem)];
}
const fontSha256 = createHash("sha256").update(buf).digest("hex");
const out = { upm: UPM, asc: ASC, desc: DESC, font: path.basename(fontPath), fontSha256, glyphs };
fs.mkdirSync(path.dirname(outJson), { recursive: true });
fs.writeFileSync(outJson, JSON.stringify(out) + "\n");
const low = results.filter(r => r.cover < 0.97).map(r => `${r.ch}:${(r.cover * 100).toFixed(1)}%`);
const hangul = results.filter(r => /^[가-힣]$/u.test(r.ch));
const average = hangul.reduce((sum, r) => sum + r.cover, 0) / hangul.length;
console.log(`글자 ${Object.keys(glyphs).length}개 (한글 ${hangul.length}개) → ${outJson} (${(fs.statSync(outJson).size / 1024).toFixed(1)}KB)`);
console.log(`한글 평균 덮임률 ${(average * 100).toFixed(2)}%, 덮임률 97% 미만: ${low.join(" ") || "없음"}`);
const missing = requested.filter(ch => !glyphs[ch]);
if (missing.length) console.log("대체 글꼴로 표시:", missing.join(" "));
if (hangul.length !== 2350 || average < 0.99) process.exitCode = 1;
