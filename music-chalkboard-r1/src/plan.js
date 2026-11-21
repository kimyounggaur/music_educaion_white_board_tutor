// 판서 계획: 장면의 항목 순서대로 "손이 들어옴 → (옮김 → 쓰기)… → 나감" 구간을 시간표로 만든다.
// 모든 구간은 이어져 있고 겹치지 않는다. 시간은 초 단위, 계획 시작을 0으로 한다.
import { clamp, easeInOut, pointAt } from "./util.js";
import { parsePitch } from "./theory/pitch.js";

/** 속도별 시간표(설계서 6.7절 초기값). hop은 옮기는 시간의 배율 */
export const SPEEDS = {
  slow: { label: "느리게", cps: 7, head: 0.3, ledger: 0.1, circle: 0.4, staff: 1.0, clef: 1.2, bracket:0.4, box:0.9, arrow:0.45, axis:0.9, hairpin:0.72, hop: 1.6, enter: 0.3, leave: 0.4 },
  normal: { label: "보통", cps: 14, head: 0.16, ledger: 0.06, circle: 0.22, staff: 0.6, clef: 0.7, bracket:0.22, box:0.5, arrow:0.25, axis:0.5, hairpin:0.4, hop: 1.0, enter: 0.25, leave: 0.35 },
  fast: { label: "빠르게", cps: 24, head: 0.1, ledger: 0.04, circle: 0.14, staff: 0.4, clef: 0.45, bracket:0.14, box:0.32, arrow:0.16, axis:0.32, hairpin:0.25, hop: 0.7, enter: 0.25, leave: 0.35 },
};

const first = (stroke) => stroke.pts[0];
const last = (stroke) => stroke.pts[stroke.pts.length - 1];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** 장면과 속도로 계획을 만든다 */
export function buildPlan(scene, speedKey) {
  const sp = SPEEDS[speedKey] ?? SPEEDS.normal;
  const segs = [];
  let t = 0;
  let pen = [scene.W + 120, scene.H + 170]; // 판 밖(오른쪽 아래)
  let penInk = null;

  const hopTime = (d) => sp.hop * clamp(0.04 + (d / scene.W) * 0.26, 0.04, 0.22);

  const add = (seg) => {
    seg.t0 = t;
    t += seg.dur;
    seg.t1 = t;
    segs.push(seg);
  };

  const addHop = (to, ink, dur, kind = "hop") => {
    add({ type: kind, from: pen.slice(), to: to.slice(), dur, ink });
    pen = to.slice();
  };

  // 첫 구간: 손이 들어온다
  const firstItem = scene.items[0];
  if (!firstItem) return { segs, total: 0, speed: speedKey, sp };
  if (firstItem.type !== "text") {
    const firstPt = first(firstItem.strokes[firstItem.pen ?? 0]);
    addHop(firstPt, firstItem.ink, sp.enter, "enter");
  }
  penInk = firstItem.ink;

  const addDraw = (item, strokeIdxs, penIdx, dur) => {
    const strokes = strokeIdxs.map((si) => item.strokes[si]);
    add({
      type: "draw",
      item,
      parts: strokeIdxs.map((si) => ({ item, si })),
      pen: penIdx,
      dur,
      ink: item.ink,
      penStroke: strokes[penIdx],
    });
    pen = last(strokes[penIdx]).slice();
    penInk = item.ink;
  };

  let prevGlyphRun = null; // 같은 글줄에서 바로 앞 글자 항목
  for (let n = 0; n < scene.items.length; n++) {
    const item = scene.items[n];
    if (item.type === "text") {
      // 일반 글꼴 대체 문자는 획 대신 글자 자체를 표시한다.
      add({ type: "text", item, parts: [{item, si: 0}], dur: item.textDuration ?? 0.3, ink: item.ink, noHand: true });
      prevGlyphRun = null;
    } else if (item.type === "glyph") {
      const budget = 1 / sp.cps;
      const isRunStart = !prevGlyphRun || !item.id.startsWith(prevGlyphRun.id.split("/")[0] + "/") || prevGlyphRun.id.split("/")[0] !== item.id.split("/")[0];
      // 글줄의 첫 글자: 거리에 따른 별도 옮김
      const startPt = first(item.strokes[0]);
      if (isRunStart || dist(pen, startPt) > scene.W * 0.12) {
        const d = dist(pen, startPt);
        if (d > 0.5) addHop(startPt, item.ink, hopTime(d));
      }
      // 글자 안: 획 길이와 획 사이 이동 거리에 비례해 시간을 나눈다
      const parts = [];
      const hopIn = dist(pen, startPt);
      const spacePause = prevGlyphRun && prevGlyphRun.spaceAfter ? 0.35 : 0;
      if (hopIn > 0.5 || spacePause) parts.push({ k: "hop", to: startPt, w: hopIn * 0.5 + 3 + spacePause * 60 });
      let cur = pen;
      item.strokes.forEach((s, si) => {
        const st = first(s);
        if (si > 0) {
          parts.push({ k: "hop", to: st, w: dist(cur, st) * 0.5 + 3 });
        }
        parts.push({ k: "draw", si, w: s.len + 8 });
        cur = last(s);
      });
      const total = parts.reduce((a, p) => a + p.w, 0);
      for (const p of parts) {
        const dur = (p.w / total) * budget;
        if (p.k === "hop") addHop(p.to, item.ink, dur);
        else addDraw(item, [p.si], 0, dur);
      }
      prevGlyphRun = item;
    } else {
      prevGlyphRun = null;
      const penIdx = item.pen ?? 0;
      const startPt = first(item.strokes[penIdx]);
      const d = dist(pen, startPt);
      if (d > 0.5) addHop(startPt, item.ink, hopTime(d));
      const dur = Number.isFinite(item.drawDuration) && item.drawDuration > 0
        ? item.drawDuration * sp.circle / SPEEDS.normal.circle : sp[item.role] ?? sp.circle;
      addDraw(
        item,
        item.strokes.map((_, i) => i),
        penIdx,
        dur,
      );
    }
  }

  // 마지막: 손이 나간다
  if (scene.items[scene.items.length - 1].type !== "text") addHop([scene.W + 120, scene.H + 170], penInk, sp.leave, "leave");

  return { segs, total: t, speed: speedKey, sp };
}

/** 단계마다 독립적인 시간표를 만든다. 항목 인덱스는 전체 장면의 값을 유지한다. */
export function buildStepPlans(scene, steps, speedKey, carriedGroups = new Set()) {
  const notes = collectNoteHeads(scene);
  const shown = new Set(notes.filter(note => carriedGroups.has(`note/${note.noteId}`)).map(note => note.noteId));
  return steps.map(step => {
    const ids = new Set(step.groupIds);
    const items = scene.items.filter(item => ids.has(item.groupId) && !carriedGroups.has(item.groupId));
    const plan = buildPlan({ ...scene, items }, speedKey);
    const endings = new Map();
    for (const segment of plan.segs) {
      if (segment.item?.role === "head") endings.set(segment.item.index, segment.t1);
    }
    const newlyVisible = notes.filter(note => endings.has(note.index));
    for (const note of newlyVisible) shown.add(note.noteId);
    const columns = new Map();
    for (const note of newlyVisible) {
      if (!columns.has(note.columnId)) columns.set(note.columnId, []);
      columns.get(note.columnId).push(note);
    }
    const events = [];
    const add = (at, soundingNotes, suffix) => {
      if (!soundingNotes.length) return;
      events.push({
        eventId: `${step.id}/${suffix}`,
        stepId: step.id,
        noteIds: soundingNotes.map(note => note.noteId),
        midis: soundingNotes.map(note => note.midi),
        at,
      });
    };

    if (step.cue?.type === "listen") {
      const audible = notes.filter(note => shown.has(note.noteId));
      const listens = (step.cue.targets ?? []).map(target => notesForTarget(audible, target)).filter(group => group.length);
      return { ...plan, stepId:step.id, groupIds:step.groupIds, events, listens };
    }
    if (step.cue?.type !== "practice") {
      for (const [columnId, current] of columns) {
        const whole = notes.filter(note => note.columnId === columnId);
        if (whole.length > 1 && whole.every(note => shown.has(note.noteId))) {
          add(Math.max(...current.map(note => endings.get(note.index))), whole.filter(note => !carriedGroups.has(`note/${note.noteId}`)), `chord/${columnId}`);
        } else {
          for (const note of current) add(endings.get(note.index), [note], `note/${note.noteId}`);
        }
      }
    }
    events.sort((a,b) => a.at - b.at);
    return { ...plan, stepId:step.id, groupIds:step.groupIds, events, listens:[] };
  });
}

// Compare the drawing itself, never its random seed or object identity. Item IDs
// may differ between documents; group names and the ordered artwork may not.
const roundCoordinate = value => Math.round(value * 10) / 10;
function drawingIdentity(item) {
  return {
    type:item.type, ink:item.ink, role:item.role, ch:item.ch, text:item.text,
    spaceAfter:!!item.spaceAfter, size:item.size, width:item.width,
    x:item.x == null ? undefined : roundCoordinate(item.x),
    baseY:item.baseY == null ? undefined : roundCoordinate(item.baseY),
    fontFamily:item.fontFamily,
    fontTransform:item.fontTransform?.map(roundCoordinate),
    stemPx:item.stemPx, revealW:item.revealW,
    strokes:item.strokes?.map(stroke => ({
      width:stroke.width,
      pts:stroke.pts.map(point => point.map(roundCoordinate)),
    })),
  };
}

/** Visible groups whose entire artwork is unchanged in the next layout. */
export function reusableGroups(previous, next, visible = new Set(previous?.groups?.keys() ?? [])) {
  const reusable = new Set();
  if (!previous || !next || previous.portrait !== next.portrait) return reusable;
  for (const [id, items] of next.groups) {
    const before = previous.groups.get(id);
    if (!visible.has(id) || !before || before.length !== items.length) continue;
    if (JSON.stringify(before.map(drawingIdentity)) === JSON.stringify(items.map(drawingIdentity))) reusable.add(id);
  }
  return reusable;
}

/** The same logical note head backs visible controls, hit testing and sound. */
export function collectNoteHeads(scene) {
  return scene.items.filter(item => item.role === "head").flatMap(item => {
    const midi = item.midi ?? parsePitch(item.noteName || "")?.midi;
    if (!Number.isInteger(midi) || midi < 0 || midi > 127) return [];
    const noteId = item.noteId ?? item.groupId?.slice("note/".length);
    if (!noteId) return [];
    const pts = item.strokes[0].pts;
    const center = {
      x:item.cx ?? (Math.min(...pts.map(pt => pt[0])) + Math.max(...pts.map(pt => pt[0]))) / 2,
      y:item.cy ?? (Math.min(...pts.map(pt => pt[1])) + Math.max(...pts.map(pt => pt[1]))) / 2,
    };
    return [{
      index:item.index,
      noteId,
      pitch:item.noteName,
      midi,
      columnId:item.columnId ?? (scene.templateId === "chord-stack" ? "legacy-chord" : noteId),
      center,
      width:item.noteWidth ?? scene.u * 1.5,
      height:item.noteHeight ?? scene.u,
    }];
  }).sort((a,b) => (scene.noteColumns?.indexOf(a.columnId) ?? 0) - (scene.noteColumns?.indexOf(b.columnId) ?? 0)
    || a.center.x - b.center.x || a.index - b.index);
}

function notesForTarget(notes, target) {
  if (target.columnId) return notes.filter(note => note.columnId === target.columnId);
  if (target.noteId) return notes.filter(note => note.noteId === target.noteId);
  return [];
}

/** 구간 안에서의 진행 정도(0~1). 긴 구간은 천천히 시작해 빨라졌다가 멈춘다 */
export function segProgress(seg, t) {
  if (t <= seg.t0) return 0;
  if (t >= seg.t1) return 1;
  const lin = (t - seg.t0) / seg.dur;
  return seg.dur >= 0.12 ? easeInOut(lin) : lin;
}

/** t 시각에 손이 있어야 할 자리 */
export function penAt(plan, seg, t) {
  const p = segProgress(seg, t);
  if (seg.type === "draw") {
    const s = seg.penStroke;
    const [x, y, dx, dy] = pointAt(s.pts, s.cum, s.len * p);
    return { x, y, dx, dy, down: true, lift: 0 };
  }
  // 옮김 / 들어옴 / 나감: 부드럽게 이동하며 떠 있다
  const [fx, fy] = seg.from;
  const [tx, ty] = seg.to;
  const q = seg.type === "enter" ? 1 - (1 - p) * (1 - p) : seg.type === "leave" ? p * p : easeInOut(p);
  const dd = Math.hypot(tx - fx, ty - fy);
  let lift;
  if (seg.type === "enter") lift = 1 - p;
  else if (seg.type === "leave") lift = p;
  else lift = clamp(dd / 70, 0, 1) * Math.sin(Math.PI * p);
  const m = dd || 1;
  return { x: fx + (tx - fx) * q, y: fy + (ty - fy) * q, dx: (tx - fx) / m, dy: (ty - fy) / m, down: false, lift };
}
