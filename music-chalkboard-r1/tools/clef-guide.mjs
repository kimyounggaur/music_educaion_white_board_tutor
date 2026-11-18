// 음자리표 손그림 길을 만들 때 모양을 맞춰 보는 도구(개발용). Bravura 글꼴의 음자리표를 회색 안내선으로만 쓴다.
// 사용: node tools/clef-guide.mjs <Bravura.otf> <출력 SVG>
import fs from "node:fs";
import { dirname } from "node:path";
import opentype from "opentype.js";
import { clefUnits } from "../src/symbols.js";
const [fontPath, out] = process.argv.slice(2);
if (fontPath === "--help" || !fontPath || !out) {
  console.log("사용법: node tools/clef-guide.mjs <Bravura.otf> <출력 SVG>");
  process.exit(fontPath === "--help" ? 0 : 1);
}

const buf = fs.readFileSync(fontPath);
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const g = font.charToGlyph(String.fromCodePoint(0xe050)); // gClef
if (!g.index) throw new Error("입력 글꼴에 SMuFL 높은음자리표(U+E050)가 없습니다.");
const p = g.getPath(0, 0, 1000); // 1000 = 한 em, 오선 한 칸 = 250
const S = 80; // 한 칸 = 80px
const k = S / 250;
const ox = 160;
const oy = 360; // G선의 위치
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="720" viewBox="0 0 420 720"><rect width="420" height="720" fill="#fff"/>`;
// 오선: G선 기준 +1(맨 아래), 0, -1, -2, -3
for (const j of [1, 0, -1, -2, -3]) svg += `<line x1="20" y1="${oy + j * S}" x2="400" y2="${oy + j * S}" stroke="#999" stroke-width="1.5"/>`;
svg += `<path d="${p.toPathData(2)}" transform="translate(${ox} ${oy}) scale(${k})" fill="#bcc3cc"/>`;
// 격자(칸 단위)
for (let x = -2; x <= 3; x++) svg += `<line x1="${ox + x * S}" y1="0" x2="${ox + x * S}" y2="720" stroke="#e55" stroke-width=".7" stroke-dasharray="3 5"/><text x="${ox + x * S + 3}" y="12" font-size="12" fill="#e55">${x}</text>`;
for (let y = -5; y <= 4; y++) svg += `<text x="4" y="${oy + y * S - 3}" font-size="12" fill="#e55">${y}</text>`;
const bb = p.getBoundingBox();
svg += `<text x="20" y="700" font-size="13" fill="#333">bbox(칸): x ${(bb.x1 / 250).toFixed(2)}~${(bb.x2 / 250).toFixed(2)}, y ${(bb.y1 / 250).toFixed(2)}~${(bb.y2 / 250).toFixed(2)}</text>`;
// 후보 길(있으면)
const extra = clefUnits();
if (extra) {
  svg += `<polyline points="${extra.map(([x, y]) => `${(ox + x * S).toFixed(1)},${(oy + y * S).toFixed(1)}`).join(" ")}" fill="none" stroke="#d00" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  svg += `<circle cx="${ox + extra[0][0] * S}" cy="${oy + extra[0][1] * S}" r="6" fill="#0a0"/>`;
}
svg += `</svg>`;
fs.mkdirSync(dirname(out), { recursive: true });
fs.writeFileSync(out, svg);
console.log("ok", out, "bbox", bb);
