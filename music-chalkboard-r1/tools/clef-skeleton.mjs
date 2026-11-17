// 안내용: Bravura 음자리표의 가운데 선(뼈대)을 뽑아 본다. 결과는 눈으로 보고 점을 찍을 때만 쓴다.
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire("/home/claude/spike-tools/package.json");
const opentype = require("opentype.js");
const TraceSkeleton = require("skeleton-tracing-js");

const buf = fs.readFileSync("/home/claude/dl_bravura/package/bravura.otf");
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const g = font.charToGlyph(String.fromCodePoint(0xe050));
const p = g.getPath(0, 0, 1000);

function flatten(commands) {
  const contours = [];
  let cur = null, x = 0, y = 0;
  const N = 16;
  for (const c of commands) {
    if (c.type === "M") { if (cur && cur.length > 1) contours.push(cur); cur = [[c.x, c.y]]; x = c.x; y = c.y; }
    else if (c.type === "L") { cur.push([c.x, c.y]); x = c.x; y = c.y; }
    else if (c.type === "Q") { for (let i = 1; i <= N; i++) { const t = i / N, u = 1 - t; cur.push([u*u*x + 2*u*t*c.x1 + t*t*c.x, u*u*y + 2*u*t*c.y1 + t*t*c.y]); } x = c.x; y = c.y; }
    else if (c.type === "C") { for (let i = 1; i <= N; i++) { const t = i / N, u = 1 - t; cur.push([u*u*u*x + 3*u*u*t*c.x1 + 3*u*t*t*c.x2 + t*t*t*c.x, u*u*u*y + 3*u*u*t*c.y1 + 3*u*t*t*c.y2 + t*t*t*c.y]); } x = c.x; y = c.y; }
    else if (c.type === "Z") { if (cur && cur.length > 1) { cur.push(cur[0]); contours.push(cur); } cur = null; }
  }
  if (cur && cur.length > 1) contours.push(cur);
  return contours;
}
const contours = flatten(p.commands);
const PX = 100 / 250; // 한 칸(250 단위) = 100px
const bb = p.getBoundingBox();
const PAD = 8;
const w = Math.ceil((bb.x2 - bb.x1) * PX) + PAD * 2;
const h = Math.ceil((bb.y2 - bb.y1) * PX) + PAD * 2;
const grid = new Uint8Array(w * h);
for (let j = 0; j < h; j++) {
  const yy = bb.y1 + (j + 0.5 - PAD) / PX;
  const hits = [];
  for (const c of contours) for (let k = 0; k < c.length - 1; k++) {
    const [x0, y0] = c[k], [x1, y1] = c[k + 1];
    if (y0 === y1) continue;
    if (y0 <= yy && yy < y1) hits.push([x0 + ((yy - y0) / (y1 - y0)) * (x1 - x0), 1]);
    else if (y1 <= yy && yy < y0) hits.push([x0 + ((yy - y0) / (y1 - y0)) * (x1 - x0), -1]);
  }
  hits.sort((a, b) => a[0] - b[0]);
  let wind = 0;
  for (let k = 0; k < hits.length - 1; k++) {
    wind += hits[k][1];
    if (wind !== 0) {
      const i0 = Math.max(0, Math.ceil((hits[k][0] - bb.x1) * PX + PAD - 0.5));
      const i1 = Math.min(w - 1, Math.floor((hits[k + 1][0] - bb.x1) * PX + PAD - 0.5));
      for (let i = i0; i <= i1; i++) grid[j * w + i] = 1;
    }
  }
}
const sk = TraceSkeleton.fromBoolArray(Array.from(grid), w, h);
// 칸 단위로 되돌린다(G선 = 0, 아래쪽이 +)
const toU = ([x, y]) => [(x - PAD) / 100 + bb.x1 / 250, (y - PAD) / 100 + bb.y1 / 250];
const lines = sk.polylines.map((pl) => pl.map(toU).map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]));
fs.writeFileSync("/home/claude/r1-prototype/out/clef-skeleton.json", JSON.stringify(lines));
console.log("polylines:", lines.length, lines.map((l) => l.length).join(","));
// 오버레이 그림
const S = 80, ox = 160, oy = 360;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="720" viewBox="0 0 420 720"><rect width="420" height="720" fill="#fff"/>`;
for (const j of [1, 0, -1, -2, -3]) svg += `<line x1="20" y1="${oy + j * S}" x2="400" y2="${oy + j * S}" stroke="#bbb" stroke-width="1.5"/>`;
svg += `<path d="${p.toPathData(2)}" transform="translate(${ox} ${oy}) scale(${S / 250})" fill="#dfe3e8"/>`;
const COLORS = ["#d62828", "#f77f00", "#2a9d8f", "#277da1", "#7b2cbf", "#588157", "#bc6c25", "#3a86ff"];
lines.forEach((l, i) => {
  svg += `<polyline points="${l.map(([x, y]) => `${(ox + x * S).toFixed(1)},${(oy + y * S).toFixed(1)}`).join(" ")}" fill="none" stroke="${COLORS[i % 8]}" stroke-width="2.5"/>`;
  svg += `<text x="${ox + l[0][0] * S}" y="${oy + l[0][1] * S}" font-size="13" fill="${COLORS[i % 8]}">${i}</text>`;
});
for (let x = -2; x <= 3; x++) svg += `<line x1="${ox + x * S}" y1="0" x2="${ox + x * S}" y2="720" stroke="#e55" stroke-width=".7" stroke-dasharray="3 5"/><text x="${ox + x * S + 3}" y="12" font-size="12" fill="#e55">${x}</text>`;
svg += `</svg>`;
fs.writeFileSync("/home/claude/r1-prototype/out/clef-skeleton.svg", svg);
