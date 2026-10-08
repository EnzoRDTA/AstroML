import "@fontsource-variable/archivo/wdth.css";
import "./style.css";
import { applyStatic, detectLang, getLang, onLangChange, setLang, t, type Lang } from "./i18n";
import { loadDataset, loadHistory, loadLiveMeta, loadPaper, type Dataset, type DatasetLabel, type HistoryPoint, type Paper } from "./data";
import { $, earthify, el, fmtFixed, fmtInt } from "./util";
import { discoveriesChart, legend, METHOD_COLORS, monitorChart } from "./charts/svg";
import { heroChart, storyChart, storyVars, whyChart } from "./sections/diagrams";
import { initMeasure } from "./sections/measure";
import { initPredictor } from "./sections/predictor";
import { initExplorer } from "./sections/explorer";
import { initResults } from "./sections/results";
import { currentPage, initRouter, onPage, refreshRouterText } from "./router";

const REFS = [
  { key: "mayor", cite: "Mayor & Queloz (1995)", where: "Nature 378, 355", doi: "10.1038/378355a0" },
  { key: "seager", cite: "Seager & Mallén-Ornelas (2003)", where: "ApJ 585, 1038", doi: "10.1086/346105" },
  { key: "weiss", cite: "Weiss & Marcy (2014)", where: "ApJL 783, L6", doi: "10.1088/2041-8205/783/1/L6" },
  { key: "wolfgang", cite: "Wolfgang, Rogers & Ford (2016)", where: "ApJ 825, 19", doi: "10.3847/0004-637X/825/1/19" },
  { key: "chen", cite: "Chen & Kipping (2017)", where: "ApJ 834, 17", doi: "10.3847/1538-4357/834/1/17" },
  { key: "fulton", cite: "Fulton et al. (2017)", where: "AJ 154, 109", doi: "10.3847/1538-3881/aa80eb" },
  { key: "ning", cite: "Ning, Wolfgang & Ghosh (2018)", where: "ApJ 869, 5", doi: "10.3847/1538-4357/aaeb31" },
  { key: "otegi", cite: "Otegi, Bouchy & Helled (2020)", where: "A&A 634, A43", doi: "10.1051/0004-6361/201936482" },
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

function renderRefs() {
  $("#refs").replaceChildren(
    ...REFS.map((r) => {
      const href = `https://doi.org/${r.doi}`;
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
const results = initResults((i) => explorer.open(i));
let hero: ReturnType<typeof heroChart> | null = null;

function renderAll() {
  const d = state.d!;
  const paper = state.paper!;
  state.redraws = [];
  applyStatic();
  refreshRouterText();
  datasetOptions();

  $("#hero-chart").replaceChildren();
  hero = heroChart($("#hero-chart"), d, (i) => explorer.open(i));
  if (currentPage() === "inicio") hero.playIntro();

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

  measure.setData(d);
  predictor.setData(d);
  results.setData(d, paper);
  explorer.setData(d);
  renderRefs();
  renderAbout(d);

  state.redraws.push(() => hero?.redraw(), why.redraw, () => story?.redraw());
  earthify(document.body);
}

function initStoryObserver() {
  const steps = Array.from(document.querySelectorAll<HTMLElement>("#story-steps .step"));
  const graphic = document.querySelector<HTMLElement>(".scrolly__graphic")!;
  let ticking = false;
  // o passo ativo é o último cujo topo já passou de uma linha de leitura:
  // no computador, o meio da tela; no celular, um pouco abaixo do gráfico fixo
  const update = () => {
    ticking = false;
    if (graphic.offsetParent === null) return; // página escondida
    const mobile = window.innerWidth < 900;
    const g = graphic.getBoundingClientRect();
    const anchor = mobile ? g.bottom + (window.innerHeight - g.bottom) * 0.3 : window.innerHeight * 0.5;
    let k = 0;
    steps.forEach((s, i) => {
      if (s.querySelector("p")!.getBoundingClientRect().top <= anchor) k = i;
    });
    if (k !== currentStep || !steps[k].classList.contains("is-active")) {
      currentStep = k;
      steps.forEach((s, i) => s.classList.toggle("is-active", i === k));
      story?.go(k);
    }
  };
  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onPage((p) => {
    if (p === "dados") requestAnimationFrame(update);
  });
  steps[0].classList.add("is-active");
}

async function main() {
  setLang(detectLang());
  initLangSwitch();
  initRouter();
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
  onPage((p) => {
    if (p === "inicio") hero?.playIntro();
  });
  // os canvas desenham texto: redesenha quando a fonte terminar de carregar
  document.fonts?.ready.then(() => state.redraws.forEach((f) => f()));
  initStoryObserver();

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
  });
}

main();
