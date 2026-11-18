// 한 장짜리 HTML로 묶는다: dist/index.html (바깥 파일·외부 주소 없음)
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

// 이 폴더에서 npm install 한 esbuild를 먼저 쓰고, 없으면 작업 환경의 것을 쓴다
const ESBUILD = existsSync("node_modules/.bin/esbuild") ? "node_modules/.bin/esbuild" : "/home/claude/music-chalkboard/node_modules/.bin/esbuild";
const debug = process.argv.includes("--debug");

const js = execFileSync(
  ESBUILD,
  ["src/app.js", "--bundle", "--format=iife", "--target=es2020", "--legal-comments=none", ...(debug ? [] : ["--minify"])],
  { encoding: "utf8", maxBuffer: 1 << 27 },
).replace(/<\/script/gi, "<\\/script");

const font = readFileSync("assets/NotoSansKR-Whiteboard.woff").toString("base64");
const fontCss = `@font-face{font-family:WhiteboardKorean;src:url(data:font/woff;base64,${font}) format("woff");font-style:normal;font-weight:400 700;font-display:swap;}`;
const css = fontCss + readFileSync("src/style.css", "utf8");
const html = readFileSync("src/index.html", "utf8");
// 치환 문자열에 "$&" 같은 특수 패턴이 들어가도 안전하도록 함수로 바꾼다
const out = html.replace("/*__STYLE__*/", () => css).replace("/*__SCRIPT__*/", () => js);

mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.html", out);
console.log("dist/index.html", (out.length / 1024).toFixed(1) + " KB");
