import { t } from "../i18n";
import { hideTip, showTip } from "../tooltip";
import { el, fmtInt } from "../util";

export const REGIME_VARS = ["--rocky", "--neptunian", "--giant"] as const;

export function regimeOf(mass: number): 0 | 1 | 2 {
  return mass <= 2.04 ? 0 : mass <= 131.58 ? 1 : 2;
}

export interface RegimeState {
  visible: [boolean, boolean, boolean];
  hover: number | null;
}

/**
 * Legenda interativa dos três tipos de planeta: clicar mostra ou esconde,
 * passar o mouse (ou focar) destaca o tipo e mostra a descrição.
 */
export function regimeLegend(container: HTMLElement, counts: number[], onChange: (s: RegimeState) => void) {
  const state: RegimeState = { visible: [true, true, true], hover: null };
  const buttons = [0, 1, 2].map((k) => {
    const b = el(
      "button",
      { type: "button", class: "toggle", "aria-pressed": "true" },
      el("i", { class: "dot", style: `--c: var(${REGIME_VARS[k]})` }),
      el("span", {}, t(`regime.${k}`)),
      el("span", { class: "toggle__n" }, fmtInt(counts[k] ?? 0)),
    );
    const tip = (x: number, y: number) =>
      showTip(el("div", {}, el("strong", { class: "tip__title" }, t(`regime.${k}`)), el("p", { class: "tip__p" }, t(`regime.desc.${k}`)), el("p", { class: "tip__hint" }, t("regime.hint"))), x, y);
    b.addEventListener("click", () => {
      state.visible[k] = !state.visible[k];
      if (!state.visible.some(Boolean)) state.visible = [true, true, true];
      sync();
      onChange(state);
    });
    b.addEventListener("pointerenter", (e) => {
      state.hover = k;
      tip(e.clientX, e.clientY);
      onChange(state);
    });
    b.addEventListener("pointermove", (e) => tip(e.clientX, e.clientY));
    b.addEventListener("pointerleave", () => {
      state.hover = null;
      hideTip();
      onChange(state);
    });
    b.addEventListener("focus", () => {
      const r = b.getBoundingClientRect();
      state.hover = k;
      tip(r.left, r.bottom);
      onChange(state);
    });
    b.addEventListener("blur", () => {
      state.hover = null;
      hideTip();
      onChange(state);
    });
    return b;
  });
  const sync = () => buttons.forEach((b, k) => b.setAttribute("aria-pressed", String(state.visible[k])));
  container.replaceChildren(...buttons);
  return state;
}

/** Opacidade de um ponto conforme o estado da legenda. */
export function regimeAlpha(state: RegimeState, k: number, base: number): number | null {
  if (!state.visible[k]) return null;
  if (state.hover == null || state.hover === k) return base;
  return base * 0.18;
}
