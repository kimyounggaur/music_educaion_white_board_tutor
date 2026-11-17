// 선 표현 방식 B: 캔버스에 분필 도장을 찍듯 그리는 붓.
// 새로 생긴 길이만큼만 도장을 더 찍으므로 매 프레임 비용이 작다. 크기가 바뀌면 처음부터 다시 찍는다.
import { hashString, pointAt, rng } from "./util.js";
import { chalkDabs } from "./texture.js";

export class CanvasRenderer {
  /** theme: { style, ink } , cssWidth: 화면에 보이는 가로(px) */
  constructor(host, scene, theme, cssWidth) {
    this.host = host;
    this.scene = scene;
    this.theme = theme;
    this.chalk = theme.style === "chalk";
    this.dprMax = 2;
    this.states = new Map(); // `${item.index}:${si}` → { T, nextD, rand }
    this.canvas = document.createElement("canvas");
    this.canvas.className = "ink-canvas";
    this.canvas.setAttribute("aria-hidden", "true");
    host.innerHTML = "";
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this.dabs = {};
    if (this.chalk) {
      let seed = 21;
      for (const ink of ["main", "accent", "dim"]) this.dabs[ink] = chalkDabs(theme.ink[ink], { count: 8, size: 64, seed: (seed += 13) });
    }
    this.resize(cssWidth);
  }

  key(part) {
    return part.item.index + ":" + part.si;
  }

  resize(cssWidth) {
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprMax);
    const w = Math.max(1, Math.round(cssWidth * dpr));
    const h = Math.max(1, Math.round((cssWidth * this.scene.H) / this.scene.W) * dpr);
    this.canvas.width = w;
    this.canvas.height = Math.round(h);
    this.scale = this.canvas.width / this.scene.W;
    this.ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    // 이미 그린 만큼 다시 찍는다
    const old = [...this.states.entries()];
    this.states.clear();
    for (const [k, st] of old) {
      if (st.T > 0) {
        const [idx, si] = k.split(":").map(Number);
        this.paintTo({ item: this.scene.items[idx], si }, st.T);
      }
    }
  }

  stateOf(part) {
    const k = this.key(part);
    let st = this.states.get(k);
    if (!st) {
      st = { T: 0, nextD: 0, rand: rng(hashString(part.item.seedId || part.item.id) + part.si * 131) };
      this.states.set(k, st);
    }
    return st;
  }

  brushOf(part) {
    const { item, si } = part;
    if (item.type === "glyph") return item.strokes[si].len < 4 ? item.brushW * 1.7 : item.brushW; // 점(.)은 더 크게 찍는다
    const w = item.strokes[si].width;
    return this.chalk ? w * 1.35 : w * 1.4;
  }

  /** 시작부터 targetLen(px)까지 찍는다(이미 찍은 곳은 건너뜀) */
  paintTo(part, targetLen) {
    const st = this.stateOf(part);
    if (part.item.type === "text") {
      const item = part.item, target = Math.min(1, targetLen);
      if (target <= st.T) return;
      this.ctx.save();
      this.ctx.fillStyle = this.theme.ink[item.ink];
      this.ctx.font = `500 ${item.size}px system-ui, sans-serif`;
      this.ctx.textBaseline = "alphabetic";
      const width = this.ctx.measureText(item.text).width + 2;
      this.ctx.beginPath();
      this.ctx.rect(item.x + width * st.T, item.baseY - item.size * 1.4, width * (target-st.T), item.size * 1.8);
      this.ctx.clip(); this.ctx.fillText(item.text, item.x, item.baseY);
      this.ctx.restore();
      st.T = target;
      return;
    }
    const s = part.item.strokes[part.si];
    const brush = this.brushOf(part);
    const spacing = Math.max(0.5, brush * (this.chalk ? 0.14 : 0.12));
    const ctx = this.ctx;
    const ink = part.item.ink;
    const color = this.theme.ink[ink];
    const end = Math.min(targetLen, s.len);
    if (this.chalk) {
      const dabs = this.dabs[ink];
      for (; st.nextD <= end + 1e-6; st.nextD += spacing) {
        const [x, y, dx, dy] = pointAt(s.pts, s.cum, st.nextD);
        const r = st.rand;
        const jitter = (r() - 0.5) * brush * 0.08;
        const px = x - dy * jitter;
        const py = y + dx * jitter;
        const reps = s.len < 4 ? 3 : 1; // 점(.)은 같은 자리에 몇 번 겹쳐 찍어 진하게
        let dab = dabs[0];
        for (let rep = 0; rep < reps; rep++) {
          dab = dabs[(r() * dabs.length) | 0];
          const size = brush * (1.05 + r() * 0.2);
          const ox = rep ? (r() - 0.5) * brush * 0.2 : 0;
          const oy = rep ? (r() - 0.5) * brush * 0.2 : 0;
          ctx.globalAlpha = 0.55 + r() * 0.3;
          ctx.drawImage(dab, px + ox - size / 2, py + oy - size / 2, size, size);
        }
        if (r() < 0.34) {
          // 바깥쪽의 옅은 번짐
          const big = brush * 1.5;
          ctx.globalAlpha = 0.09;
          ctx.drawImage(dab, px - big / 2, py - big / 2, big, big);
        }
      }
    } else {
      ctx.globalAlpha = 0.94;
      ctx.fillStyle = color;
      for (; st.nextD <= end + 1e-6; st.nextD += spacing) {
        const [x, y] = pointAt(s.pts, s.cum, st.nextD);
        ctx.beginPath();
        ctx.arc(x, y, brush / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    st.T = Math.max(st.T, targetLen);
  }

  setPart(part, p) {
    if (p <= 0) return;
    if (part.item.type === "text") { this.paintTo(part, p); return; }
    const s = part.item.strokes[part.si];
    const target = p >= 1 ? s.len + 0.01 : p * s.len;
    this.paintTo(part, target);
  }

  completeItem() {}

  completeAll() {
    for (const item of this.scene.items) {
      if (item.type === "text") this.setPart({item, si: 0}, 1);
      else item.strokes.forEach((_, si) => this.setPart({ item, si }, 1));
    }
  }

  destroy() {
    this.host.innerHTML = "";
  }
}
