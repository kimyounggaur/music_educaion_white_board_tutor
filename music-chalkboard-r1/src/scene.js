// 장면 만들기: 칠판에 쓸 것을 "순서대로 쓰는 길"의 목록으로 바꾼다.
// 글씨는 글꼴 윤곽 + 뽑아 둔 획, 악보는 직접 계산한 길이다.
import { describeInterval } from './theory/interval.js';
import { bounds, chaikin, ellipseArc, hashString, resample, rng, wobble, cumulative } from "./util.js";
import { CLEF_BOX, accidentalUnits, clefUnits, diatonicIndex, ledgerIndices, noteY, signatureSymbols, bracketUnits, diagramSymbolUnits } from "./symbols.js";
import { activeGroups, columnGroupIds, getColumns } from "./scene-model.js";
import { formatPitch, parsePitch } from "./theory/pitch.js";
import { accidentalEvents, DEFAULT_KEY, isSupportedKey, keySignatureAccidentals } from "./theory/scale.js";
import { describeChord, formatNoteLabel, keyNameKo } from "./theory/korean.js";
import { fallbackFamily, fitVisibleRows, glyphUnits, layoutParagraph } from "./text-layout.js";
export { hasGlyphs, measureText, setTextFontAvailability } from "./text-layout.js";

/** 화면 방향별 크기와 자리(논리 단위) */
export function metricsFor(portrait) {
  return portrait
    ? { portrait: true, W: 480, H: 640, u: 16, x0: 24, x1: 456 }
    : { portrait: false, W: 1000, H: 620, u: 22, x0: 64, x1: 936 };
}

function placeGlyph(token, x, baseY, seed, ink, id, textRunId) {
  const { ch, glyph, fontSize } = token;
  const [advance, inkBox, centerlines, thickness] = glyph;
  const rand = rng(seed);
  const scale = fontSize / glyphUnits;
  const rot = (rand() - 0.5) * 3.4 * Math.PI / 180;
  const dy = (rand() - 0.5) * 0.045 * fontSize;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const center = advance * scale / 2;
  const tx = x + center - cos * center;
  const ty = baseY + dy - sin * center;
  const transform = (px, py) => [tx + (px * cos - py * sin) * scale, ty + (px * sin + py * cos) * scale];
  const isDot = ch === "." || ch === "·";
  const [left, top, right, bottom] = inkBox;
  let paths = centerlines;
  if (isDot) {
    const x = (left + right) / 2;
    const y = (top + bottom) / 2;
    paths = [[x, y, x, y]];
  } else if (ch === ",") {
    const x = left + (right - left) * .63;
    const y = top + (bottom - top) * .26;
    paths = [[x, y, x, y], [x, y, x, (y + bottom) / 2, left + (right - left) * .22, bottom]];
  }
  const strokes = paths.map(flat => {
    const points = [];
    for (let i = 0; i + 1 < flat.length; i += 2) points.push(transform(flat[i], flat[i + 1]));
    const pts = points.length > 2 ? resample(chaikin(points, 1), 1.4) : points;
    const cum = cumulative(pts);
    return { pts, cum, len: cum[cum.length - 1] ?? 0 };
  });
  const stemPx = Math.max(thickness, 90) * scale;
  const revealW = isDot ? Math.hypot(right - left, bottom - top) * scale : stemPx * 1.9;
  const box = bounds([transform(left, top), transform(left, bottom), transform(right, top), transform(right, bottom)]);
  const pad = Math.max(2, revealW / 2);
  return {
    type: "glyph", id, ink, ch, textRunId, size: fontSize,
    textStart: token.offset ?? undefined, textEnd: token.end ?? undefined,
    fontTransform: [cos, sin, -sin, cos, tx, ty], strokes, stemPx, revealW,
    bbox: { x0: box.x0 - pad, y0: box.y0 - pad, x1: box.x1 + pad, y1: box.y1 + pad },
  };
}

function lineItems(row, { x, baseY, size, align = "left", ink = "main", idPrefix, seed }) {
  let position = align === "center" ? x - row.width / 2 : x;
  const output = [];
  for (const [i, token] of row.tokens.entries()) {
    if (token.space) {
      if (output.length) output.at(-1).spaceAfter = true;
    } else {
      const id = `${idPrefix}/${token.offset ?? `prefix-${i}`}`;
      if (token.glyph) output.push(placeGlyph(token, position, baseY, seed + (token.offset ?? i) * 977, ink, id, idPrefix));
      else output.push({
        type: "text", id, text: token.ch, x: position, baseY, size, ink, width: token.inkWidth,
        fontFamily: fallbackFamily(), textStart: token.offset ?? undefined, textEnd: token.end ?? undefined,
        textDuration: Math.min(.85, .16 + .025 * ((token.end ?? 1) - (token.offset ?? 0))),
      });
    }
    position += token.width;
  }
  return output;
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

function textFields(doc, portrait, metrics) {
  const maxWidth = metrics.x1 - metrics.x0 - 4;
  const fields = [];
  const add = (field, text, start, maxRows, size, minSize, prefix = "", group = field, ink = "main") => {
    if (typeof text !== "string" || !text.trim()) return null;
    const layout = layoutParagraph(text, { size, minSize, maxRows, maxWidth, prefix });
    const result = { field, group, text, layout, start, maxRows, maxWidth, ink };
    fields.push(result);
    return result;
  };
  add("question", doc.question, portrait ? 58 : 72, 2, portrait ? 29 : 36, 22, "Q. ");
  add("caption", doc.caption, portrait ? 532 : 525, 3, portrait ? 25 : 28, 20);
  if (doc.templateId === "text-explanation") {
    const blocks = Array.isArray(doc.content?.blocks) ? doc.content.blocks : [];
    const first = portrait ? 173 : 169;
    const bottom = portrait ? 470 : 466;
    let size = portrait ? 25 : 31;
    while (size > 20) {
      const height = blocks.reduce((sum, block) => {
        if (typeof block.text !== "string" || !block.text.trim()) return sum;
        const preview = layoutParagraph(block.text, { size, maxWidth });
        return sum + size * 1.27 * preview.rows.length + 12;
      }, 0);
      if (height - 12 <= bottom - first) break;
      size--;
    }
    let baseline = first;
    for (const [index, block] of blocks.entries()) {
      const maxRows = Math.max(0, Math.floor((bottom - baseline - size * .32) / (size * 1.27)) + 1);
      const item = add(`content.blocks.${index}.text`, block.text, baseline, maxRows, size, size, "", `body/${block.id}`, block.ink);
      if (item) baseline += item.layout.rows.length * item.layout.lineHeight + 12;
    }
  }
  return fields;
}

function mapNotation(doc, portrait, metrics) {
  if (!["chord-stack","note-selection"].includes(doc.templateId)) return null;
  const key = isSupportedKey(doc.content?.key) ? doc.content.key : DEFAULT_KEY;
  const signature = signatureSymbols(keySignatureAccidentals(key.tonic, key.mode));
  const columns = getColumns(doc).filter(col => col.notes?.length).map(col => ({
    ...col, notes: col.notes.filter(note => parsePitch(note.pitch)),
  })).filter(col => col.notes.length);
  const events = accidentalEvents(columns, key);
  const groups = columns.map(column => {
    const lanes = [];
    const notes = column.notes.map((note, index) => {
      const pitch = parsePitch(note.pitch);
      const offset = index > 0 && diatonicIndex(note.pitch) - diatonicIndex(column.notes[index - 1].pitch) === 1;
      const symbol = events.get(note.id)?.accidental;
      let lane = null;
      if (symbol) {
        const position = diatonicIndex(note.pitch);
        lane = lanes.findIndex(positions => positions.every(other => Math.abs(other - position) >= 5));
        if (lane === -1) { lane = lanes.length; lanes.push([]); }
        lanes[lane].push(position);
      }
      return { ...note, pitch, offset, symbol, lane };
    });
    const labelRoom = ["chord","dyad"].includes(column.kind) && column.labelMode !== "none" ? 2.8 : 0;
    return { column, notes, labelRoom, minimum: (["chord","dyad"].includes(column.kind) ? 3.5 : 2.6) + lanes.length * 1.1 + labelRoom };
  });
  const reserved = 4.2 + signature.length * 1.12;
  const needed = reserved + groups.reduce((total, group) => total + group.minimum, 0);
  const u = Math.min(metrics.u, (metrics.x1 - metrics.x0) / needed);
  const offset = metrics.x0 + reserved * u;
  const extra = (metrics.x1 - offset) - groups.reduce((total, group) => total + group.minimum * u, 0);
  let left = offset;
  for (const group of groups) {
    const laneCount = Math.max(0, ...group.notes.map(note => (note.lane ?? -1) + 1));
    const width = group.minimum * u + extra / Math.max(groups.length, 1);
    const center = left + (width + (laneCount * .88 - group.labelRoom) * u) / 2;
    group.cx = groups.length === 1 ? Math.max(center, metrics.x0 + (metrics.x1 - metrics.x0) * .55) : center;
    group.labelX = left + width - group.labelRoom * u * .48;
    group.maxLabelWidth = width - 3;
    left += width;
  }
  return { key, signature, groups, u, overflow: u < (portrait ? 12 : 15) };
}

function mapDiagram(doc, portrait, metrics) {
  const c=doc.content, items=Array.isArray(c.items)?c.items:[], n=items.length, issues=[];
  const top=portrait?173:169, bottom=portrait?470:466, width=metrics.x1-metrics.x0;
  const cells=[]; const labels=[];
  const addText=(group,text,x,baseY,maxWidth,size,maxRows,ink)=>{
    if(!text?.trim())return;
    const layout=layoutParagraph(text,{size,minSize:14,maxWidth,maxRows});
    if(layout.overflow) issues.push({field:'content.items',message:'도식의 글자가 자리를 넘어요. 글자를 줄이거나 장면을 나누어 주세요.'});
    labels.push({group,text,x,baseY,maxWidth,layout,ink,maxRows});
  };
  if (c.kind==='sequence') {
    const maxColumns=portrait?3:5, rows=Math.ceil(n/maxColumns)||1, rowHeight=(bottom-top)/rows;
    items.forEach((item,index)=>{
      const row=Math.floor(index/maxColumns), start=row*maxColumns, count=Math.min(maxColumns,n-start), column=index%maxColumns;
      const arrow=portrait?20:30, cellWidth=(width-arrow*(count-1))/count, height=Math.min(110,cellWidth*.62,rowHeight-65);
      const x=metrics.x0+column*(cellWidth+arrow),y=top+row*rowHeight;
      const cell={item,x,y,width:cellWidth,height,row};cells.push(cell);
      addText(`box-label/${item.id}`,item.label,x+cellWidth/2,y+height*.72,cellWidth-10,Math.min(height*.5,40),2,item.ink);
      addText(`box-sub/${item.id}`,item.sub,x+cellWidth/2,y+height+17,cellWidth-6,portrait?17:21,2,item.ink);
    });
  } else if(c.kind==='ladder') {
    const cellWidth=width/Math.max(n,1), rise=Math.min(32,(bottom-top-115)/Math.max(n,1)), base=bottom-85;
    items.forEach((item,index)=>{
      const x=metrics.x0+index*cellWidth,y=base-index*rise;
      const cell={item,x,y,width:cellWidth,height:rise};cells.push(cell);
      addText(`box-label/${item.id}`,item.label,x+cellWidth/2,y-16,cellWidth-8,portrait?22:30,2,item.ink);
      addText(`box-sub/${item.id}`,item.sub,x+cellWidth/2,bottom-45,cellWidth-6,portrait?16:20,2,item.ink);
    });
  } else {
    const gap=width/Math.max(n,1), y=top+145;
    items.forEach((item,index)=>{
      const x=metrics.x0+index*gap;
      const cell={item,x,y:y-8,width:gap,height:16};cells.push(cell);
      addText(`box-label/${item.id}`,item.label,x+gap/2,y-63,gap-6,portrait?19:25,3,item.ink);
      addText(`box-sub/${item.id}`,item.sub,x+gap/2,y+34,gap-6,portrait?16:21,3,item.ink);
    });
  }
  return {cells,labels,issues,kind:c.kind,top,bottom,metrics};
}

function drawDiagram(doc,diagram,put,seed) {
  const {cells,labels,kind,metrics,bottom}=diagram, c=doc.content;
  const line=(group,role,paths,ink='main')=>put(group,paths.map((pts,index)=>({type:'line',role,id:`${role}-${index}`,ink,drawDuration:role==='box'?(kind==='ladder'?.3:kind==='line'?.1:.5):undefined,strokes:[lineStroke(pts,2.4,seed+hashString(group)+index,.25)],pen:0})),group);
  if(kind==='line') {const y=cells[0]?.y+8;line('axis','axis',[[[metrics.x0,y],[metrics.x1,y]]]);}
  for(const [index,cell] of cells.entries()) {
    const {item,x,y,width,height}=cell;
    if(kind==='sequence') line(`box/${item.id}`,'box',diagramSymbolUnits('box').map(path=>path.map(([px,py])=>[x+px*width,y+py*height])),item.ink);
    else if(kind==='ladder') line(`box/${item.id}`,'box',[[[x,y+height],[x,y],[x+width,y]]],item.ink);
    else line(`box/${item.id}`,'box',[[[x+width/2,y],[x+width/2,y+height]]],item.ink);
    if(kind==='sequence' && c.arrows && index>0) {
      const prev=cells[index-1];
      if(prev.row===cell.row) {
        const x0=prev.x+prev.width+3,x1=x-4,cy=y+height/2;
        line(`arrow/${item.id}`,'arrow',[[[x0,cy],[x1,cy]],[[x1-5,cy-5],[x1,cy],[x1-5,cy+5]]],'accent');
      } else {
        const cx=x+width/2,ey=y-2;
        line(`arrow/${item.id}`,'arrow',[[[cx,ey-14],[cx,ey]],[[cx-5,ey-5],[cx,ey],[cx+5,ey-5]]],'accent');
      }
    }
  }
  if(kind==='ladder') for(const [index,type] of (c.hairpins??[]).entries()) {
    const x0=metrics.x0+12,x1=metrics.x1-12,y=bottom-20+index*13,half=5;
    line(`hairpin/${type}`,'hairpin',type==='up'?[[[x0,y],[x1,y-half]],[[x0,y],[x1,y+half]]]:[[[x0,y-half],[x1,y]],[[x0,y+half],[x1,y]]],'accent');
  }
  for(const label of labels) put(label.group,fitVisibleRows(label.layout,label.maxRows,label.maxWidth).flatMap((row,index)=>lineItems(row,{x:label.x,baseY:label.baseY+index*label.layout.lineHeight,size:label.layout.size,align:'center',ink:label.ink,idPrefix:`line${index}`,seed:seed+hashString(label.group)})),label.text);
}

function prepareLayout(doc, portrait) {
  const metrics = metricsFor(portrait);
  const fields = textFields(doc, portrait, metrics);
  const notation = mapNotation(doc, portrait, metrics);
  const diagram = doc.templateId === "diagram" ? mapDiagram(doc, portrait, metrics) : null;
  const issues = fields.filter(field => field.layout.overflow).map(field => ({
    field: field.field,
    message: `${field.field === "question" ? "질문" : field.field === "caption" ? "정리 문장" : "본문"}이 칠판 영역을 넘어요. 문장을 줄이거나 장면을 나눠 주세요.`,
  }));
  if (notation?.overflow) issues.push({
    field: "content.columns", message: "이 화면에서 음표 사이가 좁아요. 여러 장면으로 열을 나누면 더 크게 표시됩니다.",
  });
  if (diagram) issues.push(...diagram.issues);
  if (notation && Array.isArray(doc.content.intervals)) {
    const yb=portrait?321:315, u=notation.u;
    const spots=new Map(notation.groups.flatMap(g=>g.notes.map(n=>[n.id,{x:g.cx,y:noteY(formatPitch(n.pitch),yb,u)}])));
    const question=fields.find(field=>field.field==='question');
    const questionBottom=question ? question.start+(question.layout.rows.length-1)*question.layout.lineHeight+question.layout.size*.3 : 100;
    for (const interval of doc.content.intervals) {
      const a=spots.get(interval.from),b=spots.get(interval.to); if(!a||!b||a.x===b.x)continue;
      const top=Math.min(yb-6*u,a.y-2*u,b.y-2*u)-1.5*u;
      if(top<questionBottom || (top<metrics.H*.1 && Math.max(a.x,b.x)>metrics.W/2)) issues.push({field:'content.intervals',message:'음정 표시가 질문이나 고정 문구 자리와 겹쳐요. 음역을 낮추거나 장면을 나누어 주세요.'});
    }
  }
  return { metrics, fields, notation, diagram, issues };
}

export function checkDocumentLayout(doc) {
  const landscape = prepareLayout(doc, false);
  const portrait = prepareLayout(doc, true);
  const errors = landscape.issues;
  const warnings = portrait.issues.filter(issue => !errors.some(error => error.field === issue.field))
    .map(issue => ({ ...issue, message: `세로 화면: ${issue.message}` }));
  const counts = {};
  for (const [orientation, layout] of [["landscape", landscape], ["portrait", portrait]]) {
    for (const field of layout.fields) {
      (counts[field.field] ??= {})[orientation] = field.layout.rows.length;
    }
  }
  return { errors, warnings, counts, portraitOverflow: warnings.length > 0 };
}

function accidentalItem(symbol, x, y, u, seed, id, role = "accidental") {
  const strokes = accidentalUnits(symbol).map((path, index) =>
    lineStroke(path.map(([px, py]) => [x + px * u, y + py * u]), Math.max(1.7, u * 0.14), seed + index, u * 0.015));
  return { type: "line", role, id, ink: "main", strokes, pen: 0, symbol, cx: x, cy: y };
}

function drawNotation(doc, portrait, metrics, notation, put, seed) {
  const { key, signature, groups, u } = notation;
  const { x0, x1 } = metrics;
  const yb = portrait ? 321 : 315;
  const staff = [0, 1, 2, 3, 4].map(i => lineStroke([[x0, yb - i * u], [x1, yb - i * u]], Math.max(2, .11 * u), seed + 101 + i, .03 * u));
  put("staff", [{ type: "line", role: "staff", id: "staff", ink: "main", strokes: staff, pen: 2, parallel: true }], "다섯 줄 오선");
  const clefLeft = x0 + .55 * u;
  const clefPts = clefUnits().map(([x, y]) => [clefLeft + x * u, yb - u + y * u]);
  put("clef", [{ type: "line", role: "clef", id: "clef", ink: "main", strokes: [lineStroke(clefPts, Math.max(2.5, .19 * u), seed + 202, .03 * u)], pen: 0 }], "높은음자리표");

  if (signature.length) {
    const items = signature.map(({ symbol, pitch }, index) => accidentalItem(symbol, x0 + (3.6 + index * 1.12) * u, noteY(pitch, yb, u), u, seed + index * 31, `key/${index}`, "key-signature"));
    if (doc.content.splitSignature) items.forEach((item,index)=>put(`key-signature/${index+1}`,[item],`조표 ${index+1}번째`));
    else put("key-signature", items, `${keyNameKo(key.tonic, key.mode)} 조표 ${signature.map(({ symbol, pitch }) => pitch[0] + symbol).join(" · ")}`);
  }

  const labelAt = (group, text, x, y, size, width, ink = "main", roman = false) => {
    if (!text) return put(group, []);
    const layout = layoutParagraph(text, { size, minSize: 14, maxWidth: width, maxRows: 1, letterSpacing: roman ? -.045 : .02 });
    const rows = fitVisibleRows(layout, 1, width);
    put(group, rows.flatMap((row, index) => lineItems(row, {
      x, baseY: y, size: layout.size, ink, align: "center", idPrefix: `line${index}`, seed: seed + hashString(group),
    })), text);
  };
  const circle = (group, x, y, rx, ry, label) => put(group, [{
    type: "line", role: "circle", id: "circle", ink: "accent",
    strokes: [circleStroke(x, y, rx, ry, u, seed + 606)], pen: 0,
  }], label);
  let previous;
  let countIndex = 0;
  const noteSpots = new Map();
  for (const { column, notes, cx, maxLabelWidth, labelRoom, labelX } of groups) {
    const spots = [];
    if (column.labelMode === "count") countIndex++;
    let lastSideLabelY = Infinity;
    for (const [index, note] of notes.entries()) {
      const x = cx + (note.offset ? .8 * u : 0);
      const noteName = formatPitch(note.pitch);
      const y = noteY(noteName, yb, u);
      const id = `note/${note.id}`;
      const ledger = ledgerIndices(diatonicIndex(noteName));
      const elements = ledger.map(li => {
        const ly = yb - (li - 30) * u / 2;
        return { type: "line", role: "ledger", id: `ledger${li}`, ink: "main",
          strokes: [lineStroke([[x - 1.26 * u, ly], [x + 1.26 * u, ly]], Math.max(2, .13 * u), seed + li * 13, .035 * u)], pen: 0 };
      });
      if (note.symbol) elements.push(accidentalItem(note.symbol, cx - (1.5 + note.lane * 1.06) * u, y, u * .84, seed + index * 23, "accidental"));
      elements.push({
        type: "line", role: "head", id: "head", ink: "main",
        strokes: [headStroke(x, y, u, seed + note.pitch.midi * 31 + index)],
        pen: 0, noteId: note.id, noteName, midi: note.pitch.midi, columnId: column.id, cx: x, cy: y, noteWidth: u * 1.92, noteHeight: u * 1.3,
      });
      put(id, elements, `${formatNoteLabel(noteName, "fixed-do", key)} ${noteName}`);
      spots.push({ x, y });
      noteSpots.set(note.id,{x,y,column:column.id,pitch:noteName});
      if (column.labelMode !== "none") {
        const size = Math.max(20, u * 1.32);
        const text = column.labelMode === "count" ? String(countIndex) : formatNoteLabel(noteName, column.labelMode, key);
        const blockX = ["chord","dyad"].includes(column.kind) ? labelX : x;
        const blockY = ["chord","dyad"].includes(column.kind) ? Math.min(lastSideLabelY - (labelRoom ? u * 1.22 : 0), y + .34 * u) : yb + 2.48 * u;
        lastSideLabelY = blockY;
        if (column.labelMode === "both" && !["chord","dyad"].includes(column.kind) && text.includes(" · ")) {
          const [first, second] = text.split(" · ");
          const combined = [first, second].flatMap((row, rowIndex) => {
            const layout = layoutParagraph(row, { size, minSize: 14, maxWidth: maxLabelWidth, maxRows: 1 });
            return fitVisibleRows(layout, 1, maxLabelWidth).flatMap(r => lineItems(r, {
              x: blockX, baseY: blockY + rowIndex * size * 1.12, size: layout.size, align: "center",
              idPrefix: `label-line${rowIndex}`, seed: seed + hashString(note.id) + rowIndex,
            }));
          });
          put(`label/${note.id}`, combined, text);
        } else labelAt(`label/${note.id}`, text, blockX, blockY, size, ["chord","dyad"].includes(column.kind) ? Math.max(18, labelRoom * u - 2) : maxLabelWidth);
      }
      if (column.highlightNoteIds?.includes(note.id)) circle(`emphasis/${note.id}`, x, y, 1.32 * u, .98 * u, `${formatNoteLabel(noteName, "fixed-do", key)} 강조`);
    }
    if (column.kind === "chord" || column.kind === "dyad") {
      const ids = columnGroupIds(column);
      const chord = doc.schemaVersion === 1
        ? { name: column.legacyName ?? "", roman: column.legacyRoman ?? "" }
        : column.kind === "dyad" ? describeInterval(notes[0].pitch, notes[1].pitch) : describeChord(column, key, doc.templateVersion === 3);
      const lowest = Math.max(...spots.map(spot => spot.y));
      const highest = Math.min(...spots.map(spot => spot.y));
      const baseline = Math.max(yb + 2.85 * u, lowest + 2.65 * u);
      if (column.showName) labelAt(ids.name, [chord.name, column.teacherMemo && `메모 ${column.teacherMemo}`].filter(Boolean).join(" · "), cx, baseline, Math.max(23, u * 1.42), maxLabelWidth);
      if (column.showRoman) labelAt(ids.roman, chord.roman, cx, baseline + 1.38 * u, Math.max(21, u * 1.15), maxLabelWidth, "dim", true);
      if (column.emphasis) {
        const left = Math.min(...spots.map(spot => spot.x));
        const right = Math.max(...spots.map(spot => spot.x));
        circle(ids.emphasis, (left + right) / 2, (lowest + highest) / 2, (right - left) / 2 + 1.45 * u, (lowest - highest) / 2 + .96 * u, "화음 강조");
      }
    }
    if (doc.content?.showGaps && previous && previous.column.kind === "note" && column.kind === "note") {
      const diff = Math.abs(notes[0].pitch.midi - previous.notes[0].pitch.midi);
      const word = diff === 1 ? "반음" : diff === 2 ? "온음" : diff === 3 ? "1음 반" : "";
      labelAt(`gap/${column.id}`, word, (previous.cx + cx) / 2, yb + 5.1 * u, Math.max(16, u * 1.08), (cx - previous.cx) - 4, "accent");
    }
    previous = { column, notes, cx };
  }
  for (const interval of doc.content.intervals ?? []) {
    const a=noteSpots.get(interval.from),b=noteSpots.get(interval.to);if(!a||!b)continue;
    const description=describeInterval(a.pitch,b.pitch), group=`interval/${interval.id}`;
    if (!description.name) { put(group,[]); continue; }
    if (a.column===b.column) {labelAt(group,description.name,a.x,Math.max(yb+3*u,a.y+2.7*u,b.y+2.7*u),Math.max(21,u*1.15),5*u,'accent');continue;}
    const x0=Math.min(a.x,b.x),x1=Math.max(a.x,b.x),y=Math.min(yb-6*u,a.y-2*u,b.y-2*u);
    const bracket={type:'line',role:'bracket',id:'bracket',ink:'accent',strokes:[lineStroke(bracketUnits((x1-x0)/u).map(([px,py])=>[x0+px*u,y+py*u]),Math.max(2,u*.13),seed+hashString(group),.015*u)],pen:0};
    const layout=layoutParagraph(description.name,{size:Math.max(21,u*1.15),minSize:14,maxRows:1,maxWidth:Math.max(70,x1-x0)});
    const label=fitVisibleRows(layout,1,Math.max(70,x1-x0)).flatMap(row=>lineItems(row,{x:(x0+x1)/2,baseY:y-.5*u,size:layout.size,align:'center',ink:'accent',idPrefix:'label',seed:seed+hashString(group)}));
    put(group,[bracket,...label],description.name);
  }
}

/** 저장된 장면 문서를 현재 방향의 그리기 항목으로 변환한다. */
export function buildDocumentScene(doc, portrait) {
  const { metrics, fields, notation, diagram, issues } = prepareLayout(doc, portrait);
  const groups = new Map(activeGroups(doc).map(id => [id, []]));
  const descriptions = new Map();
  const seed = Number.isInteger(doc.renderSeed) ? doc.renderSeed : 1;
  const lineCounts = {};
  const put = (group, items, description = "") => {
    if (!group) return;
    for (const item of items) {
      item.groupId = group;
      // 복제본의 그림은 원본과 같은 씨앗을 사용한다.
      item.seedId = `${group}/${item.id}`;
      item.id = `${doc.id}/${group}/${item.id}`;
    }
    groups.set(group, items);
    if (description) descriptions.set(group, description);
  };
  for (const field of fields) {
    const { group, text, layout, start, maxRows, maxWidth, ink } = field;
    lineCounts[field.field] = layout.rows.length;
    const rows = fitVisibleRows(layout, maxRows, maxWidth);
    put(group, rows.flatMap((row, index) => lineItems(row, {
      x: metrics.x0, baseY: start + index * layout.lineHeight, size: layout.size, ink,
      idPrefix: `line${index}`, seed: seed + hashString(group),
    })), text);
  }
  if (notation) drawNotation(doc, portrait, metrics, notation, put, seed);
  if (diagram) drawDiagram(doc,diagram,put,seed);
  const items = [];
  for (const step of doc.steps) {
    for (const id of step.groupIds) {
      if (!groups.has(id)) throw new Error(`표시할 수 없는 그룹: ${id}`);
      items.push(...groups.get(id));
    }
  }
  items.forEach((item, index) => item.index = index);
  return {
    key: doc.id, ...metrics, items, groups, descriptions, lineCounts, layoutErrors: issues,
    layoutWarnings: portrait ? issues : [], clefBox: CLEF_BOX,
    diagramItems: diagram?.cells.map(cell=>({id:cell.item.id,label:cell.item.label,x0:cell.x,y0:cell.y,x1:cell.x+cell.width,y1:cell.y+cell.height})) ?? [],
    noteColumns: notation?.groups.map(group => group.column.id) ?? [],
  };
}
