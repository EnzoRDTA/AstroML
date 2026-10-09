import { locale } from "./i18n";

const cssCache = new Map<string, string>();
export function css(name: string): string {
  if (!cssCache.has(name)) cssCache.set(name, getComputedStyle(document.documentElement).getPropertyValue(name).trim());
  return cssCache.get(name)!;
}

export function reducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** Número para eixos e textos: separadores do idioma, sem casas inúteis. */
export function fmt(v: number, digits?: number): string {
  if (v == null || !isFinite(v)) return "–";
  const a = Math.abs(v);
  const d = digits ?? (a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : a >= 0.1 ? 2 : 3);
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: d, minimumFractionDigits: 0 }).format(v);
}

export function fmtFixed(v: number, digits: number): string {
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
}

export function fmtInt(v: number): string {
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(v);
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) if (c != null) e.append(typeof c === "string" ? document.createTextNode(c) : c);
  return e;
}

export function $(sel: string): HTMLElement {
  const e = document.querySelector<HTMLElement>(sel);
  if (!e) throw new Error(`elemento não encontrado: ${sel}`);
  return e;
}

/** Troca o símbolo ⊕ por um SVG: muitas fontes não têm o glifo ou o desenham enorme. */
const EARTH_SVG =
  '<svg class="earth" viewBox="0 0 10 10" role="img" aria-label="⊕"><circle cx="5" cy="5" r="4"/><path d="M5 1v8M1 5h8"/></svg>';
export function earthify(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.nodeValue?.includes("⊕") && !(n.parentElement?.closest("svg, option, script, style, title"))
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const n of nodes) {
    const span = document.createElement("span");
    span.innerHTML = n.nodeValue!.split("⊕").map(escapeHtml).join(EARTH_SVG);
    n.replaceWith(...Array.from(span.childNodes));
  }
}
function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/**
 * Altura de tela estável: no celular a barra do navegador some ao rolar e
 * muda innerHeight; só recalculamos quando a largura muda (giro da tela).
 */
let vhW = 0;
let vhH = 0;
export function stableVH(): number {
  if (innerWidth !== vhW || !vhH) {
    vhW = innerWidth;
    vhH = innerHeight;
  }
  return vhH;
}
