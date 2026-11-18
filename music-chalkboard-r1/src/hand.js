// 손 층: 펜 끝 좌표를 따라 움직이는 그림 하나(translate3d만 바꾼다). 그림자는 따로 둔다.
import { handSvg, HAND_H, HAND_W, TIP } from "./hand-art.js";

let nextMaskId = 0;

export class HandLayer {
  constructor(stage) {
    this.stage = stage;
    this.shadow = document.createElement("div");
    this.shadow.className = "hand-shadow";
    this.shadow.setAttribute("aria-hidden", "true");
    this.root = document.createElement("div");
    this.root.className = "hand";
    this.root.setAttribute("aria-hidden", "true");
    stage.append(this.shadow, this.root);
    this.mode = "hand";
    this.penKind = "chalk";
    this.visible = false;
    this.angle = -8;
    this.scale = 0.3;
    this.inkColor = "#f3efe3";
    this.last = { x: -999, y: -999, a: 0, lift: 0 };
    this.maskId = `hand-sleeve-${++nextMaskId}`;
    this.root.style.visibility = "hidden";
    this.shadow.style.visibility = "hidden";
  }

  /** 펜 종류(chalk|marker)와 보기 방식(hand|pen)을 바꾼다 */
  configure({ penKind, mode }) {
    const updateArt = !this.svg || this.penKind !== penKind;
    this.penKind = penKind;
    this.mode = mode;
    if (updateArt) {
      this.root.innerHTML = `<div class="hand-inner">${handSvg(penKind).replace(
        '<g class="body">',
        `<defs><linearGradient id="${this.maskId}-gradient" x1="0%" y1="0%" x2="35%" y2="100%">
          <stop offset="68%" stop-color="white"/><stop offset="98%" stop-color="black"/>
        </linearGradient><mask id="${this.maskId}" maskUnits="userSpaceOnUse" x="0" y="0" width="650" height="880">
          <rect width="650" height="880" fill="url(#${this.maskId}-gradient)"/>
        </mask></defs><g class="body" mask="url(#${this.maskId})">`,
      )}</div>`;
      this.inner = this.root.firstChild;
      this.svg = this.inner.firstChild;
      this._applied = null;
      this.setInk(this.inkColor);
    }
    this.root.classList.toggle("pen-only", mode === "pen");
    this.shadow.classList.toggle("pen-only", mode === "pen");
  }

  setInk(color) {
    if (color === this._applied) return;
    this._applied = color;
    this.inkColor = color;
    if (this.svg) this.svg.style.setProperty("--pen-ink", color);
  }

  /** 화면에 보이는 크기에 맞춰 손 크기를 정한다 */
  resize(stageCssW, stageCssH) {
    // Keep the visible hand smaller than both edges of a narrow board.
    this.scale = Math.min(stageCssH * 0.28, stageCssW * 0.49) / HAND_H;
    this.cssW = stageCssW;
    this.cssH = stageCssH;
    this.applySize();
  }

  applySize() {
    if (!this.inner) return;
    const s = this.scale;
    this.inner.style.width = HAND_W * s + "px";
    this.inner.style.height = HAND_H * s + "px";
    this.inner.style.left = -TIP.x * s + "px";
    this.inner.style.top = -TIP.y * s + "px";
    this.svg.setAttribute("width", HAND_W * s);
    this.svg.setAttribute("height", HAND_H * s);
    // 그림자: 손 몸통 아래쪽에 부드럽게 퍼지는 얼룩(그림 좌표 60~580, 150~770 부근)
    const sh = this.shadow;
    sh.style.width = 520 * s + "px";
    sh.style.height = 620 * s + "px";
    sh.style.left = (60 - TIP.x) * s + "px";
    sh.style.top = (150 - TIP.y) * s + "px";
  }

  show(v) {
    if (this.visible === v) return;
    this.visible = v;
    const vis = v ? "visible" : "hidden";
    this.root.style.visibility = vis;
    this.shadow.style.visibility = this.mode === "pen" ? "hidden" : vis;
  }

  /** 펜 끝을 (cssX, cssY)에 두고, 들림(0~1)과 기울기(도)를 반영한다 */
  update(cssX, cssY, lift, angleDeg) {
    const s = this.scale;
    const lx = -3 * lift * (s / 0.3);
    const ly = -5 * lift * (s / 0.3);
    this.root.style.transform = `translate3d(${(cssX + lx).toFixed(1)}px, ${(cssY + ly).toFixed(1)}px, 0) rotate(${angleDeg.toFixed(2)}deg)`;
    const sd = 2 + 6 * lift;
    this.shadow.style.transform = `translate3d(${(cssX + sd * 1.6).toFixed(1)}px, ${(cssY + sd * 2.2).toFixed(1)}px, 0)`;
    this.shadow.style.opacity = (0.5 - 0.22 * lift).toFixed(2);
  }
}
