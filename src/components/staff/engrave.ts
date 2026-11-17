/**
 * 오선보 그리기(VexFlow). 오선·음자리표·조표는 한 번, 음 열(column)은 열마다 따로 그려서
 * 열의 가운데가 x=0이 되게 만든다. 화면에서 열을 옮기는 일은 CSS transform이 맡는다.
 * 브라우저에서만 쓴다(DOM이 필요하다).
 */

import { parsePitch, type Pitch } from "../../lib/theory/pitch";
import { keySignatureAccidentals } from "../../lib/theory/scale";

export type VexFlowModule = typeof import("vexflow/bravura");

let modulePromise: Promise<VexFlowModule> | null = null;

/** VexFlow는 수업 화면에서만 받는다(수업 고르기 화면을 가볍게 하려고 따로 나눈다). */
export function loadVexFlow(): Promise<VexFlowModule> {
  modulePromise ??= import("vexflow/bravura").then(async (m) => {
    try {
      // 음표·음자리표 글꼴이 준비되기 전에 그리면 엉뚱한 글자가 잠깐 보인다
      await document.fonts.load("30pt Bravura");
    } catch {
      /* 글꼴 확인에 실패해도 그리기는 계속한다 */
    }
    return m;
  });
  return modulePromise;
}

/** VexFlow가 쓰는 그림 크기 단위. 화면에는 viewBox로 맞춰 늘이거나 줄인다. */
export const LINE_SPACING = 10;

export interface StaveInfo {
  tonic: string;
  /** 오선 전체 폭(조표 포함) */
  width: number;
  /** 음을 놓을 수 있는 가로 구간 */
  noteStartX: number;
  noteEndX: number;
  /** 맨 윗줄·맨 아랫줄의 y */
  topLineY: number;
  bottomLineY: number;
  /** 오선·음자리표·조표를 그린 SVG 조각 */
  html: string;
}

export interface ColumnArt {
  /** 음표(머리·덧줄·임시표)를 그린 SVG 조각. 가운데가 x=0 */
  html: string;
  /** 음마다 머리의 y 좌표 */
  ys: number[];
  /** 가장 왼쪽(임시표 포함)에서 가장 오른쪽까지 그림의 반폭(겹침 계산용) */
  halfWidth: number;
}

const MARGIN_X = 8;
const TOP_Y = 24;

function makeContext(vf: VexFlowModule, width: number, height: number) {
  const host = document.createElement("div");
  const renderer = new vf.Renderer(host, vf.Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();
  return { host, ctx };
}

/** VexFlow가 바깥 <svg>에 둔 기본 표현 속성(글꼴, 선 굵기 등). 조각을 옮길 때 같이 가져간다. */
const ROOT_PRESENTATION = [
  "pointer-events",
  "stroke-width",
  "stroke-dasharray",
  "fill",
  "stroke",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
] as const;

/** 그림 색은 CSS(currentColor)가 정한다. VexFlow가 쓴 검정·회색 기본색을 바꿔 넣는다. */
const DEFAULT_COLORS = "black|#000000|#000|#444444|#444|#999999|#999";
function themeable(svgInner: string): string {
  return svgInner
    .replace(new RegExp(`(fill|stroke)="(${DEFAULT_COLORS})"`, "g"), '$1="currentColor"')
    .replace(new RegExp(`(fill|stroke):\\s*(${DEFAULT_COLORS})`, "g"), "$1:currentColor");
}

function innerSvg(host: HTMLElement): string {
  const svg = host.querySelector("svg");
  if (!svg) return "";
  const attrs = ROOT_PRESENTATION.map((name) => {
    const value = svg.getAttribute(name);
    return value === null ? "" : ` ${name}="${value}"`;
  }).join("");
  return `<g${themeable(attrs)}>${themeable(svg.innerHTML)}</g>`;
}

const staveCache = new Map<string, { info: StaveInfo; stave: InstanceType<VexFlowModule["Stave"]> }>();

export function makeStave(vf: VexFlowModule, tonic: string, width: number) {
  const key = `${tonic}|${width}`;
  const cached = staveCache.get(key);
  if (cached) return cached;
  const height = 120;
  const { host, ctx } = makeContext(vf, width, height);
  const stave = new vf.Stave(MARGIN_X, TOP_Y, width - MARGIN_X * 2, { spacingBetweenLinesPx: LINE_SPACING });
  stave.addClef("treble");
  if (tonic !== "C") stave.addKeySignature(tonic);
  stave.setContext(ctx).draw();
  const info: StaveInfo = {
    tonic,
    width,
    noteStartX: stave.getNoteStartX(),
    noteEndX: stave.getNoteEndX(),
    topLineY: stave.getYForLine(0),
    bottomLineY: stave.getYForLine(4),
    html: innerSvg(host),
  };
  const entry = { info, stave };
  staveCache.set(key, entry);
  return entry;
}

function vexKey(p: Pitch): string {
  const acc = p.acc === 1 ? "#" : p.acc === -1 ? "b" : "";
  return `${p.letter.toLowerCase()}${acc}/${p.octave}`;
}

const columnCache = new Map<string, ColumnArt>();

/** 음 열 하나를 그린다. pitchTexts는 아래에서 위로("C4", "E4", "G4"). */
export function engraveColumn(
  vf: VexFlowModule,
  stave: InstanceType<VexFlowModule["Stave"]>,
  tonic: string,
  staveWidth: number,
  pitchTexts: readonly string[],
): ColumnArt {
  const cacheKey = `${tonic}|${staveWidth}|${pitchTexts.join(",")}`;
  const cached = columnCache.get(cacheKey);
  if (cached) return cached;

  const pitches = pitchTexts.map((t) => parsePitch(t) as Pitch);
  const sig = keySignatureAccidentals(tonic);
  const { host, ctx } = makeContext(vf, staveWidth, 160);

  const note = new vf.StaveNote({ keys: pitches.map(vexKey), duration: "w", clef: "treble" });
  pitches.forEach((p, i) => {
    if (p.acc !== sig[p.letter]) {
      const symbol = p.acc === 1 ? "#" : p.acc === -1 ? "b" : "n";
      note.addModifier(new vf.Accidental(symbol), i);
    }
  });
  note.setStave(stave);
  note.setContext(ctx);

  // 한 음표만 놓는 간단한 배치: 임시표 자리를 계산해 두고, 머리 가운데가 x=0이 되게 옮긴다
  vf.Formatter.SimpleFormat([note], 0);
  const tick = note.getTickContext();
  tick.setX(0);
  const centerAtZero = (note.getNoteHeadBeginX() + note.getNoteHeadEndX()) / 2;
  tick.setX(-centerAtZero);

  note.draw();
  const ys = note.getYs();
  const headHalf = (note.getNoteHeadEndX() - note.getNoteHeadBeginX()) / 2;
  const art: ColumnArt = { html: innerSvg(host), ys, halfWidth: headHalf + 16 };
  columnCache.set(cacheKey, art);
  return art;
}
