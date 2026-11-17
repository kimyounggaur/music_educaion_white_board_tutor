// 선 표현 방식 A: SVG 선 + 분필 무늬 칠.
// 선은 stroke-dasharray/offset으로 드러내고, 글씨는 글꼴 윤곽을 채운 뒤 "획을 따라 가는 가림막(mask)"로 드러낸다.
import { toPathD } from "./util.js";
import { chalkTile } from "./texture.js";

const NS = "http://www.w3.org/2000/svg";
function el(name, attrs) {
  const e = document.createElementNS(NS, name);
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

let maskSeq = 0;

export class SvgRenderer {
  /** theme: { style: "chalk"|"marker", ink: {main, accent, dim} } */
  constructor(host, scene, theme) {
    this.host = host;
    this.scene = scene;
    this.theme = theme;
    this.chalk = theme.style === "chalk";
    this.nodes = new Map(); // item.index → { kind, ... }
    this.mount();
  }

  patternId(ink, kind) {
    return `pat-${ink}-${kind}`;
  }

  mount() {
    const { W, H } = this.scene;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "ink-svg", "aria-hidden": "true", preserveAspectRatio: "xMidYMid meet" });
    const defs = el("defs");
    svg.appendChild(defs);
    this.defs = defs;
    if (this.chalk) {
      let seed = 11;
      for (const ink of ["main", "accent", "dim"]) {
        for (const [kind, minAlpha] of [["line", 0.5], ["text", 0.78]]) {
          const tile = chalkTile(this.theme.ink[ink], { size: 192, minAlpha, seed: (seed += 7) });
          const pat = el("pattern", { id: this.patternId(ink, kind), patternUnits: "userSpaceOnUse", width: 96, height: 96 });
          const img = el("image", { width: 96, height: 96, href: tile.toDataURL("image/png") });
          pat.appendChild(img);
          defs.appendChild(pat);
        }
      }
    }
    const g = el("g", { class: "ink" });
    svg.appendChild(g);
    for (const item of this.scene.items) {
      if (item.type === "glyph") this.buildGlyph(g, item);
      else this.buildLine(g, item);
    }
    this.host.innerHTML = "";
    this.host.appendChild(svg);
    this.svg = svg;
  }

  paint(ink, kind) {
    return this.chalk ? `url(#${this.patternId(ink, kind)})` : this.theme.ink[ink];
  }

  buildLine(g, item) {
    const entry = { kind: "line", paths: [], strokes: item.strokes };
    for (const s of item.strokes) {
      const d = toPathD(s.pts);
      const L = s.len + 2;
      const common = {
        d,
        fill: "none",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "stroke-dasharray": `${L} ${L}`,
        "stroke-dashoffset": L,
      };
      const group = el("g", { visibility: "hidden" });
      const els = [];
      if (this.chalk) {
        const outer = el("path", { ...common, stroke: this.paint(item.ink, "line"), "stroke-width": (s.width * 1.35).toFixed(2), "stroke-opacity": 0.25 });
        const inner = el("path", { ...common, stroke: this.paint(item.ink, "line"), "stroke-width": s.width.toFixed(2), "stroke-opacity": 0.95 });
        group.append(outer, inner);
        els.push(outer, inner);
      } else {
        const p = el("path", { ...common, stroke: this.paint(item.ink, "line"), "stroke-width": (s.width * 1.4).toFixed(2), "stroke-opacity": 0.94 });
        group.append(p);
        els.push(p);
      }
      g.appendChild(group);
      entry.paths.push({ group, els, L, len: s.len });
    }
    this.nodes.set(item.index, entry);
  }

  buildGlyph(g, item) {
    const id = `gm-${++maskSeq}`;
    const bb = item.bbox;
    const mask = el("mask", {
      id,
      maskUnits: "userSpaceOnUse",
      x: bb.x0.toFixed(1),
      y: bb.y0.toFixed(1),
      width: (bb.x1 - bb.x0).toFixed(1),
      height: (bb.y1 - bb.y0).toFixed(1),
    });
    const polys = [];
    for (const s of item.strokes) {
      const L = s.len + 2;
      const attrs = {
        d: toPathD(s.pts),
        fill: "none",
        stroke: "#fff",
        "stroke-width": item.revealW.toFixed(2),
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        visibility: "hidden",
      };
      if (s.len >= 1) {
        attrs["stroke-dasharray"] = `${L} ${L}`;
        attrs["stroke-dashoffset"] = L;
      }
      const p = el("path", attrs);
      mask.appendChild(p);
      polys.push({ p, L, len: s.len });
    }
    this.defs.appendChild(mask);
    const group = el("g", { mask: `url(#${id})`, visibility: "hidden" });
    const outline = el("path", {
      d: item.outlineD,
      fill: this.paint(item.ink, "text"),
      "fill-opacity": this.chalk ? 1 : 0.94,
    });
    if (this.chalk) {
      outline.setAttribute("stroke", this.paint(item.ink, "text"));
      outline.setAttribute("stroke-width", (item.stemPx * 0.18).toFixed(2));
      outline.setAttribute("stroke-linejoin", "round");
      outline.setAttribute("stroke-opacity", 0.35);
    }
    group.appendChild(outline);
    g.appendChild(group);
    this.nodes.set(item.index, { kind: "glyph", group, mask, polys, done: 0 });
  }

  /** 획 하나의 진행 정도(0~1)를 반영한다 */
  setPart(part, p) {
    const n = this.nodes.get(part.item.index);
    if (!n) return;
    if (n.kind === "line") {
      const q = n.paths[part.si];
      if (p > 0 && q.group.getAttribute("visibility") !== "visible") q.group.setAttribute("visibility", "visible");
      const shown = p >= 1 ? q.L : p * q.len;
      const off = (q.L - shown).toFixed(2);
      for (const e of q.els) e.setAttribute("stroke-dashoffset", off);
    } else {
      const q = n.polys[part.si];
      if (p > 0) {
        if (n.group.getAttribute("visibility") !== "visible") n.group.setAttribute("visibility", "visible");
        if (q.p.getAttribute("visibility") !== "visible") q.p.setAttribute("visibility", "visible");
      }
      if (q.len >= 1) q.p.setAttribute("stroke-dashoffset", (q.L - (p >= 1 ? q.L : p * q.len)).toFixed(2));
    }
  }

  /** 항목의 모든 획이 끝났을 때 */
  completeItem(item) {
    const n = this.nodes.get(item.index);
    if (n && n.kind === "glyph") {
      n.group.removeAttribute("mask");
      n.mask.remove();
    }
  }

  completeAll() {
    for (const item of this.scene.items) {
      item.strokes.forEach((_, si) => this.setPart({ item, si }, 1));
      this.completeItem(item);
    }
  }

  destroy() {
    this.host.innerHTML = "";
  }
}
