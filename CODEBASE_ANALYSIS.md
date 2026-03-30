# MyMoney Codebase Analysis (Updated 2026-03-30)

## 1. Architecture Snapshot

MyMoney est une application full-stack locale orientée pilotage patrimonial.

- Frontend React/TypeScript: dashboard, patrimoine, comptes, budget, objectifs, simulateurs, imports.
- Backend Express/TypeScript: API métier, calculs budget/patrimoine, intégration IA, valorisation marché.
- Persistance SQLite: données métier structurées (dettes, objectifs, immobilier, véhicules, overrides, taxes, snapshots).
- Persistance store JSON: état applicatif enrichi, compatibilité avec historique import initial.

## 2. Source Of Truth Métier

- Comptes financiers: `state.accounts` (assets/debts + imports liés).
- Entités patrimoine hors comptes: tables SQLite dédiées (`real_estate`, `vehicles`, `debts`).
- Analyse budgétaire: dérivée des transactions importées.
- Marché live: Yahoo Finance (titres) + CoinGecko (crypto).

Le calcul patrimoine agrège désormais comptes + immobilier + véhicules + dettes table dédiée.

## 3. Formules Métier Clés

Ces formules servent de référence pour maintenir la cohérence UI/API.

- Total Investment Studio = Marché live + Livrets.
- Actifs financiers (Vue globale) = Total Investment Studio.
- Actifs totaux = Actifs financiers + Immobilier + Véhicules.
- Valeur nette = Actifs totaux - Dettes.

Notes:

- Le compte courant n'entre pas dans Investment Studio.
- Les valorisations marché live remplacent les montants statiques quand disponibles.

## 4. Frontend Map (src/components)

- `DashboardTab.tsx`: cockpit exécutif, situation globale, allocation, décisions, widgets IA.
- `PatrimoineTab.tsx`: vue globale patrimoine + Investment Studio (groupes par compte, crypto agrégée).
- `AccountsTab.tsx`: gestion et visualisation des comptes/imports.
- `HealthScoreWidget.tsx`: score santé patrimoniale, axes détaillés, popups explicatifs.
- `ChatbotFloat.tsx`: accès conversationnel rapide via `/api/ai/ask`.
- `TaxTab.tsx`, `ForecastingTab.tsx`, `SimulatorsTab.tsx`: fiscalité et projections.

## 5. Backend Map (server)

- `index.ts`:
   - build state + analyses,
   - calcul patrimonial (`buildPatrimony`),
   - endpoints IA et marchés,
   - endpoints de synchronisation/import.
- `routes/crud.ts`:
   - CRUD dettes, objectifs, immobilier, véhicules,
   - tax events,
   - transaction overrides,
   - endpoints simulateurs (`/tax/estimate`, `/fire`, `/forecast`).
- `db.ts`:
   - accès SQLite,
   - snapshots journaliers,
   - lecture/écriture entités métier.
- `validation/schemas.ts`:
   - schémas Zod pour validation requêtes.

## 6. API Surface (pratique)

Core:

- `GET /api/state`
- `GET /api/health`

Imports:

- `GET /api/imports`
- `POST /api/import`
- `PATCH /api/imports/:id`
- `GET /api/investment-imports`
- `POST /api/investment-import`
- `PATCH /api/investment-imports/:id`
- `DELETE /api/investment-imports/:id`

Comptes:

- `GET /api/accounts`
- `POST /api/accounts`
- `PATCH /api/accounts/:id`
- `DELETE /api/accounts/:id`
- `POST /api/accounts/:id/imports`
- `PATCH /api/accounts/:accountId/imports/:importId`
- `DELETE /api/accounts/:accountId/imports/:importId`

Patrimoine et marchés:

- `GET /api/patrimony/breakdown`
- `POST /api/wealth/sync`
- `GET /api/markets/investments`
- `GET|PUT|DELETE /api/markets/symbol-overrides`
- `GET /api/timeline`

Pilotage & IA:

- `PUT /api/budgets`
- `PUT /api/rules`
- `POST /api/ai/ask`
- `POST /api/ai/suggest`
- `GET|PUT /api/emergency-fund`
- `GET /api/health-score`

CRUD métiers (routeur dédié):

- `debts`, `goals`, `real-estate`, `vehicles`, `tax-events`, `transaction-overrides`
- `GET /api/tax/estimate`
- `GET /api/fire`
- `GET /api/forecast`

## 7. Known Technical Debt

- Quelques erreurs TypeScript existent en backend dans une section non bloquante pour le build frontend.
- Bundle frontend principal > 500 kB minifié (warning Vite); optimisation par code splitting à prévoir.
- Certaines vues mélangent encore logique de calcul et rendu, ce qui limite la réutilisabilité.

## 8. Conventions de Maintenance

- Toute évolution de formule patrimoniale doit être répercutée dans:
   - `buildPatrimony` (backend),
   - `PatrimoineTab` (Vue globale),
   - `DashboardTab` (cockpit),
   pour garantir des totaux cohérents.
- Préférer les montants live pour la poche marché quand la donnée est disponible.
- Garder les définitions de périmètre explicites dans l'UI (libellés Marché, Livrets, Actifs totaux, Valeur nette).
anomalies: month.anomalies.slice(0, 5)  // Only first 5
topCategories: month.categories.slice(0, 5)  // Only first 5
```

**Problem:**
- Truncated to 5 items each
- AI may miss key insights if important anomalies are beyond top 5
- No indication to AI that data is truncated

---

#### **Issue 4: Missing Patrimony/Investment Context** [MODERATE]
**Location:** [server/index.ts L1355-1405]

**Problem:**
- `askRemoteAi()` **only receives budget/transaction data**
- Does NOT receive:
  - Patrimony summary (net worth, allocation)
  - Investment performance
  - Emergency fund status
  - Asset breakdown
- Chatbot cannot answer questions about investments, net worth changes, or long-term planning
- Example: User asks "Should I increase my crypto allocation?" → AI has no investment data

---

#### **Issue 5: No Cache for Month Key** [LOW]
**Location:** [DashboardTab.tsx L209, ChatbotFloat.tsx L81]

**Problem:**
- Dashboard caches month key in `aiBriefMonthKeyRef.current` to avoid re-fetching
- ChatbotFloat doesn't use any caching mechanism
- Each message re-fetches and re-analyzes same month data

---

### 🔴 **The Core Issue: Analysis Data Completeness**

**Expected Behavior:**
1. User opens chatbot after importing CSV
2. Chatbot displays: "Analyse locale active ✓"
3. User asks question
4. AI receives full current month financial snapshot including:
   - Income, expenses, net cash flow
   - Budget variance
   - Top spending categories
   - Anomalies detected
5. AI responds with context-aware advice

**Actual Behavior:**
- ✅ Steps 1-3 work
- ⚠️ Step 4: AI context is **budget-only** (missing investments/patrimony)
- ✅ Step 5: Response works but may lack financial context

---

## 4. Summary of Findings

### Card Component Consolidation Priority:
1. **HIGH:** `MetricCard` component (used 15+ times)
2. **HIGH:** `StatRow` component (used in monthly cards, allocation items)
3. **MEDIUM:** `AlertCard` (used for alerts and suggestions)
4. **MEDIUM:** `PanelHeader` (reused in all premium panels)

### Chatbot/AI Issues Priority:
1. **CRITICAL:** Missing patrimony/investment context in AI prompt
   - Fix: Pass `patrimony` summary to `askRemoteAi()`
   
2. **CRITICAL:** No validation that month data exists before AI call
   - Fix: Check all required fields before passing to LM Studio
   
3. **MODERATE:** Remote AI failures not logged
   - Fix: Add console error logging for debugging
   
4. **MODERATE:** Incomplete anomaly context
   - Fix: Increase slice limit or indicate truncation to AI
   
5. **LOW:** No early-return for missing data
   - Fix: Return explicit error when month missing instead of null

### Data Flow Diagram:

```
ChatbotFloat (query + monthKey)
    ↓
POST /api/ai/ask
    ↓
readStore() → buildAnalysis(state)
    ↓
analysis.monthly[monthKey] ← Only returns budget data!
    ↓
askRemoteAi() ← Needs patrimony added!
    ↓
LM Studio API (20s timeout)
    ↓
response: { mode, title, answer }
```

---

## Files Modified/Needed:
- ✅ [ChatbotFloat.tsx](ChatbotFloat.tsx) - Request structure correct
- ✅ [DashboardTab.tsx](DashboardTab.tsx) - Month key handling correct
- ⚠️ [server/index.ts](server/index.ts) - **askRemoteAi needs patrimony context**
- 📋 **New: MetricCard.tsx** - Extract reusable card components
- 📋 **New: StatRow.tsx** - Extract reusable stat components
