"""Gera os arquivos JSON que o site lê.

Uso:
    python pipeline/build.py data/snapshots/pscomppars_2026-09-23.csv --label snapshot --date 2026-09-23
    python pipeline/build.py data/live/pscomppars_latest.csv --label live --date 2026-10-12 --history
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

import core

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "public" / "data"

METHODS = ["Transit", "Radial Velocity", "Microlensing", "Imaging"]  # demais: "Other"


def sig(v, n=4):
    """Arredonda para n algarismos significativos, preservando nulos."""
    if v is None or (isinstance(v, float) and not np.isfinite(v)):
        return None
    if v == 0:
        return 0
    return float(f"{v:.{n}g}")


def col(series, n=4):
    return [sig(float(v), n) if pd.notna(v) else None for v in series]


def method_code(m):
    return METHODS.index(m) if m in METHODS else len(METHODS)


def build(csv: Path, label: str, date: str, history: bool) -> dict:
    raw = pd.read_csv(csv)
    df = core.flag_calculated(raw)
    clean, steps = core.attrition(df)
    audit = core.audit(df)
    audit["attrition"] = [{"step": k, "n": n} for k, n in steps]
    audit["naive_n"] = int(((df["pl_bmasse"] > 0) & (df["pl_rade"] > 0) & (df["pl_controv_flag"] == 0)).sum())
    audit["date"] = date
    audit["regimes"] = [int(v) for v in np.bincount(core.regime(clean["pl_bmasse"].values), minlength=3)]
    audit["clean_transit_pct"] = round(100 * float((clean["discoverymethod"] == "Transit").mean()), 1)

    mod = core.models(clean)
    res = core.residuals_for_export(clean, mod["fits"])

    # planetas com massa e raio, em colunas (formato compacto)
    both = df[(df["pl_bmasse"] > 0) & (df["pl_rade"] > 0)].copy()
    both["clean"] = both.index.isin(clean.index)
    both = both.join(res)
    planets = {
        "name": both["pl_name"].tolist(),
        "host": both["hostname"].tolist(),
        "method": [method_code(m) for m in both["discoverymethod"]],
        "year": [int(v) if pd.notna(v) else None for v in both["disc_year"]],
        "mass": col(both["pl_bmasse"]),
        "mass_hi": col(both["pl_bmasseerr1"].abs(), 3),
        "mass_lo": col(both["pl_bmasseerr2"].abs(), 3),
        "radius": col(both["pl_rade"]),
        "radius_hi": col(both["pl_radeerr1"].abs(), 3),
        "radius_lo": col(both["pl_radeerr2"].abs(), 3),
        "mass_calc": both["mass_calc"].astype(int).tolist(),
        "radius_calc": both["rad_calc"].astype(int).tolist(),
        "msini": (both["pl_bmassprov"].astype(str).str.startswith("Msini")).astype(int).tolist(),
        "controversial": both["pl_controv_flag"].fillna(0).astype(int).tolist(),
        "clean": both["clean"].astype(int).tolist(),
        "insol": col(both["pl_insol"], 3),
        "period": col(both["pl_orbper"], 4),
        "teff": col(both["st_teff"], 4),
        "met": col(both["st_met"], 3),
        "dist": col(both["sy_dist"], 4),
        "res_r": col(both["res_r"], 3),
        "res_m": col(both["res_m"], 3),
    }

    # descobertas por ano e método (todos os planetas do catálogo)
    disc = raw.dropna(subset=["disc_year"]).copy()
    disc["m"] = [METHODS[c] if c < len(METHODS) else "Other" for c in map(method_code, disc["discoverymethod"])]
    tab = disc.groupby(["disc_year", "m"]).size().unstack(fill_value=0)
    discoveries = {
        "methods": METHODS + ["Other"],
        "years": [int(y) for y in tab.index],
        "counts": {m: [int(v) for v in tab.get(m, pd.Series(0, index=tab.index))] for m in METHODS + ["Other"]},
        "totals_by_method": {k: int(v) for k, v in raw["discoverymethod"].value_counts().items()},
    }

    out_dir = OUT / label
    out_dir.mkdir(parents=True, exist_ok=True)
    meta = {"label": label, "date": date, "source": csv.name}
    for name, obj in [("audit", audit), ("models", mod), ("planets", planets),
                      ("discoveries", discoveries), ("meta", meta)]:
        with open(out_dir / f"{name}.json", "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))

    if history:
        hist_path = OUT / "history.json"
        hist = json.loads(hist_path.read_text()) if hist_path.exists() else []
        hist = [h for h in hist if h["date"] != date]
        hist.append({"date": date, "n_planets": audit["n_planets"],
                     "mass_calc_pct": audit["mass"]["pct"], "radius_calc_pct": audit["radius"]["pct"],
                     "n_clean": len(clean)})
        hist.sort(key=lambda h: h["date"])
        hist_path.write_text(json.dumps(hist, ensure_ascii=False, indent=1))
    return {"audit": audit, "models": mod}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("csv", type=Path)
    ap.add_argument("--label", required=True)
    ap.add_argument("--date", required=True)
    ap.add_argument("--history", action="store_true")
    a = ap.parse_args()
    r = build(a.csv, a.label, a.date, a.history)
    au, mo = r["audit"], r["models"]
    print(f"[{a.label}] planetas={au['n_planets']} massas calc={au['mass']['pct']}% "
          f"raios calc={au['radius']['pct']}% limpa={mo['n_clean']} estrelas={mo['n_stars']}")
    for d, v in mo["cv"].items():
        print(d, {k: round(x["rmse_dex"], 3) for k, x in v.items() if "rmse_dex" in x},
              "intr", round(v["decomposition_m4"]["intrinsic_fraction"], 3))
    for d, v in mo["fits"].items():
        print(d, "M1", round(v["m1"]["slope"], 3), "M3 quebras", [round(b, 2) for b in v["m3"]["breaks_linear"]],
              "expoentes", [round(s, 3) for s in v["m3"]["slopes"]])
