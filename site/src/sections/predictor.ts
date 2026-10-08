import { ckRadius, predictBroken, regimeOf, SOLAR, type Dataset } from "../data";
import { t } from "../i18n";
import { $, earthify, el, fmt, fmtFixed } from "../util";
import { predictorChart } from "./diagrams";

type Dir = "mass" | "radius";

function quantile(sorted: number[], q: number) {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (i - lo);
}

export function initPredictor() {
  const form = $("#pred-form") as HTMLFormElement;
  const input = $("#pred-input") as HTMLInputElement;
  const slider = $("#pred-slider") as HTMLInputElement;
  const chartEl = $("#pred-chart");
  let d!: Dataset;
  let chart!: ReturnType<typeof predictorChart>;
  let range!: Record<Dir, [number, number]>;

  function setData(next: Dataset) {
    d = next;
    chartEl.replaceChildren();
    chart = predictorChart(chartEl, d);
    const p = d.planets;
    const cleanR = p.radius.filter((_, i) => p.clean[i]).sort((a, b) => a - b);
    const cleanM = p.mass.filter((_, i) => p.clean[i]).sort((a, b) => a - b);
    // a massa é prevista a partir do raio: o intervalo relevante é o do raio
    range = {
      mass: [quantile(cleanR, 0.01), quantile(cleanR, 0.99)],
      radius: [quantile(cleanM, 0.01), quantile(cleanM, 0.99)],
    };
    labels();
    setValue(value);
  }
  const sliderDomain: Record<Dir, [number, number]> = { mass: [0.4, 25], radius: [0.1, 5000] };

  let dir: Dir = "mass";
  let preset: keyof typeof SOLAR | null = "neptune";
  let value: number = SOLAR.neptune.radius;
  let touched = false;

  const toSlider = (v: number) => {
    const [a, b] = sliderDomain[dir];
    return Math.round((1000 * Math.log(v / a)) / Math.log(b / a));
  };
  const fromSlider = (s: number) => {
    const [a, b] = sliderDomain[dir];
    return a * Math.pow(b / a, s / 1000);
  };

  function labels() {
    $("#pred-input-label").textContent = dir === "mass" ? t("pred.inRadius") : t("pred.inMass");
    $("#pred-unit").textContent = dir === "mass" ? "R⊕" : "M⊕";
    earthify($("#pred-unit"));
    const [lo, hi] = range[dir];
    $("#pred-hint").textContent = t("pred.hint", { lo: fmt(lo), hi: fmt(hi), unit: dir === "mass" ? t("pred.unitR") : t("pred.unitM") });
    $("#pred-hint").classList.remove("is-error");
  }

  function compute() {
    const valid = isFinite(value) && value > 0;
    const out = $("#pred-value");
    const rng = $("#pred-range");
    const facts = $("#pred-facts");
    $("#pred-result-label").textContent = dir === "mass" ? t("pred.outMass") : t("pred.outRadius");
    if (!valid) {
      if (touched) {
        $("#pred-hint").textContent = t("pred.invalid");
        $("#pred-hint").classList.add("is-error");
      }
      out.textContent = "–";
      rng.textContent = "";
      facts.replaceChildren();
      return;
    }
    labels();
    const fits = d.models.fits;
    const cv = d.models.cv;
    const fit = dir === "mass" ? fits.mass_from_radius.m3 : fits.radius_from_mass.m3;
    const factor = dir === "mass" ? cv.mass_from_radius.m3.factor : cv.radius_from_mass.m3.factor;
    const pred = 10 ** predictBroken(fit, Math.log10(value));
    const unitS = dir === "mass" ? "M⊕" : "R⊕";
    const unitL = dir === "mass" ? t("pred.unitM") : t("pred.unitR");
    out.textContent = `${fmt(pred)} ${unitS}`;
    rng.textContent = t("pred.range", { lo: fmt(pred / factor), hi: fmt(pred * factor), unit: unitL });

    const rows: [string, string][] = [[t("pred.factor"), t("pred.factorV", { v: fmtFixed(factor, 2) })]];
    const massForRegime = dir === "mass" ? pred : value;
    rows.push([t("pred.regime"), t(`regime.${regimeOf(massForRegime)}`)]);
    if (dir === "radius") rows.push([t("pred.ck"), `${fmt(ckRadius(value))} R⊕`]);
    if (preset) {
      const s = SOLAR[preset];
      const real = dir === "mass" ? s.mass : s.radius;
      rows.push([`${t("pred.real")} (${t(`planet.${preset}`)})`, `${fmt(real)} ${unitS}`]);
    }
    const [lo, hi] = range[dir];
    facts.replaceChildren(...rows.flatMap(([k, v]) => [el("dt", {}, k), el("dd", {}, v)]));
    if (value < lo || value > hi) {
      $("#pred-hint").textContent = t("pred.outside");
      $("#pred-hint").classList.add("is-error");
    }
    chart.update(dir, value, pred, factor, preset);
    earthify($("#prever"));
  }

  function setValue(v: number, fromSliderInput = false) {
    value = v;
    if (!fromSliderInput) slider.value = String(toSlider(v));
    input.value = String(Number(v.toPrecision(3)));
    compute();
  }

  form.querySelectorAll<HTMLInputElement>('input[name="dir"]').forEach((r) =>
    r.addEventListener("change", () => {
      dir = r.value as Dir;
      labels();
      const s = SOLAR[preset ?? "neptune"];
      setValue(dir === "mass" ? s.radius : s.mass);
    }),
  );
  input.addEventListener("input", () => {
    touched = true;
    preset = null;
    value = parseFloat(input.value.replace(",", "."));
    if (isFinite(value) && value > 0) slider.value = String(toSlider(value));
    $("#pred-hint").classList.remove("is-error");
    if (isFinite(value) && value > 0) compute();
  });
  input.addEventListener("blur", () => {
    touched = true;
    compute();
  });
  slider.addEventListener("input", () => {
    preset = null;
    setValue(fromSlider(+slider.value), true);
  });
  form.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach((b) =>
    b.addEventListener("click", () => {
      preset = b.dataset.preset as keyof typeof SOLAR;
      const s = SOLAR[preset];
      setValue(dir === "mass" ? s.radius : s.mass);
    }),
  );
  form.addEventListener("submit", (e) => e.preventDefault());

  return { setData, redraw: () => { labels(); compute(); chart.redraw(); } };
}
