import { scaleLinear, scaleLog, type ScaleContinuousNumeric } from "d3-scale";
import { Delaunay } from "d3-delaunay";
import { css, fmt, reducedMotion } from "../util";
import { hideTip, showTip } from "../tooltip";

export type Scale = ScaleContinuousNumeric<number, number>;

export interface AxisSpec {
  type: "log" | "linear";
  domain: [number, number];
  ticks: number[];
  label: () => string;
}

export interface PointStyle {
  color: string | null; // null = oculto
  alpha: number;
  r: number;
}

export interface ScatterOptions {
  x: AxisSpec;
  y: AxisSpec;
  xs: (number | null)[];
  ys: (number | null)[];
  height: (width: number) => number;
  margin?: { top: number; right: number; bottom: number; left: number };
  tooltip?: (i: number) => HTMLElement | null;
  onClick?: (i: number) => void;
  compactAxes?: boolean;
}

export type Overlay = (ctx: CanvasRenderingContext2D, sx: Scale, sy: Scale, p: number) => void;

export class Scatter {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private o: ScatterOptions;
  private w = 0;
  private h = 0;
  sx!: Scale;
  sy!: Scale;
  private n: number;
  private cur: { color: (string | null)[]; alpha: Float32Array; r: Float32Array };
  private from: { alpha: Float32Array };
  private target: { alpha: Float32Array };
  private overlays: Overlay[] = [];
  private overlayProgress = 1;
  private tween = 1;
  get settled() {
    return this.tween >= 1;
  }
  private intro = 1; // 0..1, posição aleatória -> posição real
  private introPos: Float32Array | null = null;
  private raf = 0;
  private delaunay: Delaunay<number> | null = null;
  private visibleIdx: number[] = [];
  private hoverIdx = -1;

  constructor(el: HTMLElement, o: ScatterOptions) {
    this.el = el;
    this.o = o;
    this.n = o.xs.length;
    this.canvas = document.createElement("canvas");
    el.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
    this.cur = { color: new Array(this.n).fill(null), alpha: new Float32Array(this.n), r: new Float32Array(this.n) };
    this.from = { alpha: new Float32Array(this.n) };
    this.target = { alpha: new Float32Array(this.n) };
    new ResizeObserver(() => this.resize()).observe(el);
    this.bindPointer();
    this.resize();
  }

  get margin() {
    return this.o.margin ?? (this.o.compactAxes ? { top: 8, right: 22, bottom: 40, left: 54 } : { top: 12, right: 24, bottom: 48, left: 60 });
  }

  private resize() {
    const w = this.el.clientWidth;
    if (!w) return;
    const h = this.o.height(w);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const m = this.margin;
    const mk = (a: AxisSpec, range: [number, number]): Scale =>
      (a.type === "log" ? scaleLog() : scaleLinear()).domain(a.domain).range(range).clamp(false) as Scale;
    this.sx = mk(this.o.x, [m.left, w - m.right]);
    this.sy = mk(this.o.y, [h - m.bottom, m.top]);
    this.buildIndex();
    this.draw();
  }

  /** Define o estilo de cada ponto (e, se dado, as camadas); anima a transição. */
  setStyle(fn: (i: number) => PointStyle, animate = true, overlays?: Overlay[], duration = 650) {
    if (overlays) {
      const changed = overlays.length !== this.overlays.length || overlays.some((o, k) => o !== this.overlays[k]);
      this.overlays = overlays;
      if (changed && animate && !reducedMotion()) this.overlayProgress = 0;
    }
    for (let i = 0; i < this.n; i++) {
      const s = fn(i);
      this.from.alpha[i] = this.cur.alpha[i];
      this.target.alpha[i] = s.color ? s.alpha : 0;
      if (s.color) this.cur.color[i] = s.color;
      this.cur.r[i] = s.r;
    }
    this.buildIndex();
    if (animate && !reducedMotion()) this.animate(duration);
    else {
      this.tween = 1;
      this.cur.alpha.set(this.target.alpha);
      this.draw();
    }
  }

  setOverlays(list: Overlay[], animate = true) {
    this.overlays = list;
    this.overlayProgress = animate && !reducedMotion() ? 0 : 1;
    if (this.overlayProgress < 1) this.animate(900);
    else this.draw();
  }

  /** Abertura: os pontos partem de posições aleatórias e chegam às reais. */
  playIntro(duration = 2600) {
    if (reducedMotion()) return;
    this.introPos = new Float32Array(this.n * 2);
    for (let i = 0; i < this.n; i++) {
      this.introPos[2 * i] = Math.random();
      this.introPos[2 * i + 1] = Math.random();
    }
    this.intro = 0;
    this.animate(duration, true);
  }

  private animate(duration: number, isIntro = false) {
    cancelAnimationFrame(this.raf);
    const start = performance.now();
    const o0 = this.overlayProgress;
    const step = (now: number) => {
      const k = Math.min((now - start) / duration, 1);
      const e = 1 - Math.pow(1 - k, 3);
      if (isIntro) {
        this.intro = e;
        this.overlayProgress = Math.max(0, (k - 0.55) / 0.45);
      } else {
        this.tween = e;
        if (o0 < 1) this.overlayProgress = o0 + (1 - o0) * e;
      }
      for (let i = 0; i < this.n; i++) {
        this.cur.alpha[i] = this.from.alpha[i] + (this.target.alpha[i] - this.from.alpha[i]) * (isIntro ? 1 : e);
      }
      this.draw();
      if (k < 1) this.raf = requestAnimationFrame(step);
      else {
        this.introPos = null;
        this.intro = 1;
        this.tween = 1;
        this.overlayProgress = 1;
        this.draw();
      }
    };
    this.raf = requestAnimationFrame(step);
  }

  private buildIndex() {
    if (!this.sx) return;
    const pts: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < this.n; i++) {
      const x = this.o.xs[i];
      const y = this.o.ys[i];
      if (x == null || y == null || !(this.target.alpha[i] > 0)) continue;
      const px = this.sx(x);
      const py = this.sy(y);
      if (!isFinite(px) || !isFinite(py)) continue;
      pts.push(px, py);
      idx.push(i);
    }
    this.visibleIdx = idx;
    this.delaunay = idx.length > 2 ? new Delaunay(Float64Array.from(pts)) : null;
  }

  private bindPointer() {
    const find = (ev: PointerEvent) => {
      if (!this.delaunay) return -1;
      const r = this.canvas.getBoundingClientRect();
      const mx = ev.clientX - r.left;
      const my = ev.clientY - r.top;
      const j = this.delaunay.find(mx, my);
      const i = this.visibleIdx[j];
      if (i == null) return -1;
      const d = Math.hypot(this.sx(this.o.xs[i]!) - mx, this.sy(this.o.ys[i]!) - my);
      return d <= 24 ? i : -1;
    };
    this.canvas.addEventListener("pointermove", (ev) => {
      if (!this.o.tooltip) return;
      const i = find(ev);
      if (i !== this.hoverIdx) {
        this.hoverIdx = i;
        this.draw();
      }
      if (i < 0) return hideTip();
      const content = this.o.tooltip(i);
      if (content) showTip(content, ev.clientX, ev.clientY);
      this.canvas.style.cursor = this.o.onClick ? "pointer" : "default";
    });
    this.canvas.addEventListener("pointerleave", () => {
      this.hoverIdx = -1;
      hideTip();
      this.draw();
    });
    this.canvas.addEventListener("click", (ev) => {
      if (!this.o.onClick) return;
      const i = find(ev as PointerEvent);
      if (i >= 0) this.o.onClick(i);
    });
  }

  draw() {
    const { ctx, w, h } = this;
    if (!w) return;
    ctx.clearRect(0, 0, w, h);
    this.drawAxes();
    const m = this.margin;
    ctx.save();
    ctx.beginPath();
    ctx.rect(m.left, m.top - 6, w - m.left - m.right + 6, h - m.top - m.bottom + 12);
    ctx.clip();

    for (const ov of this.overlays) if ((ov as Overlay & { under?: boolean }).under) ov(ctx, this.sx, this.sy, this.overlayProgress);

    // pontos
    const xs = this.o.xs;
    const ys = this.o.ys;
    const pw = w - m.left - m.right;
    const ph = h - m.top - m.bottom;
    for (let i = 0; i < this.n; i++) {
      const a = this.cur.alpha[i];
      const c = this.cur.color[i];
      if (!(a > 0.01) || !c || xs[i] == null || ys[i] == null) continue;
      let px = this.sx(xs[i]!);
      let py = this.sy(ys[i]!);
      if (this.introPos && this.intro < 1) {
        const k = this.intro;
        px = m.left + this.introPos[2 * i] * pw + (px - m.left - this.introPos[2 * i] * pw) * k;
        py = m.top + this.introPos[2 * i + 1] * ph + (py - m.top - this.introPos[2 * i + 1] * ph) * k;
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(px, py, this.cur.r[i], 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const ov of this.overlays) if (!(ov as Overlay & { under?: boolean }).under) ov(ctx, this.sx, this.sy, this.overlayProgress);

    if (this.hoverIdx >= 0) {
      const i = this.hoverIdx;
      const px = this.sx(xs[i]!);
      const py = this.sy(ys[i]!);
      ctx.lineWidth = 2;
      ctx.strokeStyle = css("--void");
      ctx.beginPath();
      ctx.arc(px, py, this.cur.r[i] + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = css("--star");
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, this.cur.r[i] + 4.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawAxes() {
    const { ctx, w, h } = this;
    const m = this.margin;
    const grid = css("--rule");
    const ink = css("--dust");
    ctx.font = `${this.o.compactAxes ? 12 : 13}px "Archivo Variable", system-ui, sans-serif`;
    ctx.lineWidth = 1;
    ctx.fillStyle = ink;
    // grade e rótulos de x
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const v of this.o.x.ticks) {
      const px = Math.round(this.sx(v)) + 0.5;
      if (px < m.left - 1 || px > w - m.right + 1) continue;
      ctx.strokeStyle = grid;
      ctx.beginPath();
      ctx.moveTo(px, m.top);
      ctx.lineTo(px, h - m.bottom);
      ctx.stroke();
      ctx.fillText(fmt(v), px, h - m.bottom + 8);
    }
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const v of this.o.y.ticks) {
      const py = Math.round(this.sy(v)) + 0.5;
      if (py < m.top - 1 || py > h - m.bottom + 1) continue;
      ctx.strokeStyle = grid;
      ctx.beginPath();
      ctx.moveTo(m.left, py);
      ctx.lineTo(w - m.right, py);
      ctx.stroke();
      ctx.fillText(fmt(v), m.left - 8, py);
    }
    // títulos dos eixos
    ctx.fillStyle = ink;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(this.o.x.label(), w - m.right, h - 4);
    ctx.save();
    ctx.translate(12, m.top);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(this.o.y.label(), 0, 0);
    ctx.restore();
  }

  redraw() {
    this.draw();
  }
}

/** Curva em escala log desenhada progressivamente (p de 0 a 1). */
export function curveOverlay(
  f: (x: number) => number,
  domain: [number, number],
  color: string,
  width = 2,
): Overlay {
  return (ctx, sx, sy, p) => {
    const [a, b] = domain;
    const steps = 240;
    const end = Math.max(1, Math.round(steps * p));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let k = 0; k <= end; k++) {
      const x = a * Math.pow(b / a, k / steps);
      const px = sx(x);
      const py = sy(f(x));
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  };
}

/** Marcadores com rótulo (Sistema Solar). */
export function labelOverlay(points: { x: number; y: number; label: () => string }[]): Overlay {
  return (ctx, sx, sy, p) => {
    ctx.globalAlpha = p;
    ctx.font = `500 12px "Archivo Variable", system-ui, sans-serif`;
    ctx.textBaseline = "middle";
    for (const pt of points) {
      const px = sx(pt.x);
      const py = sy(pt.y);
      ctx.fillStyle = css("--void");
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = css("--star");
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = css("--star");
      ctx.textAlign = "left";
      ctx.fillText(pt.label(), px + 10, py - 14);
    }
    ctx.globalAlpha = 1;
  };
}
