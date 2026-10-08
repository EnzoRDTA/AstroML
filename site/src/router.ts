import { t } from "./i18n";
import { el, reducedMotion } from "./util";

export const PAGES = ["inicio", "medir", "dados", "prever", "resultados", "explorar", "fontes", "sobre"] as const;
export type Page = (typeof PAGES)[number];

const TITLE_KEY: Record<Page, string> = {
  inicio: "nav.home",
  medir: "nav.measure",
  dados: "nav.finding",
  prever: "nav.predict",
  resultados: "nav.results",
  explorar: "nav.explore",
  fontes: "nav.sources",
  sobre: "nav.about",
};

// endereços da primeira versão, que era uma página única
const LEGACY: Record<string, Page> = {
  top: "inicio",
  medir: "medir",
  achado: "dados",
  porque: "dados",
  prever: "prever",
  resultados: "resultados",
  explorar: "explorar",
  fontes: "fontes",
  sobre: "sobre",
};

function parse(hash: string): Page | null {
  const h = hash.replace(/^#/, "");
  if (h === "" || h === "/") return "inicio";
  if (h.startsWith("/")) {
    const p = h.slice(1).split(/[/?]/)[0] as Page;
    return (PAGES as readonly string[]).includes(p) ? p : "inicio";
  }
  return LEGACY[h] ?? null; // outras âncoras (ex.: pular para o conteúdo) não trocam de página
}

let current: Page | null = null;
const listeners: Array<(p: Page) => void> = [];

export function onPage(fn: (p: Page) => void) {
  listeners.push(fn);
}

export function currentPage(): Page {
  return current ?? "inicio";
}

function renderPager(page: Page) {
  const pager = document.getElementById("pager")!;
  const i = PAGES.indexOf(page);
  const prev = i > 0 ? PAGES[i - 1] : null;
  const next = i < PAGES.length - 1 ? PAGES[i + 1] : null;
  const link = (p: Page, dir: "prev" | "next") =>
    el(
      "a",
      { href: p === "inicio" ? "#/" : `#/${p}`, class: `pager__link pager__link--${dir}` },
      el("span", { class: "pager__dir" }, t(`pager.${dir}`)),
      el("span", { class: "pager__title" }, t(TITLE_KEY[p])),
    );
  pager.replaceChildren(...(page === "inicio" ? [] : [prev ? link(prev, "prev") : el("span"), next ? link(next, "next") : el("span")]));
  pager.hidden = page === "inicio";
}

export function show(page: Page, userAction: boolean) {
  const changed = page !== current;
  current = page;
  document.querySelectorAll<HTMLElement>("[data-page]").forEach((sec) => {
    const on = sec.dataset.page === page;
    sec.hidden = !on;
    if (on && changed && !reducedMotion()) {
      sec.classList.remove("is-entering");
      void sec.offsetWidth; // reinicia a animação de entrada
      sec.classList.add("is-entering");
    }
  });
  document.querySelectorAll<HTMLAnchorElement>(".topnav a").forEach((a) => {
    if (a.dataset.route === page) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  renderPager(page);
  const base = t("site.name");
  document.title = page === "inicio" ? `${base} | ${t("nav.home")}` : `${t(TITLE_KEY[page])} | ${base}`;
  if (changed) {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    if (userAction) {
      // leva o foco ao título da página, para leitores de tela e teclado
      const h = document.querySelector<HTMLElement>(`[data-page="${page}"] h1, [data-page="${page}"] h2`);
      if (h) {
        h.setAttribute("tabindex", "-1");
        h.focus({ preventScroll: true });
      }
    }
    listeners.forEach((fn) => fn(page));
  }
}

export function initRouter() {
  const initial = parse(location.hash) ?? "inicio";
  show(initial, false);
  window.addEventListener("hashchange", () => {
    const p = parse(location.hash);
    if (p) show(p, true);
  });
}

/** Reaplica textos do roteador (pager e título) após troca de idioma. */
export function refreshRouterText() {
  if (current) {
    renderPager(current);
    const base = t("site.name");
    document.title = current === "inicio" ? `${base} | ${t("nav.home")}` : `${t(TITLE_KEY[current])} | ${base}`;
  }
}
