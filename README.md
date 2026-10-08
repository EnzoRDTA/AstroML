# Além da Curva / Beyond the Curve

Site interativo da pesquisa **"Relação massa-raio de exoplanetas nas duas direções de predição: qualidade dos dados, modelos estatísticos e o limite da previsão"**, de Enzo Rodrigues Teixeira de Andrade (Ciência de Dados e Inteligência Artificial, IESB, 2026), com orientação do Prof. Sérgio da Costa Côrtes.

O NASA Exoplanet Archive indica, em cada registro da tabela PSCompPars, quando a massa ou o raio foi calculado pela relação de Chen e Kipping (2017). A pesquisa separa os valores medidos dos calculados, ajusta modelos nas duas direções (massa pelo raio e raio pela massa) e mede o limite da previsão.

## Como funciona

```
data/snapshots/   extração usada no trabalho (23/09/2026)
data/live/        extração semanal (baixada pelo GitHub Actions)
pipeline/         Python: download (TAP), auditoria, amostra limpa, modelos, validação cruzada
site/             front-end (Vite + TypeScript), lê os JSON de site/public/data
.github/workflows/site.yml   publica no GitHub Pages; toda segunda-feira baixa o catálogo e refaz tudo
```

Não há servidor nem banco de dados: o pipeline gera arquivos JSON que o site lê no navegador. O custo é zero.

### Rodar localmente

```bash
pip install -r pipeline/requirements.txt
python pipeline/build.py data/snapshots/pscomppars_2026-09-23.csv --label snapshot --date 2026-09-23

cd site
npm install
npm run dev
```

### Publicar

Em *Settings → Pages*, escolha **GitHub Actions** como fonte. A cada push na `main` o site é publicado em `https://enzordta.github.io/AstroML/`. Para atualizar os dados na hora, rode o workflow **Site** manualmente na aba *Actions*.

## Dados e agradecimento

This research has made use of the NASA Exoplanet Archive, which is operated by the California Institute of Technology, under contract with the National Aeronautics and Space Administration under the Exoplanet Exploration Program.

Christiansen, J. L. et al. (2025). The NASA Exoplanet Archive and Exoplanet Follow-up Observing Program: Data, Tools, and Usage. *The Planetary Science Journal*, 6, 186.

Projeto acadêmico independente, sem vínculo oficial com a NASA ou o Caltech.
