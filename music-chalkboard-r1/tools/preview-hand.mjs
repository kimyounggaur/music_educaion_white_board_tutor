// 손 그림만 따로 그려 눈으로 확인하는 도구: node tools/preview-hand.mjs <출력 svg> [chalk|marker]
import fs from "node:fs";
import { handSvg } from "../src/hand-art.js";

const [, , out = "/home/claude/r1-prototype/out/hand.svg", kind = "chalk"] = process.argv;
let svg = handSvg(kind);
// 좌표 격자와 펜 끝 표시를 덧그린다
let grid = "";
for (let x = 0; x <= 640; x += 100) grid += `<line x1="${x}" y1="0" x2="${x}" y2="880" stroke="#99a" stroke-width="1" stroke-dasharray="4 6"/><text x="${x + 3}" y="14" font-size="14" fill="#556">${x}</text>`;
for (let y = 0; y <= 880; y += 100) grid += `<line x1="0" y1="${y}" x2="640" y2="${y}" stroke="#99a" stroke-width="1" stroke-dasharray="4 6"/><text x="3" y="${y + 14}" font-size="14" fill="#556">${y}</text>`;
const mark = `<circle cx="92" cy="96" r="7" fill="none" stroke="#e00" stroke-width="3"/>`;
svg = svg.replace("</svg>", `${grid}${mark}</svg>`);
svg = svg.replace('width="640" height="880"', 'width="640" height="880"');
const bg = kind === "marker" ? "#ffffff" : "#1f4036";
svg = svg.replace(/(<svg[^>]*>)/, `$1<rect width="640" height="880" fill="${bg}"/>`);
fs.writeFileSync(out, svg);
console.log("ok", out);
