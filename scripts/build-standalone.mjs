/**
 * 한 파일(HTML) 배포판 만들기: npm run build:standalone
 * 서버가 없는 곳(교실 컴퓨터에서 파일 열기, Claude 아티팩트, 메일 첨부)에서도 같은 수업 화면이 열린다.
 * 결과: dist/standalone/music-chalkboard.html (스크립트·스타일·오선보 글꼴이 모두 안에 들어 있다)
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

process.env.NODE_ENV = "production";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "dist", "standalone");
const outFile = path.join(outDir, "music-chalkboard.html");

// 1. 스타일: 서버 버전과 같은 globals.css를 Tailwind로 처리한다
const cssPath = path.join(root, "src", "app", "globals.css");
const css = (await postcss([tailwindcss({ base: root })]).process(await readFile(cssPath, "utf8"), { from: cssPath })).css;

// 2. 스크립트: 화면 구성요소와 수업 대본을 한 덩어리로 묶는다(next/link만 작은 대체품으로 바꾼다)
const bundle = await build({
  entryPoints: [path.join(root, "standalone", "main.tsx")],
  bundle: true,
  write: false,
  minify: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  jsx: "automatic",
  legalComments: "none",
  logLevel: "warning",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "next/link": path.join(root, "standalone", "next-link.tsx") },
});
const script = bundle.outputFiles[0].text;

// 3. HTML에 넣을 때 깨지는 글자 묶음을 바꾼다(뜻은 같다)
const safeScript = script.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");
const safeCss = css.replace(/<\/(style)/gi, "<\\/$1");

// 화면이 그려지기 전에 저장된 색(칠판/화이트보드)을 적용한다. src/app/layout.tsx와 같은 내용이다.
const themeScript = `(function(){try{var t=localStorage.getItem("mc-theme");document.documentElement.dataset.theme=(t==="white")?"white":"chalk"}catch(e){document.documentElement.dataset.theme="chalk"}})()`;

const html = `<!DOCTYPE html>
<html lang="ko" data-theme="chalk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>음악 칠판 (가칭)</title>
<style>${safeCss}</style>
<script>${themeScript}</script>
</head>
<body>
<div id="root"></div>
<noscript>이 화면은 자바스크립트가 필요해요. 브라우저 설정에서 켜 주세요.</noscript>
<script>${safeScript}</script>
</body>
</html>
`;

await mkdir(outDir, { recursive: true });
await writeFile(outFile, html, "utf8");

const kb = (n) => `${(n / 1024).toFixed(0)}KB`;
console.log(`만들었어요: ${path.relative(root, outFile)}`);
console.log(`  전체 ${kb(Buffer.byteLength(html))} (스크립트 ${kb(Buffer.byteLength(script))}, 스타일 ${kb(Buffer.byteLength(css))})`);
