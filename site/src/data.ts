export type DatasetLabel = "snapshot" | "live";

export interface Planets {
  name: string[];
  host: string[];
  method: number[];
  year: (number | null)[];
  mass: number[];
  mass_hi: (number | null)[];
  mass_lo: (number | null)[];
  radius: number[];
  radius_hi: (number | null)[];
  radius_lo: (number | null)[];
  mass_calc: number[];
  radius_calc: number[];
  msini: number[];
  controversial: number[];
  clean: number[];
  insol: (number | null)[];
  period: (number | null)[];
  teff: (number | null)[];
  met: (number | null)[];
  dist: (number | null)[];
  res_r: (number | null)[];
  res_m: (number | null)[];
}

export interface BrokenFit {
  c1: number;
  c2: number;
  beta: number[];
  slopes: number[];
  breaks_linear: number[];
}

export interface CvEntry {
  rmse_dex: number;
  factor: number;
  median_frac_err: number;
}

export interface Models {
  n_clean: number;
  n_stars: number;
  n_complete: number;
  fits: Record<"mass_from_radius" | "radius_from_mass", { m1: { intercept: number; slope: number; r2: number }; m3: BrokenFit }>;
  cv: Record<"mass_from_radius" | "radius_from_mass", Record<string, CvEntry> & {
    decomposition_m4: { mse: number; intrinsic_fraction: number; intrinsic_sigma_dex: number; intrinsic_factor: number };
    decomposition_segments: Segment[];
  }>;
  curves: Record<Direction, Record<string, number[]>>;
}

export type Direction = "mass_from_radius" | "radius_from_mass";
export interface Segment {
  segment: number;
  n: number;
  intrinsic_fraction: number;
  intrinsic_factor: number;
}

export interface Audit {
  n_planets: number;
  mass: { n: number; calculated: number; pct: number };
  radius: { n: number; calculated: number; pct: number };
  deviation_by_mass_type: { type: string; n: number; median_dev_pct: number }[];
  criterion: Record<"radius" | "mass", { tp: number; fp: number; fn: number; tn: number; precision: number; recall: number }>;
  attrition: { step: string; n: number }[];
  naive_n: number;
  date: string;
  regimes: number[];
  clean_transit_pct: number;
}

export interface Discoveries {
  methods: string[];
  years: number[];
  counts: Record<string, number[]>;
}

export interface Paper {
  cv: Record<"mass_from_radius" | "radius_from_mass", { model: string; rmse: number; frac: number }[]>;
  decomposition: {
    mass_from_radius: { intrinsic_fraction: number; intrinsic_factor: number; giants_fraction: number; segments: Segment[] };
    radius_from_mass: { intrinsic_fraction: number; intrinsic_factor: number; segments: Segment[] };
  };
  breaks: {
    radius_from_mass: { value: number; lo: number; hi: number }[];
    mass_from_radius: { value: number; lo: number; hi: number }[];
    ck_reference_mass: number;
  };
  contamination: Record<"naive" | "clean", { n: number; slope_mr: number; slope_rm: number; r2: number; se_mr: number; se_rm: number }>;
}

export interface HistoryPoint {
  date: string;
  n_planets: number;
  mass_calc_pct: number;
  radius_calc_pct: number;
  n_clean: number;
}

export interface Dataset {
  label: DatasetLabel;
  date: string;
  planets: Planets;
  audit: Audit;
  models: Models;
  discoveries: Discoveries;
  n: number;
}

async function getJSON<T>(path: string): Promise<T> {
  const r = await fetch(path, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json() as Promise<T>;
}

const cache = new Map<DatasetLabel, Promise<Dataset>>();

export function loadDataset(label: DatasetLabel): Promise<Dataset> {
  if (!cache.has(label)) {
    const base = `data/${label}/`;
    cache.set(
      label,
      Promise.all([
        getJSON<{ date: string }>(base + "meta.json"),
        getJSON<Planets>(base + "planets.json"),
        getJSON<Audit>(base + "audit.json"),
        getJSON<Models>(base + "models.json"),
        getJSON<Discoveries>(base + "discoveries.json"),
      ]).then(([meta, planets, audit, models, discoveries]) => ({
        label,
        date: meta.date,
        planets,
        audit,
        models,
        discoveries,
        n: planets.name.length,
      })),
    );
  }
  return cache.get(label)!;
}

export const loadPaper = () => getJSON<Paper>("data/paper.json");
export const loadHistory = () => getJSON<HistoryPoint[]>("data/history.json").catch(() => [] as HistoryPoint[]);
export const loadLiveMeta = () => getJSON<{ date: string }>("data/live/meta.json");

/** Previsão da lei de potência quebrada (log10 -> log10). */
export function predictBroken(fit: BrokenFit, x: number): number {
  const b = fit.beta;
  return b[0] + b[1] * x + b[2] * Math.max(x - fit.c1, 0) + b[3] * Math.max(x - fit.c2, 0);
}

/** Chen e Kipping (2017): raio em R⊕ para massa em M⊕. */
const CK_C = 1.008;
const CK_BREAKS = [2.04, 131.58, 26635.6];
const CK_EXPS = [0.279, 0.589, -0.044, 0.881];
const CK_CONSTS = (() => {
  const c: number[] = [];
  let k = CK_C;
  for (let i = 0; i < CK_EXPS.length; i++) {
    c.push(k);
    if (i < CK_BREAKS.length) k = (k * CK_BREAKS[i] ** CK_EXPS[i]) / CK_BREAKS[i] ** CK_EXPS[i + 1];
  }
  return c;
})();

export function ckRadius(mass: number): number {
  let i = 0;
  while (i < CK_BREAKS.length && mass > CK_BREAKS[i]) i++;
  return CK_CONSTS[i] * mass ** CK_EXPS[i];
}

export function regimeOf(mass: number): 0 | 1 | 2 {
  return mass <= 2.04 ? 0 : mass <= 131.58 ? 1 : 2;
}

/** Planetas do Sistema Solar (massa e raio equatorial em unidades terrestres). */
export const SOLAR = {
  earth: { mass: 1, radius: 1 },
  uranus: { mass: 14.54, radius: 4.01 },
  neptune: { mass: 17.15, radius: 3.88 },
  saturn: { mass: 95.16, radius: 9.45 },
  jupiter: { mass: 317.8, radius: 11.21 },
} as const;
