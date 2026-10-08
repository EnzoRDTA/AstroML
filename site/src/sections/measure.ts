import { t } from "../i18n";
import { $, css, fmtFixed, reducedMotion } from "../util";

/** Animações do trânsito e da velocidade radial. */
export function initMeasure() {
  const cT = $("#transit-canvas") as HTMLCanvasElement;
  const cR = $("#rv-canvas") as HTMLCanvasElement;
  const sizeIn = $("#transit-size") as HTMLInputElement;
  const massIn = $("#rv-mass") as HTMLInputElement;
  const toggle = $("#anim-toggle") as HTMLButtonElement;
  let playing = !reducedMotion();
  let clock = 2.2; // posição inicial com o planeta já sobre a estrela
  let last: number | null = null;
  let visible = false;

  const setToggle = () => (toggle.textContent = playing ? t("anim.pause") : t("anim.play"));
  toggle.addEventListener("click", () => {
    playing = !playing;
    setToggle();
  });

  const fit = (c: HTMLCanvasElement, h: number) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth || 320;
    c.style.height = `${h}px`;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  };
  let S1 = fit(cT, 300);
  let S2 = fit(cR, 420);
  new ResizeObserver(() => {
    S1 = fit(cT, 300);
    S2 = fit(cR, 420);
    draw();
  }).observe(cT);

  const font = '12px "Archivo Variable", system-ui, sans-serif';
  const text = (ctx: CanvasRenderingContext2D, s: string, x: number, y: number, col: string, align: CanvasTextAlign = "left") => {
    ctx.fillStyle = col;
    ctx.textAlign = align;
    ctx.font = font;
    ctx.fillText(s, x, y);
  };
  const overlap = (R: number, r: number, d: number) => {
    if (d >= R + r) return 0;
    if (d <= Math.abs(R - r)) return Math.PI * Math.min(R, r) ** 2;
    const a = r * r * Math.acos((d * d + r * r - R * R) / (2 * d * r));
    const b = R * R * Math.acos((d * d + R * R - r * r) / (2 * d * R));
    const c = 0.5 * Math.sqrt((-d + r + R) * (d + r - R) * (d - r + R) * (d + r + R));
    return a + b - c;
  };

  function starGradient(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
    const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
    g.addColorStop(0, "#FFFBEF");
    g.addColorStop(0.65, "#F6E3A8");
    g.addColorStop(1, "#E4B65C");
    return g;
  }

  function drawTransit() {
    const { ctx, w, h } = S1;
    ctx.clearRect(0, 0, w, h);
    const rho = +sizeIn.value / 100;
    ($("#transit-out") as HTMLOutputElement).textContent = t("transit.out", { v: fmtFixed(rho, 2) });
    const drop = rho * rho * 100;
    $("#transit-readout").textContent = t("transit.readout", { v: fmtFixed(drop, drop < 0.1 ? 3 : 2) });
    const cx = w / 2;
    const cy = 78;
    const R = Math.min(56, w * 0.14);
    ctx.fillStyle = starGradient(ctx, cx, cy, R);
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
    const Rr = w - 14;
    const T = 176;
    const B = h - 28;
    const ymin = 0.9;
    const ymax = 1.004;
    const X = (uu: number) => L + uu * (Rr - L);
    const Y = (b: number) => B - ((b - ymin) / (ymax - ymin)) * (B - T);
    ctx.lineWidth = 1;
    ctx.strokeStyle = css("--rule");
    [1, 0.95, 0.9].forEach((v) => {
      ctx.beginPath();
      ctx.moveTo(L, Math.round(Y(v)) + 0.5);
      ctx.lineTo(Rr, Math.round(Y(v)) + 0.5);
      ctx.stroke();
      text(ctx, `${Math.round(v * 100)}%`, L - 8, Y(v) + 4, css("--dust"), "right");
    });
    text(ctx, t("transit.brightness"), L, T - 10, css("--dust"));
    text(ctx, t("transit.time"), Rr, B + 20, css("--dust"), "right");
    const val = (uu: number) => {
      const x = -span + 2 * span * uu;
      return 1 - overlap(1, rho, Math.hypot(x, py)) / Math.PI;
    };
    ctx.strokeStyle = css("--measured");
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i <= 240; i++) {
      const uu = i / 240;
      if (i) ctx.lineTo(X(uu), Y(val(uu)));
      else ctx.moveTo(X(uu), Y(val(uu)));
    }
    ctx.stroke();
    ctx.fillStyle = css("--star");
    ctx.beginPath();
    ctx.arc(X(u), Y(val(u)), 5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawRV() {
    const { ctx, w, h } = S2;
    ctx.clearRect(0, 0, w, h);
    const m = +massIn.value;
    const maxS = 40;
    const starR = 4 + 3.6 * m;
    ($("#rv-out") as HTMLOutputElement).textContent = t(m <= 3 ? "rv.small" : m <= 7 ? "rv.medium" : "rv.large");
    $("#rv-readout").textContent = t("rv.readout");
    const th = clock * 1.1;
    const cx = w / 2;
    const cy = 100;
    const a = Math.min(78, w * 0.28);
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
    ctx.fillStyle = starGradient(ctx, sx, sy, 13);
    ctx.beginPath();
    ctx.arc(sx, sy, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = css("--measured");
    ctx.beginPath();
    ctx.arc(cx + a * Math.cos(th), cy + a * Math.sin(th), 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = css("--star");
    ctx.beginPath();
    ctx.moveTo(cx - 6, 192);
    ctx.lineTo(cx + 6, 192);
    ctx.lineTo(cx, 202);
    ctx.closePath();
    ctx.fill();
    text(ctx, t("rv.observer"), cx, 218, css("--star"), "center");

    const v = -starR * Math.cos(th);
    const vn = v / maxS;
    const x0 = 16;
    const x1 = w - 16;
    const W = x1 - x0;
    const y0 = 262;
    const hh = 24;
    const sg = ctx.createLinearGradient(x0, 0, x1, 0);
    ([[0, 265], [0.22, 225], [0.45, 150], [0.7, 55], [1, 5]] as const).forEach(([p, hue]) => sg.addColorStop(p, `hsl(${hue},70%,52%)`));
    ctx.fillStyle = sg;
    ctx.fillRect(x0, y0, W, hh);
    const K = Math.min(20, W * 0.06);
    const shift = -vn * K;
    [0.18, 0.31, 0.47, 0.62, 0.79].forEach((f) => {
      const xr = x0 + f * W;
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
    text(ctx, st, w / 2, y0 - 14, css("--star"), "center");
    text(ctx, t("rv.blue"), x0, y0 + hh + 16, css("--dust"));
    text(ctx, t("rv.red"), x1, y0 + hh + 16, css("--dust"), "right");

    const L = 52;
    const Rr = w - 14;
    const mid = 360;
    const A = 30;
    ctx.strokeStyle = css("--rule");
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(L, mid + 0.5);
    ctx.lineTo(Rr, mid + 0.5);
    ctx.stroke();
    text(ctx, t("rv.speed"), L, mid - A - 12, css("--dust"));
    text(ctx, t("rv.coming"), L - 8, mid - A + 4, css("--dust"), "right");
    text(ctx, t("rv.going"), L - 8, mid + A + 4, css("--dust"), "right");
    const XX = (tt: number) => L + (tt / (2 * Math.PI)) * (Rr - L);
    const YY = (tt: number) => mid - ((-starR * Math.cos(tt)) / maxS) * A;
    ctx.strokeStyle = css("--measured");
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const tt = (i / 120) * 2 * Math.PI;
      if (i) ctx.lineTo(XX(tt), YY(tt));
      else ctx.moveTo(XX(tt), YY(tt));
    }
    ctx.stroke();
    const tm = ((th % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    ctx.fillStyle = css("--star");
    ctx.beginPath();
    ctx.arc(XX(tm), YY(tm), 5, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, t("rv.orbit"), Rr, mid + A + 24, css("--dust"), "right");
  }

  function draw() {
    drawTransit();
    drawRV();
  }

  function frame(ts: number) {
    if (playing && visible && last !== null) clock += (ts - last) / 1000;
    last = ts;
    if (visible) draw();
    requestAnimationFrame(frame);
  }
  // só anima quando a seção está na tela
  new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
  }).observe($("#medir .measure"));

  sizeIn.addEventListener("input", draw);
  massIn.addEventListener("input", draw);
  setToggle();
  draw();
  requestAnimationFrame(frame);
  return { redraw: () => { setToggle(); draw(); } };
}
