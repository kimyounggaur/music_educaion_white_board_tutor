// 분필 가루: 펜 끝에서 작고 둥근 알갱이와 옅은 먼지 덩이가 떨어진다(설계서 6.6, 7.8). 좌표는 화면(CSS px) 기준이다.
import { rng } from "./util.js";

export const DUST = {
  perPx: 0.11, // 펜이 움직인 거리(px)마다 나는 알갱이 수
  maxPerFrame: 6,
  maxLive: 170,
  gravity: 360,
  vxRange: 22,
  vyMin: 8,
  vyMax: 55,
  lifeMin: 0.55,
  lifeMax: 1.15,
  puffShare: 0.3, // 옅고 큰 먼지 덩이의 비율
  speck: { rMin: 0.7, rMax: 1.7, alpha: 0.85 },
  puff: { rMin: 2.0, rMax: 3.6, alpha: 0.2 },
  grow: 0.8, // 수명 동안 커지는 비율
  burst: 9,
};

/** 둥글게 번지는 점 하나(색을 입혀 둔다) */
function makeSprite(color) {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, color);
  g.addColorStop(0.45, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 32, 32);
  return c;
}

export class Dust {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.list = [];
    this.rand = rng(99);
    this.carry = 0;
    this.dpr = 1;
    this.sprites = new Map();
    this.cssW = 1;
    this.cssH = 1;
    this.enabled = false;
    this.dirty = null;
    this.frameTimes = [];
    this.slowWindows = 0;
    this.degraded = false;
  }

  resize(cssW, cssH, enabled = true) {
    const width = Math.max(1, cssW);
    const height = Math.max(1, cssH);
    if (width === this.cssW && height === this.cssH && enabled === this.enabled) return;
    this.clear();
    this.enabled = enabled;
    this.cssW = width;
    this.cssH = height;
    const pixelLimit = Math.sqrt(2_000_000 / (width * height));
    this.dpr = Math.min(globalThis.devicePixelRatio || 1, 1.5, pixelLimit);
    const canvasWidth = enabled ? Math.max(1, Math.floor(width * this.dpr)) : 1;
    const canvasHeight = enabled ? Math.max(1, Math.floor(height * this.dpr)) : 1;
    if (this.canvas.width !== canvasWidth) this.canvas.width = canvasWidth;
    if (this.canvas.height !== canvasHeight) this.canvas.height = canvasHeight;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  setEnabled(enabled) {
    this.resize(this.cssW, this.cssH, enabled);
  }

  get active() {
    return this.enabled && !this.degraded && (this.list.length > 0 || this.dirty !== null);
  }

  sprite(color) {
    let s = this.sprites.get(color);
    if (!s) {
      s = makeSprite(color);
      this.sprites.set(color, s);
    }
    return s;
  }

  emitOne(x, y, color) {
    if (!this.enabled || this.degraded) return;
    const r = this.rand;
    if (this.list.length >= DUST.maxLive) this.list.shift();
    const puff = r() < DUST.puffShare;
    const k = puff ? DUST.puff : DUST.speck;
    const life = DUST.lifeMin + r() * (DUST.lifeMax - DUST.lifeMin);
    this.list.push({
      x: x + (r() - 0.5) * 3,
      y: y + (r() - 0.5) * 2,
      vx: (r() * 2 - 1) * DUST.vxRange * (puff ? 0.6 : 1),
      vy: (DUST.vyMin + r() * (DUST.vyMax - DUST.vyMin)) * (puff ? 0.5 : 1),
      life,
      max: life,
      r: k.rMin + r() * (k.rMax - k.rMin),
      a: k.alpha,
      sprite: this.sprite(color),
    });
  }

  /** 펜이 distPx만큼 움직였을 때 */
  trail(x, y, distPx, color) {
    if (!this.enabled || this.degraded) return;
    this.carry += distPx * DUST.perPx;
    let n = Math.floor(this.carry);
    this.carry -= n;
    n = Math.min(n, DUST.maxPerFrame);
    for (let i = 0; i < n; i++) this.emitOne(x, y, color);
  }

  burst(x, y, color, n = DUST.burst) {
    for (let i = 0; i < n; i++) this.emitOne(x, y, color);
  }

  clearPrevious() {
    if (!this.dirty) return;
    const [left, top, right, bottom] = this.dirty;
    this.ctx.clearRect(left, top, right - left, bottom - top);
    this.dirty = null;
  }

  clear() {
    this.list.length = 0;
    this.carry = 0;
    this.clearPrevious();
    this.frameTimes.length = 0;
    this.slowWindows = 0;
    this.degraded = false;
  }

  sampleFrame(dt) {
    if (dt >= .09 || globalThis.document?.hidden) {
      this.frameTimes.length = 0;
      this.slowWindows = 0;
      return;
    }
    if (dt <= 0) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 60) return;
    this.frameTimes.sort((a, b) => a - b);
    const median = (this.frameTimes[29] + this.frameTimes[30]) / 2;
    this.frameTimes.length = 0;
    this.slowWindows = median > .025 ? this.slowWindows + 1 : 0;
    if (this.slowWindows >= 2) {
      this.clear();
      this.degraded = true;
    }
  }

  /** 입자와 직전에 그린 영역이 있는 동안에만 캔버스를 갱신한다. */
  step(dt) {
    if (!this.enabled || this.degraded) return;
    this.sampleFrame(dt);
    if (!this.active) return;
    this.clearPrevious();
    const ctx = this.ctx;
    let live = 0;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const p of this.list) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += DUST.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const fraction = p.life / p.max;
      const size = p.r * 2 * (1 + DUST.grow * (1 - fraction));
      const x = p.x - size / 2;
      const y = p.y - size / 2;
      ctx.globalAlpha = p.a * Math.pow(fraction, 0.8);
      ctx.drawImage(p.sprite, x, y, size, size);
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + size);
      bottom = Math.max(bottom, y + size);
      this.list[live++] = p;
    }
    this.list.length = live;
    ctx.globalAlpha = 1;
    if (live) this.dirty = [
      Math.max(0, Math.floor(left) - 2),
      Math.max(0, Math.floor(top) - 2),
      Math.min(this.cssW, Math.ceil(right) + 2),
      Math.min(this.cssH, Math.ceil(bottom) + 2),
    ];
    if (this.dirty && (this.dirty[0] >= this.dirty[2] || this.dirty[1] >= this.dirty[3])) this.dirty = null;
  }
}
