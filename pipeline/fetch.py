"""Baixa a tabela PSCompPars do NASA Exoplanet Archive (serviço TAP).

Mesma consulta ADQL do Apêndice A do trabalho. Salva em data/live/.
"""
from __future__ import annotations

import datetime as dt
import io
import sys
from pathlib import Path

import pandas as pd
import requests

TAP = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync"
ADQL = """
SELECT pl_name, hostname, discoverymethod, disc_year,
       pl_bmasse, pl_bmasseerr1, pl_bmasseerr2, pl_bmassprov,
       pl_bmasse_reflink,
       pl_rade, pl_radeerr1, pl_radeerr2, pl_rade_reflink,
       pl_dens, pl_orbper, pl_orbsmax, pl_insol, pl_eqt,
       st_teff, st_rad, st_mass, st_met, st_meterr1, st_meterr2,
       sy_dist, sy_pnum, tran_flag, rv_flag, ttv_flag,
       pl_controv_flag
FROM pscomppars
"""

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    r = requests.get(TAP, params={"query": " ".join(ADQL.split()), "format": "csv"}, timeout=300)
    r.raise_for_status()
    df = pd.read_csv(io.StringIO(r.text))
    if len(df) < 5000 or "pl_bmasse_reflink" not in df.columns:
        print(f"Resposta inesperada do arquivo: {len(df)} linhas", file=sys.stderr)
        return 1
    today = dt.date.today().isoformat()
    out = ROOT / "data" / "live"
    out.mkdir(parents=True, exist_ok=True)
    df.to_csv(out / "pscomppars_latest.csv", index=False)
    (out / "DATE").write_text(today)
    print(f"{len(df)} planetas baixados em {today}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
