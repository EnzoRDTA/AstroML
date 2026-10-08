"""Auditoria, amostra limpa e modelos da relação massa-raio.

Reproduz a metodologia do trabalho "Relação massa-raio de exoplanetas nas duas
direções de predição" (Andrade, IESB, 2026) sobre qualquer extração da tabela
PSCompPars do NASA Exoplanet Archive.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.model_selection import GroupKFold

CALC = "Calculated Value"

# Chen & Kipping (2017), relação média usada pelo arquivo para preencher valores
CK_C = 1.008
CK_BREAKS = [2.04, 131.58, 26635.6]  # massas terrestres
CK_EXPS = [0.279, 0.589, -0.044, 0.881]

SEED = 42


# ---------------------------------------------------------------------------
# Chen & Kipping
# ---------------------------------------------------------------------------
def ck_radius(mass):
    """Raio (R_terra) previsto por Chen & Kipping (2017) para a massa (M_terra)."""
    m = np.asarray(mass, dtype=float)
    edges = [0.0] + CK_BREAKS + [np.inf]
    r = np.full_like(m, np.nan)
    # constante de cada segmento, escolhida para a curva ser contínua nas quebras
    consts, c = [], CK_C
    for i in range(len(CK_EXPS)):
        consts.append(c)
        if i < len(CK_BREAKS):
            b = CK_BREAKS[i]
            c = c * b ** CK_EXPS[i] / b ** CK_EXPS[i + 1]
    for i, e in enumerate(CK_EXPS):
        sel = (m > edges[i]) & (m <= edges[i + 1])
        r[sel] = consts[i] * m[sel] ** e
    return r


# ---------------------------------------------------------------------------
# Auditoria e amostra
# ---------------------------------------------------------------------------
def flag_calculated(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["mass_calc"] = df["pl_bmasse_reflink"].astype(str).str.contains(CALC, regex=False)
    df["rad_calc"] = df["pl_rade_reflink"].astype(str).str.contains(CALC, regex=False)
    df.loc[df["pl_bmasse"].isna(), "mass_calc"] = False
    df.loc[df["pl_rade"].isna(), "rad_calc"] = False
    df["mass_unc"] = df["pl_bmasseerr1"].notna() & df["pl_bmasseerr2"].notna()
    df["rad_unc"] = df["pl_radeerr1"].notna() & df["pl_radeerr2"].notna()
    return df


def attrition(df: pd.DataFrame):
    """Cadeia de inclusão do trabalho. Devolve (amostra limpa, etapas)."""
    steps = [("catalog", len(df))]
    s = df[(df["pl_bmasse"] > 0) & (df["pl_rade"] > 0)]
    steps.append(("both_nonnull", len(s)))
    s = s[~s["mass_calc"]]
    steps.append(("mass_not_calc", len(s)))
    s = s[~s["rad_calc"]]
    steps.append(("radius_not_calc", len(s)))
    s = s[s["pl_controv_flag"] == 0]
    steps.append(("not_controversial", len(s)))
    s = s[s["mass_unc"] & s["rad_unc"]]
    steps.append(("with_uncertainties", len(s)))
    return s.copy(), steps


def audit(df: pd.DataFrame) -> dict:
    mass_n = int(df["pl_bmasse"].notna().sum())
    rad_n = int(df["pl_rade"].notna().sum())
    mc = int(df["mass_calc"].sum())
    rc = int(df["rad_calc"].sum())

    both = df[(df["pl_bmasse"] > 0) & (df["pl_rade"] > 0)].copy()
    dev = 100 * (both["pl_rade"] - ck_radius(both["pl_bmasse"])).abs() / ck_radius(both["pl_bmasse"])
    prov = both["pl_bmassprov"].fillna("(none)")
    by_type = []
    for k, g in both.groupby(prov):
        by_type.append({
            "type": k, "n": int(len(g)),
            "median_dev_pct": round(float(dev.loc[g.index].median()), 2),
        })
    by_type.sort(key=lambda d: -d["n"])

    def criterion(calc, unc, valid):
        flagged = valid & ~unc
        tp = int((flagged & calc).sum())
        fp = int((flagged & ~calc).sum())
        fn = int((~flagged & calc & valid).sum())
        tn = int((~flagged & ~calc & valid).sum())
        return {
            "tp": tp, "fp": fp, "fn": fn, "tn": tn,
            "precision": round(tp / (tp + fp), 3) if tp + fp else None,
            "recall": round(tp / (tp + fn), 3) if tp + fn else None,
        }

    measured_dev = dev[~both["mass_calc"] & ~both["rad_calc"]].median()
    calc_dev = dev[both["mass_calc"] | both["rad_calc"]].median()
    return {
        "n_planets": int(len(df)),
        "mass": {"n": mass_n, "calculated": mc, "pct": round(100 * mc / mass_n, 1)},
        "radius": {"n": rad_n, "calculated": rc, "pct": round(100 * rc / rad_n, 1)},
        "both_calculated": int((df["mass_calc"] & df["rad_calc"]).sum()),
        "deviation_by_mass_type": by_type,
        "median_dev_measured_pct": round(float(measured_dev), 2),
        "median_dev_calculated_pct": round(float(calc_dev), 3),
        "criterion": {
            "radius": criterion(df["rad_calc"], df["rad_unc"], df["pl_rade"].notna()),
            "mass": criterion(df["mass_calc"], df["mass_unc"], df["pl_bmasse"].notna()),
        },
    }


def regime(mass):
    return np.select([mass <= 2.04, mass <= 131.58], [0, 1], 2)


# ---------------------------------------------------------------------------
# Modelos
# ---------------------------------------------------------------------------
def ols(X, y):
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    return beta


def design_broken(x, c1, c2):
    return np.column_stack([np.ones_like(x), x, np.clip(x - c1, 0, None), np.clip(x - c2, 0, None)])


def fit_broken(x, y, n_cand=40, min_seg=30):
    """Lei de potência quebrada contínua com duas quebras estimadas por grade."""
    lo, hi = np.percentile(x, [2, 98])
    cands = np.linspace(lo, hi, n_cand)
    best = None
    xs = np.sort(x)
    for i, c1 in enumerate(cands):
        for c2 in cands[i + 1:]:
            n1 = np.searchsorted(xs, c1)
            n2 = np.searchsorted(xs, c2) - n1
            n3 = len(xs) - n1 - n2
            if min(n1, n2, n3) < min_seg:
                continue
            X = design_broken(x, c1, c2)
            b = ols(X, y)
            ssr = float(np.sum((y - X @ b) ** 2))
            if best is None or ssr < best[0]:
                best = (ssr, c1, c2, b)
    _, c1, c2, b = best
    return {"c1": float(c1), "c2": float(c2), "beta": [float(v) for v in b]}


def predict_broken(fit, x):
    return design_broken(np.asarray(x, float), fit["c1"], fit["c2"]) @ np.array(fit["beta"])


def broken_slopes(fit):
    b = fit["beta"]
    return [b[1], b[1] + b[2], b[1] + b[2] + b[3]]


def design_m4(x, c1, c2, logS, feh):
    base = design_broken(x, c1, c2)
    seg = np.select([x <= c1, x <= c2], [0, 1], 2)
    cols = [base]
    for k in range(3):
        ind = (seg == k).astype(float)
        cols.append(np.column_stack([ind * logS, ind * feh]))
    return np.column_stack(cols)


def symlog_sigma(v, e1, e2):
    """Incerteza simetrizada em log10 (Eq. 4.1 do trabalho). Quando o limite
    inferior não é positivo, usa-se apenas o lado superior."""
    v, e1, e2 = (np.asarray(a, float) for a in (v, e1, e2))
    hi = np.log10(v + np.abs(e1))
    lo_val = v - np.abs(e2)
    two_sided = (hi - np.log10(np.where(lo_val > 0, lo_val, 1.0))) / 2
    upper_only = hi - np.log10(v)
    return np.where(lo_val > 0, two_sided, upper_only)


def models(clean: pd.DataFrame, n_splits=10) -> dict:
    """Ajusta os modelos nas duas direções e mede o erro fora da amostra."""
    d = clean.copy()
    d["lm"] = np.log10(d["pl_bmasse"])
    d["lr"] = np.log10(d["pl_rade"])
    d["sm"] = symlog_sigma(d["pl_bmasse"], d["pl_bmasseerr1"], d["pl_bmasseerr2"])
    d["sr"] = symlog_sigma(d["pl_rade"], d["pl_radeerr1"], d["pl_radeerr2"])

    out = {"n_clean": int(len(d)), "n_stars": int(d["hostname"].nunique())}
    directions = {"mass_from_radius": ("lr", "lm", "sr", "sm"),
                  "radius_from_mass": ("lm", "lr", "sm", "sr")}

    full = {}
    for name, (xc, yc, sx, sy) in directions.items():
        x, y = d[xc].values, d[yc].values
        b1 = ols(np.column_stack([np.ones_like(x), x]), y)
        r2 = float(np.corrcoef(x, y)[0, 1] ** 2)
        brk = fit_broken(x, y)
        full[name] = {
            "m1": {"intercept": float(b1[0]), "slope": float(b1[1]), "r2": r2},
            "m3": brk | {"slopes": broken_slopes(brk), "breaks_linear": [10 ** brk["c1"], 10 ** brk["c2"]]},
        }

    # validação cruzada agrupada por estrela, casos completos (como no trabalho)
    cc = d.dropna(subset=["pl_insol", "st_met"]).copy()
    cc = cc[cc["pl_insol"] > 0]
    cc["lS"] = np.log10(cc["pl_insol"])
    cc["fe"] = cc["st_met"]
    groups = cc["hostname"].values
    folds = list(GroupKFold(n_splits=n_splits).split(cc, groups=groups))
    out["n_complete"] = int(len(cc))

    cv = {}
    for name, (xc, yc, sx, sy) in directions.items():
        x, y = cc[xc].values, cc[yc].values
        preds = {k: np.full(len(cc), np.nan) for k in ["m1", "m3", "m4", "rf", "gb", "ck"]}
        for tr, te in folds:
            X1 = np.column_stack([np.ones(len(tr)), x[tr]])
            b = ols(X1, y[tr])
            preds["m1"][te] = b[0] + b[1] * x[te]
            f = fit_broken(x[tr], y[tr])
            preds["m3"][te] = predict_broken(f, x[te])
            X4 = design_m4(x[tr], f["c1"], f["c2"], cc["lS"].values[tr], cc["fe"].values[tr])
            b4 = ols(X4, y[tr])
            preds["m4"][te] = design_m4(x[te], f["c1"], f["c2"], cc["lS"].values[te], cc["fe"].values[te]) @ b4
            F = np.column_stack([x, cc["lS"].values, cc["fe"].values])
            rf = RandomForestRegressor(n_estimators=200, max_features=0.6, min_samples_leaf=10,
                                       random_state=SEED, n_jobs=-1).fit(F[tr], y[tr])
            preds["rf"][te] = rf.predict(F[te])
            gb = HistGradientBoostingRegressor(max_leaf_nodes=5, learning_rate=0.05, max_iter=300,
                                               random_state=SEED).fit(F[tr], y[tr])
            preds["gb"][te] = gb.predict(F[te])
            if name == "radius_from_mass":
                preds["ck"][te] = np.log10(ck_radius(10 ** x[te]))
        res = {}
        for k, p in preds.items():
            if np.isnan(p).all():
                continue
            e = y - p
            rmse = float(np.sqrt(np.mean(e ** 2)))
            res[k] = {"rmse_dex": rmse, "factor": float(10 ** rmse),
                      "median_frac_err": float(np.median(np.abs(10 ** e - 1)))}
        # decomposição do erro do Modelo 4: instrumental x intrínseco
        f_all = full[name]["m3"]
        slopes = f_all["slopes"]
        seg = np.select([x <= f_all["c1"], x <= f_all["c2"]], [0, 1], 2)
        beta_local = np.array(slopes)[seg]
        instr = cc[sy].values ** 2 + beta_local ** 2 * cc[sx].values ** 2
        mse = float(np.mean((y - preds["m4"]) ** 2))
        intr = max(mse - float(np.mean(instr)), 0.0)
        res["decomposition_m4"] = {
            "mse": mse, "intrinsic_fraction": intr / mse,
            "intrinsic_sigma_dex": float(np.sqrt(intr)), "intrinsic_factor": float(10 ** np.sqrt(intr)),
        }
        cv[name] = res
    out["fits"] = full
    out["cv"] = cv
    return out


def residuals_for_export(clean: pd.DataFrame, fits: dict) -> pd.DataFrame:
    """Resíduos de cada planeta da amostra limpa em relação ao Modelo 3."""
    lm = np.log10(clean["pl_bmasse"].values)
    lr = np.log10(clean["pl_rade"].values)
    r_rad = lr - predict_broken(fits["radius_from_mass"]["m3"], lm)
    r_mass = lm - predict_broken(fits["mass_from_radius"]["m3"], lr)
    return pd.DataFrame({"res_r": r_rad, "res_m": r_mass}, index=clean.index)
