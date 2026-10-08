import { scaleBand, scaleLinear } from "d3-scale";
import { t } from "../i18n";
import { hideTip, showTip } from "../tooltip";
import { css, el, fmt, fmtFixed, fmtInt } from "../util";

const NS = "http://www.w3.org/2000/svg";
function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, text?: string) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text != null) e.textContent = text;
  return e;
}

function svgRoot(w: number, h: number, label: string) {
  return s("svg", { viewBox: `0 0 ${w} ${h}`, width: w, height: h, role: "img", "aria-label": label });
}

function observeWidth(container: HTMLElement, render: (w: number) => void) {
  let last = 0;
  const ro = new ResizeObserver(() => {
    const w = Math.round(container.clientWidth);
    if (w && w !== last) {
      last = w;
      render(w);
    }
  });
  ro.observe(container);
  return () => {
    last = 0;
    render(Math.round(container.clientWidth));
  };
}

function tipRows(title: string, rows: [string, string, string?][]) {
  return el(
    "div",
    {},
    el("strong", { class: "tip__title" }, title),
    ...rows.map(([k, v, c]) =>
      el("div", { class: "tip__row" }, el("span", {}, c ? el("i", { class: "tip__key", style: `--c:${c}` }) : null, k), el("b", {}, v)),
    ),
  );
}

/* --------------------------------------------------- descobertas por ano */
export const METHOD_COLORS = ["--m-transit", "--m-rv", "--m-micro", "--m-imaging", "--m-other"];

export function discoveriesChart(
  container: HTMLElement,
  data: { methods: string[]; years: number[]; counts: Record<string, number[]> },
) {
  const render = (w: number) => {
    const h = Math.max(240, Math.min(360, w * 0.42));
    const m = { top: 16, right: 8, bottom: 30, left: 48 };
    const years = data.years;
    const totals = years.map((_, i) => data.methods.reduce((a, k) => a + data.counts[k][i], 0));
    const x = scaleBand<number>().domain(years).range([m.left, w - m.right]).paddingInner(0.18);
    const ymax = Math.ceil(Math.max(...totals) / 500) * 500;
    const y = scaleLinear().domain([0, ymax]).range([h - m.bottom, m.top]);
    const svg = svgRoot(w, h, t("disc.h"));
    for (let v = 0; v <= ymax; v += 500) {
      const py = Math.round(y(v)) + 0.5;
      svg.append(s("line", { x1: m.left, x2: w - m.right, y1: py, y2: py, class: "grid" }));
      svg.append(s("text", { x: m.left - 8, y: py, class: "tick", "text-anchor": "end", "dominant-baseline": "middle" }, fmtInt(v)));
    }
    const bw = Math.min(x.bandwidth(), 24);
    years.forEach((yr, i) => {
      const cx = x(yr)! + (x.bandwidth() - bw) / 2;
      let acc = 0;
      const g = s("g", { class: "col", tabindex: 0 });
      const segs = data.methods.map((k, j) => ({ k, j, v: data.counts[k][i] })).filter((d) => d.v > 0);
      segs.forEach((d, idx) => {
        const y0 = y(acc);
        const y1 = y(acc + d.v);
        acc += d.v;
        const top = idx === segs.length - 1;
        const hgt = Math.max(0, y0 - y1 - (idx > 0 ? 2 : 0));
        if (hgt <= 0) return;
        const r = top ? Math.min(3, bw / 2, hgt) : 0;
        g.append(
          s("path", {
            d: roundedTop(cx, y1, bw, hgt, r),
            fill: css(METHOD_COLORS[d.j]),
          }),
        );
      });
      g.append(s("rect", { x: x(yr)!, y: m.top, width: x.bandwidth(), height: h - m.top - m.bottom, fill: "transparent" }));
      const show = (ev: MouseEvent | FocusEvent) => {
        const rect = (ev.currentTarget as Element).getBoundingClientRect();
        const px = "clientX" in ev ? ev.clientX : rect.right;
        const py = "clientY" in ev ? ev.clientY : rect.top;
        showTip(
          tipRows(
            `${yr}: ${fmtInt(totals[i])}`,
            data.methods.map((k, j) => [t(`method.${j}`), fmtInt(data.counts[k][i]), css(METHOD_COLORS[j])] as [string, string, string]).filter((r) => r[1] !== "0"),
          ),
          px,
          py,
        );
        g.classList.add("is-hover");
      };
      g.addEventListener("pointermove", show);
      g.addEventListener("focus", show);
      g.addEventListener("pointerleave", () => { hideTip(); g.classList.remove("is-hover"); });
      g.addEventListener("blur", () => { hideTip(); g.classList.remove("is-hover"); });
      svg.append(g);
      // rótulos seletivos: só os dois maiores anos
      const top2 = [...totals].sort((a, b) => b - a).slice(0, 2);
      if (top2.includes(totals[i])) {
        svg.append(s("text", { x: cx + bw / 2, y: y(totals[i]) - 6, class: "value", "text-anchor": "middle" }, fmtInt(totals[i])));
      }
    });
    const every = w < 560 ? 10 : 5;
    years.forEach((yr) => {
      if (yr % every === 0) svg.append(s("text", { x: x(yr)! + x.bandwidth() / 2, y: h - m.bottom + 18, class: "tick", "text-anchor": "middle" }, String(yr)));
    });
    container.replaceChildren(svg);
  };
  return observeWidth(container, render);
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  if (r <= 0) return `M${x},${y}h${w}v${h}h${-w}z`;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}z`;
}

export function legend(container: HTMLElement, items: { color: string; label: string; kind?: "dot" | "line" | "rect" }[]) {
  container.replaceChildren(
    ...items.map((it) =>
      el("span", { class: "key" }, el("i", { class: it.kind ?? "rect", style: `--c: var(${it.color})` }), el("span", {}, it.label)),
    ),
  );
}

/* ------------------------------------------- erro fora da amostra (dot plot) */
export function cvChart(container: HTMLElement, rows: { model: string; rmse: number }[], range: [number, number], floor?: number) {
  const render = (w: number) => {
    const rowH = 34;
    const labelW = Math.min(250, w * 0.52);
    const m = { top: 26, right: 56, bottom: 30, left: labelW };
    const h = m.top + rows.length * rowH + m.bottom;
    const x = scaleLinear().domain(range).range([m.left, w - m.right]).nice();
    const svg = svgRoot(w, h, t("cv.h"));
    for (const v of x.ticks(4)) {
      const px = Math.round(x(v)) + 0.5;
      svg.append(s("line", { x1: px, x2: px, y1: m.top, y2: h - m.bottom, class: "grid" }));
      svg.append(s("text", { x: px, y: h - m.bottom + 18, class: "tick", "text-anchor": "middle" }, `${fmt(v, 2)}×`));
    }
    if (floor) {
      const fx = Math.round(x(floor)) + 0.5;
      svg.append(s("rect", { x: x(range[0]), y: m.top, width: Math.max(0, fx - x(range[0])), height: h - m.top - m.bottom, class: "floor-zone" }));
      svg.append(s("line", { x1: fx, x2: fx, y1: m.top - 4, y2: h - m.bottom, class: "floor" }));
      svg.append(s("text", { x: fx - 6, y: m.top - 10, class: "floor-label", "text-anchor": "end" }, t("cv.floor", { v: fmtFixed(floor, 2) })));
    }
    rows.forEach((r, i) => {
      const cy = m.top + i * rowH + rowH / 2;
      const f = 10 ** r.rmse;
      const isCk = r.model === "ck";
      const g = s("g", { class: "row", tabindex: 0 });
      g.append(s("line", { x1: m.left, x2: x(f), y1: cy, y2: cy, class: "stem" }));
      g.append(s("circle", { cx: x(f), cy, r: 6, fill: css(isCk ? "--calculated" : "--measured"), stroke: css("--void"), "stroke-width": 2 }));
      g.append(s("text", { x: 0, y: cy, class: "row-label", "dominant-baseline": "middle" }, t(`model.${r.model}`)));
      g.append(s("text", { x: w - 4, y: cy, class: "row-value", "text-anchor": "end", "dominant-baseline": "middle" }, `${fmtFixed(f, 2)}×`));
      g.append(s("rect", { x: 0, y: cy - rowH / 2, width: w, height: rowH, fill: "transparent" }));
      const show = (ev: MouseEvent | FocusEvent) => {
        const rect = (ev.currentTarget as Element).getBoundingClientRect();
        showTip(
          tipRows(t(`model.${r.model}`), [
            [t("pred.factor"), `${fmtFixed(f, 2)}×`],
            ["RMSE", `${fmtFixed(r.rmse, 3)} dex`],
          ]),
          "clientX" in ev ? ev.clientX : rect.left + w / 2,
          "clientY" in ev ? ev.clientY : rect.top,
        );
      };
      g.addEventListener("pointermove", show);
      g.addEventListener("focus", show);
      g.addEventListener("pointerleave", hideTip);
      g.addEventListener("blur", hideTip);
      svg.append(g);
    });
    container.replaceChildren(svg);
  };
  return observeWidth(container, render);
}

/* ---------------------------------------------- decomposição (barras 100%) */
export function decompositionChart(container: HTMLElement, rows: { label: string; intrinsic: number }[]) {
  const render = (w: number) => {
    const rowH = 56;
    const m = { top: 4, right: 4, bottom: 4, left: 0 };
    const h = m.top + rows.length * rowH + m.bottom;
    const x = scaleLinear().domain([0, 1]).range([m.left, w - m.right]);
    const svg = svgRoot(w, h, t("dec.h"));
    rows.forEach((r, i) => {
      const y0 = m.top + i * rowH;
      svg.append(s("text", { x: 0, y: y0 + 12, class: "row-label" }, r.label));
      const by = y0 + 22;
      const bh = 22;
      const xi = x(r.intrinsic);
      svg.append(s("path", { d: `M${x(0)},${by}h${xi - x(0) - 1}v${bh}h${-(xi - x(0) - 1)}z`, fill: css("--intrinsic") }));
      svg.append(s("path", { d: `M${xi + 1},${by}H${x(1) - 4}Q${x(1)},${by} ${x(1)},${by + 4}V${by + bh - 4}Q${x(1)},${by + bh} ${x(1) - 4},${by + bh}H${xi + 1}z`, fill: css("--instrumental") }));
      const pct = (v: number) => `${fmtFixed(v * 100, 0)}%`;
      if (xi - x(0) > 48) svg.append(s("text", { x: x(0) + 10, y: by + bh / 2, class: "in-bar", "dominant-baseline": "middle" }, pct(r.intrinsic)));
      if (x(1) - xi > 48) svg.append(s("text", { x: x(1) - 10, y: by + bh / 2, class: "in-bar in-bar--dark", "text-anchor": "end", "dominant-baseline": "middle" }, pct(1 - r.intrinsic)));
    });
    container.replaceChildren(svg);
  };
  return observeWidth(container, render);
}

/* ---------------------------------------------------------- monitor (linha) */
export function monitorChart(container: HTMLElement, hist: { date: string; mass_calc_pct: number; radius_calc_pct: number }[]) {
  if (hist.length < 2) {
    container.replaceChildren(el("p", { class: "figure__note" }, t("monitor.wait")));
    return () => container.replaceChildren(el("p", { class: "figure__note" }, t("monitor.wait")));
  }
  const render = (w: number) => {
    const h = 180;
    const m = { top: 12, right: 64, bottom: 26, left: 36 };
    const xs = hist.map((d) => new Date(d.date).getTime());
    const x = scaleLinear().domain([Math.min(...xs), Math.max(...xs)]).range([m.left, w - m.right]);
    const vals = hist.flatMap((d) => [d.mass_calc_pct, d.radius_calc_pct]);
    const y = scaleLinear().domain([Math.floor(Math.min(...vals) - 2), Math.ceil(Math.max(...vals) + 2)]).range([h - m.bottom, m.top]).nice();
    const svg = svgRoot(w, h, t("monitor.h"));
    for (const v of y.ticks(3)) {
      const py = Math.round(y(v)) + 0.5;
      svg.append(s("line", { x1: m.left, x2: w - m.right, y1: py, y2: py, class: "grid" }));
      svg.append(s("text", { x: m.left - 6, y: py, class: "tick", "text-anchor": "end", "dominant-baseline": "middle" }, `${fmt(v, 0)}%`));
    }
    const series: [keyof (typeof hist)[0], string, string][] = [
      ["mass_calc_pct", "--calculated", t("monitor.mass")],
      ["radius_calc_pct", "--m-imaging", t("monitor.radius")],
    ];
    for (const [k, c] of series) {
      const d = hist.map((p, i) => `${i ? "L" : "M"}${x(xs[i])},${y(p[k] as number)}`).join("");
      svg.append(s("path", { d, fill: "none", stroke: css(c), "stroke-width": 2, "stroke-linejoin": "round" }));
      const lastV = hist[hist.length - 1][k] as number;
      svg.append(s("circle", { cx: x(xs[xs.length - 1]), cy: y(lastV), r: 4, fill: css(c), stroke: css("--void"), "stroke-width": 2 }));
      svg.append(s("text", { x: x(xs[xs.length - 1]) + 8, y: y(lastV), class: "tick", "dominant-baseline": "middle" }, `${fmtFixed(lastV, 1)}%`));
    }
    const leg = el("div", { class: "legend-row" });
    legend(leg, series.map(([, c, label]) => ({ color: c, label, kind: "line" as const })));
    container.replaceChildren(leg, svg);
  };
  return observeWidth(container, render);
}
