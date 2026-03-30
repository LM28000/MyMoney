# MyMoney Codebase Analysis

## 1. Card/Metric Display Patterns Found

### Overview: Multiple Reusable Card Patterns Identified

#### **DashboardTab.tsx** patterns:

1. **Hero Card** (`hero-card` class)
   - Location: [DashboardTab.tsx](DashboardTab.tsx#L468)
   - Used for: Net worth summary
   - Structure: Label + Strong value + Small metadata
   - Example: `<div className="hero-card networth-card">`

2. **Compact Metric Cards** (`compact-metric-card` class)
   - Location: [DashboardTab.tsx](DashboardTab.tsx#L473-L489)
   - Used for: Trésorerie, Livrets, Investissements quick stats
   - Structure: Span label + Strong value + Small metadata
   - Count: 4 instances in dashboard overview
   - Pattern: `<span>Label</span> <strong>Value</strong> <small>Metadata</small>`

3. **History Chart Card** (`HistoryChartCard` component)
   - Location: [DashboardTab.tsx](DashboardTab.tsx#L153-L175)
   - Used for: Patrimoine net, Poche investie trends
   - Structure: Title + Chart SVG + Footer with dates/values
   - Child variations: `history-card`, `history-card-header`, `history-chart`

4. **Investment Overview Card** (`investment-overview-card` class)
   - Location: [DashboardTab.tsx](DashboardTab.tsx#L714-L728)
   - Used for: Total valuation + Period performance
   - Structure: Two-column layout (main/side) with labels

5. **Allocation Item Cards** (`allocation-item` class)
   - Location: [DashboardTab.tsx](DashboardTab.tsx#L740-L756)
   - Used for: Investment breakdown by product type
   - Structure: Label + Value + Share % + Progress bar
   - Count: Dynamic (one per product type)
   - Pattern: Repeating card with visual indicator

6. **Monthly Cards** (`monthly-card` / `premium-month-card` class)
   - Location: [DashboardTab.tsx](DashboardTab.tsx#L774-L805)
   - Used for: Monthly Pulse analysis (income/expenses/net)
   - Structure: Month label + Three-stat grid
   - Count: 3 cards (latest months)

7. **Suggestion/Priority Cards** (in AI Brief panel)
   - Location: [DashboardTab.tsx](DashboardTab.tsx#L594-L606)
   - Used for: AI recommended actions (also in Monthly panel at L798)
   - Structure: Title + Description + Actionable advice
   - Classes: `ai-priority-item`, `suggestion`, `compact-suggestion`

8. **Investment Alert Cards** (`investment-alert` class)
   - Location: [DashboardTab.tsx](DashboardTab.tsx#L690-L698)
   - Used for: Risk warnings (emergency fund, concentration, drawdown)
   - Structure: Title + Description, with severity styling

9. **Emergency Fund Widget** (specialized card)
   - Location: [DashboardTab.tsx](DashboardTab.tsx#L643-L686)
   - Used for: Emergency fund progress display
   - Structure: Amounts + Progress bar + Livret list
   - Unique: Complex multi-element widget

---

#### **AccountsTab.tsx** patterns:

1. **Summary Cards** (`summary-cards` / `card` class)
   - Location: [AccountsTab.tsx](AccountsTab.tsx#L312-L330)
   - Used for: Total assets, Livrets, Investments summary
   - Structure: Label + Value + Meta count
   - Pattern: `<div className="card"><div className="card-label">`, `<div className="card-value">`, `<div className="card-meta">`

2. **Account Row Card** (within grouped sections)
   - Location: [AccountsTab.tsx](AccountsTab.tsx#L400+) (render section)
   - Used for: Individual account display in collapsible groups
   - Structure: Product icon + Name + Balance + Actions + Trend
   - Elements: `account-item`, `account-item-header`, `account-balance-row`

---

### **Consolidation Opportunities**

| Pattern | Locations | Consolidation Approach |
|---------|-----------|------------------------|
| **Metric Card** | DashboardTab (compact-metric-card), AccountsTab (summary-cards), all panels | Create `<MetricCard label, value, meta, variant>` |
| **Stat Row** | Monthly cards, allocation items, multiple panels | Create `<StatRow label, value, secondary>` component |
| **Alert/Priority Card** | Investment alerts, AI priorities, suggestions | Create `<AlertCard title, description, severity>` |
| **Summary Panel Header** | All premium-panels | Create `<PanelHeader kicker, title, description, actions>` |
| **Chart Container** | HistoryChartCard, investment overview | Create `<ChartCard title, chartComponent, footer>` |

---

## 2. Chatbot Implementation & AI Prompt System

### Flow: User Question → AI Response

#### **Frontend Layer** (`ChatbotFloat.tsx`)

1. **User Input Collection**
   - Location: [ChatbotFloat.tsx](ChatbotFloat.tsx#L66-L102)
   - Collects: Query text or quick prompt selection
   - Sends POST `/api/ai/ask` with:
     ```json
     {
       "query": "user question",
       "monthKey": "2026-03" (analysis?.months[0]?.key)
     }
     ```

2. **Quick Prompts Available** (Line 45-49):
   - "Résumé du mois"
   - "Anomalies détectées ?"
   - "Dépenses récurrentes"
   - "Plus grosse dépense ?"
   - "Non catégorisé"

---

#### **Backend Layer** (`server/index.ts` endpoint)

**Endpoint: `POST /api/ai/ask`**
- Location: [server/index.ts](server/index.ts#L1860-L1892)

**Request Processing:**
```typescript
{
  query: string,        // User question (required)
  monthKey?: string     // Specific month (defaults to first month)
}
```

**Data Flow:**
1. **Fetch stored state** → `readStore()`
2. **Build analysis** → `buildAnalysis(state)` creates `BudgetAnalysis`
3. **Validate month exists** → Get `analysis.monthly[monthKey]`
4. **Two-path logic**:
   - If `OPENAI_BASE_URL` and `OPENAI_MODEL` configured → Try remote AI first
   - If remote fails or not configured → Use local fallback

---

### **System Prompt Structure** (askRemoteAi)

**Location: [server/index.ts](server/index.ts#L1355-L1405)**

#### System Message (Line 1373-1375):
```
"Tu es un assistant financier francophone. Donne des conseils concrets, 
concis, et actionnables. N'invente aucune donnée absente."
```

#### User Message Context (Line 1378-1398):
Passes **structured JSON** containing:

```json
{
  "query": "user question",
  "monthLabel": "mars 2026",
  "expenses": 2500.50,
  "income": 3200.00,
  "budgetTarget": 3000.00,
  "budgetGap": -499.50,
  "anomalies": [
    { "reason": "...", "amount": 100 }  // First 5 anomalies
  ],
  "topCategories": [
    { "name": "Food", "amount": 500, "budget": 450, "balance": -50 }  // First 5
  ],
  "recurringExpenses": [
    { "label": "Netflix", "amount": 15, "frequency": 30 }  // First 6
  ]
}
```

---

### **Response Format**

**Location: [server/index.ts](server/index.ts#L1884-L1896)**

Success response:
```json
{
  "mode": "remote" | "local",
  "title": "Assistant IA",
  "answer": "markdown formatted response",
  "transactions": []
}
```

Fallback (local) uses `answerBudgetQuestion()` from [src/lib/finance.ts](src/lib/finance.ts)

---

## 3. Issues Preventing Chatbot from Receiving Analysis Data

### ✅ **What Works Correctly:**

1. **Month Key Formatting** [ChatbotFloat.tsx L81]
   - Correctly uses: `analysis?.months[0]?.key`
   - This gets passed to `/api/ai/ask` as `monthKey`

2. **Request Structure** [ChatbotFloat.tsx L72-79]
   - Properly sends `monthKey` to backend
   - Backend correctly retrieves month data

3. **Analysis Availability Check** [ChatbotFloat.tsx L55, 61]
   - Checks `hasData = Boolean(analysis && analysis.months.length > 0)`
   - Disables input if no data

---

### ⚠️ **Potential Issues Found:**

#### **Issue 1: Month Data Access in Backend** [CRITICAL]
**Location:** [server/index.ts L1360]
```typescript
const month = analysis.monthly[monthKey]
if (!month) {
  return null
}
```

**Problem:** 
- Backend looks for `analysis.monthly[monthKey]` (the detailed month object)
- But if `buildAnalysis()` doesn't properly index by month key, it returns `null`
- Remote AI call fails silently and falls back to local

**Missing Context Detail:**
- The month object should contain: `expenses`, `income`, `totalBudgetTarget`, `budgetGap`, `anomalies`, `categories`
- If any of these are undefined, the JSON stringify creates incomplete context for AI
- **No validation** that these fields exist before passing to LM Studio

---

#### **Issue 2: No Error Logging for Remote AI Failures** [MODERATE]
**Location:** [server/index.ts L1883-1896]
```typescript
try {
  const answer = await askRemoteAi(...)
  if (answer) {
    response.json({ mode: 'remote', ... })
  } else {
    // Falls back to local silently
  }
} catch {
  // Falls back to local silently
}
```

**Problem:**
- User sees response but doesn't know if it came from AI or local fallback
- No indication whether LM Studio is actually being used
- Response includes `mode: 'remote'` even if the AI returned null

---

#### **Issue 3: Incomplete Anomaly Context** [MODERATE]
**Location:** [server/index.ts L1391, L1384]
```typescript
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
