"use client";

import { useEffect, useMemo, useState } from "react";
import type { KeyLabelMode } from "../lib/script/schema";
import { keyboardKeys, pitchFromMidi, type KeyDef } from "../lib/theory/keyboard";
import { letterNameEn, letterNameKo, solfegeInKey } from "../lib/theory/korean";

const WHITE_W = 40;
const BLACK_W = 25;

interface KeyboardProps {
  fromMidi: number;
  toMidi: number;
  tonic: string;
  keyLabels: KeyLabelMode;
  hot: ReadonlySet<number>;
  sounding: ReadonlySet<number>;
  /** 해보기에서 맞게 누른 건반 */
  found: readonly number[];
  /** 방금 틀리게 누른 건반(누른 순간 번호와 함께 온다) */
  wrong: { midi: number; seq: number } | null;
  onTap: (midi: number) => void;
  /** 세로로 긴 화면(폰 세로 등)에서는 건반을 길게 그려 누르기 쉽게 한다 */
  tall?: boolean;
}

function labelsFor(key: KeyDef, mode: KeyLabelMode, tonic: string): { line1: string; line2: string } {
  if (mode === "없음" || !key.white) return { line1: "", line2: "" };
  const p = pitchFromMidi(key.midi);
  if (mode === "계이름") return { line1: solfegeInKey(p, tonic) ?? "", line2: "" };
  return { line1: letterNameKo(p), line2: letterNameEn(p) };
}

export function Keyboard({ fromMidi, toMidi, tonic, keyLabels, hot, sounding, found, wrong, onTap, tall = false }: KeyboardProps) {
  const WHITE_H = tall ? 190 : 132;
  const BLACK_H = tall ? 118 : 82;
  const keys = useMemo(() => keyboardKeys(fromMidi, toMidi), [fromMidi, toMidi]);
  const whites = keys.filter((k) => k.white);
  const blacks = keys.filter((k) => !k.white);
  const width = whites.length * WHITE_W;

  // 틀린 건반은 잠깐만 빨갛게 보인다
  const [wrongShown, setWrongShown] = useState<number | null>(null);
  useEffect(() => {
    if (!wrong) return;
    setWrongShown(wrong.midi);
    const t = setTimeout(() => setWrongShown(null), 650);
    return () => clearTimeout(t);
  }, [wrong]);

  const stateClass = (k: KeyDef) =>
    [
      "key",
      k.white ? "key-white" : "key-black",
      sounding.has(k.midi) ? "is-sound" : "",
      hot.has(k.midi) ? "is-hot" : "",
      found.includes(k.midi) ? "is-found" : "",
      wrongShown === k.midi ? "is-wrong" : "",
    ]
      .filter(Boolean)
      .join(" ");

  const press = (k: KeyDef) => (e: React.PointerEvent) => {
    e.preventDefault();
    onTap(k.midi);
  };

  return (
    <svg
      className="keyboard"
      viewBox={`0 0 ${width} ${WHITE_H}`}
      preserveAspectRatio="xMidYMid meet"
      role="group"
      aria-label="건반"
    >
      {whites.map((k) => {
        const { line1, line2 } = labelsFor(k, keyLabels, tonic);
        const x = k.whiteIndex * WHITE_W;
        return (
          <g key={k.midi} className={stateClass(k)} onPointerDown={press(k)} role="button" aria-label={`${k.name} 건반`} data-midi={k.midi}>
            <rect x={x + 1} y={0} width={WHITE_W - 2} height={WHITE_H - 1} rx={4} />
            {line1 ? (
              <text className="key-label" x={x + WHITE_W / 2} y={WHITE_H - (line2 ? 30 : 16)} textAnchor="middle" fontSize={line2 ? 15 : 17}>
                {line1}
              </text>
            ) : null}
            {line2 ? (
              <text className="key-label key-label2" x={x + WHITE_W / 2} y={WHITE_H - 12} textAnchor="middle" fontSize={11}>
                {line2}
              </text>
            ) : null}
          </g>
        );
      })}
      {blacks.map((k) => {
        const x = (k.whiteIndex + 1) * WHITE_W - BLACK_W / 2;
        return (
          <g key={k.midi} className={stateClass(k)} onPointerDown={press(k)} role="button" aria-label={`${k.name} 건반`} data-midi={k.midi}>
            <rect x={x} y={0} width={BLACK_W} height={BLACK_H} rx={3} />
          </g>
        );
      })}
    </svg>
  );
}
