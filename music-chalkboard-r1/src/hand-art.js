// 손 그림(직접 그린 그림). 640×880 칸 안에서 펜 끝이 (92, 96)에 오도록 그린다.
// 손가락은 "굵기가 변하는 캡슐"을 이어 붙여 만들고, 테두리는 겹친 모양 전체를 한 번에 감싼다.

export const HAND_W = 640;
export const HAND_H = 880;
export const TIP = { x: 92, y: 96 };

const f = (n) => Math.round(n * 10) / 10;

/** 두 원(중심, 반지름)을 접선으로 이은 알약 모양 길 */
function capsule(x0, y0, r0, x1, y1, r1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  // 접선 각도: 반지름이 다르면 살짝 기울어진다
  const k = Math.max(-1, Math.min(1, (r0 - r1) / L));
  const a = Math.acos(k);
  const px = -uy;
  const py = ux;
  const c = Math.cos(a);
  const s = Math.sin(a);
  // 접점 방향(왼쪽/오른쪽)
  const nx1 = ux * c + px * s;
  const ny1 = uy * c + py * s;
  const nx2 = ux * c - px * s;
  const ny2 = uy * c - py * s;
  const A = [x0 + nx1 * r0, y0 + ny1 * r0];
  const B = [x1 + nx1 * r1, y1 + ny1 * r1];
  const C = [x1 + nx2 * r1, y1 + ny2 * r1];
  const D = [x0 + nx2 * r0, y0 + ny2 * r0];
  return (
    `M${f(A[0])} ${f(A[1])}L${f(B[0])} ${f(B[1])}` +
    `A${f(r1)} ${f(r1)} 0 1 0 ${f(C[0])} ${f(C[1])}` +
    `L${f(D[0])} ${f(D[1])}` +
    `A${f(r0)} ${f(r0)} 0 1 0 ${f(A[0])} ${f(A[1])}Z`
  );
}

/** 점 목록을 이은 알약들(마디가 여러 개인 손가락) */
function chain(pts) {
  let d = "";
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0, r0] = pts[i];
    const [x1, y1, r1] = pts[i + 1];
    d += capsule(x0, y0, r0, x1, y1, r1);
  }
  return d;
}

const OUT = "#7a4a30"; // 윤곽선
const OUT_W = 5;
const SKIN = "#f3c9a5";
const SKIN_D = "#e2a67e"; // 그늘
const SKIN_L = "#fbdcc2"; // 빛
const NAIL = "#fde9de";
const SLEEVE = "#4d6486";
const SLEEVE_D = "#3b4f6d";

/** 윤곽을 먼저 굵게 칠하고 그 위에 살색을 칠해, 겹친 모양 전체에 테두리가 한 번만 생기게 한다 */
function solid(d, fill, extra = "") {
  return (
    `<path d="${d}" fill="${OUT}" stroke="${OUT}" stroke-width="${OUT_W * 2}" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="${fill}"${extra}/>`
  );
}

/** 여러 모양을 한 덩어리로: 윤곽을 모두 먼저 칠하고 그 위에 살색을 모두 칠한다(겹침 방향과 상관없이 합쳐진다) */
function unionSolid(list, fill) {
  return (
    list.map((d) => `<path d="${d}" fill="${OUT}" stroke="${OUT}" stroke-width="${OUT_W * 2}" stroke-linejoin="round"/>`).join("") +
    list.map((d) => `<path d="${d}" fill="${fill}"/>`).join("")
  );
}

/** 펜: 분필 또는 마커. 펜 끝이 (0,0)이고 아래쪽(+y)으로 뻗는다. */
export function penArt(kind) {
  if (kind === "marker") {
    return (
      `<g class="pen pen-marker">` +
      // 몸통
      `<path d="M-23 70 L-23 400 Q-23 414 -9 414 L9 414 Q23 414 23 400 L23 70 Z" fill="#f4f6f8" stroke="${OUT}" stroke-width="4" stroke-linejoin="round"/>` +
      `<rect x="-23" y="250" width="46" height="46" fill="var(--pen-ink,#1d2a24)" stroke="${OUT}" stroke-width="4"/>` +
      // 뾰족한 끝
      `<path d="M-23 70 L-14 26 L14 26 L23 70 Z" fill="#dfe4e8" stroke="${OUT}" stroke-width="4" stroke-linejoin="round"/>` +
      `<path d="M-14 26 L-7 0 L7 0 L14 26 Z" fill="var(--pen-ink,#1d2a24)" stroke="${OUT}" stroke-width="4" stroke-linejoin="round"/>` +
      `<path d="M-14 120 L-14 380" stroke="#ffffff" stroke-opacity=".75" stroke-width="5" stroke-linecap="round"/>` +
      `</g>`
    );
  }
  return (
    `<g class="pen pen-chalk">` +
    `<path d="M-24 18 Q-24 0 -7 0 L7 0 Q24 0 24 18 L24 396 Q24 412 7 412 L-7 412 Q-24 412 -24 396 Z" fill="var(--pen-ink,#f7f4ea)" stroke="${OUT}" stroke-width="4" stroke-linejoin="round"/>` +
    `<path d="M-14 40 L-14 360" stroke="#ffffff" stroke-opacity=".6" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M-24 300 Q0 308 24 300" fill="none" stroke="${OUT}" stroke-opacity=".25" stroke-width="3"/>` +
    `<ellipse cx="0" cy="3" rx="11" ry="4" fill="#ffffff" fill-opacity=".85"/>` +
    `</g>`
  );
}

/** 손과 팔 전체. 펜은 따로 끼워 넣는다(가운데 자리 표시). */
export function handArt() {
  // 펜은 끝점에서 오른쪽 아래로 뻗는다. 펜 방향 각도(도, 시계 방향이 +): 아래쪽을 0으로 본 회전
  const PEN_ROT = -32.7;

  // 소매(손목 위를 덮는다)
  const sleeve = `M440 676 C512 644 584 618 650 600 L650 880 L318 880 C334 790 380 722 440 676Z`;
  const sleeveFold1 = `M468 712 C450 768 430 826 420 880`;
  const sleeveFold2 = `M540 686 C522 756 504 824 494 880`;

  // 손등(아래쪽은 소매 밑으로 들어간다)
  const back = `M372 236 C444 224 520 276 552 360 C580 436 598 512 606 590 L616 690 L440 716 C436 612 414 528 396 480 Z`;

  // 접힌 세 손가락(가운데·약지·새끼): 매듭에서 왼쪽 아래로 접혀 있다
  const mid = chain([[412, 338, 36], [334, 360, 33], [296, 408, 28]]);
  const ring = chain([[420, 406, 33], [352, 430, 30], [320, 470, 25]]);
  const pinky = chain([[424, 468, 29], [372, 492, 26], [348, 524, 22]]);

  // 엄지: 펜 아래쪽을 따라 올라간다(뿌리는 손등에 묻힌다)
  const thumb = chain([[404, 560, 50], [318, 492, 44], [250, 408, 38], [196, 326, 32], [158, 266, 27]]);
  // 검지: 펜 위쪽을 덮는다
  const index = chain([[396, 268, 36], [306, 244, 31], [236, 220, 27], [190, 200, 23]]);
  // 손등 + 엄지 + 검지는 한 덩어리로 보이도록 윤곽을 한 번만 둘러싼다
  const body = [back, thumb, index];

  const nailIndex = `<ellipse cx="194" cy="197" rx="13" ry="9.5" transform="rotate(-24 194 197)" fill="${NAIL}" stroke="${OUT}" stroke-opacity=".55" stroke-width="2"/>`;
  const nailThumb = `<ellipse cx="156" cy="259" rx="13" ry="10" transform="rotate(-62 156 259)" fill="${NAIL}" stroke="${OUT}" stroke-opacity=".55" stroke-width="2"/>`;

  return (
    `<g class="hand-art">` +
    // 펜(맨 뒤)
    `<g transform="translate(${TIP.x} ${TIP.y}) rotate(${PEN_ROT})" class="pen-slot">__PEN__</g>` +
    `<g class="body">` +
    // 접힌 손가락
    solid(pinky, SKIN) +
    solid(ring, SKIN) +
    solid(mid, SKIN) +
    // 손등 + 엄지 + 검지
    unionSolid(body, SKIN) +
    // 소매
    solid(sleeve, SLEEVE) +
    `<path d="${sleeveFold1}" fill="none" stroke="${SLEEVE_D}" stroke-width="7" stroke-linecap="round"/>` +
    `<path d="${sleeveFold2}" fill="none" stroke="${SLEEVE_D}" stroke-width="7" stroke-linecap="round" stroke-opacity=".7"/>` +
    // 손톱, 그늘과 빛(살짝)
    nailThumb +
    nailIndex +
    `<path d="M398 306 C470 304 520 366 542 446" fill="none" stroke="${SKIN_L}" stroke-width="12" stroke-linecap="round" stroke-opacity=".8"/>` +
    `<path d="M300 380 C330 372 352 380 368 400" fill="none" stroke="${SKIN_D}" stroke-width="6" stroke-linecap="round"/>` +
    `<path d="M318 444 C344 436 366 442 380 460" fill="none" stroke="${SKIN_D}" stroke-width="6" stroke-linecap="round"/>` +
    `<path d="M284 254 C304 264 314 278 316 294" fill="none" stroke="${SKIN_D}" stroke-width="5" stroke-linecap="round" stroke-opacity=".8"/>` +
    `<path d="M448 650 C500 640 560 626 610 612" fill="none" stroke="${SKIN_D}" stroke-width="10" stroke-linecap="round" stroke-opacity=".55"/>` +
    `</g></g>`
  );
}

/** 손 그림 전체를 SVG 문자열로 */
export function handSvg(penKind) {
  return `<svg class="hand-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${HAND_W} ${HAND_H}" width="${HAND_W}" height="${HAND_H}" aria-hidden="true" focusable="false">${handArt().replace("__PEN__", penArt(penKind))}</svg>`;
}
