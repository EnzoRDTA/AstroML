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

let shownAt = 0;
let advancing = false;

function renderPager(page: Page) {
  const pager = document.getElementById("pager")!;
  const i = PAGES.indexOf(page);
  const next = i < PAGES.length - 1 ? PAGES[i + 1] : null;
  pager.hidden = !next;
  if (!next) return pager.replaceChildren();
  pager.replaceChildren(
    el(
      "a",
      { href: `#/${next}`, class: "pager__next" },
      el("span", { class: "pager__dir" }, t("pager.scroll")),
      el("span", { class: "pager__title" }, t(TITLE_KEY[next])),
      el("span", { class: "pager__bar", "aria-hidden": "true" }, el("i")),
      el("span", { class: "pager__arrow", "aria-hidden": "true" }, "↓"),
    ),
  );
  pager.style.setProperty("--p", "0");
}

/** Rolar até o fim da página leva à próxima. */
function onScroll() {
  const pager = document.getElementById("pager")!;
  if (pager.hidden || advancing || !current) return;
  const r = pager.getBoundingClientRect();
  const p = Math.max(0, Math.min(1, (innerHeight - r.top) / r.height));
  pager.style.setProperty("--p", p.toFixed(3));
  const atEnd = innerHeight + scrollY >= document.documentElement.scrollHeight - 4;
  if (p > 0.97 && atEnd && performance.now() - shownAt > 700) {
    const i = PAGES.indexOf(current);
    advancing = true;
    setTimeout(() => {
      advancing = false;
      location.hash = `#/${PAGES[i + 1]}`;
    }, 180);
  }
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
    shownAt = performance.now();
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
  window.addEventListener("scroll", onScroll, { passive: true });
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
