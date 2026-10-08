import type { Dataset } from "../data";
import { ckRadius, predictBroken, SOLAR } from "../data";
import { t } from "../i18n";
import { curveOverlay, labelOverlay, Scatter, type AxisSpec, type Overlay } from "../charts/scatter";
import { css, el, fmt, fmtFixed, fmtInt } from "../util";
import { REGIME_VARS, regimeAlpha, regimeLegend, regimeOf, type RegimeState } from "../charts/regimes";

export const MASS_AXIS: AxisSpec = {
  type: "log",
  domain: [0.015, 15000],
  ticks: [0.1, 1, 10, 100, 1000, 10000],
  label: () => t("axis.mass"),
};
export const RADIUS_AXIS: AxisSpec = {
  type: "log",
  domain: [0.28, 30],
  ticks: [0.5, 1, 2, 5, 10, 20],
  label: () => t("axis.radius"),
};
const CK_DOMAIN: [number, number] = [0.015, 15000];

export function isCalc(d: Dataset, i: number) {
  return d.planets.mass_calc[i] === 1 || d.planets.radius_calc[i] === 1;
}

export function planetTip(d: Dataset, i: number): HTMLElement {
  const p = d.planets;
  const origin: string[] = [];
  if (p.mass_calc[i]) origin.push(t("tip.calcMass"));
  if (p.radius_calc[i]) origin.push(t("tip.calcRad"));
  const color = isCalc(d, i) ? css("--calculated") : css("--measured");
  return el(
    "div",
    {},
    el("strong", { class: "tip__title" }, p.name[i]),
    el("div", { class: "tip__row" }, el("span", {}, t("tip.mass")), el("b", {}, `${fmt(p.mass[i])} M⊕`)),
    el("div", { class: "tip__row" }, el("span", {}, t("tip.radius")), el("b", {}, `${fmt(p.radius[i])} R⊕`)),
    el(
      "div",
      { class: "tip__origin" },
      el("i", { class: "tip__key", style: `--c:${color}` }),
      origin.length ? origin.join(", ") : t("orig.measured"),
    ),
  );
}

function ckOverlay(alpha = 1): Overlay {
  const base = curveOverlay(ckRadius, CK_DOMAIN, css("--curve"), 1.5);
  const ov: Overlay = (ctx, sx, sy, p) => {
    ctx.globalAlpha = alpha;
    base(ctx, sx, sy, p);
    ctx.globalAlpha = 1;
  };
  // desenhada por baixo dos pontos, para os valores calculados aparecerem sobre ela
  (ov as Overlay & { under?: boolean }).under = true;
  return ov;
}

/* ------------------------------------------------------------------ hero */
let introPlayed = false;
export function heroChart(container: HTMLElement, d: Dataset, onPick: (i: number) => void) {
  const p = d.planets;
  const sc = new Scatter(container, {
    x: MASS_AXIS,
    y: RADIUS_AXIS,
    xs: p.mass,
    ys: p.radius,
    height: (w) => Math.max(360, Math.min(w * 0.78, window.innerHeight * 0.72)),
    tooltip: (i) => planetTip(d, i),
    onClick: onPick,
    compactAxes: true,
  });
  const style = (i: number) => ({
    color: isCalc(d, i) ? css("--calculated") : css("--measured"),
    alpha: isCalc(d, i) ? 0.9 : 0.6,
    r: isCalc(d, i) ? 1.5 : 1.7,
  });
  // sem a curva: os próprios pontos laranja desenham a fórmula
  sc.setStyle(style, false, []);
  return {
    redraw: () => sc.redraw(),
    /** A abertura toca uma vez, na primeira vez que a página inicial aparece. */
    playIntro: () => {
      if (introPlayed) return;
      introPlayed = true;
      requestAnimationFrame(() => requestAnimationFrame(() => sc.playIntro()));
    },
  };
}

/* ----------------------------------------------------------- scrollytelling */
export function storyChart(container: HTMLElement, legend: HTMLElement, d: Dataset, onPick: (i: number) => void) {
  const p = d.planets;
  const sc = new Scatter(container, {
    x: MASS_AXIS,
    y: RADIUS_AXIS,
    xs: p.mass,
    ys: p.radius,
    // no celular o gráfico divide a tela com o texto, por isso fica mais baixo
    height: (w) =>
      window.innerWidth < 900
        ? Math.max(230, Math.min(w * 0.8, window.innerHeight * 0.36))
        : Math.max(320, Math.min(w * 0.72, window.innerHeight * 0.7)),
    tooltip: (i) => planetTip(d, i),
    onClick: onPick,
    compactAxes: window.innerWidth < 900,
  });
  let step = 0;
  const neutral = css("--star");
  const blue = css("--measured");
  const orange = css("--calculated");
  const ck = ckOverlay(0.95);
  const ckFaint = ckOverlay(0.35);

  const states: Record<number, () => void> = {
    0: () => sc.setStyle(() => ({ color: neutral, alpha: 0.45, r: 1.5 }), true, []),
    1: () => sc.setStyle((i) => ({ color: isCalc(d, i) ? orange : blue, alpha: isCalc(d, i) ? 0.85 : 0.55, r: 1.6 }), true, []),
    2: () => sc.setStyle((i) => ({ color: isCalc(d, i) ? orange : blue, alpha: isCalc(d, i) ? 0.9 : 0.2, r: 1.6 }), true, [ck]),
    3: () => sc.setStyle((i) => ({ color: isCalc(d, i) ? orange : blue, alpha: isCalc(d, i) ? 0.9 : 0.12, r: isCalc(d, i) ? 1.8 : 1.4 }), true, [ck]),
    4: () => sc.setStyle((i) => ({ color: p.clean[i] ? blue : null, alpha: 0.8, r: 2.2 }), true, [ckFaint]),
  };

  const legends: Record<number, [string, string][]> = {
    0: [["--star", "legend.measured"]],
    1: [["--measured", "legend.measured"], ["--calculated", "legend.calculated"]],
    2: [["--measured", "legend.measured"], ["--calculated", "legend.calculated"], ["line", "legend.ck"]],
    3: [["--measured", "legend.measured"], ["--calculated", "legend.calculated"], ["line", "legend.ck"]],
    4: [["--measured", "legend.clean"], ["line", "legend.ck"]],
  };

  function renderLegend() {
    legend.replaceChildren(
      ...legends[step].map(([c, key]) =>
        el("span", { class: "key" }, c === "line" ? el("i", { class: "line" }) : el("i", { class: "dot", style: `--c: var(${c})` }), el("span", {}, t(key))),
      ),
    );
    if (step === 0) legend.replaceChildren(el("span", { class: "key" }, el("i", { class: "dot", style: "--c: var(--star)" }), el("span", {}, t("axis.planets"))));
  }

  function go(s: number) {
    if (s === step && s !== 0) return;
    step = s;
    states[s]();
    renderLegend();
  }

  states[0]();
  renderLegend();
  return { go, redraw: () => { sc.redraw(); renderLegend(); } };
}

export function storyVars(d: Dataset) {
  const a = d.audit;
  const calcPlanets = d.planets.mass_calc.reduce((s, v, i) => s + (v || d.planets.radius_calc[i] ? 1 : 0), 0);
  const devCalc = a.deviation_by_mass_type.find((x) => x.type === "M-R relationship")?.median_dev_pct ?? 0;
  const devMeas = a.deviation_by_mass_type.find((x) => x.type === "Mass")?.median_dev_pct ?? 0;
  return {
    0: { n: fmtInt(d.n) },
    1: { n: fmtInt(calcPlanets), pm: fmtFixed(a.mass.pct, 1), pr: fmtFixed(a.radius.pct, 1) },
    2: { dc: fmtFixed(devCalc, 2), dm: fmtFixed(devMeas, 0) },
    3: {},
    4: { n: fmtInt(d.models.n_clean), s: fmtInt(d.models.n_stars) },
  } as Record<number, Record<string, string>>;
}

/* ------------------------------------------------------------ por que */
export function whyChart(container: HTMLElement, legend: HTMLElement, d: Dataset, onPick: (i: number) => void) {
  const p = d.planets;
  const ys = p.res_r.map((v, i) => (p.clean[i] && p.insol[i] && p.insol[i]! > 0 ? v : null));
  const sc = new Scatter(container, {
    x: { type: "log", domain: [0.03, 30000], ticks: [0.1, 1, 10, 100, 1000, 10000], label: () => t("axis.insol") },
    y: { type: "linear", domain: [-0.85, 0.85], ticks: [-0.8, -0.4, 0, 0.4, 0.8], label: () => t("axis.resid") },
    xs: p.insol,
    ys,
    height: (w) => Math.max(300, Math.min(w * 0.5, 460)),
    tooltip: (i) => planetTip(d, i),
    onClick: onPick,
  });
  const colors = REGIME_VARS.map(css);
  const zero: Overlay = (ctx, sx, sy) => {
    ctx.strokeStyle = css("--dust");
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx(0.03), Math.round(sy(0)) + 0.5);
    ctx.lineTo(sx(30000), Math.round(sy(0)) + 0.5);
    ctx.stroke();
  };
  const counts = [0, 0, 0];
  ys.forEach((v, i) => {
    if (v != null) counts[regimeOf(p.mass[i])]++;
  });
  let state: RegimeState = { visible: [true, true, true], hover: null };
  const apply = (animate: boolean, duration = 650) =>
    sc.setStyle(
      (i) => {
        if (ys[i] == null) return { color: null, alpha: 0, r: 2.2 };
        const k = regimeOf(p.mass[i]);
        const a = regimeAlpha(state, k, 0.8);
        return { color: a == null ? null : colors[k], alpha: a ?? 0, r: 2.3 };
      },
      animate,
      [zero],
      duration,
    );
  const renderLegend = () => {
    state = regimeLegend(legend, counts, (s) => {
      state = s;
      apply(true, 220);
    });
  };
  apply(false);
  renderLegend();
  return { redraw: () => { sc.redraw(); renderLegend(); apply(false); } };
}

/* -------------------------------------------------------- previsor (gráfico) */
export function predictorChart(container: HTMLElement, d: Dataset) {
  const p = d.planets;
  const sc = new Scatter(container, {
    x: MASS_AXIS,
    y: RADIUS_AXIS,
    xs: p.mass,
    ys: p.radius,
    height: (w) => Math.max(300, Math.min(w * 0.72, 480)),
    tooltip: (i) => planetTip(d, i),
    compactAxes: true,
  });
  sc.setStyle((i) => ({ color: p.clean[i] ? css("--measured") : null, alpha: 0.35, r: 1.6 }), false);

  function update(dir: "mass" | "radius", input: number, pred: number, factor: number, solarKey: string | null) {
    const fits = d.models.fits;
    const model = curveOverlay(
      dir === "radius"
        ? (m) => 10 ** predictBroken(fits.radius_from_mass.m3, Math.log10(m))
        : (m) => m,
      [0.06, 9000],
      css("--dust"),
      2,
    );
    // na direção massa ~ raio a curva é desenhada no espaço (raio -> massa)
    const massCurve: Overlay = (ctx, sx, sy) => {
      ctx.strokeStyle = css("--dust");
      ctx.lineWidth = 2;
      ctx.beginPath();
      const f = fits.mass_from_radius.m3;
      for (let k = 0; k <= 200; k++) {
        const r = 0.35 * Math.pow(16 / 0.35, k / 200);
        const m = 10 ** predictBroken(f, Math.log10(r));
        const px = sx(m);
        const py = sy(r);
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    };
    const band: Overlay = (ctx, sx, sy) => {
      ctx.fillStyle = css("--band");
      ctx.strokeStyle = css("--star");
      ctx.lineWidth = 2;
      if (dir === "mass") {
        const lo = pred / factor;
        const hi = pred * factor;
        const y = sy(input);
        ctx.fillRect(sx(lo), y - 7, sx(hi) - sx(lo), 14);
        ctx.beginPath();
        ctx.moveTo(sx(lo), y);
        ctx.lineTo(sx(hi), y);
        ctx.stroke();
        dot(ctx, sx(pred), y);
      } else {
        const lo = pred / factor;
        const hi = pred * factor;
        const x = sx(input);
        ctx.fillRect(x - 7, sy(hi), 14, sy(lo) - sy(hi));
        ctx.beginPath();
        ctx.moveTo(x, sy(lo));
        ctx.lineTo(x, sy(hi));
        ctx.stroke();
        dot(ctx, x, sy(pred));
      }
    };
    const overlays: Overlay[] = [dir === "radius" ? model : massCurve, band];
    if (solarKey && solarKey in SOLAR) {
      const s = SOLAR[solarKey as keyof typeof SOLAR];
      overlays.push(labelOverlay([{ x: s.mass, y: s.radius, label: () => t(`planet.${solarKey}`) }]));
    }
    sc.setStyle((i) => ({ color: p.clean[i] ? css("--measured") : null, alpha: 0.35, r: 1.6 }), false, overlays);
  }
  return { update, redraw: () => sc.redraw() };
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = css("--void");
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = css("--star");
  ctx.beginPath();
  ctx.arc(x, y, 5.5, 0, Math.PI * 2);
  ctx.fill();
}
