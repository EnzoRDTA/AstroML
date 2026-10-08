import "@fontsource-variable/archivo/wdth.css";
import "./style.css";
import { applyStatic, detectLang, getLang, onLangChange, setLang, t, type Lang } from "./i18n";
import { loadDataset, loadHistory, loadLiveMeta, loadPaper, type Dataset, type DatasetLabel, type HistoryPoint, type Paper } from "./data";
import { $, earthify, el, fmtFixed, fmtInt } from "./util";
import { cvChart, decompositionChart, discoveriesChart, legend, METHOD_COLORS, monitorChart } from "./charts/svg";
import { heroChart, storyChart, storyVars, whyChart } from "./sections/diagrams";
import { initMeasure } from "./sections/measure";
import { initPredictor } from "./sections/predictor";
import { initExplorer } from "./sections/explorer";

const REFS = [
  { key: "mayor", cite: "Mayor & Queloz (1995)", where: "Nature 378, 355", doi: "10.1038/378355a0" },
  { key: "seager", cite: "Seager & Mallén-Ornelas (2003)", where: "ApJ 585, 1038", doi: "10.1086/346105" },
  { key: "weiss", cite: "Weiss & Marcy (2014)", where: "ApJ 783, L6", doi: "10.1088/2041-8205/783/1/L6" },
  { key: "wolfgang", cite: "Wolfgang, Rogers & Ford (2016)", where: "ApJ 825, 19", doi: "10.3847/0004-637X/825/1/19" },
  { key: "chen", cite: "Chen & Kipping (2017)", where: "ApJ 834, 17", doi: "10.3847/1538-4357/834/1/17" },
  { key: "fulton", cite: "Fulton et al. (2017)", where: "AJ 154, 109", doi: "10.3847/1538-3881/aa80eb" },
  { key: "ning", cite: "Ning, Wolfgang & Ghosh (2018)", where: "ApJ 869, 5", url: "https://arxiv.org/abs/1811.02324" },
  { key: "otegi", cite: "Otegi, Bouchy & Helled (2020)", where: "A&A 634, A43", url: "https://arxiv.org/abs/1911.04745" },
  { key: "christiansen", cite: "Christiansen et al. (2025)", where: "PSJ 6, 186", doi: "10.3847/PSJ/ade3c2" },
];

const state: {
  label: DatasetLabel;
  d?: Dataset;
  paper?: Paper;
  history: HistoryPoint[];
  liveDate?: string;
  redraws: Array<() => void>;
} = { label: "snapshot", history: [], redraws: [] };

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat(getLang() === "pt" ? "pt-BR" : "en-US", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

/* --------------------------------------------------------------- controles */
function initLangSwitch() {
  document.querySelectorAll<HTMLButtonElement>(".lang button").forEach((b) => {
    b.addEventListener("click", () => setLang(b.dataset.lang as Lang));
  });
  const sync = () =>
    document.querySelectorAll<HTMLButtonElement>(".lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === getLang())));
  onLangChange(sync);
  sync();
}

function datasetOptions() {
  const sel = $("#dataset") as HTMLSelectElement;
  const short = (iso: string) => iso.split("-").reverse().join("/");
  const opts: [DatasetLabel, string][] = [["snapshot", t("data.snapshot", { date: short("2026-09-23") })]];
  if (state.liveDate) opts.push(["live", t("data.live", { date: short(state.liveDate) })]);
  sel.replaceChildren(...opts.map(([v, txt]) => el("option", { value: v }, txt)));
  sel.value = state.label;
}

/* ----------------------------------------------------------------- seções */
function renderFunnel(d: Dataset) {
  const max = d.audit.attrition[0].n;
  $("#funnel").replaceChildren(
    ...d.audit.attrition.map((s, i) => {
      const prev = i ? d.audit.attrition[i - 1].n : null;
      return el(
        "li",
        { class: "funnel__step", style: `--w:${((100 * s.n) / max).toFixed(2)}%` },
        el("span", { class: "funnel__label" }, t(`attr.${s.step}`)),
        el("span", { class: "funnel__bar", "aria-hidden": "true" }),
        el("span", { class: "funnel__n" }, fmtInt(s.n), prev != null && prev !== s.n ? el("small", {}, `−${fmtInt(prev - s.n)}`) : null),
      );
    }),
  );
  const c = d.audit.criterion;
  $("#rule-facts").replaceChildren(
    el("dt", {}, t("rule.recall")),
    el("dd", {}, `${fmtFixed(100 * c.mass.recall, 0)}%`),
    el("dt", {}, t("rule.precR")),
    el("dd", {}, fmtFixed(c.radius.precision, 2)),
    el("dt", {}, t("rule.precM")),
    el("dd", {}, fmtFixed(c.mass.precision, 2)),
  );
}

function renderStorySteps(d: Dataset) {
  const vars = storyVars(d);
  document.querySelectorAll<HTMLElement>("#story-steps .step").forEach((li) => {
    const k = +li.dataset.step!;
    li.querySelector("p")!.textContent = t(`step.${k}`, vars[k]);
  });
}

function renderResults(d: Dataset, paper: Paper) {
  const live = d.label === "live";
  const box = $("#headline-results");
  let items: [string, string][];
  if (!live) {
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
  box.replaceChildren(...items.map(([v, txt]) => el("div", { class: "hr" }, el("p", { class: "hr__value" }, v), el("p", { class: "hr__text" }, txt))));

  type Row = { model: string; rmse: number };
  const fromLive = (dir: "mass_from_radius" | "radius_from_mass"): Row[] =>
    Object.entries(d.models.cv[dir])
      .filter(([k]) => k !== "decomposition_m4")
      .map(([model, v]) => ({ model, rmse: (v as { rmse_dex: number }).rmse_dex }))
      .sort((a, b) => a.rmse - b.rmse);
  const massRows = live ? fromLive("mass_from_radius") : paper.cv.mass_from_radius;
  const radRows = live ? fromLive("radius_from_mass") : paper.cv.radius_from_mass;
  const floorM = live ? d.models.cv.mass_from_radius.decomposition_m4.intrinsic_factor : paper.decomposition.mass_from_radius.intrinsic_factor;
  const floorR = live ? d.models.cv.radius_from_mass.decomposition_m4.intrinsic_factor : paper.decomposition.radius_from_mass.intrinsic_factor;
  state.redraws.push(cvChart($("#cv-mass"), massRows, [1, 3], floorM));
  state.redraws.push(cvChart($("#cv-radius"), radRows, [1, 3], floorR));
  $("#cv-note").textContent = live ? t("cv.note.live", { date: fmtDate(d.date) }) : t("cv.note.paper");

  const decRows = live
    ? [
        { label: t("dec.mass"), intrinsic: d.models.cv.mass_from_radius.decomposition_m4.intrinsic_fraction },
        { label: t("dec.radius"), intrinsic: d.models.cv.radius_from_mass.decomposition_m4.intrinsic_fraction },
      ]
    : [
        { label: t("dec.mass"), intrinsic: paper.decomposition.mass_from_radius.intrinsic_fraction },
        { label: t("dec.radius"), intrinsic: paper.decomposition.radius_from_mass.intrinsic_fraction },
      ];
  legend($("#dec-legend"), [
    { color: "--intrinsic", label: t("dec.intr") },
    { color: "--instrumental", label: t("dec.instr") },
  ]);
  state.redraws.push(decompositionChart($("#dec-chart"), decRows));

  const c = paper.contamination;
  const tr = (label: string, a: string, b: string) => el("tr", {}, el("th", { scope: "row" }, label), el("td", { class: "num" }, a), el("td", { class: "num" }, b));
  $("#cont-table").replaceChildren(
    el("thead", {}, el("tr", {}, el("th", {}, ""), el("th", { scope: "col", class: "num" }, t("cont.naive")), el("th", { scope: "col", class: "num" }, t("cont.clean")))),
    el(
      "tbody",
      {},
      tr(t("cont.n"), fmtInt(c.naive.n), fmtInt(c.clean.n)),
      tr(t("cont.r2"), fmtFixed(c.naive.r2, 2), fmtFixed(c.clean.r2, 2)),
      tr(t("cont.slope"), fmtFixed(c.naive.slope_mr, 2), fmtFixed(c.clean.slope_mr, 2)),
      tr(t("cont.se"), fmtFixed(c.naive.se_mr, 3), fmtFixed(c.clean.se_mr, 3)),
    ),
  );
}

function renderRefs() {
  $("#refs").replaceChildren(
    ...REFS.map((r) => {
      const href = "doi" in r && r.doi ? `https://doi.org/${r.doi}` : (r as { url: string }).url;
      return el(
        "li",
        { class: "ref" },
        el("p", { class: "ref__cite" }, el("a", { href, target: "_blank", rel: "noopener" }, r.cite), el("span", { class: "ref__where" }, r.where)),
        el("p", { class: "ref__text" }, t(`ref.${r.key}`)),
      );
    }),
  );
}

function renderAbout(d: Dataset) {
  const last = state.history[state.history.length - 1];
  const a = d.audit;
  const lastDate = state.liveDate ?? a.date;
  $("#monitor-facts").replaceChildren(
    el("dt", {}, t("monitor.date")),
    el("dd", {}, fmtDate(lastDate)),
    el("dt", {}, t("monitor.planets")),
    el("dd", {}, fmtInt(last?.n_planets ?? a.n_planets)),
    el("dt", {}, t("monitor.mass")),
    el("dd", {}, `${fmtFixed(last?.mass_calc_pct ?? a.mass.pct, 1)}%`),
    el("dt", {}, t("monitor.radius")),
    el("dd", {}, `${fmtFixed(last?.radius_calc_pct ?? a.radius.pct, 1)}%`),
    el("dt", {}, t("monitor.clean")),
    el("dd", {}, fmtInt(last?.n_clean ?? d.models.n_clean)),
  );
  state.redraws.push(monitorChart($("#monitor-chart"), state.history));
  $("#cite-text").textContent = t("cite.text");
}

/* ------------------------------------------------------------ montagem */
let story: ReturnType<typeof storyChart> | null = null;
let currentStep = 0;
const predictor = initPredictor();
const explorer = initExplorer();
const measure = initMeasure();

function renderAll() {
  const d = state.d!;
  const paper = state.paper!;
  state.redraws = [];
  applyStatic();
  datasetOptions();

  $("#hero-chart").replaceChildren();
  const hero = heroChart($("#hero-chart"), d, (i) => explorer.open(i));

  legend(
    $("#disc-legend"),
    d.discoveries.methods.map((_, j) => ({ color: METHOD_COLORS[j], label: t(`method.${j}`) })),
  );
  state.redraws.push(discoveriesChart($("#disc-chart"), d.discoveries));
  $("#disc-note").textContent = t("disc.note", { pct: fmtFixed(d.audit.clean_transit_pct, 1) });

  $("#story-chart").replaceChildren();
  story = storyChart($("#story-chart"), $("#story-legend"), d, (i) => explorer.open(i));
  story.go(currentStep);
  renderStorySteps(d);
  renderFunnel(d);

  $("#why-chart").replaceChildren();
  const why = whyChart($("#why-chart"), $("#why-legend"), d, (i) => explorer.open(i));

  predictor.setData(d);
  renderResults(d, paper);
  explorer.setData(d);
  renderRefs();
  renderAbout(d);

  state.redraws.push(hero.redraw, why.redraw, () => story?.redraw());
  earthify(document.body);
}

function initStoryObserver() {
  const steps = Array.from(document.querySelectorAll<HTMLElement>("#story-steps .step"));
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const k = +(e.target as HTMLElement).dataset.step!;
        currentStep = k;
        steps.forEach((s) => s.classList.toggle("is-active", s === e.target));
        story?.go(k);
      }
    },
    { rootMargin: "-45% 0px -45% 0px" },
  );
  steps.forEach((s) => io.observe(s));
  steps[0].classList.add("is-active");
}

function initNavHighlight() {
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(".topnav a"));
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        links.forEach((a) => a.classList.toggle("is-current", a.getAttribute("href") === `#${e.target.id}`));
      }
    },
    { rootMargin: "-40% 0px -55% 0px" },
  );
  ["medir", "achado", "porque", "prever", "resultados", "explorar", "fontes"].forEach((id) => {
    const s = document.getElementById(id);
    if (s) io.observe(s);
  });
}

async function main() {
  setLang(detectLang());
  initLangSwitch();
  try {
    const [paper, history, liveMeta] = await Promise.all([loadPaper(), loadHistory(), loadLiveMeta().catch(() => null)]);
    state.paper = paper;
    state.history = history;
    state.liveDate = liveMeta?.date;
    state.d = await loadDataset(state.label);
  } catch (err) {
    console.error(err);
    $("#conteudo").prepend(el("p", { class: "load-error", role: "alert" }, t("load.error")));
    return;
  }
  renderAll();
  // os canvas desenham texto: redesenha quando a fonte terminar de carregar
  document.fonts?.ready.then(() => state.redraws.forEach((f) => f()));
  initStoryObserver();
  initNavHighlight();

  ($("#dataset") as HTMLSelectElement).addEventListener("change", async (e) => {
    const label = (e.target as HTMLSelectElement).value as DatasetLabel;
    document.body.classList.add("is-loading");
    try {
      state.d = await loadDataset(label);
      state.label = label;
      renderAll();
    } finally {
      document.body.classList.remove("is-loading");
    }
  });

  onLangChange(() => {
    if (!state.d) return;
    renderAll();
    measure.redraw();
  });
}

main();
