import type { Dataset, Direction, Paper, Segment } from "../data";
import { t } from "../i18n";
import { Scatter, type Overlay } from "../charts/scatter";
import { REGIME_VARS, regimeAlpha, regimeLegend, regimeOf, type RegimeState } from "../charts/regimes";
import { $, css, earthify, el, fmt, fmtFixed, fmtInt } from "../util";
import { MASS_AXIS, RADIUS_AXIS, isCalc, planetTip } from "./diagrams";

type Row = { model: string; rmse: number; frac?: number };

/** Página de resultados: números principais, laboratório de modelos, origem do erro e efeito dos calculados. */
export function initResults(onPick: (i: number) => void) {
  let d!: Dataset;
  let paper!: Paper;
  let dir: Direction = "mass_from_radius";
  let selected = "m3";
  let regimes: RegimeState = { visible: [true, true, true], hover: null };
  let lab: Scatter | null = null;
  let cont: Scatter | null = null;
  let contMode: "clean" | "naive" = "clean";

  const live = () => d.label === "live";

  /* ------------------------------------------------------ números principais */
  function headline() {
    let items: [string, string][];
    if (!live()) {
      const dm = paper.decomposition.mass_from_radius;
      const dr = paper.decomposition.radius_from_mass;
      const b = paper.breaks.radius_from_mass[1];
      items = [
        [t("hr.1v", { v: fmtFixed(dm.intrinsic_factor, 1) }), t("hr.1", { r: fmtFixed(dr.intrinsic_factor, 2) })],
        [t("hr.2v", { v: fmtFixed(dm.intrinsic_fraction * 100, 0) }), t("hr.2", { g: fmtFixed(dm.giants_fraction * 100, 0) })],
        [t("hr.3v", { v: fmtInt(b.value) }), t("hr.3", { lo: fmtInt(b.lo), hi: fmtInt(b.hi), ck: `${fmtFixed(paper.breaks.ck_reference_mass, 1)} M⊕` })],
      ];
    } else {
      const dm = d.models.cv.mass_from_radius.decomposition_m4;
      const dr = d.models.cv.radius_from_mass.decomposition_m4;
      const brk = d.models.fits.radius_from_mass.m3.breaks_linear[1];
      items = [
        [t("hr.1v", { v: fmtFixed(dm.intrinsic_factor, 1) }), t("hr.1", { r: fmtFixed(dr.intrinsic_factor, 2) })],
        [t("hr.2v", { v: fmtFixed(dm.intrinsic_fraction * 100, 0) }), t("hr.2b")],
        [t("hr.3v", { v: fmtInt(brk) }), t("hr.3b", { ck: `${fmtFixed(paper.breaks.ck_reference_mass, 1)} M⊕` })],
      ];
    }
    $("#headline-results").replaceChildren(
      ...items.map(([v, txt]) => el("div", { class: "hr" }, el("p", { class: "hr__value" }, v), el("p", { class: "hr__text" }, txt))),
    );
  }

  /* ------------------------------------------------------ dados por direção */
  function rows(): Row[] {
    if (!live()) return [...paper.cv[dir]].sort((a, b) => a.rmse - b.rmse);
    return Object.entries(d.models.cv[dir])
      .filter(([k]) => !k.startsWith("decomposition"))
      .map(([model, v]) => ({ model, rmse: (v as { rmse_dex: number }).rmse_dex, frac: (v as { median_frac_err: number }).median_frac_err }))
      .sort((a, b) => a.rmse - b.rmse);
  }
  const floor = () =>
    live() ? d.models.cv[dir].decomposition_m4.intrinsic_factor : paper.decomposition[dir].intrinsic_factor;
  const curves = () => d.models.curves?.[dir] ?? {};

  /** Converte um ponto da curva (log preditor, log resposta) em (massa, raio). */
  const toMR = (lx: number, ly: number): [number, number] =>
    dir === "mass_from_radius" ? [10 ** ly, 10 ** lx] : [10 ** lx, 10 ** ly];

  /* ------------------------------------------------------- lista de modelos */
  function renderList() {
    const list = rows();
    if (!list.some((r) => r.model === selected)) selected = list.find((r) => r.model === "m3")?.model ?? list[0].model;
    const fl = floor();
    const maxF = Math.max(...list.map((r) => 10 ** r.rmse), fl);
    const top = Math.ceil(maxF * 1.06 * 10) / 10;
    const pos = (f: number) => `${((100 * (f - 1)) / (top - 1)).toFixed(2)}%`;
    const box = $("#model-list");
    box.replaceChildren(
      ...list.map((r) => {
        const f = 10 ** r.rmse;
        const input = el("input", { type: "radio", name: "model", value: r.model });
        input.checked = r.model === selected;
        input.addEventListener("change", () => {
          selected = r.model;
          updateLab(true);
          describe();
        });
        return el(
          "label",
          { class: `model${r.model === "ck" ? " model--ck" : ""}` },
          input,
          el("span", { class: "model__name" }, t(`model.${r.model}`)),
          el(
            "span",
            { class: "model__bar", "aria-hidden": "true" },
            el("i", { class: "model__fill", style: `--p:${pos(f)}` }),
            el("b", { class: "model__floor", style: `--p:${pos(fl)}` }),
          ),
          el("span", { class: "model__v" }, `${fmtFixed(f, 2)}×`),
        );
      }),
    );
    $("#cv-note").textContent = `${live() ? t("cv.note.live", { date: d.date.split("-").reverse().join("/") }) : t("cv.note.paper")} ${t("cv.floorNote", { v: fmtFixed(fl, 2) })}`;
  }

  /* --------------------------------------------------- gráfico do laboratório */
  function curveOverlay(model: string, color: string, width: number, alpha: number): Overlay | null {
    const c = curves();
    if (!c[model]) return null;
    const xs = c.x;
    const ys = c[model];
    return (ctx, sx, sy) => {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = "round";
      ctx.beginPath();
      xs.forEach((lx, k) => {
        const [m, r] = toMR(lx, ys[k]);
        if (k === 0) ctx.moveTo(sx(m), sy(r));
        else ctx.lineTo(sx(m), sy(r));
      });
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
  }

  function bandOverlay(model: string, factor: number): Overlay | null {
    const c = curves();
    if (!c[model]) return null;
    const xs = c.x;
    const ys = c[model];
    const lf = Math.log10(factor);
    const band = (ctx: CanvasRenderingContext2D, sx: (v: number) => number, sy: (v: number) => number) => {
      ctx.beginPath();
      xs.forEach((lx, k) => {
        const [m, r] = toMR(lx, ys[k] + lf);
        if (k === 0) ctx.moveTo(sx(m), sy(r));
        else ctx.lineTo(sx(m), sy(r));
      });
      for (let k = xs.length - 1; k >= 0; k--) {
        const [m, r] = toMR(xs[k], ys[k] - lf);
        ctx.lineTo(sx(m), sy(r));
      }
      ctx.closePath();
    };
    const ov: Overlay = (ctx, sx, sy) => {
      ctx.fillStyle = css("--band");
      band(ctx, sx, sy);
      ctx.fill();
    };
    (ov as Overlay & { under?: boolean }).under = true;
    return ov;
  }

  function updateLab(animate: boolean, duration = 500) {
    if (!lab) return;
    const p = d.planets;
    const list = rows();
    const sel = list.find((r) => r.model === selected);
    const overlays: Overlay[] = [];
    const band = sel ? bandOverlay(selected, 10 ** sel.rmse) : null;
    if (band) overlays.push(band);
    for (const r of list) {
      if (r.model === selected) continue;
      const o = curveOverlay(r.model, css("--dust"), 1.25, 0.55);
      if (o) overlays.push(o);
    }
    const main = curveOverlay(selected, selected === "ck" ? css("--calculated") : css("--accent"), 2.75, 1);
    if (main) overlays.push(main);
    const colors = REGIME_VARS.map(css);
    lab.setStyle(
      (i) => {
        if (!p.clean[i]) return { color: null, alpha: 0, r: 2 };
        const k = regimeOf(p.mass[i]);
        const a = regimeAlpha(regimes, k, 0.55);
        return { color: a == null ? null : colors[k], alpha: a ?? 0, r: 2 };
      },
      animate,
      overlays,
      duration,
    );
    keys();
  }

  function keys() {
    $("#lab-keys").replaceChildren(
      el("span", { class: "key" }, el("i", { class: "line", style: `--c: var(${selected === "ck" ? "--calculated" : "--accent"})` }), el("span", {}, t("lab.selected"))),
      el("span", { class: "key" }, el("i", { class: "line line--thin", style: "--c: var(--dust)" }), el("span", {}, t("lab.others"))),
      el("span", { class: "key" }, el("i", { class: "rect", style: "--c: var(--band)" }), el("span", {}, t("legend.band"))),
    );
  }

  function describe() {
    const r = rows().find((x) => x.model === selected);
    if (!r) return;
    const f = 10 ** r.rmse;
    const hasCurve = !!curves()[selected];
    const notes: string[] = [];
    if (!hasCurve) notes.push(t("lab.noCurve"));
    if (selected === "rf" || selected === "gb") notes.push(t("lab.pd"));
    $("#lab-desc").replaceChildren(
      el("h4", { class: "lab__title" }, t(`model.${selected}`)),
      el("p", {}, t(`mdesc.${selected}`)),
      el(
        "dl",
        { class: "facts facts--row" },
        el("dt", {}, t("lab.factor")),
        el("dd", {}, `${fmtFixed(f, 2)}×`),
        el("dt", {}, "RMSE"),
        el("dd", {}, `${fmtFixed(r.rmse, 3)} dex`),
        ...(r.frac != null ? [el("dt", {}, t("lab.frac")), el("dd", {}, `${fmtFixed(r.frac * 100, 0)}%`)] : []),
      ),
      ...notes.map((n) => el("p", { class: "figure__note" }, n)),
    );
  }

  function buildLab() {
    const p = d.planets;
    const container = $("#lab-chart");
    container.replaceChildren();
    lab = new Scatter(container, {
      x: MASS_AXIS,
      y: RADIUS_AXIS,
      xs: p.mass,
      ys: p.radius,
      height: (w) => Math.max(320, Math.min(w * 0.68, 520)),
      tooltip: (i) => planetTip(d, i),
      onClick: onPick,
      compactAxes: true,
    });
    const counts = [0, 0, 0];
    p.mass.forEach((m, i) => {
      if (p.clean[i]) counts[regimeOf(m)]++;
    });
    regimes = regimeLegend($("#lab-regimes"), counts, (s) => {
      regimes = s;
      updateLab(true, 220);
    });
    updateLab(false);
  }

  /* ---------------------------------------------------- de onde vem o erro */
  function decomposition() {
    const segs: Segment[] = live() ? d.models.cv[dir].decomposition_segments : paper.decomposition[dir].segments;
    const total = live() ? d.models.cv[dir].decomposition_m4.intrinsic_fraction : paper.decomposition[dir].intrinsic_fraction;
    const nTotal = segs.reduce((a, s) => a + s.n, 0);
    const br = live()
      ? d.models.fits[dir].m3.breaks_linear
      : paper.breaks[dir].map((b) => b.value);
    const key = dir === "mass_from_radius" ? "dec.segR" : "dec.segM";
    const fb = (v: number) => (v >= 100 ? fmtInt(v) : fmt(v, v >= 10 ? 1 : 2));
    const segLabel = (k: number) =>
      k === 0 ? t(`${key}.0`, { b: fb(br[0]) }) : k === 1 ? t(`${key}.1`, { a: fb(br[0]), b: fb(br[1]) }) : t(`${key}.2`, { a: fb(br[1]) });
    const data = [
      { label: t("dec.total"), n: nTotal, f: total, strong: true },
      ...segs.map((sg) => ({ label: segLabel(sg.segment), n: sg.n, f: sg.intrinsic_fraction, strong: false })),
    ];
    const box = $("#dec-chart");
    // guarda as larguras atuais para a barra deslizar até o novo valor
    const prev = Array.from(box.querySelectorAll<HTMLElement>(".dec-bar__intr")).map((e) => e.style.getPropertyValue("--w"));
    const pct = (v: number) => `${fmtFixed(v * 100, 0)}%`;
    const target = data.map((r) => `${(r.f * 100).toFixed(1)}%`);
    box.replaceChildren(
      ...data.map((r, k) =>
        el(
          "div",
          { class: `dec-row${r.strong ? " dec-row--total" : ""}` },
          el("div", { class: "dec-row__label" }, el("span", {}, r.label), el("span", { class: "dec-row__n" }, t("dec.n", { n: fmtInt(r.n) }))),
          el(
            "div",
            { class: "dec-bar" },
            el("span", { class: "dec-bar__intr", style: `--w:${prev[k] || target[k]}` }, pct(r.f)),
            el("span", { class: "dec-bar__instr" }, 1 - r.f >= 0.09 ? pct(1 - r.f) : ""),
          ),
        ),
      ),
    );
    if (prev.length) {
      requestAnimationFrame(() =>
        box.querySelectorAll<HTMLElement>(".dec-bar__intr").forEach((e, k) => e.style.setProperty("--w", target[k])),
      );
    }
    earthify(box);
    $("#dec-legend").replaceChildren(
      el("span", { class: "key" }, el("i", { class: "rect", style: "--c: var(--intrinsic)" }), el("span", {}, t("dec.intr"))),
      el("span", { class: "key" }, el("i", { class: "rect", style: "--c: var(--instrumental)" }), el("span", {}, t("dec.instr"))),
    );
  }

  /* -------------------------------------------- efeito dos valores calculados */
  function fit(idx: number[]) {
    const p = d.planets;
    let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
    for (const i of idx) {
      const x = Math.log10(p.radius[i]);
      const y = Math.log10(p.mass[i]);
      n++; sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y;
    }
    const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const a = (sy - b * sx) / n;
    const r = (n * sxy - sx * sy) / Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
    return { n, a, b, r2: r * r };
  }

  function buildCont() {
    const p = d.planets;
    const container = $("#cont-chart");
    container.replaceChildren();
    cont = new Scatter(container, {
      x: MASS_AXIS,
      y: RADIUS_AXIS,
      xs: p.mass,
      ys: p.radius,
      height: (w) => Math.max(280, Math.min(w * 0.7, 420)),
      tooltip: (i) => planetTip(d, i),
      onClick: onPick,
      compactAxes: true,
    });
    updateCont(false);
  }

  function updateCont(animate: boolean) {
    if (!cont) return;
    const p = d.planets;
    const idx: number[] = [];
    for (let i = 0; i < d.n; i++) {
      const inNaive = !p.controversial[i];
      if (contMode === "clean" ? p.clean[i] : inNaive) idx.push(i);
    }
    const f = fit(idx);
    const line: Overlay = (ctx, sx, sy) => {
      ctx.strokeStyle = css("--accent");
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let k = 0; k <= 60; k++) {
        const r = 0.3 * Math.pow(25 / 0.3, k / 60);
        const m = 10 ** (f.a + f.b * Math.log10(r));
        if (k === 0) ctx.moveTo(sx(m), sy(r));
        else ctx.lineTo(sx(m), sy(r));
      }
      ctx.stroke();
    };
    const set = new Set(idx);
    cont.setStyle(
      (i) => {
        if (!set.has(i)) return { color: null, alpha: 0, r: 1.6 };
        const calc = isCalc(d, i);
        return { color: calc ? css("--calculated") : css("--measured"), alpha: calc ? 0.7 : 0.5, r: 1.6 };
      },
      animate,
      [line],
      500,
    );
    $("#cont-facts").replaceChildren(
      el("dt", {}, t("cont.fitN")),
      el("dd", {}, fmtInt(f.n)),
      el("dt", {}, t("cont.fitSlope")),
      el("dd", {}, fmtFixed(f.b, 3)),
      el("dt", {}, t("cont.fitR2")),
      el("dd", {}, fmtFixed(f.r2, 2)),
    );
  }

  /* --------------------------------------------------------------- eventos */
  document.querySelectorAll<HTMLInputElement>('input[name="resdir"]').forEach((r) =>
    r.addEventListener("change", () => {
      dir = r.value as Direction;
      renderList();
      updateLab(true, 500);
      describe();
      decomposition();
    }),
  );
  document.querySelectorAll<HTMLInputElement>('input[name="cont"]').forEach((r) =>
    r.addEventListener("change", () => {
      contMode = r.value as "clean" | "naive";
      updateCont(true);
    }),
  );

  function setData(next: Dataset, nextPaper: Paper) {
    d = next;
    paper = nextPaper;
    headline();
    renderList();
    buildLab();
    describe();
    decomposition();
    buildCont();
  }

  function redraw() {
    headline();
    renderList();
    describe();
    decomposition();
    lab?.redraw();
    cont?.redraw();
    keys();
    const counts = [0, 0, 0];
    d.planets.mass.forEach((m, i) => {
      if (d.planets.clean[i]) counts[regimeOf(m)]++;
    });
    regimes = regimeLegend($("#lab-regimes"), counts, (s) => {
      regimes = s;
      updateLab(true, 220);
    });
    updateLab(false);
    updateCont(false);
  }

  return { setData, redraw };
}
