// 장면 만들기: 칠판에 쓸 것을 "순서대로 쓰는 길"의 목록으로 바꾼다.
// 글씨는 글꼴 윤곽 + 뽑아 둔 획, 악보는 직접 계산한 길이다.
import GLYPHS from "./glyph-data.json" with { type: "json" };
import { bounds, catmullRom, chaikin, ellipseArc, hashString, resample, rng, wobble, cumulative } from "./util.js";
import { CLEF_BOX, clefUnits, diatonicIndex, ledgerIndices, noteY } from "./symbols.js";

const UPM = GLYPHS.upm;
const SPACE_EM = 0.3;
const LETTER_EM = 0.035;

/** 이 앱의 획 자료로 문장 전체를 표현할 수 있는지 검사한다. */
export function hasGlyphs(text) {
  return [...text].every((ch) => ch === " " || !!GLYPHS.glyphs[ch]);
}

/** 화면 방향별 크기와 자리(논리 단위) */
export function metricsFor(portrait) {
  return portrait
    ? { portrait: true, W: 480, H: 640, u: 16, x0: 24, x1: 456, qBase: 66, qMax: 34, yb: 268, capBase: 566, capMax: 36 }
    : { portrait: false, W: 1000, H: 620, u: 22, x0: 64, x1: 936, qBase: 86, qMax: 46, yb: 298, capBase: 552, capMax: 48 };
}

export const SCENES = {
  chord: {
    label: "① 화음 쌓기(버금딸림화음)",
    caption: "함께 울리면 버금딸림화음이 돼요.",
  },
  notes: {
    label: "② 음 고르기(도·미·솔)",
    caption: "첫째, 셋째, 다섯째 음을 골라요.",
  },
};
export const QUESTION = "Q. 주요 3화음은 어떻게 만들어요?";

// ───────── 글자 ─────────
function advanceOf(ch, k) {
  if (ch === " ") return SPACE_EM * UPM * k;
  const g = GLYPHS.glyphs[ch];
  if (!g) throw new Error("글씨 자료에 없는 글자: " + ch);
  return g.a * k + LETTER_EM * UPM * k;
}

export function measureText(text, size) {
  const k = size / UPM;
  if (!hasGlyphs(text)) return [...text].reduce((w, ch) => w + (ch === " " ? 0.32 : /[\x00-\x7f]/.test(ch) ? 0.6 : 1) * size, 0);
  let w = 0;
  for (const ch of text) w += advanceOf(ch, k);
  return w - LETTER_EM * size;
}

/** 폭에 맞는 글자 크기(최대 크기 이하) */
export function fitSize(text, maxWidth, maxSize) {
  const w1 = measureText(text, 1);
  return Math.min(maxSize, maxWidth / w1);
}

/** 글자 하나의 옮겨 그리기: 글꼴 좌표 → 화면 좌표(작은 기울기·크기·높이 흔들림 포함) */
function placeGlyph(ch, x, baseY, size, seed, ink, id) {
  const g = GLYPHS.glyphs[ch];
  const rand = rng(seed);
  const k = (size / UPM) * (0.97 + rand() * 0.06);
  const rot = ((rand() - 0.5) * 3.4 * Math.PI) / 180; // ±1.7도
  const dy = (rand() - 0.5) * 0.06 * size;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  const cx = g.a / 2; // 글자 가운데를 기준으로 돌린다
  const tf = (px, py) => {
    const ax = px - cx;
    const ay = py;
    return [x + (g.a / 2) * k + (ax * cr - ay * sr) * k, baseY + dy + (ax * sr + ay * cr) * k];
  };
  // 윤곽 경로의 숫자 쌍을 모두 변환(절대 좌표 명령만 쓴다)
  const nums = g.d.match(/-?\d+(?:\.\d+)?|[A-Za-z]/g) || [];
  let out = "";
  let buf = [];
  const flush = () => {
    for (let i = 0; i + 1 < buf.length; i += 2) {
      const [tx, ty] = tf(buf[i], buf[i + 1]);
      out += (i ? " " : "") + Math.round(tx * 10) / 10 + " " + Math.round(ty * 10) / 10;
    }
    buf = [];
  };
  for (const t of nums) {
    if (/[A-Za-z]/.test(t)) {
      flush();
      out += t;
    } else buf.push(Number(t));
  }
  flush();

  const strokes = g.s.map((flat) => {
    const pts = [];
    for (let i = 0; i + 1 < flat.length; i += 2) pts.push(tf(flat[i], flat[i + 1]));
    const sm = pts.length > 2 ? resample(chaikin(pts, 1), 1.4) : pts;
    const cum = cumulative(sm);
    return { pts: sm, cum, len: cum[cum.length - 1] || 0 };
  });
  const stemPx = Math.max(g.w, 90) * k;
  const all = strokes.flatMap((s) => s.pts);
  const bb = bounds(all.length ? all : [[x, baseY]]);
  const pad = stemPx * 1.4;
  return {
    type: "glyph",
    id,
    ch,
    ink,
    outlineD: out,
    strokes,
    stemPx,
    revealW: stemPx * 1.9,
    brushW: stemPx * 1.3,
    bbox: { x0: bb.x0 - pad, y0: bb.y0 - pad, x1: bb.x1 + pad, y1: bb.y1 + pad },
  };
}

/** 글줄 하나를 글자 항목들로. align: left | center (기준 x) */
function textRun(text, { x, baseY, size, align = "left", ink = "main", idPrefix, seed }) {
  const total = measureText(text, size);
  // 글자가 하나라도 없으면 글줄 전체를 일반 글꼴로 표시한다.
  if (!hasGlyphs(text)) {
    const start = align === "center" ? x - total / 2 : x;
    return [{ type: "text", id: idPrefix, text, x: start, baseY, size, ink }];
  }
  let cx = align === "center" ? x - total / 2 : x;
  const k = size / UPM;
  const items = [];
  let i = 0;
  for (const ch of text) {
    const adv = advanceOf(ch, k);
    if (ch !== " ") {
      items.push(placeGlyph(ch, cx, baseY, size, seed + i * 977, ink, `${idPrefix}/${i}`));
      items[items.length - 1].gapBefore = false;
    } else if (items.length) {
      items[items.length - 1].spaceAfter = true;
    }
    cx += adv;
    i++;
  }
  return items;
}

// ───────── 악보 부품 ─────────
function lineStroke(pts, width, seed, wob) {
  const base = resample(pts, 3);
  const w = wobble(base, wob, seed, 80);
  const cum = cumulative(w);
  return { pts: w, cum, len: cum[cum.length - 1], width };
}

function headStroke(cx, cy, u, seed) {
  const rand = rng(seed);
  const rx = 0.86 * u * (1 + (rand() - 0.5) * 0.06);
  const ry = 0.52 * u * (1 + (rand() - 0.5) * 0.06);
  // 위쪽 왼쪽에서 시작해 반시계로 한 바퀴 조금 더
  const pts = ellipseArc(cx, cy, rx, ry, -20, -150, -372, 0.0, 8);
  const cum = cumulative(pts);
  return { pts, cum, len: cum[cum.length - 1], width: Math.max(2.4, 0.2 * u) };
}

function circleStroke(cx, cy, rx, ry, u, seed) {
  const rand = rng(seed);
  const pts = ellipseArc(cx, cy, rx, ry, -8, -105, -380, 0.05, 8);
  const w = wobble(pts, 0.06 * u, seed, 60);
  void rand;
  const cum = cumulative(w);
  return { pts: w, cum, len: cum[cum.length - 1], width: Math.max(2.6, 0.2 * u) };
}

/** 장면 만들기. 항목 순서가 곧 쓰는 순서다. */
export function buildScene(sceneKey, portrait) {
  const m = metricsFor(portrait);
  const { u, x0, x1, yb } = m;
  const seed0 = hashString("r1:" + sceneKey);
  const items = [];
  const push = (...a) => items.push(...a);

  // 1) 질문 줄
  const qSize = fitSize(QUESTION, x1 - x0, m.qMax);
  push(...textRun(QUESTION, { x: x0, baseY: m.qBase, size: qSize, ink: "main", idPrefix: "q", seed: seed0 + 11 }));

  // 2) 오선(다섯 줄을 한 번에)
  const staffStrokes = [0, 1, 2, 3, 4].map((i) =>
    lineStroke([[x0, yb - i * u], [x1, yb - i * u]], Math.max(2, 0.11 * u), seed0 + 101 + i, 0.03 * u),
  );
  push({ type: "line", role: "staff", id: "staff", ink: "main", strokes: staffStrokes, pen: 2, parallel: true });

  // 3) 음자리표
  const gY = yb - u; // G줄(아래에서 둘째 줄)
  const clefLeft = x0 + 0.9 * u;
  const clefPts = clefUnits().map(([cx, cy]) => [clefLeft + cx * u, gY + cy * u]);
  const clefW = wobble(resample(clefPts, 2.5), 0.03 * u, seed0 + 202, 90);
  const clefCum = cumulative(clefW);
  push({
    type: "line",
    role: "clef",
    id: "clef",
    ink: "main",
    strokes: [{ pts: clefW, cum: clefCum, len: clefCum[clefCum.length - 1], width: Math.max(3, 0.19 * u) }],
    pen: 0,
  });

  // 4) 설명 줄(아래쪽)
  const caption = SCENES[sceneKey].caption;
  const cSize = fitSize(caption, x1 - x0, m.capMax);
  push(...textRun(caption, { x: (x0 + x1) / 2, baseY: m.capBase, size: cSize, align: "center", ink: "main", idPrefix: "cap", seed: seed0 + 303 }));

  const labelSize = 1.5 * u;
  const labelBase = yb + 4.7 * u;
  const headRx = 0.86 * u;

  const addNote = (name, cx, idPrefix) => {
    const idx = diatonicIndex(name);
    const cy = noteY(name, yb, u);
    for (const li of ledgerIndices(idx)) {
      const ly = yb - (li - 30) * (u / 2);
      const half = headRx + 0.4 * u;
      push({
        type: "line",
        role: "ledger",
        id: `${idPrefix}/ledger${li}`,
        ink: "main",
        strokes: [lineStroke([[cx - half, ly], [cx + half, ly]], Math.max(2, 0.13 * u), seed0 + li * 13, 0.05 * u)],
        pen: 0,
      });
    }
    push({
      type: "line",
      role: "head",
      id: `${idPrefix}/head`,
      ink: "main",
      strokes: [headStroke(cx, cy, u, seed0 + idx * 31)],
      pen: 0,
      noteName: name,
    });
    return { cx, cy };
  };

  if (sceneKey === "chord") {
    const cx = x0 + (x1 - x0) * 0.62;
    const names = ["F4", "A4", "C5"];
    const spots = names.map((n, i) => addNote(n, cx, `ch/${i}`));
    // 화음 이름과 로마 숫자
    push(...textRun("버금딸림화음", { x: cx, baseY: labelBase, size: labelSize, align: "center", ink: "main", idPrefix: "name", seed: seed0 + 404 }));
    push(...textRun("IV", { x: cx, baseY: labelBase + 1.7 * u, size: labelSize * 0.8, align: "center", ink: "dim", idPrefix: "roman", seed: seed0 + 505 }));
    // 화음 전체를 감싸는 동그라미
    const cyMid = (spots[0].cy + spots[2].cy) / 2;
    const ry = (spots[0].cy - spots[2].cy) / 2 + 1.05 * u;
    push({
      type: "line",
      role: "circle",
      id: "circle/chord",
      ink: "accent",
      strokes: [circleStroke(cx, cyMid, 1.45 * u, ry, u, seed0 + 606)],
      pen: 0,
    });
  } else {
    const names = ["C4", "D4", "E4", "F4", "G4"];
    const labels = ["도", "레", "미", "파", "솔"];
    const xs0 = x0 + 7 * u;
    const xs1 = x1 - 2.6 * u;
    const spots = names.map((n, i) => {
      const cx = xs0 + ((xs1 - xs0) * i) / (names.length - 1);
      const s = addNote(n, cx, `n/${i}`);
      push(...textRun(labels[i], { x: cx, baseY: labelBase, size: labelSize, align: "center", ink: "main", idPrefix: `lab/${i}`, seed: seed0 + 700 + i }));
      return s;
    });
    // 첫째·셋째·다섯째 음에 동그라미
    [0, 2, 4].forEach((i, j) => {
      const s = spots[i];
      push({
        type: "line",
        role: "circle",
        id: `circle/${i}`,
        ink: "accent",
        strokes: [circleStroke(s.cx, s.cy, 1.45 * u, 1.05 * u, u, seed0 + 800 + j)],
        pen: 0,
      });
    });
  }

  // 나중에 쓸 수 있게 항목마다 일련번호를 매긴다
  items.forEach((it, i) => (it.index = i));
  return { key: sceneKey, ...m, items, clefBox: CLEF_BOX };
}

/** 저장된 장면 문서를 현재 방향의 그리기 항목으로 변환한다. */
export function buildDocumentScene(doc, portrait) {
  const m = metricsFor(portrait);
  const { u, x0, x1 } = m;
  // 높은 음과 낮은 음 모두 질문 및 설명 영역 안에 들어가도록 중앙에 배치한다.
  const yb = portrait ? 324 : 315;
  const seed = Number.isInteger(doc.renderSeed) ? doc.renderSeed : 1;
  const groups = new Map();
  const layoutErrors = [];
  const put = (group, items) => {
    for (const item of items) {
      item.groupId = group;
      // 복제된 장면의 외관은 원본과 동일하게 유지한다.
      item.seedId = `${group}/${item.id}`;
      item.id = `${doc.id}/${group}/${item.id}`;
    }
    groups.set(group, items);
  };
  const lineText = (group, text, x, y, size, ink = "main", align = "left") => {
    if (!text) return;
    const max = x1 - x0;
    // 줄바꿈은 공백 및 문자 경계 기준. 어느 한 글자라도 미지원이면 문장 전체에 일반 글꼴을 쓴다.
    const lines = [];
    for (const source of text.split("\n")) {
      let line = "";
      for (const ch of source) {
        if (line && measureText(line + ch, size) > max) { lines.push(line.trim()); line = ""; }
        line += ch;
      }
      lines.push(line.trim());
    }
    if (group === "question" && lines.length > 2) layoutErrors.push({field: "question", message: "질문이 칠판을 벗어나요. 문장을 줄여 주세요."});
    if (group === "caption" && lines.length > 3) layoutErrors.push({field: "caption", message: "정리 문장이 칠판을 벗어나요. 문장을 줄여 주세요."});
    const fallback = !hasGlyphs(text.replace(/\n/g, ""));
    const result = [];
    lines.forEach((line, i) => {
      if (!line) return;
      const args = { x, baseY: y + i * size * 1.2, size, ink, align, idPrefix: `${group}/line${i}`, seed: seed + hashString(group) + i * 101 };
      if (fallback && hasGlyphs(line)) {
        const width = measureText(line, size), px = align === "center" ? x - width / 2 : x;
        result.push({type: "text", id: args.idPrefix, text: line, x: px, baseY: args.baseY, size, ink});
      } else result.push(...textRun(line, args));
    });
    put(group, result);
  };
  lineText("question", doc.question ? `Q. ${doc.question}` : "", x0, portrait ? 53 : 65, portrait ? 29 : 36);
  lineText("caption", doc.caption, x0, portrait ? 527 : 526, portrait ? 25 : 28);
  if (doc.templateId === "text-explanation") {
    const blocks = doc.content.blocks;
    let y = portrait ? 177 : 184;
    const size = portrait ? 25 : 31;
    for (const block of blocks) {
      lineText(`body/${block.id}`, block.text, x0, y, size, block.ink);
      const lines = groups.get(`body/${block.id}`) || [];
      const lineCount = new Set(lines.map(item => item.type === "text" ? item.baseY : item.id.split("/").slice(0,-1).join("/"))).size || 1;
      y += size * 1.2 * lineCount + 12;
    }
    if (y - 12 > (portrait ? 464 : 448)) layoutErrors.push({field: "content.blocks", message: "본문이 칠판을 벗어나요. 문장을 줄이거나 장면을 나눠 주세요."});
  } else {
    const staff = [0,1,2,3,4].map(i => lineStroke([[x0, yb-i*u], [x1,yb-i*u]], Math.max(2, .11*u), seed+101+i, .03*u));
    put("staff", [{type:"line", role:"staff", id:"staff", ink:"main", strokes:staff, pen:2, parallel:true}]);
    const clefLeft=x0+.9*u, gY=yb-u;
    const cp=wobble(resample(clefUnits().map(([x,y])=>[clefLeft+x*u,gY+y*u]),2.5),.03*u,seed+202,90), cc=cumulative(cp);
    put("clef", [{type:"line",role:"clef",id:"clef",ink:"main",strokes:[{pts:cp,cum:cc,len:cc[cc.length-1],width:Math.max(3,.19*u)}],pen:0}]);
    const notes=doc.content.notes;
    const chord=doc.templateId === "chord-stack";
    const spots=[];
    notes.forEach((note,i)=>{
      const cx=chord ? x0+(x1-x0)*.62 : x0+6*u+(x1-x0-8.5*u)*i/Math.max(1,notes.length-1);
      const idx=diatonicIndex(note.pitch), cy=noteY(note.pitch,yb,u), id=`note/${note.id}`, elements=[];
      for(const li of ledgerIndices(idx)) {
        const ly=yb-(li-30)*u/2, half=1.26*u;
        elements.push({type:"line",role:"ledger",id:`ledger${li}`,ink:"main",strokes:[lineStroke([[cx-half,ly],[cx+half,ly]],Math.max(2,.13*u),seed+li*13,.05*u)],pen:0});
      }
      elements.push({type:"line",role:"head",id:"head",ink:"main",strokes:[headStroke(cx,cy,u,seed+idx*31+i)],pen:0,noteName:note.pitch});
      put(id,elements); spots.push({cx,cy});
      if (!chord && doc.content.showLabels) {
        const label=({C:"도",D:"레",E:"미",F:"파",G:"솔",A:"라",B:"시"})[note.pitch[0]];
        lineText(`label/${note.id}`,label,cx,yb+3.1*u,1.15*u,"main","center");
      }
    });
    const addCircle=(group,cx,cy,rx,ry)=>put(group,[{type:"line",role:"circle",id:"circle",ink:"accent",strokes:[circleStroke(cx,cy,rx,ry,u,seed+606)],pen:0}]);
    if (chord) {
      const cx=spots[0].cx;
      lineText("name",doc.content.chordName,cx,yb+3*u,1.25*u,"main","center");
      lineText("roman",doc.content.roman,cx,yb+4.5*u,u,"dim","center");
      if (doc.content.emphasis) addCircle("emphasis/chord",cx,(spots[0].cy+spots[2].cy)/2,1.45*u,Math.abs(spots[0].cy-spots[2].cy)/2+1.05*u);
    } else {
      notes.forEach((note,i)=>{ if(doc.content.highlightNoteIds.includes(note.id)) addCircle(`emphasis/${note.id}`,spots[i].cx,spots[i].cy,1.45*u,1.05*u); });
    }
  }
  const items=[];
  for (const step of doc.steps) {
    const ids=[...step.groupIds];
    // 같은 단계 내에서는 오선, 음자리표, 음표, 강조 순서를 보장한다.
    const priority=id=>id==="staff"?0:id==="clef"?1:id.startsWith("note/")?2:id.startsWith("emphasis/")?4:3;
    ids.sort((a,b)=>priority(a)-priority(b));
    for (const id of ids) {
      if (!groups.has(id)) throw new Error(`표시할 수 없는 그룹: ${id}`);
      items.push(...groups.get(id));
    }
  }
  items.forEach((item,index)=>item.index=index);
  return {key:doc.id, ...m, items, groups, layoutErrors, clefBox:CLEF_BOX};
}

export { catmullRom };
