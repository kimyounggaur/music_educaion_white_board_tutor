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
  }

  resize(cssW, cssH) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.max(1, Math.round(cssW * this.dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * this.dpr));
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.cssW = cssW;
    this.cssH = cssH;
  }

  get active() {
    return this.list.length > 0;
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
    this.carry += distPx * DUST.perPx;
    let n = Math.floor(this.carry);
    this.carry -= n;
    n = Math.min(n, DUST.maxPerFrame);
    for (let i = 0; i < n; i++) this.emitOne(x, y, color);
  }

  burst(x, y, color, n = DUST.burst) {
    for (let i = 0; i < n; i++) this.emitOne(x, y, color);
  }

  clear() {
    this.list.length = 0;
    this.carry = 0;
    this.ctx.clearRect(0, 0, this.cssW, this.cssH);
  }

  /** dt초만큼 움직이고 그린다 */
  step(dt) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    const out = [];
    for (const p of this.list) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += DUST.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const f = p.life / p.max; // 1 → 0
      const size = p.r * 2 * (1 + DUST.grow * (1 - f));
      ctx.globalAlpha = p.a * Math.pow(f, 0.8);
      ctx.drawImage(p.sprite, p.x - size / 2, p.y - size / 2, size, size);
      out.push(p);
    }
    ctx.globalAlpha = 1;
    this.list = out;
  }
}
