import type { Dataset } from "../data";
import { t } from "../i18n";
import { $, css, el, fmtFixed, fmtInt, reducedMotion } from "../util";

type Method = "transit" | "rv" | "micro" | "img";
const METHOD_INDEX: Record<Method, number> = { transit: 0, rv: 1, micro: 2, img: 3 };
const ORDER: Method[] = ["transit", "rv", "micro", "img"];
const TITLE_KEY: Record<Method, string> = { transit: "m.transit.h", rv: "m.rv.h", micro: "m.micro.h", img: "m.img.h" };
const BODY_KEY: Record<Method, string> = { transit: "transit.p", rv: "rv.p", micro: "m.micro.p", img: "m.img.p" };

/** Seletor dos métodos de descoberta com uma demonstração animada para cada um. */
export function initMeasure() {
  const canvas = $("#demo-canvas") as HTMLCanvasElement;
  const range = $("#demo-range") as HTMLInputElement;
  const rangeWrap = $("#demo-range-wrap");
  const sw = $("#demo-switch") as HTMLInputElement;
  const swWrap = $("#demo-switch-wrap");
  const toggle = $("#anim-toggle") as HTMLButtonElement;
  let method: Method = "transit";
  const values: Record<Method, number> = { transit: 12, rv: 5, micro: 5, img: 1 };
  let playing = !reducedMotion();
  let clock = 2.2;
  let last: number | null = null;
  let visible = false;
  let d: Dataset | null = null;
  let ctx = canvas.getContext("2d")!;
  let W = 320;
  let H = 300;

  const heightFor = (m: Method, w: number) =>
    m === "transit" ? (w < 480 ? 290 : 320) : m === "rv" ? 440 : m === "micro" ? 340 : w < 480 ? 300 : 340;

  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth || 320;
    H = heightFor(method, W);
    canvas.style.height = `${H}px`;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  new ResizeObserver(() => {
    fit();
    draw();
  }).observe(canvas);

  const font = (size = 13, weight = 400) => `${weight} ${size}px "Archivo Variable", system-ui, sans-serif`;
  const text = (s: string, x: number, y: number, col: string, align: CanvasTextAlign = "left", size = 13) => {
    ctx.fillStyle = col;
    ctx.textAlign = align;
    ctx.font = font(size);
    ctx.fillText(s, x, y);
  };
  const starGradient = (x: number, y: number, r: number) => {
    const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
    g.addColorStop(0, "#FFFBEF");
    g.addColorStop(0.65, "#F6E3A8");
    g.addColorStop(1, "#E4B65C");
    return g;
  };
  const sizeWord = (v: number) => t(v <= 3 ? "rv.small" : v <= 7 ? "rv.medium" : "rv.large");
  const hline = (x0: number, x1: number, y: number, color = css("--rule")) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, Math.round(y) + 0.5);
    ctx.lineTo(x1, Math.round(y) + 0.5);
    ctx.stroke();
  };
  const curve = (n: number, fx: (k: number) => number, fy: (k: number) => number, color: string, width = 2) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let k = 0; k <= n; k++) {
      if (k) ctx.lineTo(fx(k), fy(k));
      else ctx.moveTo(fx(k), fy(k));
    }
    ctx.stroke();
  };
  const dot = (x: number, y: number, r = 5, color = css("--star")) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };

  /* --------------------------------------------------------------- trânsito */
  const overlap = (R: number, r: number, dd: number) => {
    if (dd >= R + r) return 0;
    if (dd <= Math.abs(R - r)) return Math.PI * Math.min(R, r) ** 2;
    const a = r * r * Math.acos((dd * dd + r * r - R * R) / (2 * dd * r));
    const b = R * R * Math.acos((dd * dd + R * R - r * r) / (2 * dd * R));
    const c = 0.5 * Math.sqrt((-dd + r + R) * (dd + r - R) * (dd - r + R) * (dd + r + R));
    return a + b - c;
  };
  function drawTransit() {
    const rho = values.transit / 100;
    const cx = W / 2;
    const cy = 76;
    const R = Math.min(56, W * 0.15);
    ctx.fillStyle = starGradient(cx, cy, R);
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    const span = 1 + rho + 0.35;
    const py = 0.2;
    const u = (clock / 7) % 1;
    const px = -span + 2 * span * u;
    ctx.fillStyle = css("--void");
    ctx.strokeStyle = css("--measured");
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx + px * R, cy + py * R, Math.max(rho * R, 1.5), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const L = 52;
    const Rr = W - 12;
    const T = 178;
    const B = H - 28;
    const ymin = 0.9;
    const ymax = 1.004;
    const X = (uu: number) => L + uu * (Rr - L);
    const Y = (b: number) => B - ((b - ymin) / (ymax - ymin)) * (B - T);
    [1, 0.95, 0.9].forEach((v) => {
      hline(L, Rr, Y(v));
      text(`${Math.round(v * 100)}%`, L - 8, Y(v) + 4, css("--dust"), "right", 12);
    });
    text(t("transit.brightness"), L, T - 12, css("--dust"), "left", 12);
    text(t("transit.time"), Rr, B + 20, css("--dust"), "right", 12);
    const val = (uu: number) => 1 - overlap(1, rho, Math.hypot(-span + 2 * span * uu, py)) / Math.PI;
    curve(240, (k) => X(k / 240), (k) => Y(val(k / 240)), css("--measured"));
    dot(X(u), Y(val(u)));
    const drop = rho * rho * 100;
    return {
      out: t("transit.out", { v: fmtFixed(rho, 2) }),
      readout: t("transit.readout", { v: fmtFixed(drop, drop < 0.1 ? 3 : 2) }),
    };
  }

  /* ------------------------------------------------------- velocidade radial */
  function drawRV() {
    const m = values.rv;
    const maxS = 40;
    const starR = 4 + 3.6 * m;
    const th = clock * 1.1;
    const cx = W / 2;
    const cy = 96;
    const a = Math.min(76, W * 0.25);
    ctx.strokeStyle = css("--rule");
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, a, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = css("--rule-strong");
    ctx.beginPath();
    ctx.arc(cx, cy, starR, 0, Math.PI * 2);
    ctx.stroke();
    const sx = cx - starR * Math.cos(th);
    const sy = cy - starR * Math.sin(th);
    ctx.fillStyle = starGradient(sx, sy, 13);
    ctx.beginPath();
    ctx.arc(sx, sy, 12, 0, Math.PI * 2);
    ctx.fill();
    dot(cx + a * Math.cos(th), cy + a * Math.sin(th), 5, css("--measured"));

    // observador
    ctx.fillStyle = css("--star");
    ctx.beginPath();
    ctx.moveTo(cx - 6, 184);
    ctx.lineTo(cx + 6, 184);
    ctx.lineTo(cx, 194);
    ctx.closePath();
    ctx.fill();
    text(t("rv.observer"), cx, 212, css("--star"), "center", 12);

    // espectro
    const v = -starR * Math.cos(th);
    const vn = v / maxS;
    const x0 = 12;
    const x1 = W - 12;
    const SW = x1 - x0;
    const y0 = 252;
    const hh = 22;
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    ([[0, 265], [0.22, 225], [0.45, 150], [0.7, 55], [1, 5]] as const).forEach(([p, hue]) => g.addColorStop(p, `hsl(${hue},70%,52%)`));
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, SW, hh);
    const shift = -vn * Math.min(20, SW * 0.06);
    [0.18, 0.31, 0.47, 0.62, 0.79].forEach((f) => {
      const xr = x0 + f * SW;
      ctx.fillStyle = css("--dust");
      ctx.beginPath();
      ctx.moveTo(xr - 4, y0 - 6);
      ctx.lineTo(xr + 4, y0 - 6);
      ctx.lineTo(xr, y0 - 1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(6,11,22,.92)";
      ctx.fillRect(xr + shift - 1, y0, 2, hh);
    });
    const st = vn > 0.15 ? t("rv.toward") : vn < -0.15 ? t("rv.away") : t("rv.side");
    text(st, W / 2, y0 - 14, css("--star"), "center", 12);
    text(t("rv.blue"), x0, y0 + hh + 16, css("--dust"), "left", 12);
    text(t("rv.red"), x1, y0 + hh + 16, css("--dust"), "right", 12);

    // curva de velocidade
    const L = 52;
    const Rr = W - 12;
    const mid = 368;
    const A = 28;
    text(t("rv.speed"), L, 322, css("--dust"), "left", 12);
    hline(L, Rr, mid);
    text(t("rv.coming"), L - 8, mid - A + 4, css("--dust"), "right", 12);
    text(t("rv.going"), L - 8, mid + A + 4, css("--dust"), "right", 12);
    const XX = (tt: number) => L + (tt / (2 * Math.PI)) * (Rr - L);
    const YY = (tt: number) => mid - ((-starR * Math.cos(tt)) / maxS) * A;
    curve(120, (k) => XX((k / 120) * 2 * Math.PI), (k) => YY((k / 120) * 2 * Math.PI), css("--measured"));
    const tm = ((th % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    dot(XX(tm), YY(tm));
    text(t("rv.orbit"), Rr, mid + A + 24, css("--dust"), "right", 12);
    return { out: sizeWord(m), readout: t("rv.readout") };
  }

  /* ------------------------------------------------------------- microlente */
  const U0 = 0.12;
  const TE = 0.11;
  const BUMP_T = 0.63;
  const magn = (tt: number, m: number) => {
    const u = Math.sqrt(U0 * U0 + ((tt - 0.5) / TE) ** 2);
    const base = (u * u + 2) / (u * Math.sqrt(u * u + 4));
    const w = 0.004 + 0.0025 * Math.sqrt(m);
    return base + 0.16 * m * Math.exp(-0.5 * ((tt - BUMP_T) / w) ** 2);
  };
  function drawMicro() {
    const m = values.micro;
    const tt = (clock / 9) % 1;
    const cx = W / 2;
    const sy = 64;
    const S = W * 1.25;
    const A = magn(tt, m);
    // estrela de fundo, ampliada
    const glow = 5 + 3.2 * (A - 1);
    const g = ctx.createRadialGradient(cx, sy, 1, cx, sy, glow * 2.2);
    g.addColorStop(0, "rgba(220,235,255,0.95)");
    g.addColorStop(0.35, "rgba(140,207,255,0.45)");
    g.addColorStop(1, "rgba(140,207,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, sy, glow * 2.2, 0, Math.PI * 2);
    ctx.fill();
    dot(cx, sy, 3.5, "#EAF4FF");
    text(t("m.micro.source"), cx, sy - 30, css("--dust"), "center", 12);
    // estrela-lente com planeta, passando na frente
    const lx = cx + (tt - 0.5) * S;
    const ly = sy + 46;
    const pxp = lx - (BUMP_T - 0.5) * S;
    ctx.strokeStyle = css("--rule-strong");
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(cx, sy);
    ctx.stroke();
    ctx.fillStyle = starGradient(lx, ly, 10);
    ctx.beginPath();
    ctx.arc(lx, ly, 9, 0, Math.PI * 2);
    ctx.fill();
    dot(pxp, ly, 2 + m * 0.25, css("--measured"));
    if (lx > 40 && lx < W - 40) text(t("m.micro.lens"), lx, ly + 26, css("--dust"), "center", 12);

    // curva de luz
    const L = 40;
    const Rr = W - 12;
    const T = 168;
    const B = H - 28;
    let top = 0;
    for (let k = 0; k <= 400; k++) top = Math.max(top, magn(k / 400, m));
    const X = (u: number) => L + u * (Rr - L);
    const Y = (a: number) => B - ((a - 1) / (top * 1.05 - 1)) * (B - T);
    hline(L, Rr, Y(1));
    text(t("m.micro.axis"), L, T - 10, css("--dust"), "left", 12);
    text(t("transit.time"), Rr, B + 20, css("--dust"), "right", 12);
    curve(600, (k) => X(k / 600), (k) => Y(magn(k / 600, m)), css("--measured"));
    // marca o pico do planeta
    const bx = X(BUMP_T);
    const by = Y(magn(BUMP_T, m));
    ctx.strokeStyle = css("--dust");
    ctx.beginPath();
    ctx.moveTo(bx, by - 6);
    ctx.lineTo(bx + 18, by - 22);
    ctx.stroke();
    text(t("m.micro.bump"), bx + 22, by - 24, css("--star"), "left", 12);
    dot(X(tt), Y(magn(tt, m)));
    return { out: sizeWord(m), readout: t("m.micro.readout") };
  }

  /* ------------------------------------------------------ imageamento direto */
  const field = Array.from({ length: 70 }, (_, k) => {
    const r = Math.sin(k * 12.9898) * 43758.5453;
    const q = Math.sin(k * 78.233) * 12543.123;
    return { x: r - Math.floor(r), y: q - Math.floor(q), a: 0.2 + ((k * 37) % 10) / 20 };
  });
  function drawImaging() {
    const on = values.img === 1;
    field.forEach((s) => dot(s.x * W, s.y * H, 0.8, `rgba(231,237,246,${s.a})`));
    const cx = W / 2;
    const cy = H / 2 - 6;
    const rx = Math.min(130, W * 0.36);
    const ry = rx * 0.42;
    const th = clock * 0.5;
    const px = cx + rx * Math.cos(th);
    const py = cy + ry * Math.sin(th);
    ctx.strokeStyle = css("--rule");
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (!on) {
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, rx * 1.6);
      g.addColorStop(0, "rgba(255,251,239,1)");
      g.addColorStop(0.12, "rgba(246,227,168,0.9)");
      g.addColorStop(0.45, "rgba(228,182,92,0.35)");
      g.addColorStop(1, "rgba(228,182,92,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, rx * 1.6, 0, Math.PI * 2);
      ctx.fill();
      dot(px, py, 2.5, "rgba(140,207,255,0.12)");
    } else {
      // resto de luz em volta da máscara
      const g = ctx.createRadialGradient(cx, cy, 22, cx, cy, 70);
      g.addColorStop(0, "rgba(246,227,168,0.28)");
      g.addColorStop(1, "rgba(246,227,168,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, 70, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = css("--void");
      ctx.beginPath();
      ctx.arc(cx, cy, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = css("--rule-strong");
      ctx.stroke();
      text(t("m.img.mask"), cx, cy + 44, css("--dust"), "center", 12);
      const pg = ctx.createRadialGradient(px, py, 0, px, py, 12);
      pg.addColorStop(0, "rgba(140,207,255,0.9)");
      pg.addColorStop(1, "rgba(140,207,255,0)");
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(px, py, 12, 0, Math.PI * 2);
      ctx.fill();
      dot(px, py, 3.5, "#EAF4FF");
      text(t("m.img.planet"), px, py - 16, css("--star"), "center", 12);
    }
    return { out: "", readout: on ? t("m.img.on") : t("m.img.off") };
  }

  /* ----------------------------------------------------------------- quadro */
  function draw() {
    ctx.clearRect(0, 0, W, H);
    const r = method === "transit" ? drawTransit() : method === "rv" ? drawRV() : method === "micro" ? drawMicro() : drawImaging();
    $("#demo-range-out").textContent = r.out;
    const ro = $("#demo-readout");
    if (ro.textContent !== r.readout) ro.textContent = r.readout;
  }

  function frame(ts: number) {
    if (playing && visible && last !== null) clock += (ts - last) / 1000;
    last = ts;
    if (visible) draw();
    requestAnimationFrame(frame);
  }
  new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
  }).observe($("#methods-panel"));

  /* ------------------------------------------------------------ abas e textos */
  function panel() {
    const n = d?.discoveries;
    const i = METHOD_INDEX[method];
    const key = n ? n.methods[i] : "";
    const total = n ? n.methods.reduce((a, k) => a + n.counts[k].reduce((x, y) => x + y, 0), 0) : 0;
    const count = n ? n.counts[key].reduce((x, y) => x + y, 0) : 0;
    const first = n ? n.years.find((_, k) => n.counts[key][k] > 0) : undefined;
    $("#demo-title").textContent = t(TITLE_KEY[method]);
    $("#demo-body").innerHTML = t(BODY_KEY[method]); // texto do próprio site (i18n), sem dados externos
    $("#demo-facts").replaceChildren(
      el("dt", {}, t("methods.measures")),
      el("dd", {}, t(`m.${method}.measures`)),
      el("dt", {}, t("methods.count")),
      el("dd", {}, n ? `${fmtInt(count)} (${fmtFixed((100 * count) / total, 1)}%)` : "–"),
      el("dt", {}, t("methods.first")),
      el("dd", {}, first ? String(first) : "–"),
      el("dt", {}, t("methods.best")),
      el("dd", {}, t(`m.${method}.best`)),
    );
    const isImg = method === "img";
    rangeWrap.hidden = isImg;
    swWrap.hidden = !isImg;
    if (!isImg) {
      $("#demo-range-label").textContent = method === "transit" ? t("transit.label") : method === "rv" ? t("rv.label") : t("m.micro.label");
      if (method === "transit") {
        range.min = "2";
        range.max = "30";
      } else {
        range.min = "1";
        range.max = "10";
      }
      range.value = String(values[method]);
    } else sw.checked = values.img === 1;
    $("#methods-panel").setAttribute("aria-labelledby", `tab-${method}`);
    document.querySelectorAll<HTMLButtonElement>("#methods-tabs [role=tab]").forEach((b) => {
      const on = b.dataset.method === method;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
    });
    fit();
    draw();
  }

  function tabs() {
    const n = d?.discoveries;
    const totals = ORDER.map((m) => (n ? n.counts[n.methods[METHOD_INDEX[m]]].reduce((x, y) => x + y, 0) : 0));
    const all = n ? n.methods.reduce((a, k) => a + n.counts[k].reduce((x, y) => x + y, 0), 0) : 1;
    const box = $("#methods-tabs");
    box.replaceChildren(
      ...ORDER.map((m, k) => {
        const pct = (100 * totals[k]) / all;
        const b = el(
          "button",
          { type: "button", role: "tab", id: `tab-${m}`, "data-method": m, "aria-controls": "methods-panel", class: "mtab" },
          el("span", { class: "mtab__name" }, t(TITLE_KEY[m])),
          el("span", { class: "mtab__pct" }, `${fmtFixed(pct, pct < 10 ? 1 : 0)}%`),
          el("span", { class: "mtab__bar", "aria-hidden": "true" }, el("i", { style: `--p:${Math.max(pct, 0.6).toFixed(2)}%` })),
          el("span", { class: "mtab__n" }, t("dec.n", { n: fmtInt(totals[k]) })),
        );
        b.addEventListener("click", () => {
          method = m;
          panel();
        });
        b.addEventListener("keydown", (e) => {
          const i = ORDER.indexOf(method);
          let j = -1;
          if (e.key === "ArrowDown" || e.key === "ArrowRight") j = (i + 1) % ORDER.length;
          if (e.key === "ArrowUp" || e.key === "ArrowLeft") j = (i - 1 + ORDER.length) % ORDER.length;
          if (j >= 0) {
            e.preventDefault();
            method = ORDER[j];
            panel();
            ($(`#tab-${method}`) as HTMLButtonElement).focus();
          }
        });
        return b;
      }),
    );
    const others = n ? n.counts[n.methods[4]].reduce((x, y) => x + y, 0) : 0;
    $("#methods-note").textContent = t("methods.note", { n: fmtInt(others) });
  }

  range.addEventListener("input", () => {
    values[method] = +range.value;
    draw();
  });
  sw.addEventListener("change", () => {
    values.img = sw.checked ? 1 : 0;
    draw();
  });
  const setToggle = () => (toggle.textContent = playing ? t("anim.pause") : t("anim.play"));
  toggle.addEventListener("click", () => {
    playing = !playing;
    setToggle();
  });
  setToggle();
  requestAnimationFrame(frame);

  return {
    setData(next: Dataset) {
      d = next;
      setToggle();
      tabs();
      panel();
    },
    redraw() {
      setToggle();
      tabs();
      panel();
    },
  };
}
