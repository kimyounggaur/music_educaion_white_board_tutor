// 악보 기호의 "쓰는 길". 단위는 오선의 한 칸(u). 값은 모두 직접 찍은 점이다.
import { catmullRom } from "./util.js";

/**
 * 높은음자리표 한 획. 좌표는 G(솔)줄 = y 0, 아래쪽이 +, 왼쪽 끝 = x 0.
 * 순서: 둥근 부분 가운데에서 시작 → 바깥으로 돌아 아래 → 왼쪽 → 비스듬히 올라가 위쪽 고리 →
 *       세로로 내려와(오선을 가로지름) → 꼬리 끝의 둥근 부분.
 * 높이는 약 7칸(위 −4.3 ~ 아래 +2.6), 폭은 약 2.5칸.
 */
export const CLEF_KEYS = [
  [1.3, 0.52], [1.02, 0.5], [0.82, 0.3], [0.76, -0.05], [0.9, -0.42], [1.2, -0.64], [1.62, -0.74],
  [2.0, -0.72], [2.28, -0.48], [2.38, -0.05], [2.28, 0.4], [2.02, 0.78], [1.55, 1.08], [1.0, 1.1],
  [0.5, 0.95], [0.2, 0.62], [0.1, 0.1], [0.2, -0.55], [0.55, -1.15], [1.0, -1.65], [1.45, -2.05],
  [1.8, -2.4], [2.1, -2.75], [2.25, -3.15], [2.22, -3.7], [2.0, -4.1], [1.78, -4.3],
  [1.5, -4.05], [1.32, -3.55], [1.3, -3.0], [1.33, -2.45], [1.38, -1.9], [1.48, -1.35], [1.62, -0.75], [1.75, -0.15],
  [1.88, 0.45], [1.98, 1.0], [2.08, 1.5], [2.14, 2.0], [2.06, 2.34], [1.8, 2.54], [1.45, 2.56], [1.15, 2.44],
  [0.92, 2.3], [0.78, 2.1], [0.84, 1.92], [1.02, 1.9], [1.12, 2.06], [1.0, 2.2], [0.88, 2.1],
];

/** 음자리표의 점 목록(칸 단위) */
export function clefUnits() {
  return catmullRom(CLEF_KEYS, 8);
}

/** 음자리표 크기(칸): 왼쪽 끝 x 0 기준 폭, 위·아래 끝(G줄 기준) */
export const CLEF_BOX = { w: 2.5, top: -4.35, bottom: 2.6 };

/**
 * 오선 위 음의 세로 위치. 단계 번호는 도(C4)=28, 레=29, 미(E4)=30 … 파(F5)=38.
 * 맨 아랫줄(E4)이 30. 한 단계 = 반 칸.
 */
export function diatonicIndex(name) {
  const m = /^([A-G])(#|b)?(\d)$/.exec(name);
  if (!m) throw new Error("음 이름을 읽을 수 없어요: " + name);
  return "CDEFGAB".indexOf(m[1]) + 7 * Number(m[3]);
}

export function noteY(name, bottomLineY, u) {
  return bottomLineY - (diatonicIndex(name) - 30) * (u / 2);
}

/** 덧줄이 필요한 높이(단계 번호 목록): 아래는 28, 26 … 위는 40, 42 … */
export function ledgerIndices(idx) {
  const out = [];
  if (idx <= 28) for (let i = 28; i >= idx; i -= 2) out.push(i);
  if (idx >= 40) for (let i = 40; i <= idx; i += 2) out.push(i);
  return out;
}

const SHARPS = ['F5', 'C5', 'G5', 'D5', 'A4', 'E5', 'B4'];
const FLATS = ['B4', 'E5', 'A4', 'D5', 'G4', 'C5', 'F4'];
const ACCIDENTAL_STROKES = {
  '♯': [
    [[-.24, -1], [-.24, .94]],
    [[.24, -1.14], [.24, .8]],
    [[-.5, -.25], [.49, -.46]],
    [[-.5, .34], [.49, .13]],
  ],
  '♭': [
    [[-.15, -1.11], [-.15, .78]],
    [[-.15, .06], [.06, -.15], [.29, -.13], [.39, .07], [.35, .29], [.12, .57], [-.15, .78]],
  ],
  '♮': [
    [[-.25, -1.08], [-.25, .45], [.25, .23]],
    [[-.25, -.29], [.25, -.5], [.25, 1.04]],
  ],
};

export function signatureSymbols(signature) {
  return [
    ...SHARPS.filter(note => signature[note[0]] === 1).map(pitch => ({ symbol: '♯', pitch })),
    ...FLATS.filter(note => signature[note[0]] === -1).map(pitch => ({ symbol: '♭', pitch })),
  ];
}

export function accidentalUnits(symbol) {
  return ACCIDENTAL_STROKES[symbol] ?? [];
}

/** Staff-unit interval bracket: two half-space ticks and one horizontal line. */
export function bracketUnits(width) { return [[0,.5],[0,0],[width,0],[width,.5]]; }

/** Normalized one-stroke geometry reused by both rendering methods. */
export function diagramSymbolUnits(kind) {
  if (kind === 'box') return [[[0,0],[1,0],[1,1],[0,1],[0,0]]];
  if (kind === 'arrow') return [[[0,.5],[1,.5]],[[.8,0],[1,.5],[.8,1]]];
  if (kind === 'hairpin-up') return [[[0,.5],[1,0]],[[0,.5],[1,1]]];
  if (kind === 'hairpin-down') return [[[0,0],[1,.5]],[[0,1],[1,.5]]];
  return [];
}
