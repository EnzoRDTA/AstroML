import { earthify } from "./util";

const tip = () => document.getElementById("tooltip")!;

export function showTip(content: HTMLElement, x: number, y: number) {
  const t = tip();
  t.replaceChildren(content);
  earthify(t);
  t.hidden = false;
  const pad = 14;
  const r = t.getBoundingClientRect();
  let left = x + pad;
  let top = y + pad;
  if (left + r.width > window.innerWidth - 8) left = x - r.width - pad;
  if (top + r.height > window.innerHeight - 8) top = y - r.height - pad;
  t.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
}

export function hideTip() {
  tip().hidden = true;
}
