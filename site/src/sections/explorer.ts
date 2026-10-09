import { predictBroken, type Dataset } from "../data";
import { t } from "../i18n";
import { $, css, earthify, el, fmt, fmtFixed, fmtInt } from "../util";
import { isCalc } from "./diagrams";

const PAGE = 30;
type SortKey = "name" | "year" | "mass" | "radius";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function initExplorer() {
  const search = $("#exp-search") as HTMLInputElement;
  const origin = $("#exp-origin") as HTMLSelectElement;
  const method = $("#exp-method") as HTMLSelectElement;
  const regime = $("#exp-regime") as HTMLSelectElement;
  const table = $("#exp-table") as HTMLTableElement;
  const more = $("#exp-more") as HTMLButtonElement;
  const download = $("#exp-download") as HTMLButtonElement;
  const drawer = $("#drawer");
  const drawerBody = $("#drawer-body");
  let d!: Dataset;
  let names: string[] = [];
  let rows: number[] = [];
  let shown = PAGE;
  let sort: { key: SortKey; dir: 1 | -1 } = { key: "name", dir: 1 };
  let lastFocus: HTMLElement | null = null;

  function options() {
    const keep = [origin.value, method.value, regime.value];
    origin.replaceChildren(
      ...[["all", "exp.all"], ["clean", "exp.clean"], ["measured", "exp.measured"], ["calc", "exp.calc"]].map(([v, k]) => el("option", { value: v }, t(k))),
    );
    method.replaceChildren(el("option", { value: "all" }, t("exp.all")), ...[0, 1, 2, 3, 4].map((k) => el("option", { value: String(k) }, t(`method.${k}`))));
    regime.replaceChildren(el("option", { value: "all" }, t("exp.all")), ...[0, 1, 2].map((k) => el("option", { value: String(k) }, t(`regime.${k}`))));
    [origin.value, method.value, regime.value] = keep.map((v, i) => v || ["all", "all", "all"][i]);
  }

  function filter() {
    const p = d.planets;
    const q = norm(search.value.trim());
    const o = origin.value;
    const m = method.value;
    const r = regime.value;
    rows = [];
    for (let i = 0; i < d.n; i++) {
      if (q && !names[i].includes(q)) continue;
      if (o === "clean" && !p.clean[i]) continue;
      if (o === "measured" && isCalc(d, i)) continue;
      if (o === "calc" && !isCalc(d, i)) continue;
      if (m !== "all" && p.method[i] !== +m) continue;
      if (r !== "all") {
        const rg = p.mass[i] <= 2.04 ? 0 : p.mass[i] <= 131.58 ? 1 : 2;
        if (rg !== +r) continue;
      }
      rows.push(i);
    }
    const k = sort.key;
    const val = (i: number): number | string =>
      k === "name" ? p.name[i] : k === "year" ? p.year[i] ?? 0 : k === "mass" ? p.mass[i] : p.radius[i];
    rows.sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      return (typeof va === "string" ? va.localeCompare(vb as string, undefined, { numeric: true }) : (va as number) - (vb as number)) * sort.dir;
    });
    shown = PAGE;
    render();
  }

  function originBadges(i: number) {
    const p = d.planets;
    const out: HTMLElement[] = [];
    if (p.mass_calc[i]) out.push(el("span", { class: "origin origin--calc" }, t("orig.massCalc")));
    if (p.radius_calc[i]) out.push(el("span", { class: "origin origin--calc" }, t("orig.radCalc")));
    if (!out.length) out.push(el("span", { class: "origin" }, t("orig.measured")));
    if (p.msini[i]) out.push(el("span", { class: "origin origin--quiet" }, t("orig.msini")));
    return out;
  }

  function header() {
    const cols: [SortKey | null, string, string][] = [
      ["name", "col.name", ""],
      [null, "col.method", "hide-sm"],
      ["year", "col.year", "num hide-sm"],
      ["mass", "col.mass", "num"],
      ["radius", "col.radius", "num"],
      [null, "col.origin", ""],
    ];
    return el(
      "thead",
      {},
      el(
        "tr",
        {},
        ...cols.map(([key, label, cls]) => {
          const th = el("th", { scope: "col", class: cls });
          if (!key) {
            th.textContent = t(label);
            return th;
          }
          const active = sort.key === key;
          th.setAttribute("aria-sort", active ? (sort.dir === 1 ? "ascending" : "descending") : "none");
          const b = el("button", { type: "button", class: "sort" }, el("span", {}, t(label)), el("span", { class: "sort__icon", "aria-hidden": "true" }, active ? (sort.dir === 1 ? "▲" : "▼") : ""));
          b.addEventListener("click", () => {
            sort = { key, dir: active ? ((-sort.dir) as 1 | -1) : 1 };
            filter();
          });
          th.append(b);
          return th;
        }),
      ),
    );
  }

  function render() {
    const p = d.planets;
    $("#exp-count").textContent = t("exp.count", { n: fmtInt(rows.length) });
    const body = el("tbody");
    if (!rows.length) {
      body.append(el("tr", {}, el("td", { colspan: "6", class: "empty" }, t("exp.empty"))));
    }
    for (const i of rows.slice(0, shown)) {
      const tr = el(
        "tr",
        { tabindex: "0", "data-i": String(i) },
        el("td", {}, el("span", { class: "pname" }, p.name[i])),
        el("td", { class: "hide-sm" }, t(`method.${p.method[i]}`)),
        el("td", { class: "num hide-sm" }, p.year[i] ? String(p.year[i]) : "–"),
        el("td", { class: "num" }, fmt(p.mass[i])),
        el("td", { class: "num" }, fmt(p.radius[i])),
        el("td", {}, ...originBadges(i)),
      );
      body.append(tr);
    }
    table.replaceChildren(header(), body);
    earthify(table.tHead!);
    const rest = rows.length - shown;
    more.hidden = rest <= 0;
    more.textContent = t("exp.more", { n: fmtInt(Math.min(PAGE, Math.max(rest, 0))) });
    download.textContent = t("exp.download");
  }

  table.addEventListener("click", (e) => {
    const tr = (e.target as HTMLElement).closest("tr[data-i]") as HTMLElement | null;
    if (tr) open(+tr.dataset.i!, tr);
  });
  table.addEventListener("keydown", (e) => {
    const tr = (e.target as HTMLElement).closest("tr[data-i]") as HTMLElement | null;
    if (tr && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      open(+tr.dataset.i!, tr);
    }
  });
  more.addEventListener("click", () => {
    shown += PAGE;
    render();
  });
  download.addEventListener("click", () => {
    const p = d.planets;
    const head = ["pl_name", "hostname", "disc_year", "method", "mass_earth", "mass_err_hi", "mass_err_lo", "mass_calculated", "radius_earth", "radius_err_hi", "radius_err_lo", "radius_calculated", "clean_sample"];
    // texto que começa com = + - @ vira fórmula em planilhas: prefixa com apóstrofo
    const q = (v: unknown) => {
      if (v == null) return "";
      let s = String(v);
      if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = rows.map((i) =>
      [p.name[i], p.host[i], p.year[i], t(`method.${p.method[i]}`), p.mass[i], p.mass_hi[i], p.mass_lo[i], p.mass_calc[i], p.radius[i], p.radius_hi[i], p.radius_lo[i], p.radius_calc[i], p.clean[i]].map(q).join(","),
    );
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = el("a", { href: URL.createObjectURL(blob), download: `alem-da-curva_${d.label}_${d.date}.csv` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  let timer = 0;
  search.addEventListener("input", () => {
    clearTimeout(timer);
    timer = window.setTimeout(filter, 120);
  });
  [origin, method, regime].forEach((s) => s.addEventListener("change", filter));

  /* ------------------------------------------------------------ detalhes */
  function value(v: number, hi: number | null, lo: number | null, unit: string, calc: boolean) {
    const main = `${fmt(v)} ${unit}`;
    if (calc) return [main, el("span", { class: "muted" }, ` (${t("drawer.calc")})`)];
    if (hi == null || lo == null) return [main, el("span", { class: "muted" }, ` (${t("drawer.noUnc")})`)];
    return [`${main} `, el("span", { class: "muted" }, `+${fmt(hi)} / −${fmt(lo)}`)];
  }

  function open(i: number, from?: HTMLElement) {
    const p = d.planets;
    lastFocus = from ?? (document.activeElement as HTMLElement);
    const rows: [string, (Node | string)[]][] = [
      [t("drawer.host"), [p.host[i]]],
      [t("drawer.method"), [`${t(`method.${p.method[i]}`)}${p.year[i] ? `, ${p.year[i]}` : ""}`]],
      [t("drawer.mass"), value(p.mass[i], p.mass_hi[i], p.mass_lo[i], "M⊕", !!p.mass_calc[i])],
      [t("drawer.radius"), value(p.radius[i], p.radius_hi[i], p.radius_lo[i], "R⊕", !!p.radius_calc[i])],
      [t("drawer.density"), [`${fmtFixed((5.514 * p.mass[i]) / p.radius[i] ** 3, 2)} g/cm³`]],
    ];
    if (p.insol[i] != null) rows.push([t("drawer.insol"), [fmt(p.insol[i]!)]]);
    if (p.period[i] != null) rows.push([t("drawer.period"), [`${fmt(p.period[i]!)} ${t("drawer.days")}`]]);
    if (p.dist[i] != null) rows.push([t("drawer.dist"), [`${fmt(p.dist[i]!)} ${t("drawer.pc")}`]]);

    let curveText: string;
    if (isCalc(d, i)) curveText = t("drawer.onCurve");
    else {
      const res = Math.log10(p.mass[i]) - predictBroken(d.models.fits.mass_from_radius.m3, Math.log10(p.radius[i]));
      const f = 10 ** res;
      curveText = f >= 1 ? t("drawer.denser", { v: fmtFixed(f, 1) }) : t("drawer.lighter", { v: `${fmtFixed(f * 100, 0)}%` });
    }
    const why: string[] = [];
    if (!p.clean[i]) {
      if (isCalc(d, i)) why.push(t("drawer.why.calc"));
      if (p.controversial[i]) why.push(t("drawer.why.controv"));
      if (!isCalc(d, i) && (p.mass_hi[i] == null || p.radius_hi[i] == null)) why.push(t("drawer.why.unc"));
    }
    const color = isCalc(d, i) ? css("--calculated") : css("--measured");
    drawerBody.replaceChildren(
      el("h3", { id: "drawer-title", class: "drawer__title" }, el("i", { class: "dot", style: `--c:${color}` }), p.name[i]),
      el("dl", { class: "facts facts--drawer" }, ...rows.flatMap(([k, v]) => [el("dt", {}, k), el("dd", {}, ...v)])),
      el("h4", {}, t("drawer.curve")),
      el("p", {}, curveText),
      why.length ? el("p", { class: "muted" }, t("drawer.notClean", { why: why.join("; ") })) : "",
      el("p", {}, el("a", { href: `https://exoplanetarchive.ipac.caltech.edu/overview/${encodeURIComponent(p.name[i])}`, target: "_blank", rel: "noopener noreferrer" }, t("drawer.archive"))),
    );
    earthify(drawerBody);
    drawer.hidden = false;
    requestAnimationFrame(() => drawer.classList.add("is-open"));
    ($("#drawer-close") as HTMLButtonElement).focus();
  }

  function close() {
    drawer.classList.remove("is-open");
    drawer.hidden = true;
    lastFocus?.focus();
  }
  $("#drawer-close").addEventListener("click", close);
  drawer.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
    if (e.key === "Tab") {
      const f = Array.from(drawer.querySelectorAll<HTMLElement>("button, a[href]"));
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !drawer.hidden) close();
  });

  function setData(next: Dataset) {
    d = next;
    names = d.planets.name.map((n, i) => norm(`${n} ${d.planets.host[i]}`));
    options();
    filter();
  }
  return { setData, open, redraw: () => { options(); render(); } };
}
