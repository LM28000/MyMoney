# MyMoney

Application locale de pilotage financier personnel (budget + patrimoine), basée sur des imports CSV, une API Express/SQLite et un frontend React.
<img width="3024" height="1658" alt="image" src="https://github.com/user-attachments/assets/9eafbce1-696c-4734-9701-9a1d1732b888" />

## Fonctionnalités actuelles

- Import CSV d'opérations et de positions d'investissement.
- Moteur budget: catégorisation, règles, dépenses récurrentes, anomalies, synthèse mensuelle.
- Cockpit décisionnel: situation, allocation, actions prioritaires, cartes IA.
- Vue patrimoniale complète: actifs financiers, immobilier, véhicules, dettes.
- Investment Studio intégré à la Vue globale (Patrimoine) avec:
  - poche crypto agrégée,
  - poche livrets,
  - valorisation live (Yahoo Finance + CoinGecko),
  - ventilation par compte.
- Modules additionnels: objectifs, fiscalité, forecast/FIRE, timeline, overrides transaction.

## Stack

- Frontend: React 19 + TypeScript + Vite.
- Backend: Express + TypeScript (tsx).
- Persistance: SQLite (better-sqlite3) + store JSON historique.
- Données marché: yahoo-finance2 + CoinGecko.

## Démarrage

```bash
npm install
```

### Frontend seul

```bash
npm run dev
```

### Backend seul

```bash
npm run api:dev
```

### Frontend + backend

```bash
npm run dev:full
```

Par défaut l'API tourne sur le port `8787`.
Tu peux le changer (ex: `8788`) via la variable d'environnement `API_PORT`.

## Variables d'environnement

Variables supportées:

- `API_PORT` (défaut: `8787`)
- `OPENAI_BASE_URL` (ex: `http://localhost:1234/v1`)
- `OPENAI_API_KEY` (défaut: `lm-studio`)
- `OPENAI_MODEL`
- `CORS_ORIGIN` (défaut: `*`)
- `LOG_LEVEL` (ex: `info`, `debug`)
- `MARKET_CACHE_TTL_MS` (défaut: `60000`)

Si la config IA n'est pas disponible, les endpoints IA retombent sur un mode local/fallback.

## Formules métier de référence

Pour éviter les ambiguïtés d'affichage entre écrans:

- Total Investment Studio = Marché live + Livrets.
- Actifs financiers (Vue globale) = même périmètre que Total Investment Studio.
- Actifs totaux = Actifs financiers + Immobilier + Véhicules.
- Valeur nette = Actifs totaux - Dettes.

## API (résumé)

Endpoints principaux:

- État global: `GET /api/state`, `GET /api/health`
- Imports budget: `GET /api/imports`, `POST /api/import`, `PATCH /api/imports/:id`
- Imports investissement: `GET /api/investment-imports`, `POST /api/investment-import`, `PATCH /api/investment-imports/:id`, `DELETE /api/investment-imports/:id`
- Comptes: `GET /api/accounts`, `POST /api/accounts`, `PATCH /api/accounts/:id`, `DELETE /api/accounts/:id`
- Import par compte: `POST /api/accounts/:id/imports`, `PATCH /api/accounts/:accountId/imports/:importId`, `DELETE /api/accounts/:accountId/imports/:importId`
- Budgets/règles: `PUT /api/budgets`, `PUT /api/rules`
- Patrimoine: `PUT /api/networth-items`, `POST /api/wealth/sync`, `GET /api/patrimony/breakdown`, `GET /api/timeline`
- Marchés: `GET /api/markets/investments`, `GET|PUT|DELETE /api/markets/symbol-overrides`
- IA: `POST /api/ai/ask`, `POST /api/ai/suggest`
- Emergency fund / score: `GET /api/emergency-fund`, `PUT /api/emergency-fund`, `GET /api/health-score`
- CRUD métiers: dettes, objectifs, immobilier, véhicules, tax events, overrides transaction, simulateurs fiscal/FIRE/forecast.

## Build production

```bash
npm run build
```

## Notes

- Le build Vite peut afficher un warning de taille de chunk; c'est informatif et non bloquant.
- La documentation détaillée de l'architecture est maintenue dans `CODEBASE_ANALYSIS.md`.
