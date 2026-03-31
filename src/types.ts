export type TransactionDirection = 'income' | 'expense'

// ─── New Entities ────────────────────────────────────────────────────────────

export type DebtType = 'mortgage' | 'consumer' | 'auto' | 'student' | 'other'

export type Debt = {
  id: string
  name: string
  type: DebtType
  originalAmount: number
  balance: number
  interestRate: number      // e.g. 3.5  → 3.5%
  monthlyPayment: number
  startDate: string         // ISO date
  endDate: string           // ISO date
  linkedAssetId?: string    // real_estate.id
}

export type AmortizationRow = {
  month: number
  date: string
  payment: number
  principal: number
  interest: number
  balance: number
}

export type Goal = {
  id: string
  name: string
  icon: string              // emoji
  color: string             // hex
  targetAmount: number
  targetDate: string        // ISO date YYYY-MM-DD
  currentAmount: number     // pulled from linked account or manual
  monthlyContribution: number
  linkedAccountId?: string
  isCompleted: boolean
}

export type HealthGoals = {
  targetEmergencyFundMonths: number
  maxCryptoShareTotal: number
  maxSinglePositionShare: number
  maxTop3PositionsShare: number
  maxDebtToAssetRatio: number
  maxDebtServiceToIncomeRatio: number
  allocationDriftTolerance: number
  minAssetClassCount: number
  minGeoBucketCount: number
  minSectorBucketCount: number
}

export type RealEstate = {
  id: string
  name: string
  address?: string
  purchasePrice: number
  currentValue: number
  purchaseDate: string      // ISO date
  isRental: boolean
  monthlyRent?: number
  monthlyCharges?: number
  taxRegime?: 'micro-foncier' | 'real'
  linkedDebtId?: string
}

export type Vehicle = {
  id: string
  name: string
  purchasePrice: number
  purchaseDate: string      // ISO date
  currentValue: number      // user-overridable; auto = linear depreciation
}

export type TransactionOverride = {
  transactionId: string
  category: string
  categoryParent: string
  supplier: string
  note: string
}

export type FIREScenario = {
  annualExpenses: number
  portfolioValue: number
  monthlyContribution: number
  expectedReturnRate: number  // e.g. 7  → 7%
  safeWithdrawalRate: number  // e.g. 4  → 4%
  fireNumber: number
  currentProgress: number     // 0-100 %
  yearsToFire: number
  fireDate: string
  currentSavingsRate: number  // % of income
}

export type NetWorthProjection = {
  years: string[]
  conservative: number[]
  base: number[]
  optimistic: number[]
}

export type TaxEstimate = {
  year: number
  pfuDividendsGross: number
  pfuCapitalGainsGross: number
  pfuTotal: number           // 30% flat tax
  rentalGross: number
  rentalRegime: 'micro-foncier' | 'real' | 'none'
  rentalAbattement: number
  rentalTaxBase: number
  rentalTaxEstimate: number  // at 30%
  totalEstimated: number
  isNearIFIThreshold: boolean
  realEstateNetValue: number
}

export type RealEstatePurchaseSimulation = {
  propertyPrice: number
  apport: number
  loanAmount: number
  loanRate: number
  loanDurationYears: number
  monthlyPayment: number
  totalCostOfCredit: number
  totalCost: number
  monthlyRentSaved?: number   // if buying replaces renting
  currentRent?: number        // rent currently paid
  breakEvenMonths?: number
  affordabilityRatio: number  // payment / income %
  isAffordable: boolean       // < 33%
}

export type Transaction = {
  id: string
  operationDate: string
  valueDate: string
  monthKey: string
  monthLabel: string
  label: string
  category: string
  categoryParent: string
  supplier: string
  amount: number
  direction: TransactionDirection
  comment: string
  accountNumber: string
  accountLabel: string
  balance: number | null
  isTransfer: boolean
  isUncategorized: boolean
}

export type CategoryRule = {
  id: string
  field: 'supplier' | 'label'
  match: string
  category: string
  categoryParent: string
}

export type BudgetOverrides = Record<string, number>

export type ManualNetWorthItem = {
  id: string
  label: string
  kind: 'asset' | 'debt'
  value: number // the computed or manual value
  symbol?: string     // e.g. 'AAPL' or 'BTC-USD'
  quantity?: number
  buyingPrice?: number
  productType?: ProductType
}

export type MonthOption = {
  key: string
  label: string
  transactionCount: number
}

export type ProductType =
  | 'checking'       // Compte courant
  | 'credit'         // Crédit / prêt
  | 'livret-a'       // Livret A
  | 'livret-jeune'   // Livret Jeune
  | 'lep'            // LEP
  | 'ldds'           // LDDS
  | 'livret-other'   // Autre livret
  | 'pea'            // PEA
  | 'pea-pme'        // PEA-PME
  | 'assurance-vie'  // Assurance vie
  | 'per'            // PER
  | 'cto'            // Compte-titres ordinaire
  | 'crypto'         // Crypto
  | 'real-estate'    // Immobilier
  | 'other'          // Autre

export type SummaryCard = {
  label: string
  value: number
  accent: 'sand' | 'coral' | 'teal' | 'slate'
}

export type CategorySummary = {
  name: string
  parent: string
  amount: number
  share: number
  transactionCount: number
  suggestedBudget: number
  status: 'under' | 'close' | 'over'
}

export type MerchantSummary = {
  name: string
  amount: number
  transactionCount: number
  category: string
}

export type RecurringExpense = {
  name: string
  amount: number
  occurrences: number
  category: string
  lastDate: string
  cadence: 'weekly' | 'monthly' | 'irregular'
}

export type Anomaly = {
  id: string
  label: string
  amount: number
  expectedAmount: number
  merchant: string
  date: string
  reason: string
  severity: 'medium' | 'high'
}

export type Insight = {
  title: string
  body: string
  tone: 'info' | 'warning' | 'positive'
}

export type QueryResponse = {
  title: string
  body: string
  matchingTransactions: Transaction[]
}

export type MonthlyAnalysis = {
  key: string
  label: string
  income: number
  expenses: number
  transfers: number
  net: number
  dailyRunRate: number
  projectedMonthEnd: number
  totalBudgetTarget: number
  budgetGap: number
  expenseDelta: number | null
  uncategorizedCount: number
  uncategorizedAmount: number
  summaryCards: SummaryCard[]
  categories: CategorySummary[]
  merchants: MerchantSummary[]
  anomalies: Anomaly[]
  insights: Insight[]
  allTransactions: Transaction[]
  recentTransactions: Transaction[]
  uncategorizedTransactions: Transaction[]
}

export type ActionTask = {
  id: string
  title: string
  description: string
  week: number                                    // 1-4 for 30-day plan
  priority: 'critical' | 'high' | 'medium' | 'low'
  type: 'budget' | 'investment' | 'debt' | 'savings' | 'categorization' | 'review'
  estimatedImpact?: number                       // monetary impact or score impact
  targetDate: string                             // ISO date YYYY-MM-DD
  completed: boolean
  actionableSteps?: string[]                     // step-by-step substeps
}

export type ActionPlan = {
  durationDays: number
  startDate: string                              // ISO date
  endDate: string                                // ISO date
  tasks: ActionTask[]
  summary: string                                // one-line summary of the plan
  estimatedFinancialImpact: number               // total €€ impact
}

export type BudgetAnalysis = {
  months: MonthOption[]
  monthly: Record<string, MonthlyAnalysis>
  transactions: Transaction[]
  recurringExpenses: RecurringExpense[]
  accounts: Array<{
    accountLabel: string
    balance: number | null
  }>
}

// ─── Boursorama Integration ──────────────────────────────────────────────────

export type {
  BoursoAccount,
  BoursoAccountKind,
  OrderSide,
  TradeOrder,
  TradeOrderResult,
  Transfer,
  TransferResult,
  Quote,
  BoursoAction,
} from './types-bourso'