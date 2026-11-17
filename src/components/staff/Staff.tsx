"use client";

import { useEffect, useMemo, useState } from "react";
import type { StaffColumn } from "../../lib/script/board";
import type { Lesson } from "../../lib/script/schema";
import { engraveColumn, loadVexFlow, makeStave, type ColumnArt, type StaveInfo, type VexFlowModule } from "./engrave";
import { extentAboveStaff, LABEL_SIZE, MIN_WIDTH, slotWidth, widestStep } from "./layout";

interface StaffProps {
  lesson: Lesson;
  columns: StaffColumn[];
  description: string;
}

interface Ready {
  vf: VexFlowModule;
  width: number;
  info: StaveInfo;
  stave: ReturnType<typeof makeStave>["stave"];
}

const SIDE = 8;

export function Staff({ lesson, columns, description }: StaffProps) {
  const [vf, setVf] = useState<VexFlowModule | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadVexFlow().then(
      (m) => alive && setVf(m),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, []);

  const tonic = lesson.key.tonic;
  const widest = useMemo(() => widestStep(lesson), [lesson]);
  const above = useMemo(() => extentAboveStaff(lesson), [lesson]);

  const ready = useMemo<Ready | null>(() => {
    if (!vf) return null;
    const probe = makeStave(vf, tonic, MIN_WIDTH).info;
    const width = Math.max(MIN_WIDTH, Math.ceil(probe.noteStartX + widest + SIDE + 24));
    const { info, stave } = makeStave(vf, tonic, width);
    return { vf, width, info, stave };
  }, [vf, tonic, widest]);

  const view = useMemo(() => {
    if (!ready) return null;
    const { info, width } = ready;
    const slots = columns.map(slotWidth);
    const total = slots.reduce((a, b) => a + b, 0);
    const start = info.noteStartX + 6;
    const end = width - SIDE - 8;
    let x = start + Math.max(0, (end - start - total) / 2);
    const placed = columns.map((col, i) => {
      const cx = x + (slots[i] as number) / 2;
      x += slots[i] as number;
      return { col, cx, art: engraveColumn(ready.vf, ready.stave, tonic, width, col.pitches) as ColumnArt };
    });
    const minY = Math.floor(info.topLineY - Math.max(20, above + 14));
    const labelY1 = info.bottomLineY + 44;
    const labelY2 = info.bottomLineY + 63;
    const gapY = info.bottomLineY + 82;
    return { placed, minY, height: Math.ceil(gapY + 22 - minY), labelY1, labelY2, gapY };
  }, [ready, columns, tonic, above]);

  if (failed) {
    return (
      <div className="staff-error" role="alert">
        오선보를 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 보세요.
      </div>
    );
  }

  const width = ready?.width ?? MIN_WIDTH;
  const minY = view?.minY ?? 0;
  const height = view?.height ?? 180;

  return (
    <svg
      className="staff"
      viewBox={`0 ${minY} ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={description}
      aria-busy={!ready}
    >
      {ready && view ? (
        <>
          <g className="stave" dangerouslySetInnerHTML={{ __html: ready.info.html }} />
          {view.placed.map(({ col, cx, art }) => (
            <g
              key={col.key}
              className={`col${col.isNew ? " col-new" : ""}${col.isChord ? " col-chord" : ""}`}
              style={{ transform: `translate(${cx}px, 0px)` }}
            >
              {col.pitches.map((_, i) => (
                <g key={i}>
                  {col.sounding[i] ? <ellipse className="halo halo-sound" cx={0} cy={art.ys[i]} rx={14} ry={10} /> : null}
                  {col.hot[i] ? <ellipse className="halo halo-hot" cx={0} cy={art.ys[i]} rx={14} ry={10} /> : null}
                </g>
              ))}
              <g className="art" dangerouslySetInnerHTML={{ __html: art.html }} />
              {col.line1 ? (
                <text className="lab lab1" y={view.labelY1} textAnchor="middle" fontSize={LABEL_SIZE.line1}>
                  {col.line1}
                </text>
              ) : null}
              {col.line2 ? (
                <text className="lab lab2" y={view.labelY2} textAnchor="middle" fontSize={LABEL_SIZE.line2}>
                  {col.line2}
                </text>
              ) : null}
            </g>
          ))}
          {view.placed.map(({ col, cx }, i) => {
            const next = view.placed[i + 1];
            if (!col.gapAfter || !next) return null;
            const x1 = cx + 9;
            const x2 = next.cx - 9;
            const semitone = col.gapAfter === "반음";
            return (
              <g key={`gap-${col.key}`} className={`gap${semitone ? " gap-semi" : ""}`}>
                <path d={`M ${x1} ${view.gapY - 5} v 5 H ${x2} v -5`} fill="none" />
                <text x={(x1 + x2) / 2} y={view.gapY + 15} textAnchor="middle" fontSize={LABEL_SIZE.line2}>
                  {col.gapAfter}
                </text>
              </g>
            );
          })}
        </>
      ) : null}
    </svg>
  );
}
