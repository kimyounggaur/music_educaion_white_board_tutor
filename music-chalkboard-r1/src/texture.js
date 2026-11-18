// 앱이 시작할 때 계산으로 만드는 질감들(그림 파일 없음): 분필 무늬, 붓 도장, 칠판 면.
import { rng } from "./util.js";

export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 가로·세로로 이어 붙여도 이음매가 없는 값 잡음 */
function tileNoise(size, cell, seed) {
  const r = rng(seed);
  const n = Math.max(2, Math.round(size / cell));
  const grid = Array.from({ length: n * n }, () => r());
  const step = n / size;
  return (x, y) => {
    const gx = x * step;
    const gy = y * step;
    const x0 = Math.floor(gx) % n;
    const y0 = Math.floor(gy) % n;
    const fx = gx - Math.floor(gx);
    const fy = gy - Math.floor(gy);
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const x1 = (x0 + 1) % n;
    const y1 = (y0 + 1) % n;
    const a = grid[y0 * n + x0];
    const b = grid[y0 * n + x1];
    const c = grid[y1 * n + x0];
    const d = grid[y1 * n + x1];
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  };
}

const tiles = new Map();
const tileURLs = new WeakMap();
const brushSets = new Map();
const boardCache = new WeakMap();

function remember(store, key, value) {
  if (store.size >= 24) store.delete(store.keys().next().value);
  store.set(key, value);
  return value;
}

/** 분필 무늬 한 장: 색은 그대로, 투명도만 고르지 않게 한다. minAlpha 아래로는 내려가지 않는다. */
export function chalkTile(color, { size = 192, minAlpha = 0.55, seed = 1 } = {}) {
  const key = `${color}|${size}|${minAlpha}|${seed}`;
  if (tiles.has(key)) return tiles.get(key);
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(size, size);
  const [r, g, b] = hexToRgb(color);
  const lo = tileNoise(size, 48, seed);
  const mid = tileNoise(size, 12, seed + 1);
  const rand = rng(seed + 2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let a = 0.9 + 0.3 * (lo(x, y) - 0.5) + 0.28 * (mid(x, y) - 0.5) + 0.3 * (rand() - 0.5);
      if (rand() < 0.045) a *= 0.4; // 가루가 묻지 않은 작은 구멍
      a = Math.min(1, Math.max(minAlpha, a));
      const i = (y * size + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return remember(tiles, key, cv);
}

export function chalkTileURL(color, options) {
  const tile = chalkTile(color, options);
  if (!tileURLs.has(tile)) tileURLs.set(tile, tile.toDataURL("image/png"));
  return tileURLs.get(tile);
}

/** 붓 도장(분필 한 번 찍은 자국) 여러 장 */
export function chalkDabs(color, { count = 8, size = 64, seed = 5 } = {}) {
  const key = `${color}|${count}|${size}|${seed}`;
  if (brushSets.has(key)) return brushSets.get(key);
  const [r, g, b] = hexToRgb(color);
  const out = [];
  for (let n = 0; n < count; n++) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = size;
    const ctx = cv.getContext("2d");
    const img = ctx.createImageData(size, size);
    const rand = rng(seed + n * 101);
    const c = (size - 1) / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const rho = Math.hypot(x - c, y - c) / c;
        const base = 1 - smooth(0.5, 1.0, rho);
        let grain = 0.4 + 0.6 * rand();
        if (rand() < 0.12) grain *= 0.3;
        const a = base * grain;
        const i = (y * size + x) * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = Math.round(Math.min(1, a) * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    out.push(cv);
  }
  return remember(brushSets, key, out);
}

/** 칠판 / 화이트보드 바탕을 캔버스에 그린다(씨앗값이 같으면 같은 모양) */
export function paintBoard(canvas, theme, seed = 3) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const cacheKey = `${theme}|${w}|${h}|${seed}`;
  if (boardCache.get(canvas) === cacheKey) return;
  boardCache.set(canvas, cacheKey);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const rand = rng(seed);
  if (theme === "chalk") {
    ctx.fillStyle = "#1f4036";
    ctx.fillRect(0, 0, w, h);
    // 닦은 자국과 얼룩(아주 옅게)
    for (let i = 0; i < 70; i++) {
      const cx = rand() * w;
      const cy = rand() * h;
      const rx = w * (0.05 + rand() * 0.28);
      const ry = h * (0.01 + rand() * 0.07);
      const a = 0.012 + rand() * 0.03;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((rand() - 0.5) * 0.35);
      ctx.scale(1, ry / rx);
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      gr.addColorStop(0, `rgba(235,245,238,${a})`);
      gr.addColorStop(1, "rgba(235,245,238,0)");
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // 고운 알갱이(되읽기 없이: 작은 잡음 조각을 이어 붙여 아주 옅게 덮는다)
    const tile = document.createElement("canvas");
    tile.width = tile.height = 128;
    const tctx = tile.getContext("2d");
    const timg = tctx.createImageData(128, 128);
    for (let i = 0; i < timg.data.length; i += 4) {
      const v = rand() < 0.5 ? 0 : 255;
      timg.data[i] = timg.data[i + 1] = timg.data[i + 2] = v;
      timg.data[i + 3] = Math.floor(rand() * 15);
    }
    tctx.putImageData(timg, 0, 0);
    ctx.fillStyle = ctx.createPattern(tile, "repeat");
    ctx.fillRect(0, 0, w, h);
    // 가장자리 살짝 어둡게
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.22)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  } else {
    const lg = ctx.createLinearGradient(0, 0, w, h);
    lg.addColorStop(0, "#ffffff");
    lg.addColorStop(1, "#eef3f5");
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) {
      const cx = rand() * w;
      const cy = rand() * h;
      const rx = w * (0.05 + rand() * 0.2);
      const ry = h * (0.01 + rand() * 0.05);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((rand() - 0.5) * 0.6);
      ctx.scale(1, ry / rx);
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      gr.addColorStop(0, `rgba(110,130,150,${0.02 + rand() * 0.025})`);
      gr.addColorStop(1, "rgba(110,130,150,0)");
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
