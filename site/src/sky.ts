/**
 * Céu de fundo: campo de estrelas fixo com a faixa da Via Láctea.
 * Desenhado uma vez num canvas; só algumas estrelas brilhantes cintilam.
 * Fica atrás de tudo e nunca atrás dos gráficos (que têm fundo próprio).
 */
import { reducedMotion } from "./util";

// gerador pseudoaleatório com semente: o céu é o mesmo a cada visita
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r: () => number) => {
  const u = Math.max(r(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
};

// cores de estrelas por temperatura (azul-branca a laranja), em baixa saturação
const TEMPS = ["#c9d8ff", "#dfe7ff", "#f4f6ff", "#fff4e0", "#ffe2b8", "#ffc996"];
const pickTemp = (r: () => number) => {
  const x = r();
  return TEMPS[x < 0.18 ? 0 : x < 0.42 ? 1 : x < 0.72 ? 2 : x < 0.88 ? 3 : x < 0.96 ? 4 : 5];
};

interface Twinkler {
  x: number;
  y: number;
  r: number;
  c: string;
  phase: number;
  speed: number;
}

export function initSky() {
  const wrap = document.createElement("div");
  wrap.className = "sky";
  wrap.setAttribute("aria-hidden", "true");
  const base = document.createElement("canvas");
  const live = document.createElement("canvas");
  wrap.append(base, live);
  document.body.prepend(wrap);

  let W = 0;
  let H = 0;
  let dpr = 1;
  let twinklers: Twinkler[] = [];

  function paint() {
    const width = innerWidth;
    if (width === W && H) return; // a barra do navegador no celular não redesenha o céu
    W = width;
    H = Math.round(Math.max(innerHeight, screen.height || 0) * 1.25);
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    for (const c of [base, live]) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      c.style.width = `${W}px`;
      c.style.height = `${H}px`;
    }
    const ctx = base.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = rng(20260923);
    const area = (W * H) / 1e6;

    // faixa da Via Láctea: uma diagonal suave do canto superior direito
    const ax = W * 1.05,
      ay = -H * 0.05,
      bx = -W * 0.1,
      by = H * 0.95;
    const len = Math.hypot(bx - ax, by - ay);
    const ux = (bx - ax) / len,
      uy = (by - ay) / len;
    const nx = -uy,
      ny = ux;
    const bandW = Math.max(W, H) * 0.12;

    // brilho difuso da faixa, em camadas de baixa opacidade
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 34; i++) {
      const t = r();
      const off = gauss(r) * bandW * 0.45;
      const x = ax + ux * len * t + nx * off;
      const y = ay + uy * len * t + ny * off;
      const rad = bandW * (0.6 + r() * 0.9);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const warm = r() < 0.35;
      g.addColorStop(0, warm ? "rgba(130,100,160,0.11)" : "rgba(80,110,190,0.12)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    ctx.globalCompositeOperation = "source-over";
    // faixa de poeira escura no meio da Via Láctea
    for (let i = 0; i < 14; i++) {
      const t = r();
      const off = gauss(r) * bandW * 0.12;
      const x = ax + ux * len * t + nx * off;
      const y = ay + uy * len * t + ny * off;
      const rad = bandW * (0.25 + r() * 0.35);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, "rgba(3,5,12,0.35)");
      g.addColorStop(1, "rgba(3,5,12,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }

    // estrelas da faixa: muitas, pequenas e fracas
    const nBand = Math.round(2600 * area);
    for (let i = 0; i < nBand; i++) {
      const t = r();
      const off = gauss(r) * bandW * 0.5;
      const x = ax + ux * len * t + nx * off;
      const y = ay + uy * len * t + ny * off;
      ctx.globalAlpha = 0.12 + r() * 0.35;
      ctx.fillStyle = pickTemp(r);
      const s = r() < 0.9 ? 0.6 : 0.9;
      ctx.fillRect(x, y, s, s);
    }
    // campo geral
    const nField = Math.round(700 * area);
    twinklers = [];
    for (let i = 0; i < nField; i++) {
      const x = r() * W;
      const y = r() * H;
      const m = r();
      const c = pickTemp(r);
      if (m > 0.985) {
        twinklers.push({ x, y, r: 0.9 + r() * 0.7, c, phase: r() * Math.PI * 2, speed: 0.6 + r() * 1.4 });
        continue;
      }
      ctx.globalAlpha = m > 0.93 ? 0.7 : 0.18 + m * 0.4;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, y, m > 0.93 ? 0.95 : 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    drawLive(0);
  }

  function drawLive(ts: number) {
    const ctx = live.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (const s of twinklers) {
      const a = reducedMotion() ? 0.75 : 0.55 + 0.4 * Math.sin(s.phase + (ts / 1000) * s.speed);
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 4);
      g.addColorStop(0, s.c);
      g.addColorStop(0.25, s.c + "66");
      g.addColorStop(1, s.c + "00");
      ctx.globalAlpha = a;
      ctx.fillStyle = g;
      ctx.fillRect(s.x - s.r * 4, s.y - s.r * 4, s.r * 8, s.r * 8);
    }
    ctx.globalAlpha = 1;
  }

  // cintilar leve, a 12 quadros por segundo, parado se a aba estiver escondida
  let lastFrame = 0;
  function loop(ts: number) {
    if (!document.hidden && !reducedMotion() && ts - lastFrame > 83) {
      lastFrame = ts;
      drawLive(ts);
    }
    requestAnimationFrame(loop);
  }

  // paralaxe discreta: o céu anda 3% da rolagem
  let ticking = false;
  addEventListener(
    "scroll",
    () => {
      if (ticking || reducedMotion()) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const max = Math.max(0, H - innerHeight);
        wrap.style.transform = `translate3d(0, ${-Math.min(scrollY * 0.03, max)}px, 0)`;
      });
    },
    { passive: true },
  );
  addEventListener("resize", paint);
  paint();
  requestAnimationFrame(loop);
}
