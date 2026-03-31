import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

import cors from 'cors'
import express from 'express'
import OpenAI from 'openai'
import Papa from 'papaparse'
import YahooFinance from 'yahoo-finance2'

import {
  analyzeTransactions,
  answerBudgetQuestion,
  applyCategoryRules,
  parseBudgetCsv,
} from '../src/lib/finance'
import type {
  BudgetAnalysis,
  BudgetOverrides,
  CategoryRule,
  HealthGoals,
  ManualNetWorthItem,
  Transaction,
  RecurringExpense,
  ProductType,
} from '../src/types'
import {
  initDB, readStoreFromDB, writeStoreToDB, saveDailySnapshot, getDailySnapshots,
  getAllDebts, insertDebt, updateDebt, deleteDebt,
  getAllGoals, insertGoal, updateGoal, deleteGoal,
  getAllRealEstate, insertRealEstate, updateRealEstate, deleteRealEstate,
  getAllVehicles, insertVehicle, updateVehicle, deleteVehicle,
  getAllTransactionOverrides, upsertTransactionOverride, deleteTransactionOverride,
  getAllTaxEvents, insertTaxEvent, deleteTaxEvent,
} from './db'
import { env } from './env'
import { errorHandler, notFoundHandler } from './http'
import { logger } from './logger'
import { registerCrudRoutes } from './routes/crud'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const API_PORT = env.API_PORT
const OPENAI_BASE_URL = env.OPENAI_BASE_URL
const OPENAI_API_KEY = env.OPENAI_API_KEY
const OPENAI_MODEL = env.OPENAI_MODEL
const STORE_PATH = path.resolve(__dirname, './data/store.json')
const yahooFinance = new YahooFinance()

// ProductType has been moved to src/types.ts

type StoredImport = {
  id: string
  fileName: string
  uploadedAt: string
  csvText: string
  accountLabel?: string
  accountNumber?: string
  institution?: string
  periodStartDate?: string
  periodEndDate?: string
  isActive: boolean
}

type AccountImportKind = 'operations' | 'positions' | 'unknown'

type CryptoHolding = {
  coinId?: string
  symbol?: string
  name?: string
  quantity?: number
  averageBuyPrice?: number
}

type ParsedAccountOperation = {
  operationDate: string
  valueDate: string
  label: string
  amount: number
  balance: number | null
  accountLabel: string
}

// A "compte" is the canonical entity the user manages.
// It can have CSV exports attached (StoredImport[]).
type StoredAccount = {
  id: string
  name: string            // e.g. "Livret A Bourso"
  productType: ProductType
  institution?: string    // e.g. "BoursoBank"
  manualBalance?: number  // manual override when no CSV
  cryptoHolding?: CryptoHolding
  notes?: string
  isEligibleEmergencyFund: boolean  // auto true for livrets
  csvImports: StoredImport[]          // ordered by uploadedAt desc  
  kind: 'asset' | 'debt'
}

type StoredNetWorthItem = ManualNetWorthItem & {
  id: string
  productType: ProductType
  notes?: string
}

type MarketSymbolOverride = {
  name: string
  symbol: string
  updatedAt: string
}

export type StoredState = {
  accounts: StoredAccount[]
  imports: StoredImport[]          // legacy bank-transaction imports (for budget analysis)
  rules: CategoryRule[]
  budgetOverrides: BudgetOverrides
  netWorthItems: StoredNetWorthItem[]
  emergencyFundTargetMonths: number
  emergencyFundMonthlyExpenses: number | null
  emergencyFundDesignated: string[]
  healthGoals: HealthGoals
  marketSymbolOverrides: Record<string, MarketSymbolOverride>
  investmentImports: StoredInvestmentImport[]
  dashboardHistory: DashboardHistoryPoint[]
}

type CashflowProjection = {
  currentBalance: number
  pendingRecurringExpenses: number
  pendingRecurringList: RecurringExpense[]
  projectedEndBalance: number
}

type PatrimonySummary = {
  bankCash: number
  externalAssets: { [key: string]: number }
  debts: number
  netWorth: number
  emergencyFund: {
    current: number
    target: number
    isHealthy: boolean
    months: number
    livretDetails: Array<{ name: string; balance: number }>
  }
  assetsByProductType: { [key: string]: number }
  livretTotal: number
  totalAssets: number
  externalPatrimonyTotal: number
  positionDetails: Array<{
    accountName: string
    investmentName: string
    quantity: number
    lastPrice: number
    currentValue: number
    variation: number
  }>
  cashflow: CashflowProjection
}

type FinancialSuggestion = {
  id: string
  category: 'emergency-fund' | 'spending' | 'savings-rate' | 'debt' | 'allocation'
  priority: 'high' | 'medium' | 'low'
  title: string
  description: string
  actionableAdvice: string
}

type InvestmentCsvType = 'positions' | 'operations'

type StoredInvestmentImport = {
  id: string
  fileName: string
  uploadedAt: string
  csvText: string
  accountLabel: string
  csvType: InvestmentCsvType
  periodStartDate?: string
  periodEndDate?: string
  isActive: boolean
}

type InvestmentPosition = {
  name: string
  isin: string
  quantity: number
  buyingPrice: number
  lastPrice: number
  intradayVariation: number
  currentValue: number
  amountVariation: number
  variation: number
}

type InvestmentOperation = {
  date: string
  label: string
  amount: number
  balance: number | null
  accountLabel: string
}

type InvestmentImportSummary = {
  id: string
  fileName: string
  uploadedAt: string
  accountLabel: string
  csvType: InvestmentCsvType
  periodStartDate?: string
  periodEndDate?: string
  isActive: boolean
  positions?: InvestmentPosition[]
  operations?: InvestmentOperation[]
  totalCurrentValue?: number
  totalInvested?: number
  totalGain?: number
  performancePercent?: number
}

type InvestmentPortfolio = {
  totalCurrentValue: number
  totalInvested: number
  totalGain: number
  performancePercent: number
  accounts: InvestmentImportSummary[]
}

type PerformancePeriod = '24h' | '7d' | '1m' | '1y' | 'all'

type LiveInvestmentPosition = {
  accountId: string
  accountName: string
  productType: ProductType
  investmentName: string
  symbol?: string
  isin?: string
  quantity: number
  buyingPrice: number
  currentPrice: number
  referencePrice: number
  currentValue: number
  costBasis: number
  periodChangeAmount: number
  periodChangePercent: number | null
  source: 'live' | 'csv' | 'manual'
}

type LiveInvestmentSnapshot = {
  period: PerformancePeriod
  fetchedAt: string
  totalsByProductType: Record<string, number>
  totalCurrentValue: number
  periodChangeAmount: number
  periodChangePercent: number | null
  positions: LiveInvestmentPosition[]
  diversification: DiversificationAnalysis
  history: DashboardHistoryPoint[]
  alerts: DashboardAlert[]
}

type DiversificationBucket = {
  label: string
  value: number
  share: number
}

type DiversificationAnalysis = {
  score: number
  level: 'excellent' | 'good' | 'moderate' | 'weak'
  byAssetType: DiversificationBucket[]
  byGeography: DiversificationBucket[]
  bySector: DiversificationBucket[]
  concentration: {
    largestPositionShare: number
    top3Share: number
  }
  summary: string[]
}

type DashboardHistoryPoint = {
  date: string
  netWorth: number
  bankCash: number
  livretTotal: number
  investedAssets: number
  totalAssets: number
}

type DashboardAlert = {
  id: string
  severity: 'high' | 'medium' | 'low'
  title: string
  description: string
}

const DEFAULT_HEALTH_GOALS: HealthGoals = {
  targetEmergencyFundMonths: 6,
  maxCryptoShareTotal: 10,
  maxSinglePositionShare: 15,
  maxTop3PositionsShare: 45,
  maxDebtToAssetRatio: 35,
  maxDebtServiceToIncomeRatio: 30,
  allocationDriftTolerance: 5,
  minAssetClassCount: 4,
  minGeoBucketCount: 3,
  minSectorBucketCount: 5,
}

const sanitizeHealthGoals = (value?: Partial<HealthGoals> | null): HealthGoals => {
  const source = value ?? {}
  const pick = (candidate: unknown, fallback: number, min: number, max: number) => {
    if (typeof candidate !== 'number' || !Number.isFinite(candidate)) return fallback
    return Math.max(min, Math.min(max, candidate))
  }

  return {
    targetEmergencyFundMonths: Math.round(pick(source.targetEmergencyFundMonths, DEFAULT_HEALTH_GOALS.targetEmergencyFundMonths, 1, 24)),
    maxCryptoShareTotal: pick(source.maxCryptoShareTotal, DEFAULT_HEALTH_GOALS.maxCryptoShareTotal, 0, 100),
    maxSinglePositionShare: pick(source.maxSinglePositionShare, DEFAULT_HEALTH_GOALS.maxSinglePositionShare, 1, 100),
    maxTop3PositionsShare: pick(source.maxTop3PositionsShare, DEFAULT_HEALTH_GOALS.maxTop3PositionsShare, 1, 100),
    maxDebtToAssetRatio: pick(source.maxDebtToAssetRatio, DEFAULT_HEALTH_GOALS.maxDebtToAssetRatio, 0, 100),
    maxDebtServiceToIncomeRatio: pick(source.maxDebtServiceToIncomeRatio, DEFAULT_HEALTH_GOALS.maxDebtServiceToIncomeRatio, 0, 100),
    allocationDriftTolerance: pick(source.allocationDriftTolerance, DEFAULT_HEALTH_GOALS.allocationDriftTolerance, 0, 30),
    minAssetClassCount: Math.round(pick(source.minAssetClassCount, DEFAULT_HEALTH_GOALS.minAssetClassCount, 1, 12)),
    minGeoBucketCount: Math.round(pick(source.minGeoBucketCount, DEFAULT_HEALTH_GOALS.minGeoBucketCount, 1, 12)),
    minSectorBucketCount: Math.round(pick(source.minSectorBucketCount, DEFAULT_HEALTH_GOALS.minSectorBucketCount, 1, 20)),
  }
}

const defaultState: StoredState = {
  accounts: [],
  imports: [],
  rules: [],
  budgetOverrides: {},
  netWorthItems: [],
  emergencyFundTargetMonths: 6,
  emergencyFundMonthlyExpenses: null,
  emergencyFundDesignated: [],
  healthGoals: { ...DEFAULT_HEALTH_GOALS },
  marketSymbolOverrides: {},
  investmentImports: [],
  dashboardHistory: [],
}

const ensureStore = () => {
  const directoryPath = path.dirname(STORE_PATH)

  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true })
  }

  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify(defaultState, null, 2), 'utf-8')
  }
}

initDB()

const readStore = (): StoredState => {
  const sqlState = readStoreFromDB()
  if (sqlState) {
    const migratedGoals = sanitizeHealthGoals((sqlState as Partial<StoredState>).healthGoals)
    const emergencyFundTargetMonths =
      typeof (sqlState as Partial<StoredState>).emergencyFundTargetMonths === 'number'
        ? (sqlState as Partial<StoredState>).emergencyFundTargetMonths as number
        : migratedGoals.targetEmergencyFundMonths

    return {
      ...sqlState,
      emergencyFundTargetMonths,
      healthGoals: {
        ...migratedGoals,
        targetEmergencyFundMonths: emergencyFundTargetMonths,
      },
      marketSymbolOverrides: sqlState.marketSymbolOverrides ?? {},
    }
  }

  ensureStore()

  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<StoredState>

    const migratedState: StoredState = {
      accounts: (parsed.accounts ?? []).map((a) => ({
        ...a,
        csvImports: (a.csvImports ?? []).map((imp) => ({ ...imp, isActive: imp.isActive ?? true })),
        cryptoHolding: a.cryptoHolding
          ? {
              coinId: a.cryptoHolding.coinId,
              symbol: a.cryptoHolding.symbol,
              name: a.cryptoHolding.name,
              quantity:
                typeof a.cryptoHolding.quantity === 'number' && Number.isFinite(a.cryptoHolding.quantity)
                  ? a.cryptoHolding.quantity
                  : undefined,
              averageBuyPrice:
                typeof a.cryptoHolding.averageBuyPrice === 'number' && Number.isFinite(a.cryptoHolding.averageBuyPrice)
                  ? a.cryptoHolding.averageBuyPrice
                  : undefined,
            }
          : undefined,
        isEligibleEmergencyFund: a.isEligibleEmergencyFund ?? isLivretType(a.productType),
        kind: a.kind ?? 'asset',
      })) as StoredAccount[],
      imports: (parsed.imports ?? []).map((imp) => ({ ...imp, isActive: imp.isActive ?? true })),
      rules: parsed.rules ?? [],
      budgetOverrides: parsed.budgetOverrides ?? {},
      netWorthItems: parsed.netWorthItems ?? [],
      emergencyFundTargetMonths: parsed.emergencyFundTargetMonths ?? 6,
      emergencyFundMonthlyExpenses:
        typeof parsed.emergencyFundMonthlyExpenses === 'number'
          ? parsed.emergencyFundMonthlyExpenses
          : null,
      emergencyFundDesignated: parsed.emergencyFundDesignated ?? [],
      healthGoals: {
        ...sanitizeHealthGoals(parsed.healthGoals),
        targetEmergencyFundMonths:
          typeof parsed.emergencyFundTargetMonths === 'number'
            ? parsed.emergencyFundTargetMonths
            : sanitizeHealthGoals(parsed.healthGoals).targetEmergencyFundMonths,
      },
      marketSymbolOverrides:
        parsed.marketSymbolOverrides && typeof parsed.marketSymbolOverrides === 'object'
          ? Object.entries(parsed.marketSymbolOverrides).reduce<Record<string, MarketSymbolOverride>>((acc, [key, value]) => {
              const row = value as Partial<MarketSymbolOverride>
              if (!row || typeof row.symbol !== 'string' || !row.symbol.trim()) return acc
              acc[key] = {
                name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : key,
                symbol: row.symbol.trim().toUpperCase(),
                updatedAt: typeof row.updatedAt === 'string' && row.updatedAt ? row.updatedAt : new Date(0).toISOString(),
              }
              return acc
            }, {})
          : {},
      investmentImports: (parsed.investmentImports ?? []).map((imp) => ({ ...imp, isActive: imp.isActive ?? true })),
      dashboardHistory: (parsed.dashboardHistory ?? [])
        .filter((entry): entry is DashboardHistoryPoint => Boolean(entry && typeof entry.date === 'string'))
        .map((entry) => ({
          date: entry.date,
          netWorth: Number.isFinite(entry.netWorth) ? entry.netWorth : 0,
          bankCash: Number.isFinite(entry.bankCash) ? entry.bankCash : 0,
          livretTotal: Number.isFinite(entry.livretTotal) ? entry.livretTotal : 0,
          investedAssets: Number.isFinite(entry.investedAssets) ? entry.investedAssets : 0,
          totalAssets: Number.isFinite(entry.totalAssets) ? entry.totalAssets : 0,
        })),
    }

    writeStoreToDB(migratedState)
    return migratedState
  } catch {
    return defaultState
  }
}

const writeStore = (state: StoredState) => {
  writeStoreToDB(state)
  fs.writeFileSync(STORE_PATH, JSON.stringify(state, null, 2), 'utf-8')
}

const createId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const LIVRET_TYPES: ProductType[] = ['livret-a', 'livret-jeune', 'lep', 'ldds', 'livret-other']
const isLivretType = (t: string) => LIVRET_TYPES.includes(t as ProductType)

const monthFormatter = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  year: 'numeric',
})

const normalizeHeader = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()

const hasAssuranceViePositionHeaders = (headers: string[]) =>
  headers.includes('valeur') &&
  headers.includes('datedevaleur') &&
  headers.includes('quantite') &&
  headers.includes('prixrevient') &&
  headers.includes('cours') &&
  headers.includes('montant')

const LIVE_PRODUCT_TYPES: ProductType[] = ['pea', 'pea-pme', 'assurance-vie', 'cto', 'crypto']

const isLiveProductType = (value: ProductType) => LIVE_PRODUCT_TYPES.includes(value)

const PERFORMANCE_PERIODS: PerformancePeriod[] = ['24h', '7d', '1m', '1y', 'all']

const parsePerformancePeriod = (value?: string): PerformancePeriod =>
  PERFORMANCE_PERIODS.includes((value ?? '') as PerformancePeriod)
    ? (value as PerformancePeriod)
    : 'all'

const parseDateToIso = (raw: string | undefined): string => {
  const value = (raw ?? '').trim()
  if (!value) return ''

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }

  const slashMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (slashMatch) {
    const [, day, month, year] = slashMatch
    return `${year}-${month}-${day}`
  }

  return ''
}

const fetchJson = async <T>(url: string): Promise<T | null> => {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      return null
    }

    return (await response.json()) as T
  } catch {
    return null
  }
}

const YAHOO_SYMBOL_CACHE = new Map<string, { symbol: string; name: string; cachedAt: number }>()
const YAHOO_SYMBOL_CACHE_TTL = 12 * 60 * 60 * 1000
const YAHOO_FX_CACHE = new Map<string, { rateToEur: number; cachedAt: number }>()
const YAHOO_FX_CACHE_TTL = 60 * 60 * 1000
const YAHOO_ETF_SECTOR_CACHE = new Map<string, { buckets: DiversificationBucket[]; cachedAt: number }>()
const YAHOO_ETF_SECTOR_CACHE_TTL = 12 * 60 * 60 * 1000
const CRYPTO_LIVE_CACHE = new Map<string, { currentPrice: number; referencePrice: number | null; symbol?: string; name?: string; cachedAt: number }>()
const CRYPTO_LIVE_CACHE_TTL = 30 * 60 * 1000
const COINGECKO_SYMBOL_OVERRIDES: Record<string, string> = {
  btc: 'bitcoin',
  eth: 'ethereum',
  sol: 'solana',
  bnb: 'binancecoin',
  ada: 'cardano',
  xrp: 'ripple',
  doge: 'dogecoin',
  avax: 'avalanche-2',
  dot: 'polkadot',
  matic: 'matic-network',
  link: 'chainlink',
  uni: 'uniswap',
}
const YAHOO_NAME_SYMBOL_OVERRIDES: Record<string, string> = {
  'amundi s p 500 ii ucits etf d': 'LYSP5.SW',
}

const normalizeYahooText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .toLowerCase()
    .trim()

const simplifyInstrumentName = (value: string) => {
  const compact = value.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
  const withoutClassSuffix = compact
    .replace(/\s+(ACC|DIST|CAP|DISTR|D|C|A)$/i, '')
    .replace(/\s+[\-–]\s*(ACC|DIST|CAP|DISTR|D|C|A)$/i, '')
  const withoutRomanSuffix = withoutClassSuffix
    .replace(/\s+(I|II|III|IV|V|VI|VII|VIII|IX|X)$/i, '')
    .replace(/[\s\-]+[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]$/u, '')
  return withoutRomanSuffix.replace(/\s+/g, ' ').trim()
}

const readNumericValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  if (value && typeof value === 'object' && 'raw' in (value as Record<string, unknown>)) {
    const raw = (value as Record<string, unknown>).raw
    return readNumericValue(raw)
  }
  return null
}

const resolveFxRateToEur = async (currency?: string | null) => {
  if (!currency) return 1
  const normalized = currency.toUpperCase()
  if (normalized === 'EUR') return 1

  const cached = YAHOO_FX_CACHE.get(normalized)
  if (cached && Date.now() - cached.cachedAt < YAHOO_FX_CACHE_TTL) {
    return cached.rateToEur
  }

  const pairSymbol = `${normalized}EUR=X`
  let quote: any = null
  try {
    quote = await yahooFinance.quote(pairSymbol as string)
  } catch {
    quote = null
  }

  const rate = readNumericValue(quote?.regularMarketPrice)
    ?? readNumericValue(quote?.previousClose)
    ?? readNumericValue(quote?.regularMarketPreviousClose)

  const safeRate = rate && rate > 0 ? rate : 1
  YAHOO_FX_CACHE.set(normalized, { rateToEur: safeRate, cachedAt: Date.now() })
  return safeRate
}

const buildTimedSamples = (timestamps: unknown, prices: unknown): Array<{ timestamp: number; price: number }> => {
  if (!Array.isArray(timestamps) || !Array.isArray(prices)) return []

  return timestamps
    .map((timestamp, index) => {
      const price = prices[index]
      return {
        timestamp: typeof timestamp === 'number' ? timestamp * 1000 : Number.NaN,
        price: typeof price === 'number' ? price : Number.NaN,
      }
    })
    .filter((sample) => Number.isFinite(sample.timestamp) && Number.isFinite(sample.price) && sample.price > 0)
}

const pickClosestHistoricalPrice = (
  samples: Array<{ timestamp: number; price: number }>,
  period: PerformancePeriod,
): number | null => {
  if (samples.length === 0) return null
  if (period === 'all') return null

  const now = Date.now()
  const target =
    period === '24h'
      ? now - 24 * 60 * 60 * 1000
      : period === '7d'
        ? now - 7 * 24 * 60 * 60 * 1000
        : period === '1m'
          ? now - 30 * 24 * 60 * 60 * 1000
          : now - 365 * 24 * 60 * 60 * 1000

  return samples.reduce((closest, sample) => {
    if (!closest) return sample
    return Math.abs(sample.timestamp - target) < Math.abs(closest.timestamp - target) ? sample : closest
  }, samples[0] as { timestamp: number; price: number } | null)?.price ?? null
}

const computeReferencePrice = (
  buyingPrice: number,
  currentPrice: number,
  period: PerformancePeriod,
  liveReferencePrice?: number | null,
  csvVariationPercent?: number,
): number => {
  if (period === 'all') {
    return buyingPrice > 0 ? buyingPrice : currentPrice
  }

  if (liveReferencePrice && liveReferencePrice > 0) {
    return liveReferencePrice
  }

  if (period === '24h' && csvVariationPercent !== undefined && csvVariationPercent !== null) {
    const ratio = 1 + csvVariationPercent / 100
    if (ratio > 0) {
      return currentPrice / ratio
    }
  }

  return currentPrice
}

const buildLivePosition = ({
  account,
  investmentName,
  quantity,
  buyingPrice,
  fallbackCurrentPrice,
  period,
  source,
  symbol,
  isin,
  liveCurrentPrice,
  liveReferencePrice,
  csvVariationPercent,
}: {
  account: StoredAccount
  investmentName: string
  quantity: number
  buyingPrice: number
  fallbackCurrentPrice: number
  period: PerformancePeriod
  source: 'live' | 'csv' | 'manual'
  symbol?: string
  isin?: string
  liveCurrentPrice?: number | null
  liveReferencePrice?: number | null
  csvVariationPercent?: number
}): LiveInvestmentPosition => {
  const currentPrice = liveCurrentPrice && liveCurrentPrice > 0 ? liveCurrentPrice : fallbackCurrentPrice
  const referencePrice = computeReferencePrice(
    buyingPrice,
    currentPrice,
    period,
    liveReferencePrice,
    csvVariationPercent,
  )
  const currentValue = quantity * currentPrice
  const referenceValue = quantity * referencePrice
  const periodChangeAmount = currentValue - referenceValue
  const periodChangePercent = referenceValue > 0 ? periodChangeAmount / referenceValue : null

  return {
    accountId: account.id,
    accountName: account.name,
    productType: account.productType,
    investmentName,
    symbol,
    isin,
    quantity,
    buyingPrice,
    currentPrice,
    referencePrice,
    currentValue,
    costBasis: quantity * buyingPrice,
    periodChangeAmount,
    periodChangePercent,
    source,
  }
}

const resolveYahooSymbol = async (
  query: { isin?: string; name: string },
  overrides?: Record<string, MarketSymbolOverride>,
) => {
  const normalizedNameKey = normalizeYahooText(query.name)
  const userOverride = overrides?.[normalizedNameKey]
  if (userOverride?.symbol) {
    return {
      symbol: userOverride.symbol,
      name: userOverride.name || query.name,
    }
  }

  if (!query.isin) {
    const overriddenSymbol = YAHOO_NAME_SYMBOL_OVERRIDES[normalizedNameKey]
    if (overriddenSymbol) {
      return {
        symbol: overriddenSymbol,
        name: query.name,
      }
    }
  }

  const cacheKey = `${query.isin ?? ''}|${query.name}`.toLowerCase()
  const cached = YAHOO_SYMBOL_CACHE.get(cacheKey)
  if (cached && Date.now() - cached.cachedAt < YAHOO_SYMBOL_CACHE_TTL) {
    return { symbol: cached.symbol, name: cached.name }
  }

  const simplifiedName = simplifyInstrumentName(query.name)
  const broadName = simplifiedName
    .replace(/\bS\s*&\s*P\b/gi, 'SP')
    .replace(/\s+/g, ' ')
    .trim()

  const searchTerms = [query.isin, query.name, simplifiedName, broadName]
    .filter((value): value is string => Boolean(value && value.trim()))

  const extraTerms = [
    simplifiedName.replace(/\bUCITS\b/gi, '').trim(),
    simplifiedName.replace(/\bETF\b/gi, '').trim(),
    simplifiedName
      .replace(/\bS\s*&\s*P\b/gi, 'S P')
      .replace(/\bUCITS\b/gi, '')
      .replace(/\bETF\b/gi, '')
      .trim(),
  ]
  for (const term of extraTerms) {
    if (term && !searchTerms.includes(term)) searchTerms.push(term)
  }

  const dedupedTerms = [...new Map(searchTerms.map((term) => [term.toLowerCase(), term])).values()]

  const queryName = normalizeYahooText(query.name)
  const queryWords = queryName.split(/\s+/).filter((word) => word.length >= 3)
  const candidates: Array<{ symbol: string; name: string; score: number }> = []

  for (const term of dedupedTerms) {
    const payload = await fetchJson<any>(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(term)}&quotesCount=15&newsCount=0`,
    )
    let quotes = Array.isArray(payload?.quotes) ? payload.quotes : []

    if (quotes.length === 0) {
      try {
        const fallbackSearch = await yahooFinance.search(term)
        quotes = Array.isArray((fallbackSearch as any)?.quotes)
          ? (fallbackSearch as any).quotes
          : []
      } catch {
        quotes = []
      }
    }

    for (const quote of quotes) {
      if (!quote?.symbol) continue
      const displayName =
        typeof quote.longname === 'string'
          ? quote.longname
          : typeof quote.shortname === 'string'
            ? quote.shortname
            : query.name
      const normalizedDisplayName = normalizeYahooText(displayName)

      let score = 0
      if (query.isin && typeof quote.isin === 'string' && quote.isin.toUpperCase() === query.isin.toUpperCase()) {
        score += 100
      }
      if (queryName && normalizedDisplayName.includes(queryName)) {
        score += 35
      }
      score += queryWords.filter((word) => normalizedDisplayName.includes(word)).length * 8

      const quoteType = typeof quote.quoteType === 'string' ? quote.quoteType.toUpperCase() : ''
      if (['ETF', 'EQUITY', 'MUTUALFUND', 'FUND'].includes(quoteType)) {
        score += 10
      }

      const exchange = typeof quote.exchange === 'string' ? quote.exchange.toUpperCase() : ''
      if (exchange === 'PAR' || String(quote.symbol).toUpperCase().endsWith('.PA')) {
        score += 20
      }

      candidates.push({
        symbol: String(quote.symbol),
        name: displayName,
        score,
      })
    }
  }

  const best = candidates.sort((left, right) => right.score - left.score)[0]
  if (!best) return null

  YAHOO_SYMBOL_CACHE.set(cacheKey, {
    symbol: best.symbol,
    name: best.name,
    cachedAt: Date.now(),
  })

  return {
    symbol: best.symbol,
    name: best.name,
  }
}

const fetchYahooMarketData = async (
  query: { isin?: string; name: string },
  period: PerformancePeriod,
  overrides?: Record<string, MarketSymbolOverride>,
) => {
  const resolved = await resolveYahooSymbol(query, overrides)
  if (!resolved) return null

  let quote: any = null
  try {
    quote = await yahooFinance.quote(resolved.symbol as string)
  } catch {
    quote = null
  }

  const currentPriceCandidates = [
    quote?.regularMarketPrice,
    quote?.postMarketPrice,
    quote?.preMarketPrice,
    quote?.previousClose,
    quote?.regularMarketPreviousClose,
  ]
  const quoteCurrency = typeof quote?.currency === 'string' ? quote.currency : null
  const fxToEur = await resolveFxRateToEur(quoteCurrency)

  const rawCurrentPrice = currentPriceCandidates
    .map((candidate) => readNumericValue(candidate))
    .find((candidate) => typeof candidate === 'number' && candidate > 0) ?? null
  const currentPrice = rawCurrentPrice !== null ? rawCurrentPrice * fxToEur : null
  let referencePrice =
    period === '24h'
      ? readNumericValue(quote?.regularMarketPreviousClose)
      : null

  if (period === '7d' || period === '1m' || period === '1y') {
    const range = period === '7d' ? '1mo' : period === '1m' ? '3mo' : '1y'
    let chartPayload: any = null
    try {
      const chartOptions: any = {
        range: range as any,
        interval: '1d',
      }
      chartPayload = await yahooFinance.chart(resolved.symbol as string, chartOptions)
    } catch {
      chartPayload = null
    }
    const samples = buildTimedSamples(
      chartPayload?.timestamp,
      chartPayload?.indicators?.quote?.[0]?.close,
    )
    referencePrice = pickClosestHistoricalPrice(samples, period)
  }

  if (referencePrice !== null) {
    referencePrice *= fxToEur
  }

  if (!currentPrice) {
    logger.warn(`Yahoo quote missing for ${resolved.symbol} (${query.name})`)
  }

  return {
    symbol: resolved.symbol,
    name: resolved.name,
    currentPrice,
    referencePrice,
  }
}

const resolveCoinGeckoCoin = async (holding: CryptoHolding, fallbackLabel: string) => {
  if (holding.coinId) {
    return {
      id: holding.coinId,
      symbol: holding.symbol,
      name: holding.name ?? fallbackLabel,
    }
  }

  const overrideId = COINGECKO_SYMBOL_OVERRIDES[(holding.symbol || '').toLowerCase()]
  if (overrideId) {
    return {
      id: overrideId,
      symbol: holding.symbol?.toUpperCase(),
      name: holding.name ?? fallbackLabel,
    }
  }

  const query = holding.symbol || holding.name || fallbackLabel
  const payload = await fetchJson<any>(
    `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`,
  )
  const coins = Array.isArray(payload?.coins) ? payload.coins : []
  const loweredSymbol = (holding.symbol || '').toLowerCase()
  const loweredName = (holding.name || fallbackLabel).toLowerCase()
  const exactMatch =
    coins.find((coin: any) =>
      (typeof coin?.symbol === 'string' && coin.symbol.toLowerCase() === loweredSymbol) ||
      (typeof coin?.name === 'string' && coin.name.toLowerCase() === loweredName),
    ) ?? coins[0]

  if (!exactMatch?.id) return null

  return {
    id: String(exactMatch.id),
    symbol: typeof exactMatch.symbol === 'string' ? exactMatch.symbol.toUpperCase() : holding.symbol,
    name: typeof exactMatch.name === 'string' ? exactMatch.name : holding.name ?? fallbackLabel,
  }
}

const fetchCoinGeckoMarketData = async (holding: CryptoHolding, fallbackLabel: string, period: PerformancePeriod) => {
  const resolved = await resolveCoinGeckoCoin(holding, fallbackLabel)
  if (!resolved) return null

  let currentPrice: number | null = null
  let referencePrice: number | null = null

  if (period === '24h') {
    const simplePayload = await fetchJson<any>(
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(resolved.id)}&vs_currencies=eur&include_24hr_change=true`,
    )

    const rawCurrent = simplePayload?.[resolved.id]?.eur
    const rawChange24h = simplePayload?.[resolved.id]?.eur_24h_change
    currentPrice = typeof rawCurrent === 'number' && rawCurrent > 0 ? rawCurrent : null
    const changeRatio = typeof rawChange24h === 'number' ? rawChange24h / 100 : null
    referencePrice =
      currentPrice && changeRatio !== null && Number.isFinite(changeRatio) && 1 + changeRatio > 0
        ? currentPrice / (1 + changeRatio)
        : null

    if (!currentPrice) {
      const marketChartPayload = await fetchJson<any>(
        `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(resolved.id)}/market_chart?vs_currency=eur&days=1`,
      )
      const samples = Array.isArray(marketChartPayload?.prices)
        ? marketChartPayload.prices
            .map((entry: any) => ({
              timestamp: Array.isArray(entry) ? Number(entry[0]) : Number.NaN,
              price: Array.isArray(entry) ? Number(entry[1]) : Number.NaN,
            }))
            .filter((sample: { timestamp: number; price: number }) => Number.isFinite(sample.timestamp) && Number.isFinite(sample.price) && sample.price > 0)
        : []

      currentPrice = samples.length > 0 ? samples[samples.length - 1].price : null
      referencePrice = pickClosestHistoricalPrice(samples, period)
    }
  } else if (period === '7d' || period === '1m' || period === '1y') {
    const days = period === '7d' ? '7' : period === '1m' ? '30' : '365'
    const marketChartPayload = await fetchJson<any>(
      `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(resolved.id)}/market_chart?vs_currency=eur&days=${days}`,
    )
    const samples = Array.isArray(marketChartPayload?.prices)
      ? marketChartPayload.prices
          .map((entry: any) => ({
            timestamp: Array.isArray(entry) ? Number(entry[0]) : Number.NaN,
            price: Array.isArray(entry) ? Number(entry[1]) : Number.NaN,
          }))
          .filter((sample: { timestamp: number; price: number }) => Number.isFinite(sample.timestamp) && Number.isFinite(sample.price) && sample.price > 0)
      : []

    currentPrice = samples.length > 0 ? samples[samples.length - 1].price : null
    referencePrice = pickClosestHistoricalPrice(samples, period)
  } else {
    const simplePayload = await fetchJson<any>(
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(resolved.id)}&vs_currencies=eur`,
    )
    currentPrice = typeof simplePayload?.[resolved.id]?.eur === 'number' ? simplePayload[resolved.id].eur : null
  }

  return {
    coinId: resolved.id,
    symbol: resolved.symbol,
    name: resolved.name,
    currentPrice,
    referencePrice,
  }
}

const inferAssetTypeLabel = (position: LiveInvestmentPosition) => {
  switch (position.productType) {
    case 'crypto':
      return 'Crypto'
    case 'assurance-vie':
      return 'Assurance vie'
    case 'pea':
    case 'pea-pme':
      return 'Actions / ETF (PEA)'
    case 'cto':
      return 'Actions / ETF (CTO)'
    default:
      return 'Autres actifs'
  }
}

const inferGeographyLabel = (position: LiveInvestmentPosition) => {
  if (position.productType === 'crypto') return 'Global / Crypto'

  const symbol = (position.symbol ?? '').toUpperCase()
  const isin = (position.isin ?? '').toUpperCase()
  const name = normalizeYahooText(position.investmentName)

  if (/sp\s*500|s\s*p\s*500|nasdaq|usa|us\b|etats unis|united states|msci north america/.test(name)) {
    return 'États-Unis'
  }
  if (/europe|euroland|euro stoxx|stoxx europe|msci europe/.test(name)) {
    return 'Europe'
  }
  if (/japan|japon|nikkei/.test(name)) {
    return 'Japon'
  }
  if (/china|chine|emerging|asie|asia|pacific|world|monde|global|msci world|all country/.test(name)) {
    return 'Monde / Emergents'
  }

  if (isin.startsWith('FR')) return 'Europe'
  if (isin.startsWith('DE')) return 'Allemagne'
  if (isin.startsWith('GB')) return 'Royaume-Uni'
  if (isin.startsWith('US')) return 'États-Unis'
  if (isin.startsWith('JP')) return 'Japon'
  if (isin.startsWith('LU') || isin.startsWith('IE')) {
    if (/sp\s*500|s\s*p\s*500|nasdaq|usa|us\b|etats unis|united states|msci north america/.test(name)) {
      return 'États-Unis'
    }
    if (/europe|euroland|euro stoxx|stoxx europe|msci europe/.test(name)) {
      return 'Europe'
    }
    if (/japan|japon|nikkei/.test(name)) {
      return 'Japon'
    }
    if (/emerging|asie|asia|pacific|china|chine|world|monde|global|msci world|all country/.test(name)) {
      return 'Monde / Emergents'
    }
  }

  if (symbol.endsWith('.PA') || symbol.endsWith('.FP') || /france|europe|euroland|cac/.test(name)) {
    return 'Europe'
  }
  if (symbol.endsWith('.L') || symbol.endsWith('.LN')) {
    return 'Royaume-Uni'
  }
  if (symbol.endsWith('.DE') || symbol.endsWith('.F') || /germany|allemagne|dax/.test(name)) {
    return 'Allemagne'
  }
  if (symbol.endsWith('.MI') || symbol.endsWith('.AS') || symbol.endsWith('.BR')) {
    return 'Europe'
  }
  if (
    symbol.endsWith('.US') ||
    symbol.endsWith('.N') ||
    symbol.endsWith('.O') ||
    symbol.endsWith('.Q') ||
    /sp\s*500|s\s*p\s*500|nasdaq|usa|us\b|etats unis|united states/.test(name)
  ) {
    return 'États-Unis'
  }
  if (/japan|japon|nikkei/.test(name)) {
    return 'Japon'
  }
  if (/china|chine|emerging|asie|asia|world|monde|global/.test(name)) {
    return 'Monde / Emergents'
  }
  return 'Non déterminé'
}

const inferSectorLabel = (position: LiveInvestmentPosition) => {
  if (position.productType === 'crypto') return 'Actifs numériques'

  const name = normalizeYahooText(position.investmentName)
  if (/tech|technology|information|digital|semiconductor|ai|cloud/.test(name)) return 'Technologie'
  if (/health|sante|healthcare|biotech|pharma/.test(name)) return 'Santé'
  if (/finance|financial|banque|bank|insurance|assurance/.test(name)) return 'Finance'
  if (/energy|energie|oil|gas|utilities/.test(name)) return 'Énergie'
  if (/industrial|industry|aerospace|defense/.test(name)) return 'Industrie'
  if (/consumer|retail|luxe|luxury|discretionary|staples/.test(name)) return 'Consommation'
  if (/real estate|reit|immobilier/.test(name)) return 'Immobilier'
  if (/bond|oblig|fixed income|treasury/.test(name)) return 'Obligations'
  if (/world|global|msci|sp\s*500|s\s*p\s*500|nasdaq|stoxx|multifactor|all country|acwi|etf/.test(name)) return 'Diversifié global'
  return 'Non déterminé'
}

const mapYahooSectorKeyToFrench = (key: string): string => {
  const normalized = normalizeYahooText(key).replace(/\s+/g, '_')
  switch (normalized) {
    case 'technology':
      return 'Technologie'
    case 'healthcare':
      return 'Santé'
    case 'financial_services':
    case 'financial':
      return 'Finance'
    case 'communication_services':
      return 'Communication'
    case 'consumer_cyclical':
      return 'Consommation cyclique'
    case 'consumer_defensive':
      return 'Consommation défensive'
    case 'industrials':
      return 'Industrie'
    case 'energy':
      return 'Énergie'
    case 'utilities':
      return 'Services publics'
    case 'realestate':
    case 'real_estate':
      return 'Immobilier'
    case 'basic_materials':
      return 'Matériaux'
    default:
      return 'Autres secteurs'
  }
}

const fetchYahooSectorBucketsForSymbol = async (symbol: string): Promise<DiversificationBucket[]> => {
  const cacheKey = symbol.toUpperCase()
  const cached = YAHOO_ETF_SECTOR_CACHE.get(cacheKey)
  if (cached && Date.now() - cached.cachedAt < YAHOO_ETF_SECTOR_CACHE_TTL) {
    return cached.buckets
  }

  let summary: any = null
  try {
    summary = await yahooFinance.quoteSummary(cacheKey, { modules: ['topHoldings'] } as any)
  } catch {
    summary = null
  }

  const rows = Array.isArray(summary?.topHoldings?.sectorWeightings)
    ? summary.topHoldings.sectorWeightings
    : []

  const aggregate = new Map<string, number>()
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    for (const [rawKey, rawValue] of Object.entries(row as Record<string, unknown>)) {
      const value = typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : 0
      if (value <= 0) continue
      const label = mapYahooSectorKeyToFrench(rawKey)
      aggregate.set(label, (aggregate.get(label) ?? 0) + value)
    }
  }

  const total = [...aggregate.values()].reduce((sum, value) => sum + value, 0)
  const buckets: DiversificationBucket[] = total > 0
    ? [...aggregate.entries()]
        .map(([label, value]) => ({
          label,
          value,
          share: value / total,
        }))
        .sort((left, right) => right.value - left.value)
    : []

  YAHOO_ETF_SECTOR_CACHE.set(cacheKey, { buckets, cachedAt: Date.now() })
  return buckets
}

const buildAutoSectorBuckets = async (
  positions: LiveInvestmentPosition[],
  totalCurrentValue: number,
): Promise<DiversificationBucket[]> => {
  if (positions.length === 0 || totalCurrentValue <= 0) return []

  const aggregate = new Map<string, number>()

  for (const position of positions) {
    if (position.currentValue <= 0) continue

    const symbol = (position.symbol ?? '').toUpperCase()
    let hasYahooBreakdown = false

    if (symbol) {
      const yahooBuckets = await fetchYahooSectorBucketsForSymbol(symbol)
      if (yahooBuckets.length > 0) {
        hasYahooBreakdown = true
        for (const bucket of yahooBuckets) {
          const weightedValue = position.currentValue * bucket.share
          aggregate.set(bucket.label, (aggregate.get(bucket.label) ?? 0) + weightedValue)
        }
      }
    }

    if (!hasYahooBreakdown) {
      const label = inferSectorLabel(position)
      aggregate.set(label, (aggregate.get(label) ?? 0) + position.currentValue)
    }
  }

  return [...aggregate.entries()]
    .map(([label, value]) => ({
      label,
      value,
      share: value / totalCurrentValue,
    }))
    .sort((left, right) => right.value - left.value)
}

const buildDiversificationBuckets = (
  positions: LiveInvestmentPosition[],
  totalCurrentValue: number,
  labelResolver: (position: LiveInvestmentPosition) => string,
): DiversificationBucket[] => {
  const map = new Map<string, number>()
  for (const position of positions) {
    const label = labelResolver(position)
    map.set(label, (map.get(label) ?? 0) + position.currentValue)
  }
  return [...map.entries()]
    .map(([label, value]) => ({
      label,
      value,
      share: totalCurrentValue > 0 ? value / totalCurrentValue : 0,
    }))
    .sort((left, right) => right.value - left.value)
}

const scoreBuckets = (buckets: DiversificationBucket[]) => {
  if (buckets.length <= 1) return 0
  const shares = buckets.map((bucket) => bucket.share).filter((share) => share > 0)
  if (shares.length <= 1) return 0
  const entropy = -shares.reduce((sum, share) => sum + share * Math.log(share), 0)
  const normalized = entropy / Math.log(shares.length)
  return Math.max(0, Math.min(100, Math.round(normalized * 100)))
}

const buildDiversificationAnalysis = (
  positions: LiveInvestmentPosition[],
  totalsByProductType: Record<string, number>,
  totalCurrentValue: number,
): DiversificationAnalysis => {
  if (positions.length === 0 || totalCurrentValue <= 0) {
    return {
      score: 0,
      level: 'weak',
      byAssetType: [],
      byGeography: [],
      bySector: [],
      concentration: {
        largestPositionShare: 0,
        top3Share: 0,
      },
      summary: ['Aucune position investie détectée pour calculer la diversification.'],
    }
  }

  const byAssetType = [...Object.entries(totalsByProductType)]
    .map(([productType, value]) => ({
      label: inferAssetTypeLabel({ productType: productType as ProductType } as LiveInvestmentPosition),
      value,
      share: totalCurrentValue > 0 ? value / totalCurrentValue : 0,
    }))
    .sort((left, right) => right.value - left.value)

  const byGeography = buildDiversificationBuckets(positions, totalCurrentValue, inferGeographyLabel)
  const bySector = buildDiversificationBuckets(positions, totalCurrentValue, inferSectorLabel)

  const sortedPositions = [...positions].sort((left, right) => right.currentValue - left.currentValue)
  const largestPositionShare = totalCurrentValue > 0 ? sortedPositions[0].currentValue / totalCurrentValue : 0
  const top3Share =
    totalCurrentValue > 0
      ? sortedPositions.slice(0, 3).reduce((sum, position) => sum + position.currentValue, 0) / totalCurrentValue
      : 0

  const concentrationScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 - Math.max(0, (largestPositionShare - 0.22) * 220) - Math.max(0, (top3Share - 0.62) * 120),
      ),
    ),
  )

  const scoreAssetType = scoreBuckets(byAssetType)
  const scoreGeography = scoreBuckets(byGeography)
  const scoreSector = scoreBuckets(bySector)

  const score = Math.round(
    scoreAssetType * 0.35 +
      scoreGeography * 0.25 +
      scoreSector * 0.2 +
      concentrationScore * 0.2,
  )

  const level: DiversificationAnalysis['level'] =
    score >= 80 ? 'excellent' : score >= 65 ? 'good' : score >= 45 ? 'moderate' : 'weak'

  const summary = [
    `Diversification ${level} (${score}/100).`,
    `Concentration: plus grosse ligne ${(largestPositionShare * 100).toFixed(1)}%, top 3 ${(top3Share * 100).toFixed(1)}%.`,
    `Répartition géographique dominante: ${byGeography[0]?.label ?? 'N/A'} (${((byGeography[0]?.share ?? 0) * 100).toFixed(1)}%).`,
    `Répartition sectorielle dominante: ${bySector[0]?.label ?? 'N/A'} (${((bySector[0]?.share ?? 0) * 100).toFixed(1)}%).`,
  ]

  return {
    score,
    level,
    byAssetType,
    byGeography,
    bySector,
    concentration: {
      largestPositionShare,
      top3Share,
    },
    summary,
  }
}

const buildLiveInvestmentSnapshot = async (
  state: StoredState,
  period: PerformancePeriod,
): Promise<LiveInvestmentSnapshot> => {
  const positions: LiveInvestmentPosition[] = []

  for (const account of state.accounts.filter((item) => item.kind === 'asset' && isLiveProductType(item.productType))) {
    if (account.productType === 'crypto') {
      const holding = account.cryptoHolding
      if (!holding?.quantity || holding.quantity <= 0) continue

      const cryptoCacheKey = account.id
      let marketData = await fetchCoinGeckoMarketData(holding, account.name, period)

      if (marketData?.currentPrice) {
        CRYPTO_LIVE_CACHE.set(cryptoCacheKey, {
          currentPrice: marketData.currentPrice,
          referencePrice: marketData.referencePrice,
          symbol: marketData.symbol,
          name: marketData.name,
          cachedAt: Date.now(),
        })
        if (marketData.coinId && !holding.coinId) holding.coinId = marketData.coinId
        if (marketData.symbol && !holding.symbol) holding.symbol = marketData.symbol
        if (marketData.name && !holding.name) holding.name = marketData.name
      } else {
        const cached = CRYPTO_LIVE_CACHE.get(cryptoCacheKey)
        if (cached && Date.now() - cached.cachedAt < CRYPTO_LIVE_CACHE_TTL) {
          marketData = {
            coinId: holding.coinId ?? cryptoCacheKey,
            symbol: cached.symbol ?? holding.symbol,
            name: cached.name ?? holding.name ?? account.name,
            currentPrice: cached.currentPrice,
            referencePrice: cached.referencePrice,
          }
        }
      }

      positions.push(
        buildLivePosition({
          account,
          investmentName: marketData?.name ?? holding.name ?? holding.symbol ?? account.name,
          quantity: holding.quantity,
          buyingPrice: holding.averageBuyPrice ?? 0,
          fallbackCurrentPrice: holding.averageBuyPrice ?? account.manualBalance ?? 0,
          period,
          source: marketData?.currentPrice ? 'live' : 'manual',
          symbol: marketData?.symbol ?? holding.symbol,
          liveCurrentPrice: marketData?.currentPrice,
          liveReferencePrice: marketData?.referencePrice,
        }),
      )
      continue
    }

    const activeImport = getActiveImportsSortedByTemporalEndDate(account, 'positions')[0]?.imp
    if (!activeImport) continue

    const accountPositions = parsePositionsCsv(activeImport.csvText)
    for (const position of accountPositions) {
      const marketData = await fetchYahooMarketData(
        { isin: position.isin || undefined, name: position.name },
        period,
        state.marketSymbolOverrides,
      )

      positions.push(
        buildLivePosition({
          account,
          investmentName: marketData?.name ?? position.name,
          quantity: position.quantity,
          buyingPrice: position.buyingPrice,
          fallbackCurrentPrice: position.lastPrice,
          period,
          source: marketData?.currentPrice ? 'live' : 'csv',
          symbol: marketData?.symbol,
          isin: position.isin || undefined,
          liveCurrentPrice: marketData?.currentPrice,
          liveReferencePrice: marketData?.referencePrice,
          csvVariationPercent: position.variation,
        }),
      )
    }
  }

  const totalsByProductType = positions.reduce<Record<string, number>>((accumulator, position) => {
    accumulator[position.productType] = (accumulator[position.productType] ?? 0) + position.currentValue
    return accumulator
  }, {})

  const totalCurrentValue = positions.reduce((sum, position) => sum + position.currentValue, 0)
  const periodChangeAmount = positions.reduce((sum, position) => sum + position.periodChangeAmount, 0)
  const referenceValue = totalCurrentValue - periodChangeAmount
  const diversification = buildDiversificationAnalysis(positions, totalsByProductType, totalCurrentValue)

  return {
    period,
    fetchedAt: new Date().toISOString(),
    totalsByProductType,
    totalCurrentValue,
    periodChangeAmount,
    periodChangePercent: referenceValue > 0 ? periodChangeAmount / referenceValue : null,
    positions,
    diversification,
    history: [],
    alerts: [],
  }
}

const liveInvestmentSnapshotCache = new Map<string, { expiresAt: number; snapshot: LiveInvestmentSnapshot }>()

const buildLiveSnapshotCacheKey = (state: StoredState, period: PerformancePeriod) =>
  JSON.stringify({
    period,
    overrides: Object.entries(state.marketSymbolOverrides)
      .map(([key, value]) => ({ key, symbol: value.symbol }))
      .sort((left, right) => left.key.localeCompare(right.key)),
    accounts: state.accounts.map((account) => ({
      id: account.id,
      productType: account.productType,
      kind: account.kind,
      manualBalance: account.manualBalance,
      cryptoHolding: account.cryptoHolding,
      imports: account.csvImports.map((item) => ({
        id: item.id,
        isActive: item.isActive,
        uploadedAt: item.uploadedAt,
      })),
    })),
  })

const buildLiveAccountSummaryMap = (snapshot: LiveInvestmentSnapshot) => {
  const byAccount = new Map<string, {
    balance: number
    trendAmount: number
    trendPercent: number | null
    sourceLabel: string
    trendLabel: string
    hasLive: boolean
  }>()

  for (const position of snapshot.positions) {
    const current = byAccount.get(position.accountId) ?? {
      balance: 0,
      trendAmount: 0,
      trendPercent: null,
      sourceLabel: 'Cours live marché',
      trendLabel: 'variation de séance',
      hasLive: false,
    }

    current.balance += position.currentValue
    current.trendAmount += position.periodChangeAmount
    if (position.source === 'live') current.hasLive = true
    byAccount.set(position.accountId, current)
  }

  for (const [, summary] of byAccount.entries()) {
    const baseValue = summary.balance - summary.trendAmount
    summary.trendPercent = baseValue > 0 ? summary.trendAmount / baseValue : null
    summary.sourceLabel = summary.hasLive ? 'Cours live marché' : 'Dernier cours connu'
  }

  return byAccount
}

const getCachedLiveInvestmentSnapshot = async (
  state: StoredState,
  period: PerformancePeriod,
  options?: { forceRefresh?: boolean },
): Promise<LiveInvestmentSnapshot> => {
  if (options?.forceRefresh) {
    const snapshot = await buildLiveInvestmentSnapshot(state, period)
    const cacheKey = buildLiveSnapshotCacheKey(state, period)
    liveInvestmentSnapshotCache.set(cacheKey, {
      expiresAt: Date.now() + env.MARKET_CACHE_TTL_MS,
      snapshot,
    })
    return snapshot
  }

  const cacheKey = buildLiveSnapshotCacheKey(state, period)
  const cached = liveInvestmentSnapshotCache.get(cacheKey)

  if (cached && cached.expiresAt > Date.now()) {
    return cached.snapshot
  }

  const snapshot = await buildLiveInvestmentSnapshot(state, period)
  liveInvestmentSnapshotCache.set(cacheKey, {
    expiresAt: Date.now() + env.MARKET_CACHE_TTL_MS,
    snapshot,
  })

  return snapshot
}

const buildDashboardHistoryPoint = (
  patrimony: PatrimonySummary,
  liveSnapshot: LiveInvestmentSnapshot,
): DashboardHistoryPoint => {
  const investedAssets = Object.values(liveSnapshot.totalsByProductType).reduce((sum, value) => sum + value, 0)
  const totalAssets = patrimony.bankCash + patrimony.livretTotal + investedAssets

  return {
    date: new Date().toISOString().slice(0, 10),
    netWorth: totalAssets - patrimony.debts,
    bankCash: patrimony.bankCash,
    livretTotal: patrimony.livretTotal,
    investedAssets,
    totalAssets,
  }
}

const persistDashboardHistoryPoint = (
  state: StoredState,
  patrimony: PatrimonySummary,
  liveSnapshot: LiveInvestmentSnapshot,
) => {
  const todayPoint = buildDashboardHistoryPoint(patrimony, liveSnapshot)
  const withoutToday = state.dashboardHistory.filter((entry) => entry.date !== todayPoint.date)
  state.dashboardHistory = [...withoutToday, todayPoint]
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-90)
}

const getDashboardHistory = (
  state: StoredState,
  patrimony: PatrimonySummary,
  liveSnapshot: LiveInvestmentSnapshot,
) => {
  const todayPoint = buildDashboardHistoryPoint(patrimony, liveSnapshot)
  const withoutToday = state.dashboardHistory.filter((entry) => entry.date !== todayPoint.date)
  return [...withoutToday, todayPoint]
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-30)
}

const generateDashboardAlerts = (
  state: StoredState,
  patrimony: PatrimonySummary,
  liveSnapshot: LiveInvestmentSnapshot,
): DashboardAlert[] => {
  const alerts: DashboardAlert[] = []
  const history = getDashboardHistory(state, patrimony, liveSnapshot)
  const latestHistory = history[history.length - 1]
  const previousHistory = history.length > 1 ? history[history.length - 2] : null
  const totalAssets = latestHistory?.totalAssets ?? 0
  const investedAssets = latestHistory?.investedAssets ?? 0
  const cryptoExposure = liveSnapshot.totalsByProductType.crypto ?? 0
  const maxCryptoShare = state.healthGoals.maxCryptoShareTotal / 100
  const maxSinglePositionShare = state.healthGoals.maxSinglePositionShare / 100
  const largestPosition = [...liveSnapshot.positions].sort((left, right) => right.currentValue - left.currentValue)[0]

  if (!patrimony.emergencyFund.isHealthy) {
    alerts.push({
      id: 'emergency-fund-gap',
      severity: 'high',
      title: 'Épargne de précaution sous l’objectif',
      description: `Il manque ${formatEuroShort(Math.max(0, patrimony.emergencyFund.target - patrimony.emergencyFund.current))} pour atteindre ${state.emergencyFundTargetMonths} mois.`,
    })
  }

  if (totalAssets > 0 && cryptoExposure / totalAssets >= maxCryptoShare) {
    alerts.push({
      id: 'crypto-concentration',
      severity: 'medium',
      title: 'Exposition crypto élevée',
      description: `La crypto représente ${(cryptoExposure / totalAssets * 100).toFixed(1)}% (objectif max ${state.healthGoals.maxCryptoShareTotal.toFixed(0)}%).`,
    })
  }

  if (investedAssets > 0 && largestPosition && largestPosition.currentValue / investedAssets >= maxSinglePositionShare) {
    alerts.push({
      id: 'single-position-concentration',
      severity: 'medium',
      title: 'Position très concentrée',
      description: `${largestPosition.investmentName} pèse ${(largestPosition.currentValue / investedAssets * 100).toFixed(1)}% (max visé ${state.healthGoals.maxSinglePositionShare.toFixed(0)}%).`,
    })
  }

  if (liveSnapshot.period !== 'all' && liveSnapshot.periodChangePercent !== null && liveSnapshot.periodChangePercent <= -0.05) {
    alerts.push({
      id: 'portfolio-drawdown',
      severity: 'medium',
      title: 'Repli marqué du portefeuille',
      description: `Les investissements reculent de ${(liveSnapshot.periodChangePercent * 100).toFixed(1)}% sur ${liveSnapshot.period}.`,
    })
  }

  if (previousHistory && latestHistory && previousHistory.netWorth > 0) {
    const netWorthDelta = latestHistory.netWorth - previousHistory.netWorth
    const netWorthDeltaPercent = netWorthDelta / previousHistory.netWorth
    if (netWorthDeltaPercent <= -0.03) {
      alerts.push({
        id: 'net-worth-drop',
        severity: 'high',
        title: 'Patrimoine net en baisse',
        description: `Le patrimoine net recule de ${(netWorthDeltaPercent * 100).toFixed(1)}% depuis le dernier snapshot.`,
      })
    }
  }

  if (alerts.length === 0) {
    alerts.push({
      id: 'portfolio-healthy',
      severity: 'low',
      title: 'Alerte faible uniquement',
      description: 'Aucun signal critique détecté sur la poche de liquidité, la concentration ou la variation récente.',
    })
  }

  return alerts.slice(0, 4)
}

function formatEuroShort(value: number) {
  return `${Math.round(value).toLocaleString('fr-FR')}€`
}

function normalizeAssistantQuery(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function buildPromptKeyFinancialCard(
  analysis: BudgetAnalysis | null,
  monthKey: string,
  patrimony: PatrimonySummary,
  liveSnapshot: LiveInvestmentSnapshot | null,
  promptKey?: 'executive' | 'actions' | 'risks' | 'allocation',
) {
  const activeMonth = analysis?.monthly?.[monthKey]
  if (!promptKey || !activeMonth) return null

  const totalInvested = liveSnapshot?.totalCurrentValue ?? Object.entries(patrimony.assetsByProductType)
    .filter(([type]) => !['checking', 'livret-a', 'livret-jeune', 'lep', 'ldds', 'livret-other'].includes(type))
    .reduce((sum, [, value]) => sum + value, 0)
  const topPositions = (liveSnapshot?.positions ?? [])
    .slice()
    .sort((left, right) => right.currentValue - left.currentValue)
    .slice(0, 3)
  const emergencyGap = Math.max(0, patrimony.emergencyFund.target - patrimony.emergencyFund.current)
  const totalAssets = patrimony.bankCash + patrimony.livretTotal + totalInvested
  const topPosition = topPositions[0]

  if (promptKey === 'executive') {
    return {
      title: 'Synthèse globale',
      answer: [
        `Patrimoine net estimé: ${formatEuroShort(patrimony.netWorth)}.`,
        activeMonth ? `Ce mois-ci, dépenses: ${formatEuroShort(activeMonth.expenses)} pour un budget cible de ${formatEuroShort(activeMonth.totalBudgetTarget)}.` : 'Aucune donnée budgétaire pour ce mois.',
        `Réserve de sécurité: ${formatEuroShort(patrimony.emergencyFund.current)} sur ${formatEuroShort(patrimony.emergencyFund.target)}.${emergencyGap > 0 ? ` Il manque ${formatEuroShort(emergencyGap)}.` : ' Objectif atteint.'}`,
        totalInvested > 0 ? `Poche investie: ${formatEuroShort(totalInvested)}.` : 'Aucune poche investie significative détectée.',
        liveSnapshot?.alerts?.[0] ? `Signal principal: ${liveSnapshot.alerts[0].description}` : activeMonth?.anomalies.length ? `${activeMonth.anomalies.length} anomalie(s) budgétaire(s) restent à surveiller.` : 'Aucun signal critique majeur détecté.',
      ].join(' '),
      transactions: [],
    }
  }

  if (promptKey === 'actions') {
    const actions = [
      emergencyGap > 0
        ? `1. Compléter d'abord l'épargne de précaution: il manque ${formatEuroShort(emergencyGap)}.`
        : `1. Maintenir l'épargne de précaution au-dessus de ${formatEuroShort(patrimony.emergencyFund.target)}.`,
      patrimony.bankCash > 0
        ? `2. Déployer progressivement la trésorerie excédentaire (${formatEuroShort(patrimony.bankCash)}) au lieu d'investir en une seule fois.`
        : '2. Reconstituer un peu de trésorerie avant tout renforcement agressif.',
      topPosition
        ? `3. Vérifier la pondération de ${topPosition.investmentName} (${formatEuroShort(topPosition.currentValue)}) avant tout nouvel achat.`
        : '3. Définir une allocation cible simple avant d’ouvrir de nouvelles lignes.',
    ]

    return {
      title: 'Actions à mener',
      answer: actions.join(' '),
      transactions: [],
    }
  }

  if (promptKey === 'risks') {
    const riskLines = [
      emergencyGap > 0
        ? `Risque 1: matelas de sécurité insuffisant, écart de ${formatEuroShort(emergencyGap)}.`
        : 'Risque 1: pas de tension immédiate sur la réserve de sécurité.',
      topPosition && totalAssets > 0 && topPosition.currentValue / totalAssets > 0.25
        ? `Risque 2: concentration élevée sur ${topPosition.investmentName}.`
        : 'Risque 2: pas de concentration extrême visible sur une seule ligne.',
      activeMonth?.anomalies.length
        ? `Risque 3: ${activeMonth.anomalies.length} anomalie(s) de dépenses ce mois-ci.`
        : 'Risque 3: pas d’anomalie budgétaire majeure ce mois-ci.',
    ]

    return {
      title: 'Risques et déséquilibres',
      answer: riskLines.join(' '),
      transactions: [],
    }
  }

  const cashShare = totalAssets > 0 ? (patrimony.bankCash / totalAssets) * 100 : 0
  const livretShare = totalAssets > 0 ? (patrimony.livretTotal / totalAssets) * 100 : 0
  const investedShare = totalAssets > 0 ? (totalInvested / totalAssets) * 100 : 0

  return {
    title: 'Rééquilibrage recommandé',
    answer: [
      `Répartition actuelle visible: trésorerie ${cashShare.toFixed(1)}%, livrets ${livretShare.toFixed(1)}%, investissements ${investedShare.toFixed(1)}%.`,
      emergencyGap > 0
        ? 'Allocation conseillée à court terme: renforcer d’abord les livrets de sécurité avant d’augmenter la poche investie.'
        : 'Allocation conseillée à court terme: stabiliser la réserve de sécurité puis investir progressivement le surplus.',
      topPositions.length > 0
        ? `Rééquilibrage à envisager: surveiller ${topPositions.map((position) => position.investmentName).join(', ')} pour éviter une concentration excessive.`
        : 'Rééquilibrage à envisager: construire une poche investie diversifiée par étapes.',
    ].join(' '),
    transactions: [],
  }
}

const priorityOrder: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

function generateActionPlan(
  analysis: BudgetAnalysis | null,
  patrimony: PatrimonySummary,
  healthGoals: HealthGoals,
  liveSnapshot: LiveInvestmentSnapshot | null,
): ActionPlan {
  const today = new Date()
  const startDate = today.toISOString().split('T')[0]
  const endDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const tasks: ActionTask[] = []
  let estimatedFinancialImpact = 0

  // ─── WEEK 1: Priority on categorization & emergency fund ───────────────────

  // Task 1.1: Categorize uncategorized transactions
  const activeMonth = analysis?.monthly[analysis.months[0]?.key ?? '']
  const uncategorizedAmount = activeMonth?.uncategorizedAmount ?? 0
  const uncategorizedCount = activeMonth?.uncategorizedCount ?? 0

  if (uncategorizedCount > 0) {
    tasks.push({
      id: `task-w1-categorize`,
      title: 'Catégorisez les dépenses non catégorisées',
      description: `Vous avez ${uncategorizedCount} transactions pour €${uncategorizedAmount.toFixed(2)} non classées. Cela bloque une analyse budgétaire précise.`,
      week: 1,
      priority: 'critical',
      type: 'categorization',
      estimatedImpact: 0,
      targetDate: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      completed: false,
      actionableSteps: [
        'Ouvrir l\'onglet Imprts et examiner les transactions non catégorisées',
        'Classer chaque transaction dans la catégorie appropriée',
        'Utiliser les règles de catégorisation pour automatiser à l\'avenir',
      ],
    })
  }

  // Task 1.2: Emergency fund completion
  const emergencyGap = Math.max(0, patrimony.emergencyFund.target - patrimony.emergencyFund.current)
  if (emergencyGap > 0) {
    const monthlyAllocation = Math.min(100, emergencyGap / 4) // Try to fill in 4 weeks
    tasks.push({
      id: `task-w1-emergency`,
      title: `Complétez votre fonds d'urgence (manque €${emergencyGap.toFixed(2)})`,
      description: `Vous avez ${patrimony.emergencyFund.current.toFixed(0)} € / ${patrimony.emergencyFund.target.toFixed(0)} € d'épargne de précaution. C'est votre filet de sécurité.`,
      week: 1,
      priority: 'critical',
      type: 'savings',
      estimatedImpact: monthlyAllocation,
      targetDate: endDate, // Full plan duration
      completed: false,
      actionableSteps: [
        `Allouer €${monthlyAllocation.toFixed(2)} cette semaine vers le fonds de précaution`,
        'Compléter progressivement sur les 3 semaines suivantes si possible',
        'Ne pas investir en risqué tant que ce fonds n\'est pas complet',
      ],
    })
    estimatedFinancialImpact += monthlyAllocation
  }

  // ─── WEEK 2: Budget optimization & debt analysis ────────────────────────────

  // Task 2.1: Optimize highest spending categories
  const topCategories = activeMonth?.categories
    ?.sort((a, b) => b.amount - a.amount)
    .slice(0, 3) ?? []

  const nonEssentialCategories = topCategories.filter(
    (cat) => !['Salaire', 'Revenus', 'Prélèvements sociaux', 'Impôts'].includes(cat.name)
  )

  if (nonEssentialCategories.length > 0) {
    const savingsTarget = nonEssentialCategories.reduce((sum, cat) => sum + cat.amount * 0.1, 0) // Try 10% reduction
    tasks.push({
      id: `task-w2-budget`,
      title: `Optimiser les dépenses: ${nonEssentialCategories[0]?.name}`,
      description: `${nonEssentialCategories[0]?.name} consomme €${nonEssentialCategories[0]?.amount.toFixed(2)}/mois. Réduire de 10% = €${(nonEssentialCategories[0]?.amount * 0.1).toFixed(2)} jusqu'à fin d'année.`,
      week: 2,
      priority: 'high',
      type: 'budget',
      estimatedImpact: savingsTarget,
      targetDate: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      completed: false,
      actionableSteps: [
        `Identifier les dépenses non essentielles dans ${nonEssentialCategories[0]?.name}`,
        'Fixer un budget cible réduit de 10% pour la semaine prochaine',
        'Mettre en place des alertes automatiques pour les dépassements',
      ],
    })
    estimatedFinancialImpact += savingsTarget
  }

  // Task 2.2: Debt management prioritization
  if (patrimony.totalDebt > 0) {
    const debtServiceRatio = patrimony.debtServiceToIncomeRatio ?? 0
    tasks.push({
      id: `task-w2-debt`,
      title: `Analyser et rembourser la dette (€${patrimony.totalDebt.toFixed(0)})`,
      description: `Vous avez €${patrimony.totalDebt.toFixed(0)} de dettes. Ratio dette/revenus: ${(debtServiceRatio * 100).toFixed(1)}%. Priorité à la réduction structurelle.`,
      week: 2,
      priority: 'high',
      type: 'debt',
      estimatedImpact: 50, // Minimum accelerated payment
      targetDate: new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      completed: false,
      actionableSteps: [
        'Consulter l\'onglet Dettes pour voir le détail de chaque emprunt',
        'Identifier la dette avec le taux d\'intérêt le plus élevé',
        'Négocier un taux fixe ou une restructuration si possible',
        'Prévoir €50-100 minimum de remboursement accéléré en avril',
      ],
    })
    estimatedFinancialImpact += 50
  }

  // ─── WEEK 3: Investment rebalancing ──────────────────────────────────────────

  // Task 3.1: Review investment concentration
  if (liveSnapshot && liveSnapshot.positions.length > 0) {
    const topPosition = liveSnapshot.positions.sort((a, b) => b.currentValue - a.currentValue)[0]
    const totalInvested = liveSnapshot.totalCurrentValue
    const concentrationRatio = topPosition ? topPosition.currentValue / totalInvested : 0

    if (concentrationRatio > 0.25) {
      tasks.push({
        id: `task-w3-concentration`,
        title: `Réduire concentration sur ${topPosition?.investmentName}`,
        description: `${topPosition?.investmentName} pèse ${(concentrationRatio * 100).toFixed(1)}% (${formatEuroShort(topPosition?.currentValue ?? 0)}). Cible max: 20%.`,
        week: 3,
        priority: 'high',
        type: 'investment',
        estimatedImpact: 0,
        targetDate: new Date(today.getTime() + 17 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        completed: false,
        actionableSteps: [
          `Vérifier la position actuelle de ${topPosition?.investmentName} dans tous les comptes`,
          'Réduire progressivement de 5-10% sur les 3 prochaines semaines',
          'Redéployer vers des ETF plus diversifiés (MSCI World, iShares Core)',
        ],
      })
    }

    // Task 3.2: Crypto allocation check
    const cryptoAssets = liveSnapshot.positions.filter((p) => p.productType === 'crypto')
    const cryptoTotal = cryptoAssets.reduce((sum, p) => sum + p.currentValue, 0)
    const cryptoShare = totalInvested > 0 ? cryptoTotal / totalInvested : 0

    if (cryptoShare > healthGoals.maxCryptoShareTotal / 100) {
      tasks.push({
        id: `task-w3-crypto`,
        title: `Maîtriser allocation crypto (actuellement ${(cryptoShare * 100).toFixed(1)}%)`,
        description: `Vous avez ${(cryptoShare * 100).toFixed(1)}% en crypto vs objectif de ${healthGoals.maxCryptoShareTotal}%. Risque élevé.`,
        week: 3,
        priority: 'high',
        type: 'investment',
        estimatedImpact: 0,
        targetDate: new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        completed: false,
        actionableSteps: [
          'Consulter l\'onglet Patrimoines pour voir la détail des crypto',
          'Identifier les actifs crypto les plus volatiles (ex: altcoins)',
          `Réduire la part crypto de ${(cryptoShare * 100).toFixed(1)}% à ${healthGoals.maxCryptoShareTotal}%`,
          'Basculer une partie vers stablecoins ou HODL seulement les positions principales',
        ],
      })
    }
  }

  // ─── WEEK 4: Monitoring & next month setup ───────────────────────────────────

  // Task 4.1: Health score review
  tasks.push({
    id: `task-w4-health-review`,
    title: 'Vérifier votre score de santé financière',
    description: 'Évaluer les progrès sur les 4 axes (Liquidité, Types de placement, Résilience, Diversification).',
    week: 4,
    priority: 'medium',
    type: 'review',
    estimatedImpact: 0,
    targetDate: new Date(today.getTime() + 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    completed: false,
    actionableSteps: [
      'Ouvrir l\'onglet Objectifs pour voir le détail de chaque axe',
      'Identifier les axes avec le plus fort déficit',
      'Valider que les actions de semaines 1-3 améliorent le score',
    ],
  })

  // Task 4.2: Plan for May
  tasks.push({
    id: `task-w4-planning`,
    title: 'Préparez le plan d\'action pour mai',
    description: 'Basé sur les résultats d\'avril, définir les priorités du mois suivant.',
    week: 4,
    priority: 'medium',
    type: 'review',
    estimatedImpact: 0,
    targetDate: new Date(today.getTime() + 29 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    completed: false,
    actionableSteps: [
      'Faire un bilan des actions menées en avril',
      'Identifier ce qui a fonctionné et ce qui doit être ajusté',
      'Fixer les priorités pour mai en fonction des déficits restants',
    ],
  })

  const summary = `Plan d'action 30 jours: ${tasks.length} actions pour améliorer votre santé financière (impact estimé: €${estimatedFinancialImpact.toFixed(0)}/mois).`

  return {
    durationDays: 30,
    startDate,
    endDate,
    tasks: tasks.sort((a, b) => a.week - b.week || (priorityOrder[a.priority] ?? 10) - (priorityOrder[b.priority] ?? 10)),
    summary,
    estimatedFinancialImpact,
  }
}

function buildLocalFinancialFallback(
  query: string,
  analysis: BudgetAnalysis | null,
  monthKey: string,
  patrimony: PatrimonySummary,
  liveSnapshot: LiveInvestmentSnapshot | null,
  promptKey?: 'executive' | 'actions' | 'risks' | 'allocation',
) {
  const promptCard = buildPromptKeyFinancialCard(analysis, monthKey, patrimony, liveSnapshot, promptKey)
  if (promptCard) {
    return promptCard
  }

  const normalizedQuery = normalizeAssistantQuery(query)
  const totalInvested = liveSnapshot?.totalCurrentValue ?? Object.entries(patrimony.assetsByProductType)
    .filter(([type]) => !['checking', 'livret-a', 'livret-jeune', 'lep', 'ldds', 'livret-other'].includes(type))
    .reduce((sum, [, value]) => sum + value, 0)
  const topPositions = (liveSnapshot?.positions ?? [])
    .slice()
    .sort((left, right) => right.currentValue - left.currentValue)
    .slice(0, 3)
  const emergencyGap = Math.max(0, patrimony.emergencyFund.target - patrimony.emergencyFund.current)
  const totalAssets = patrimony.bankCash + patrimony.livretTotal + totalInvested

  const investmentIntent =
    normalizedQuery.includes('invest') ||
    normalizedQuery.includes('placement') ||
    normalizedQuery.includes('portefeuille') ||
    normalizedQuery.includes('pea') ||
    normalizedQuery.includes('cto') ||
    normalizedQuery.includes('assurance vie') ||
    normalizedQuery.includes('assurance-vie') ||
    normalizedQuery.includes('crypto') ||
    normalizedQuery.includes('bourse')

  const envelopeIntent =
    normalizedQuery.includes('pea') ||
    normalizedQuery.includes('assurance vie') ||
    normalizedQuery.includes('assurance-vie') ||
    normalizedQuery.includes('cto')

  const patrimonyIntent =
    normalizedQuery.includes('patrimoine') ||
    normalizedQuery.includes('allocation') ||
    normalizedQuery.includes('tresorerie') ||
    normalizedQuery.includes('cash')

  if (investmentIntent) {
    const byEnvelope = {
      pea: (liveSnapshot?.positions ?? []).filter((position) => position.productType === 'pea').sort((a, b) => b.currentValue - a.currentValue),
      assuranceVie: (liveSnapshot?.positions ?? []).filter((position) => position.productType === 'assurance-vie').sort((a, b) => b.currentValue - a.currentValue),
      cto: (liveSnapshot?.positions ?? []).filter((position) => position.productType === 'cto').sort((a, b) => b.currentValue - a.currentValue),
    }
    const totalPea = byEnvelope.pea.reduce((sum, position) => sum + position.currentValue, 0)
    const totalAssuranceVie = byEnvelope.assuranceVie.reduce((sum, position) => sum + position.currentValue, 0)
    const totalCto = byEnvelope.cto.reduce((sum, position) => sum + position.currentValue, 0)

    if (envelopeIntent && (byEnvelope.pea.length > 0 || byEnvelope.assuranceVie.length > 0 || byEnvelope.cto.length > 0)) {
      const topPea = byEnvelope.pea.slice(0, 4)
      const topAssuranceVie = byEnvelope.assuranceVie.slice(0, 4)
      const topCto = byEnvelope.cto.slice(0, 4)

      return {
        title: 'Analyse des lignes PEA et assurance-vie',
        answer: [
          '## Diagnostic',
          `Poche investie suivie: ${formatEuroShort(totalInvested)}. PEA: ${formatEuroShort(totalPea)}. Assurance-vie: ${formatEuroShort(totalAssuranceVie)}.${totalCto > 0 ? ` CTO: ${formatEuroShort(totalCto)}.` : ''}`,
          topPea.length > 0
            ? `Lignes principales PEA: ${topPea.map((position) => `${position.investmentName} (${formatEuroShort(position.currentValue)})`).join(', ')}.`
            : 'Aucune ligne PEA détectée dans le snapshot actif.',
          topAssuranceVie.length > 0
            ? `Lignes principales assurance-vie: ${topAssuranceVie.map((position) => `${position.investmentName} (${formatEuroShort(position.currentValue)})`).join(', ')}.`
            : 'Aucune ligne assurance-vie détectée dans le snapshot actif.',
          '',
          '## Plan d\'action',
          emergencyGap > 0
            ? `- Priorité 1: compléter l'épargne de précaution (manque ${formatEuroShort(emergencyGap)}) avant tout renforcement agressif des lignes.`
            : '- Priorité 1: maintenir la réserve de sécurité puis investir le surplus progressivement.',
          topPositions[0]
            ? `- Priorité 2: surveiller la concentration de ${topPositions[0].investmentName} (${formatEuroShort(topPositions[0].currentValue)}) avant d'ajouter de nouvelles positions.`
            : '- Priorité 2: définir une allocation cible par enveloppe (PEA / AV / CTO).',
          '- Priorité 3: privilégier les renforcements sur les lignes déjà suivies avant d\'ouvrir trop de petites positions.',
          '',
          '## Points de vigilance',
          liveSnapshot?.alerts?.length
            ? `- ${liveSnapshot.alerts[0].description}`
            : '- Vérifier chaque mois la concentration et la cohérence avec les objectifs de santé financière.',
        ].join('\n'),
        transactions: [],
      }
    }

    const actions: string[] = []

    if (emergencyGap > 0) {
      actions.push(
        `Priorité 1: compléter l'épargne de précaution avant d'accélérer les investissements. Il manque environ ${formatEuroShort(emergencyGap)}.`
      )
    } else if (patrimony.bankCash > 0) {
      actions.push(
        `Priorité 1: déployer progressivement une partie de la trésorerie disponible (${formatEuroShort(patrimony.bankCash)}) plutôt que d'investir en une seule fois.`
      )
    }

    if (topPositions.length > 0) {
      const top = topPositions[0]
      if (totalAssets > 0 && top.currentValue / totalAssets > 0.25) {
        actions.push(
          `Priorité 2: réduire la concentration sur ${top.investmentName}, qui pèse ${formatEuroShort(top.currentValue)}.`
        )
      } else {
        actions.push('Priorité 2: renforcer d’abord les lignes déjà en place et éviter de multiplier les petites positions.')
      }
    } else {
      actions.push('Priorité 2: définir une allocation cible simple entre liquidités, livrets et poche investie avant tout nouvel achat.')
    }

    if (liveSnapshot?.alerts?.length) {
      actions.push(`Signal à surveiller: ${liveSnapshot.alerts[0]?.description}`)
    }

    const allocationLines = Object.entries(patrimony.assetsByProductType)
      .filter(([, value]) => value > 0)
      .filter(([type]) => !['checking'].includes(type))
      .map(([type, value]) => `${type}: ${formatEuroShort(value)}`)
      .slice(0, 4)

    const positionsLine =
      topPositions.length > 0
        ? `Principales lignes: ${topPositions.map((position) => `${position.investmentName} (${formatEuroShort(position.currentValue)})`).join(', ')}.`
        : 'Aucune ligne d’investissement détaillée n’est disponible pour affiner la recommandation.'

    return {
      title: 'Conseil investissements',
      answer: [
        `Tu as actuellement environ ${formatEuroShort(totalInvested)} investis.${liveSnapshot?.periodChangeAmount !== undefined ? ` Variation récente: ${formatEuroShort(liveSnapshot.periodChangeAmount)}.` : ''}`,
        allocationLines.length > 0 ? `Répartition visible: ${allocationLines.join(' • ')}.` : '',
        positionsLine,
        actions.slice(0, 3).join(' '),
      ]
        .filter(Boolean)
        .join(' '),
      transactions: [],
    }
  }

  if (patrimonyIntent) {
    return {
      title: 'Vue patrimoine',
      answer: [
        `Patrimoine net estimé: ${formatEuroShort(patrimony.netWorth)}.`,
        `Trésorerie: ${formatEuroShort(patrimony.bankCash)}. Livrets: ${formatEuroShort(patrimony.livretTotal)}.`,
        `Épargne de précaution: ${formatEuroShort(patrimony.emergencyFund.current)} sur un objectif de ${formatEuroShort(patrimony.emergencyFund.target)}.`
      ].join(' '),
      transactions: [],
    }
  }

  if (analysis) {
    const fallback = answerBudgetQuestion(query, analysis, monthKey)
    return {
      title: fallback.title,
      answer: fallback.body,
      transactions: fallback.matchingTransactions.slice(0, 6),
    }
  }

  return {
    title: 'Assistant IA',
    answer: 'Désolé, je ne dispose pas de suffisamment de données budgétaires ou patrimoniales pour répondre à cette question. Assurez-vous d\'avoir importé des comptes ou paramétré l\'assistant.',
    transactions: [],
  }
}

const toMonthKey = (isoDate: string) => isoDate.slice(0, 7)

const toMonthLabel = (monthKey: string) => {
  const [year, month] = monthKey.split('-').map(Number)
  if (!year || !month) return ''
  return monthFormatter.format(new Date(year, month - 1, 1))
}

type OperationRecord = {
  operation: ParsedAccountOperation
  importUploadedAt: string
}

const normalizeOperationLabelForKey = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const buildOperationDedupKey = (operation: ParsedAccountOperation) => {
  const amount = Number.isFinite(operation.amount) ? operation.amount.toFixed(2) : '0.00'
  const label = normalizeOperationLabelForKey(operation.label)
  return `${operation.operationDate}|${operation.valueDate}|${amount}|${label}`
}

const buildStableTransactionId = (accountId: string, dedupKey: string, occurrenceIndex: number) => {
  const digest = createHash('sha1')
    .update(`${accountId}|${dedupKey}|${occurrenceIndex}`)
    .digest('hex')
    .slice(0, 24)
  return `tx-${digest}`
}

const parseOperationsCsvGeneric = (
  csvText: string,
  fallbackAccountLabel: string,
): ParsedAccountOperation[] => {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    delimiter: ';',
    header: true,
    skipEmptyLines: true,
  })

  const rows = parsed.data
  if (!rows || rows.length === 0) {
    return []
  }

  const firstRow = rows[0] ?? {}
  const keyMap = new Map<string, string>()
  for (const key of Object.keys(firstRow)) {
    keyMap.set(normalizeHeader(key), key)
  }

  const keyFromAliases = (aliases: string[]) => {
    for (const alias of aliases) {
      const match = keyMap.get(alias)
      if (match) return match
    }
    return undefined
  }

  const dateOpKey = keyFromAliases(['dateop', 'date'])
  const dateValKey = keyFromAliases(['dateval', 'datedevaleur']) ?? dateOpKey
  const amountKey = keyFromAliases(['amount', 'montant'])
  const debitKey = keyFromAliases(['debit', 'dbit'])
  const creditKey = keyFromAliases(['credit', 'crdit'])
  const labelKey = keyFromAliases(['label', 'libelle', 'libell'])
  const balanceKey = keyFromAliases(['accountbalance', 'solde'])
  const accountLabelKey = keyFromAliases(['accountlabel'])

  const operations: ParsedAccountOperation[] = []

  rows.forEach((row) => {
    const operationDate = parseDateToIso((dateOpKey ? row[dateOpKey] : '') ?? '')
    if (!operationDate) {
      return
    }

    const valueDate = parseDateToIso((dateValKey ? row[dateValKey] : '') ?? '') || operationDate
    const label = ((labelKey ? row[labelKey] : '') ?? '').trim() || 'Opération'

    let amount = 0
    if (amountKey) {
      amount = parseEuroNumber(row[amountKey])
    } else {
      const debitRaw = debitKey ? parseEuroNumber(row[debitKey]) : 0
      const creditRaw = creditKey ? parseEuroNumber(row[creditKey]) : 0
      const debit = debitRaw === 0 ? 0 : debitRaw < 0 ? debitRaw : -debitRaw
      const credit = creditRaw
      amount = debit + credit
    }

    const balance = balanceKey ? parseEuroNumber(row[balanceKey]) : null
    const accountLabel = ((accountLabelKey ? row[accountLabelKey] : '') ?? '').trim() || fallbackAccountLabel

    operations.push({
      operationDate,
      valueDate,
      label,
      amount,
      balance: Number.isFinite(balance) ? balance : null,
      accountLabel,
    })
  })

  return operations.sort((a, b) => b.operationDate.localeCompare(a.operationDate))
}

const detectAccountImportKind = (csvText: string): AccountImportKind => {
  const firstLine = csvText.replace(/^\uFEFF/, '').split('\n')[0] ?? ''
  const normalizedHeaders = firstLine
    .split(';')
    .map((header) => normalizeHeader(header))

  if (
    normalizedHeaders.includes('isin') ||
    normalizedHeaders.includes('buyingprice') ||
    normalizedHeaders.includes('lastprice') ||
    hasAssuranceViePositionHeaders(normalizedHeaders) ||
    (normalizedHeaders.includes('quantite') && normalizedHeaders.includes('prixrevient')) ||
    (normalizedHeaders.includes('cours') && normalizedHeaders.includes('montant'))
  ) {
    return 'positions'
  }

  if (
    (normalizedHeaders.includes('dateop') && normalizedHeaders.includes('accountbalance')) ||
    (normalizedHeaders.includes('debit') &&
      normalizedHeaders.includes('credit') &&
      normalizedHeaders.includes('solde')) ||
    (normalizedHeaders.includes('dbit') &&
      normalizedHeaders.includes('crdit') &&
      normalizedHeaders.includes('solde'))
  ) {
    return 'operations'
  }

  return 'unknown'
}

const parseOperationsImport = (csvText: string) => {
  const ops = parseOperationsCsvGeneric(csvText, 'Compte')
  const rows: Array<{ date: string; balance: number | null }> = ops.map((op) => ({
    date: op.operationDate,
    balance: op.balance,
  }))

  const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date))
  const latest = sorted.find((row) => row.balance !== null)
  const oldest = [...sorted].reverse().find((row) => row.balance !== null)

  return {
    latestBalance: latest?.balance ?? null,
    oldestBalance: oldest?.balance ?? null,
    latestDate: latest?.date,
    oldestDate: oldest?.date,
  }
}

const parsePositionsImport = (csvText: string) => {
  const positions = parsePositionsCsv(csvText)
  const totalCurrentValue = positions.reduce((sum, position) => sum + position.currentValue, 0)
  const totalInvested = positions.reduce(
    (sum, position) => sum + position.quantity * position.buyingPrice,
    0,
  )
  const totalGain = totalCurrentValue - totalInvested
  const totalDayVariation = positions.reduce(
    (sum, position) => sum + position.amountVariation,
    0,
  )

  return {
    totalCurrentValue,
    totalInvested,
    totalGain,
    totalDayVariation,
  }
}

const getImportEffectiveEndDate = (imp: StoredImport, importKind: AccountImportKind): string => {
  if (imp.periodEndDate) return imp.periodEndDate

  if (importKind === 'operations') {
    return parseOperationsImport(imp.csvText).latestDate ?? imp.uploadedAt.slice(0, 10)
  }

  return imp.uploadedAt.slice(0, 10)
}

const getPreferredImportKindForAccount = (account: StoredAccount): AccountImportKind | null => {
  if (account.productType === 'crypto') return null

  if (
    account.productType === 'checking' ||
    account.productType === 'livret-a' ||
    account.productType === 'livret-jeune' ||
    account.productType === 'lep' ||
    account.productType === 'ldds' ||
    account.productType === 'livret-other'
  ) {
    return 'operations'
  }

  return 'positions'
}

const getActiveImportsSortedByTemporalEndDate = (
  account: StoredAccount,
  kind?: AccountImportKind,
): Array<{ imp: StoredImport; importKind: AccountImportKind; effectiveEndDate: string }> => {
  const imports = account.csvImports
    .filter((imp) => imp.isActive)
    .map((imp) => {
      const importKind = detectAccountImportKind(imp.csvText)
      return {
        imp,
        importKind,
        effectiveEndDate: getImportEffectiveEndDate(imp, importKind),
      }
    })

  const filtered = kind ? imports.filter((row) => row.importKind === kind) : imports

  return filtered.sort((left, right) => {
    const byEffectiveDate = right.effectiveEndDate.localeCompare(left.effectiveEndDate)
    if (byEffectiveDate !== 0) return byEffectiveDate
    return right.imp.uploadedAt.localeCompare(left.imp.uploadedAt)
  })
}

const summarizeAccount = (account: StoredAccount) => {
  const preferredKind = getPreferredImportKindForAccount(account)
  const activeImports = preferredKind
    ? getActiveImportsSortedByTemporalEndDate(account, preferredKind)
    : getActiveImportsSortedByTemporalEndDate(account)

  if (account.productType === 'crypto' && account.cryptoHolding?.quantity) {
    const quantity = account.cryptoHolding.quantity
    const averageBuyPrice = account.cryptoHolding.averageBuyPrice ?? 0
    const balance = quantity * averageBuyPrice

    return {
      balance,
      importKind: 'unknown' as AccountImportKind,
      trendAmount: null as number | null,
      trendPercent: null as number | null,
      trendLabel: null as string | null,
      sourceLabel: balance > 0 ? 'Coût d\'achat crypto' : 'Crypto à renseigner',
    }
  }

  if (activeImports.length === 0) {
    const manualBalance = account.manualBalance ?? 0
    return {
      balance: manualBalance,
      importKind: 'unknown' as AccountImportKind,
      trendAmount: null as number | null,
      trendPercent: null as number | null,
      trendLabel: null as string | null,
      sourceLabel: account.manualBalance !== undefined ? 'Solde manuel' : 'Aucune donnée',
    }
  }

  const latestImport = activeImports[0]
  const importKind = latestImport.importKind

  if (importKind === 'positions') {
    const latest = parsePositionsImport(latestImport.imp.csvText)
    const previousImport = activeImports[1]
    const previous = previousImport ? parsePositionsImport(previousImport.imp.csvText) : null
    const trendAmount = previous
      ? latest.totalCurrentValue - previous.totalCurrentValue
      : latest.totalDayVariation
    const baseValue = previous ? previous.totalCurrentValue : latest.totalCurrentValue - latest.totalDayVariation
    const trendPercent = baseValue > 0 ? trendAmount / baseValue : null

    return {
      balance: latest.totalCurrentValue,
      importKind,
      trendAmount,
      trendPercent,
      trendLabel: previous ? 'depuis le dernier export' : 'variation de séance',
      sourceLabel: 'Valorisation titres',
    }
  }

  if (importKind === 'operations') {
    const summary = parseOperationsImport(latestImport.imp.csvText)
    const latestBalance = summary.latestBalance ?? account.manualBalance ?? 0
    const oldestBalance = summary.oldestBalance
    const trendAmount =
      oldestBalance !== null && oldestBalance !== undefined ? latestBalance - oldestBalance : null
    const trendPercent =
      oldestBalance && oldestBalance !== 0 && trendAmount !== null ? trendAmount / oldestBalance : null

    return {
      balance: latestBalance,
      importKind,
      trendAmount,
      trendPercent,
      trendLabel:
        summary.oldestDate && summary.latestDate
          ? `sur ${summary.oldestDate} → ${summary.latestDate}`
          : 'sur la période importée',
      sourceLabel: 'Solde CSV',
    }
  }

  return {
    balance: account.manualBalance ?? 0,
    importKind,
    trendAmount: null as number | null,
    trendPercent: null as number | null,
    trendLabel: null as string | null,
    sourceLabel: 'Import non reconnu',
  }
}

// Compute the current balance of an account:
//   if it has CSV imports → use the latest balance value from the most recent import
//   otherwise fall back to manualBalance
const getAccountBalance = (account: StoredAccount): number => {
  return summarizeAccount(account).balance
}

const buildAnalysis = (state: StoredState): BudgetAnalysis | null => {
  const checkingAccounts = state.accounts.filter((account) => account.kind === 'asset' && account.productType === 'checking')
  const activeOpsImports = checkingAccounts.flatMap((account) =>
    account.csvImports
      .filter((imp) => imp.isActive && detectAccountImportKind(imp.csvText) === 'operations')
      .map((imp) => ({ imp, account })),
  )

  if (activeOpsImports.length === 0) {
    return null
  }

  const allTransactions: Transaction[] = []

  const accountDedupMap = new Map<string, {
    maxOccurrencesByKey: Map<string, number>
    recordsByKey: Map<string, OperationRecord[]>
  }>()

  activeOpsImports.forEach(({ imp, account }) => {
    const ops = parseOperationsCsvGeneric(imp.csvText, account.name)
    let dedup = accountDedupMap.get(account.id)
    if (!dedup) {
      dedup = {
        maxOccurrencesByKey: new Map<string, number>(),
        recordsByKey: new Map<string, OperationRecord[]>(),
      }
      accountDedupMap.set(account.id, dedup)
    }

    const importCounts = new Map<string, number>()

    ops.forEach((op) => {
      const dedupKey = buildOperationDedupKey(op)
      importCounts.set(dedupKey, (importCounts.get(dedupKey) ?? 0) + 1)

      const records = dedup.recordsByKey.get(dedupKey) ?? []
      records.push({
        operation: op,
        importUploadedAt: imp.uploadedAt,
      })
      dedup.recordsByKey.set(dedupKey, records)
    })

    importCounts.forEach((count, dedupKey) => {
      const currentMax = dedup.maxOccurrencesByKey.get(dedupKey) ?? 0
      if (count > currentMax) {
        dedup.maxOccurrencesByKey.set(dedupKey, count)
      }
    })
  })

  accountDedupMap.forEach((dedup, accountId) => {
    const account = checkingAccounts.find((item) => item.id === accountId)
    if (!account) return

    dedup.maxOccurrencesByKey.forEach((maxOccurrences, dedupKey) => {
      const records = dedup.recordsByKey.get(dedupKey) ?? []
      records.sort((left, right) => {
        const byOperationDate = right.operation.operationDate.localeCompare(left.operation.operationDate)
        if (byOperationDate !== 0) return byOperationDate

        const byValueDate = right.operation.valueDate.localeCompare(left.operation.valueDate)
        if (byValueDate !== 0) return byValueDate

        const byUploadedAt = right.importUploadedAt.localeCompare(left.importUploadedAt)
        if (byUploadedAt !== 0) return byUploadedAt

        return right.operation.amount - left.operation.amount
      })

      records.slice(0, maxOccurrences).forEach((record, occurrenceIndex) => {
        const op = record.operation
        const monthKey = toMonthKey(op.operationDate)
        const monthLabel = toMonthLabel(monthKey)
        const lowerLabel = op.label.toLowerCase()

        allTransactions.push({
          id: buildStableTransactionId(account.id, dedupKey, occurrenceIndex),
          operationDate: op.operationDate,
          valueDate: op.valueDate,
          monthKey,
          monthLabel,
          label: op.label,
          category: 'Non catégorisé',
          categoryParent: 'Non catégorisé',
          supplier: '',
          amount: op.amount,
          direction: op.amount >= 0 ? 'income' : 'expense',
          comment: '',
          accountNumber: '',
          accountLabel: op.accountLabel || account.name,
          balance: op.balance,
          isTransfer:
            lowerLabel.includes('virement') ||
            lowerLabel.startsWith('vir ') ||
            lowerLabel.includes('mouvements internes'),
          isUncategorized: true,
        })
      })
    })
  })

  if (allTransactions.length === 0) {
    return null
  }

  allTransactions.sort((left, right) => right.operationDate.localeCompare(left.operationDate))

  const normalizedTransactions = applyCategoryRules(allTransactions, state.rules)
  return analyzeTransactions(normalizedTransactions, {
    budgetOverrides: state.budgetOverrides,
  })
}

const buildPatrimony = (
  state: StoredState,
  analysis: BudgetAnalysis | null,
): PatrimonySummary => {
  // Accounts are now the source of truth for patrimony.
  const accountSummaries = state.accounts.map((account) => ({
    account,
    summary: summarizeAccount(account),
  }))

  const bankCash = accountSummaries
    .filter(({ account }) => account.kind === 'asset' && account.productType === 'checking')
    .reduce((sum, { summary }) => sum + summary.balance, 0)

  const assetsByProductType: { [key: string]: number } = {}
  const externalAssets: { [key: string]: number } = {}
  const positionDetails: Array<{
    accountName: string
    investmentName: string
    quantity: number
    lastPrice: number
    currentValue: number
    variation: number
  }> = []

  for (const { account, summary } of accountSummaries) {
    if (account.kind === 'asset') {
      const balance = summary.balance
      const pt = account.productType

      if (pt !== 'checking') {
        assetsByProductType[pt] = (assetsByProductType[pt] ?? 0) + balance
      }

      externalAssets[account.name] = balance

      // Extract position details for investment accounts
      if ((pt === 'pea' || pt === 'pea-pme' || pt === 'cto' || pt === 'assurance-vie') && summary.importKind === 'positions') {
        const activeImport = getActiveImportsSortedByTemporalEndDate(account, 'positions')[0]?.imp
        if (activeImport) {
          const positions = parsePositionsCsv(activeImport.csvText)
          positions.forEach((pos) => {
            positionDetails.push({
              accountName: account.name,
              investmentName: pos.name,
              quantity: pos.quantity,
              lastPrice: pos.lastPrice,
              currentValue: pos.currentValue,
              variation: pos.variation,
            })
          })
        }
      }
    }
  }

  // Legacy fallback only if no structured account exists yet.
  if (state.accounts.length === 0) {
    for (const item of state.netWorthItems) {
      if (item.kind === 'asset') {
        const pt = (item as StoredNetWorthItem).productType || 'other'
        assetsByProductType[pt] = (assetsByProductType[pt] ?? 0) + item.value
        externalAssets[item.label] = item.value
      }
    }
  }

  const debts =
    accountSummaries
      .filter(({ account }) => account.kind === 'debt')
      .reduce((sum, { summary }) => sum + summary.balance, 0) +
    (state.accounts.length === 0
      ? state.netWorthItems
          .filter((item) => item.kind === 'debt')
          .reduce((sum, item) => sum + item.value, 0)
      : 0)

  const debtRecords = getAllDebts()
  const debtRecordsTotal = debtRecords.reduce((sum, debt) => sum + debt.balance, 0)

  const realEstateRecords = getAllRealEstate()
  const realEstateTotal = realEstateRecords.reduce((sum, item) => sum + item.currentValue, 0)

  const vehicleRecords = getAllVehicles()
  const vehicleTotal = vehicleRecords.reduce((sum, item) => sum + item.currentValue, 0)

  // Emergency fund: livret accounts + designated netWorthItems
  const livretAccounts = state.accounts.filter(
    (a) => a.kind === 'asset' && (a.isEligibleEmergencyFund || isLivretType(a.productType)),
  )
  const livretDetails = livretAccounts.map((a) => ({
    name: a.name,
    balance: summarizeAccount(a).balance,
  }))
  const livretTotal = livretDetails.reduce((s, l) => s + l.balance, 0)

  // Legacy designated
  const legacyEmergencyFund = state.netWorthItems
    .filter((item) => state.emergencyFundDesignated.includes(item.label) && item.kind === 'asset')
    .reduce((sum, item) => sum + item.value, 0)

  const emergencyFundCurrent = livretTotal + legacyEmergencyFund

  // Monthly expenses for target calculation
  let monthlyExpenses =
    typeof state.emergencyFundMonthlyExpenses === 'number' && state.emergencyFundMonthlyExpenses > 0
      ? state.emergencyFundMonthlyExpenses
      : 0

  if (monthlyExpenses === 0 && analysis && analysis.months.length > 0) {
    const totalExpenses = analysis.months.reduce((sum, monthOpt) => {
      const monthly = analysis.monthly[monthOpt.key]
      return sum + (monthly?.expenses ?? 0)
    }, 0)
    monthlyExpenses = totalExpenses / Math.max(analysis.months.length, 1)
  }

  const emergencyFundTarget = monthlyExpenses * state.emergencyFundTargetMonths

  const totalAssets = bankCash + Object.values(assetsByProductType).reduce((a, b) => a + b, 0)
  const totalAssetsWithPatrimony = totalAssets + realEstateTotal + vehicleTotal
  const totalDebts = debts + debtRecordsTotal

  // Compute Cashflow Projection
  let pendingAmount = 0
  let pendingList: RecurringExpense[] = []
  
  if (analysis && analysis.months.length > 0) {
    const currentMonthKey = analysis.months[0].key
    const recurring = analysis.recurringExpenses
    
    // An expense is pending for the CURRENT month if its last recorded operation
    // was in a PREVIOUS month (so lastDate < currentMonthKey-00).
    pendingList = recurring.filter(exp => exp.lastDate < `${currentMonthKey}-00`)
    pendingAmount = pendingList.reduce((sum, exp) => sum + exp.amount, 0)
  }

  const cashflow: CashflowProjection = {
    currentBalance: bankCash,
    pendingRecurringExpenses: pendingAmount,
    pendingRecurringList: pendingList,
    projectedEndBalance: bankCash - pendingAmount,
  }

  return {
    bankCash,
    externalAssets: {
      ...externalAssets,
      ...Object.fromEntries(realEstateRecords.map((item) => [item.name, item.currentValue])),
      ...Object.fromEntries(vehicleRecords.map((item) => [item.name, item.currentValue])),
    },
    debts: totalDebts,
    netWorth: totalAssetsWithPatrimony - totalDebts,
    emergencyFund: {
      current: emergencyFundCurrent,
      target: emergencyFundTarget,
      isHealthy: emergencyFundCurrent >= emergencyFundTarget,
      months: monthlyExpenses > 0 ? emergencyFundCurrent / monthlyExpenses : 0,
      livretDetails,
    },
    assetsByProductType,
    livretTotal,
    positionDetails,
    cashflow,
    totalAssets: totalAssetsWithPatrimony,
    externalPatrimonyTotal: realEstateTotal + vehicleTotal,
  }
}

const generateSuggestions = (
  state: StoredState,
  analysis: BudgetAnalysis | null,
  patrimony: PatrimonySummary,
): FinancialSuggestion[] => {
  const suggestions: FinancialSuggestion[] = []
  const totalAssets = patrimony.totalAssets > 0 ? patrimony.totalAssets : 0
  const investedTypesCount = Object.entries(patrimony.assetsByProductType)
    .filter(([productType, value]) => value > 0 && !['checking', ...LIVRET_TYPES].includes(productType))
    .length
  const cryptoExposure = totalAssets > 0 ? (patrimony.assetsByProductType.crypto ?? 0) / totalAssets : 0
  const debtRatio = totalAssets > 0 ? patrimony.debts / totalAssets : 0

  // Emergency fund suggestion
  if (!patrimony.emergencyFund.isHealthy) {
    const missingMonths = Math.ceil(
      state.emergencyFundTargetMonths - patrimony.emergencyFund.months,
    )
    const avgMonthlyExpense =
      patrimony.emergencyFund.target > 0
        ? patrimony.emergencyFund.target / state.emergencyFundTargetMonths
        : 0
    suggestions.push({
      id: 'emergency-fund-low',
      category: 'emergency-fund',
      priority: 'high',
      title: 'Épargne de précaution insuffisante',
      description: `Vos livrets totalisent ${patrimony.emergencyFund.months.toFixed(1)} mois, objectif: ${state.emergencyFundTargetMonths} mois`,
      actionableAdvice:
        avgMonthlyExpense > 0
          ? `Il manque ~${(missingMonths * avgMonthlyExpense).toFixed(0)}€ pour atteindre l'objectif`
          : 'Importez un relevé de compte courant pour calculer vos dépenses mensuelles',
    })
  }

  if (cryptoExposure > state.healthGoals.maxCryptoShareTotal / 100) {
    const overTargetEuros = Math.max(0, (cryptoExposure - state.healthGoals.maxCryptoShareTotal / 100) * totalAssets)
    suggestions.push({
      id: 'crypto-over-target',
      category: 'allocation',
      priority: 'high',
      title: 'Crypto au-dessus de votre limite',
      description: `Exposition actuelle ${(cryptoExposure * 100).toFixed(1)}% (objectif max ${state.healthGoals.maxCryptoShareTotal.toFixed(0)}%).`,
      actionableAdvice: `Réduire la poche crypto d'environ ${Math.round(overTargetEuros).toLocaleString('fr-FR')}€ ou renforcer les autres poches pour revenir dans la cible.`,
    })
  }

  if (debtRatio > state.healthGoals.maxDebtToAssetRatio / 100) {
    suggestions.push({
      id: 'debt-ratio-over-target',
      category: 'debt',
      priority: 'medium',
      title: 'Ratio dettes/actifs au-dessus de votre cible',
      description: `Ratio actuel ${(debtRatio * 100).toFixed(1)}% (objectif max ${state.healthGoals.maxDebtToAssetRatio.toFixed(0)}%).`,
      actionableAdvice: 'Prioriser le remboursement des dettes les plus coûteuses ou augmenter la base d actifs liquides et investis.',
    })
  }

  if (investedTypesCount > 0 && investedTypesCount < state.healthGoals.minAssetClassCount) {
    suggestions.push({
      id: 'asset-class-diversification-low',
      category: 'allocation',
      priority: 'medium',
      title: 'Diversification en classes d actifs insuffisante',
      description: `${investedTypesCount} classe(s) détectée(s) (objectif min ${state.healthGoals.minAssetClassCount}).`,
      actionableAdvice: 'Ajouter progressivement une ou deux classes d actifs complémentaires pour lisser le risque global.',
    })
  }

  // Spending anomalies - check first month for anomalies
  if (analysis && analysis.months.length > 0) {
    const firstMonth = analysis.monthly[analysis.months[0]?.key]
    if (firstMonth && firstMonth.anomalies && firstMonth.anomalies.length > 0) {
      suggestions.push({
        id: 'anomalies-detected',
        category: 'spending',
        priority: 'medium',
        title: 'Dépenses inhabituelles détectées',
        description: `${firstMonth.anomalies.length} catégories avec écarts significatifs`,
        actionableAdvice: `Vérifier: ${firstMonth.anomalies.slice(0, 2).map((a) => a.label).join(', ')}`,
      })
    }
  }

  return suggestions.slice(0, 6)
}


const askRemoteAi = async (
  query: string,
  analysis: BudgetAnalysis | null,
  monthKey: string,
  patrimony?: PatrimonySummary,
  liveSnapshot?: LiveInvestmentSnapshot,
  healthGoals?: HealthGoals,
) => {
  if (!OPENAI_BASE_URL || !OPENAI_MODEL) {
    return null
  }

  const client = new OpenAI({
    apiKey: OPENAI_API_KEY,
    baseURL: OPENAI_BASE_URL,
    timeout: 60000, // Some hosted models can take longer than 20s
  })

  const systemPrompt = `Tu es un conseiller financier personnel francophone orienté action. 

DIRECTIVES :
- Réponds en markdown lisible.
- Donne des conseils concrets, chiffrés et actionnables.
- N'invente aucune donnée absente.
- Si l'utilisateur pose une question sur des données que tu as, réponds directement.
- Si l'utilisateur pose une question sur des domaines où tu n'as pas de contexte (ex: fiscalité complexe, placements spécialisés), dis "Je n'ai pas assez de contexte pour répondre précisément."
- Priorise les réponses sur le budget, les dépenses, le patrimoine net, les investissements et la trésorerie.
- Utilise toujours des unités en euros € avec 2 décimales.
- Fournis 1-3 actions concrètes à chaque réponse.

FORMAT ATTENDU :
- "## Diagnostic"
- "## Plan d'action"
- "## Points de vigilance"
- Maximum 180 mots sauf si l'utilisateur demande explicitement du détail.

CONTRAINTE SPECIFIQUE INVESTISSEMENTS :
- Si des lignes PEA / assurance-vie / CTO sont présentes dans le contexte, base tes recommandations dessus en citant ces lignes.
- N'utilise pas de conseils d'investissement génériques si des données de lignes sont disponibles.`

  const contextData: Record<string, unknown> = { query }

  const month = analysis?.monthly?.[monthKey]
  if (month) {
    contextData.budget = {
      monthLabel: month.label,
      income: month.income,
      expenses: month.expenses,
      budgetTarget: month.totalBudgetTarget,
      budgetGap: month.budgetGap,
      topCategories: month.categories.slice(0, 10),
      anomalies: month.anomalies.slice(0, 10),
      recurringExpenses: analysis?.recurringExpenses?.slice(0, 10) ?? [],
    }
  }

  if (patrimony) {
    contextData.patrimony = {
      netWorth: patrimony.netWorth,
      bankCash: patrimony.bankCash,
      livretTotal: patrimony.livretTotal,
      debts: patrimony.debts, // Included debts based on CODEBASE_ANALYSIS
      investments: Object.entries(patrimony.assetsByProductType)
        .filter(([type]) => !['checking', 'livret-a', 'livret-jeune', 'lep', 'ldds', 'livret-other'].includes(type))
        .reduce((acc, [type, val]) => ({ ...acc, [type]: val }), {}),
      emergencyFund: {
        current: patrimony.emergencyFund.current,
        target: patrimony.emergencyFund.target,
        months: patrimony.emergencyFund.months,
      },
    }

    if (healthGoals) {
      const totalAssets = patrimony.totalAssets > 0 ? patrimony.totalAssets : 0
      const cryptoShare = totalAssets > 0 ? ((patrimony.assetsByProductType.crypto ?? 0) / totalAssets) * 100 : 0
      const debtRatio = totalAssets > 0 ? (patrimony.debts / totalAssets) * 100 : 0
      const investedTypeCount = Object.entries(patrimony.assetsByProductType)
        .filter(([type, value]) => value > 0 && !['checking', ...LIVRET_TYPES].includes(type))
        .length
      contextData.healthGoals = healthGoals
      contextData.healthGaps = {
        emergencyFundGap: Math.max(0, patrimony.emergencyFund.target - patrimony.emergencyFund.current),
        cryptoShare,
        debtRatio,
        investedTypeCount,
      }
    }
  }

  // Add investment snapshot context if available
  if (liveSnapshot) {
    const productTypeLabel = (productType: string) => {
      switch (productType) {
        case 'pea': return 'PEA'
        case 'assurance-vie': return 'Assurance vie'
        case 'cto': return 'CTO'
        case 'pea-pme': return 'PEA-PME'
        case 'per': return 'PER'
        case 'crypto': return 'Crypto'
        default: return productType
      }
    }

    const topLines = liveSnapshot.positions
      .slice()
      .sort((left, right) => right.currentValue - left.currentValue)
      .slice(0, 12)
      .map((position) => ({
        accountName: position.accountName,
        envelope: productTypeLabel(position.productType),
        name: position.investmentName,
        symbol: position.symbol ?? position.isin ?? null,
        value: position.currentValue,
        weightInInvested: liveSnapshot.totalCurrentValue > 0
          ? position.currentValue / liveSnapshot.totalCurrentValue
          : 0,
        periodChangeAmount: position.periodChangeAmount,
        periodChangePercent: position.periodChangePercent,
      }))

    const linesByEnvelope = ['pea', 'assurance-vie', 'cto', 'pea-pme', 'per', 'crypto']
      .map((envelope) => {
        const lines = liveSnapshot.positions
          .filter((position) => position.productType === envelope)
          .sort((left, right) => right.currentValue - left.currentValue)
          .slice(0, 5)
          .map((position) => ({
            accountName: position.accountName,
            name: position.investmentName,
            value: position.currentValue,
            weightInEnvelope: (liveSnapshot.totalsByProductType[envelope] ?? 0) > 0
              ? position.currentValue / (liveSnapshot.totalsByProductType[envelope] ?? 1)
              : 0,
            periodChangePercent: position.periodChangePercent,
          }))

        return {
          envelope: productTypeLabel(envelope),
          totalValue: liveSnapshot.totalsByProductType[envelope] ?? 0,
          lines,
        }
      })
      .filter((entry) => entry.totalValue > 0)

    contextData.investments = {
      total: liveSnapshot.totalCurrentValue,
      periodChange: liveSnapshot.periodChangeAmount,
      periodChangePercent: liveSnapshot.periodChangePercent,
      topHoldings: liveSnapshot.positions.slice(0, 3).map((p) => ({
        name: p.investmentName,
        value: p.currentValue,
        account: p.accountName,
      })),
      topLines,
      linesByEnvelope,
      alerts: liveSnapshot.alerts.slice(0, 2),
    }
  } else if (patrimony?.positionDetails?.length) {
    contextData.investments = {
      source: 'patrimony-position-details',
      topLines: patrimony.positionDetails
        .slice()
        .sort((left, right) => right.currentValue - left.currentValue)
        .slice(0, 10)
        .map((position) => ({
          accountName: position.accountName,
          name: position.investmentName,
          value: position.currentValue,
          quantity: position.quantity,
          lastPrice: position.lastPrice,
          variation: position.variation,
        })),
    }
  }

  const completion = await client.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: JSON.stringify(contextData, null, 2),
      },
    ],
  })

  const rawContent = completion.choices[0]?.message?.content as unknown
  if (typeof rawContent === 'string') {
    const trimmed = rawContent.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  if (Array.isArray(rawContent)) {
    const text = rawContent
      .map((part: unknown) => {
        if (!part || typeof part !== 'object') return ''
        if ('text' in part && typeof part.text === 'string') return part.text
        return ''
      })
      .join('\n')
      .trim()
    return text.length > 0 ? text : null
  }

  return null
}

const ensureAdvisorMarkdown = (answer: string) => {
  const trimmed = answer.trim()
  if (!trimmed) return trimmed
  const hasDiagnostic = /##\s*Diagnostic/i.test(trimmed)
  const hasPlan = /##\s*Plan/i.test(trimmed)
  const hasVigilance = /##\s*Points\s+de\s+vigilance/i.test(trimmed)
  if (hasDiagnostic && hasPlan && hasVigilance) {
    return trimmed
  }

  return [
    '## Diagnostic',
    trimmed,
    '',
    '## Plan d\'action',
    '- Prioriser une action à fort impact ce mois-ci.',
    '- Mettre en place un suivi hebdomadaire des écarts.',
    '',
    '## Points de vigilance',
    '- Vérifier régulièrement la cohérence avec les objectifs de santé financière.',
  ].join('\n')
}

const isGenericInvestmentRemoteAnswer = (answer: string) => {
  const normalized = normalizeAssistantQuery(answer)
  return (
    normalized.includes('je ne dispose pas') ||
    normalized.includes('donnees specifiques') ||
    normalized.includes('hypothetique') ||
    normalized.includes('basee sur les chiffres disponibles')
  )
}

const toNumberFromString = (value: string) => {
  const normalized = value.replace(',', '.').trim()
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

const extractGoalNumber = (normalizedQuery: string, aliases: string[]) => {
  for (const alias of aliases) {
    const pattern = new RegExp(`${alias}[^0-9]{0,25}([0-9]{1,3}(?:[.,][0-9]+)?)`)
    const match = normalizedQuery.match(pattern)
    if (!match?.[1]) continue
    const parsed = toNumberFromString(match[1])
    if (parsed !== null) return parsed
  }
  return null
}

const extractHealthGoalsUpdatesFromQuery = (query: string): Partial<HealthGoals> => {
  const normalizedQuery = normalizeAssistantQuery(query)
  const updates: Partial<HealthGoals> = {}

  const assignIfDetected = (
    field: keyof HealthGoals,
    aliases: string[],
    round = true,
  ) => {
    const value = extractGoalNumber(normalizedQuery, aliases)
    if (value === null) return
    updates[field] = (round ? Math.round(value) : value) as HealthGoals[keyof HealthGoals]
  }

  assignIfDetected('targetEmergencyFundMonths', ['liquidite', 'fonds urgence', 'epargne precaution', 'mois'])
  assignIfDetected('maxCryptoShareTotal', ['crypto max', 'crypto'])
  assignIfDetected('maxSinglePositionShare', ['position unique max', 'position max', 'type dominant max'])
  assignIfDetected('maxTop3PositionsShare', ['top 3 max', 'top3 max', 'top 3'])
  assignIfDetected('maxDebtToAssetRatio', ['dette actifs max', 'dette/actifs max', 'ratio dette'])
  assignIfDetected('maxDebtServiceToIncomeRatio', ['mensualites revenus max', 'mensualites/revenus max', 'service de la dette'])
  assignIfDetected('allocationDriftTolerance', ['tolerance allocation', 'ecart allocation'])
  assignIfDetected('minAssetClassCount', ['classes actifs min', 'classes d actifs min'])
  assignIfDetected('minGeoBucketCount', ['zones geographiques min', 'zones geo min'])
  assignIfDetected('minSectorBucketCount', ['secteurs min'])

  return updates
}

// ─── Investment CSV helpers ───────────────────────────────────────────────────

const parseEuroNumber = (raw: string | undefined): number => {
  const value = (raw ?? '').trim()
  if (!value) return 0

  let normalized = value.replace(/\s/g, '')
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.')
  } else {
    normalized = normalized.replace(',', '.')
  }

  const n = parseFloat(normalized)
  return Number.isFinite(n) ? n : 0
}

const detectInvestmentCsvType = (csvText: string): InvestmentCsvType => {
  const stripped = csvText.replace(/^\uFEFF/, '')
  const firstLine = stripped.split('\n')[0] ?? ''
  const lower = firstLine.toLowerCase()
  if (lower.includes('isin') || lower.includes('buyingprice') || lower.includes('lastprice')) {
    return 'positions'
  }
  return 'operations'
}

const parsePositionsCsv = (csvText: string): InvestmentPosition[] => {
  const stripped = csvText.replace(/^\uFEFF/, '')
  const lines = stripped.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return []

  const headerLine = lines[0] ?? ''
  const headers = headerLine
    .split(';')
    .map((h) => normalizeHeader(h))

  // Detect format: Standard (with ISIN) vs Assurance-vie (without ISIN)
  const isStandardFormat = headers.includes('isin')
  const isAssuranceVieFormat = hasAssuranceViePositionHeaders(headers)

  const positions: InvestmentPosition[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line?.trim()) continue
    const cols = line.split(';').map((c) => c.replace(/^"(.*)"$/, '$1').trim())
    
    if (isStandardFormat && cols.length >= 9) {
      // Standard format: [name, isin, qty, buyPrice, lastPrice, intradayVar, amount, amountVar, variation]
      const [name, isin, qty, buyPrice, lastPrice, intradayVar, amount, amountVar, variation] = cols
      positions.push({
        name: name ?? '',
        isin: isin ?? '',
        quantity: parseEuroNumber(qty),
        buyingPrice: parseEuroNumber(buyPrice),
        lastPrice: parseEuroNumber(lastPrice),
        intradayVariation: parseEuroNumber(intradayVar),
        currentValue: parseEuroNumber(amount),
        amountVariation: parseEuroNumber(amountVar),
        variation: parseEuroNumber(variation),
      })
    } else if (isAssuranceVieFormat && cols.length >= 8) {
      // Assurance-vie format: [name, date, qty, buyPrice, lastPrice, amount, latentVar, variationPercent]
      const [name, , qty, buyPrice, lastPrice, amount, latentVar, variationPercent] = cols
      positions.push({
        name: name ?? '',
        isin: '', // No ISIN for assurance-vie
        quantity: parseEuroNumber(qty),
        buyingPrice: parseEuroNumber(buyPrice),
        lastPrice: parseEuroNumber(lastPrice),
        intradayVariation: parseEuroNumber(latentVar),
        currentValue: parseEuroNumber(amount),
        amountVariation: parseEuroNumber(latentVar),
        variation: parseEuroNumber(variationPercent),
      })
    }
  }
  return positions
}

const parseInvestmentOperationsCsv = (csvText: string): InvestmentOperation[] => {
  const stripped = csvText.replace(/^\uFEFF/, '')
  const lines = stripped.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return []

  const ops: InvestmentOperation[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line?.trim()) continue
    const cols = line.split(';').map((c) => c.replace(/^"(.*)"$/, '$1').trim())
    // dateOp;dateVal;label;category;categoryParent;supplierFound;amount;comment;accountNum;accountLabel;accountbalance
    if (cols.length < 7) continue
    const [dateOp, , label, , , , amount, , , accountLabel, balance] = cols
    if (!dateOp) continue
    ops.push({
      date: dateOp,
      label: label ?? '',
      amount: parseEuroNumber(amount),
      balance: balance ? parseEuroNumber(balance) : null,
      accountLabel: accountLabel ?? '',
    })
  }
  return ops
}

const serializeAccount = (
  account: StoredAccount,
  summaryOverride?: ReturnType<typeof summarizeAccount>,
) => {
  const summary = summaryOverride ?? summarizeAccount(account)

  return {
    ...summary,
    id: account.id,
    name: account.name,
    productType: account.productType,
    institution: account.institution,
    manualBalance: account.manualBalance,
    cryptoHolding: account.cryptoHolding,
    notes: account.notes,
    kind: account.kind,
    isEligibleEmergencyFund: account.isEligibleEmergencyFund,
    csvImports: account.csvImports.map((imp) => ({
      id: imp.id,
      fileName: imp.fileName,
      uploadedAt: imp.uploadedAt,
      periodStartDate: imp.periodStartDate,
      periodEndDate: imp.periodEndDate,
      isActive: imp.isActive,
      importKind: detectAccountImportKind(imp.csvText),
    })),
  }
}

const getOperationsPeriod = (ops: InvestmentOperation[]): { start?: string; end?: string } => {
  if (ops.length === 0) return {}
  const dates = ops.map((o) => o.date).sort()
  return { start: dates[0], end: dates[dates.length - 1] }
}

const buildInvestmentSummaryForImport = (imp: StoredInvestmentImport): InvestmentImportSummary => {
  if (imp.csvType === 'positions') {
    const positions = parsePositionsCsv(imp.csvText)
    const totalCurrentValue = positions.reduce((s, p) => s + p.currentValue, 0)
    const totalInvested = positions.reduce((s, p) => s + p.quantity * p.buyingPrice, 0)
    const totalGain = totalCurrentValue - totalInvested
    const performancePercent = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0
    return {
      id: imp.id,
      fileName: imp.fileName,
      uploadedAt: imp.uploadedAt,
      accountLabel: imp.accountLabel,
      csvType: imp.csvType,
      periodStartDate: imp.periodStartDate,
      periodEndDate: imp.periodEndDate,
      isActive: imp.isActive,
      positions,
      totalCurrentValue,
      totalInvested,
      totalGain,
      performancePercent,
    }
  } else {
    const operations = parseInvestmentOperationsCsv(imp.csvText)
    const { start, end } = getOperationsPeriod(operations)
    // Latest balance = balance from the most recent operation (first after date sort desc)
    const sorted = [...operations].sort((a, b) => b.date.localeCompare(a.date))
    const latestBalance = sorted[0]?.balance ?? 0
    return {
      id: imp.id,
      fileName: imp.fileName,
      uploadedAt: imp.uploadedAt,
      accountLabel: imp.accountLabel,
      csvType: imp.csvType,
      periodStartDate: imp.periodStartDate ?? start,
      periodEndDate: imp.periodEndDate ?? end,
      isActive: imp.isActive,
      operations,
      totalCurrentValue: latestBalance,
      totalInvested: latestBalance,
      totalGain: 0,
      performancePercent: 0,
    }
  }
}

const buildInvestmentPortfolio = (state: StoredState): InvestmentPortfolio => {
  const active = state.investmentImports.filter((i) => i.isActive)
  const accounts = active.map(buildInvestmentSummaryForImport)
  const positionAccounts = accounts.filter((a) => a.csvType === 'positions')
  const totalCurrentValue = accounts.reduce((s, a) => s + (a.totalCurrentValue ?? 0), 0)
  const totalInvested = positionAccounts.reduce((s, a) => s + (a.totalInvested ?? 0), 0)
  const totalGain = positionAccounts.reduce((s, a) => s + (a.totalGain ?? 0), 0)
  const performancePercent = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0
  return { totalCurrentValue, totalInvested, totalGain, performancePercent, accounts }
}

// ─────────────────────────────────────────────────────────────────────────────

const app = express()
app.use(cors({ origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((origin) => origin.trim()) }))
app.use(express.json({ limit: '5mb' }))
app.use((request, _response, next) => {
  logger.info(`${request.method} ${request.path}`)
  next()
})

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' })
})

app.get('/api/state', async (_request, response) => {
  const state = readStore()
  const analysis = buildAnalysis(state)
  const patrimony = buildPatrimony(state, analysis)
  const suggestions = generateSuggestions(state, analysis, patrimony)
  const latestImport = state.imports.find((imp) => imp.isActive)
  const liveSnapshot = await getCachedLiveInvestmentSnapshot(state, '24h').catch(() => null)
  const liveAccountMap = liveSnapshot ? buildLiveAccountSummaryMap(liveSnapshot) : new Map()
  const accounts = state.accounts.map((account) => {
    const baseSummary = summarizeAccount(account)
    const liveSummary = liveAccountMap.get(account.id)

    if (!liveSummary) {
      return serializeAccount(account, baseSummary)
    }

    if (account.productType === 'crypto' || account.productType === 'pea' || account.productType === 'pea-pme' || account.productType === 'assurance-vie' || account.productType === 'cto') {
      return serializeAccount(account, {
        ...baseSummary,
        balance: liveSummary.balance,
        trendAmount: liveSummary.trendAmount,
        trendPercent: liveSummary.trendPercent,
        trendLabel: liveSummary.trendLabel,
        sourceLabel: liveSummary.sourceLabel,
      })
    }

    return serializeAccount(account, baseSummary)
  })

  // Save today's snapshot automatically
  const todayDate = new Date().toISOString().split('T')[0]
  saveDailySnapshot(todayDate, patrimony)
  const history = getDailySnapshots()

  response.json({
    hasImport: Boolean(latestImport),
    latestImport: latestImport
      ? {
          id: latestImport.id,
          fileName: latestImport.fileName,
          uploadedAt: latestImport.uploadedAt,
          csvText: latestImport.csvText,
          accountLabel: latestImport.accountLabel,
        }
      : null,
    imports: state.imports.map((imp) => ({
      id: imp.id,
      fileName: imp.fileName,
      uploadedAt: imp.uploadedAt,
      accountLabel: imp.accountLabel,
      isActive: imp.isActive,
    })),
    accounts,
    rules: state.rules,
    budgetOverrides: state.budgetOverrides,
    netWorthItems: state.netWorthItems,
    emergencyFundDesignated: state.emergencyFundDesignated,
    emergencyFundTargetMonths: state.emergencyFundTargetMonths,
    emergencyFundMonthlyExpenses: state.emergencyFundMonthlyExpenses,
    healthGoals: state.healthGoals,
    analysis,
    patrimony,
    suggestions,
    history,
  })
})

app.get('/api/imports', (_request, response) => {
  const state = readStore()
  response.json({
    imports: state.imports.map((imp) => ({
      id: imp.id,
      fileName: imp.fileName,
      uploadedAt: imp.uploadedAt,
      accountLabel: imp.accountLabel || 'Sans label',
      institution: imp.institution || 'Non spécifiée',
      isActive: imp.isActive,
    })),
  })
})

app.get('/api/markets/symbol-overrides', (_request, response) => {
  const state = readStore()
  const overrides = Object.entries(state.marketSymbolOverrides)
    .map(([key, value]) => ({ key, ...value }))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))

  response.json({ overrides })
})

app.put('/api/markets/symbol-overrides', (request, response) => {
  const body = request.body as { name?: string; symbol?: string }
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const symbol = typeof body.symbol === 'string' ? body.symbol.trim().toUpperCase() : ''

  if (!name || !symbol) {
    response.status(400).json({ error: 'name et symbol sont requis' })
    return
  }

  const key = normalizeYahooText(name)
  if (!key) {
    response.status(400).json({ error: 'Nom invalide' })
    return
  }

  const state = readStore()
  state.marketSymbolOverrides[key] = {
    name,
    symbol,
    updatedAt: new Date().toISOString(),
  }
  writeStore(state)
  liveInvestmentSnapshotCache.clear()

  response.json({
    key,
    ...state.marketSymbolOverrides[key],
  })
})

app.delete('/api/markets/symbol-overrides', (request, response) => {
  const key = typeof request.query.key === 'string' ? request.query.key.trim() : ''
  if (!key) {
    response.status(400).json({ error: 'key requis' })
    return
  }

  const state = readStore()
  if (!state.marketSymbolOverrides[key]) {
    response.status(404).json({ error: 'Override introuvable' })
    return
  }

  delete state.marketSymbolOverrides[key]
  writeStore(state)
  liveInvestmentSnapshotCache.clear()
  response.json({ ok: true })
})

app.patch('/api/imports/:id', (request, response) => {
  const { id } = request.params
  const body = request.body as { isActive?: boolean; accountLabel?: string }
  const state = readStore()

  const importToUpdate = state.imports.find((imp) => imp.id === id)
  if (!importToUpdate) {
    response.status(404).json({ error: 'Import non trouvé' })
    return
  }

  if (typeof body.isActive === 'boolean') {
    importToUpdate.isActive = body.isActive
  }
  if (body.accountLabel) {
    importToUpdate.accountLabel = body.accountLabel
  }

  writeStore(state)

  const analysis = buildAnalysis(state)
  const patrimony = buildPatrimony(state, analysis)

  response.json({
    import: importToUpdate,
    analysis,
    patrimony,
  })
})

app.post('/api/import', (request, response) => {
  const body = request.body as {
    fileName?: string
    csvText?: string
    accountLabel?: string
    institution?: string
  }

  if (!body.csvText) {
    response.status(400).json({ error: 'csvText requis' })
    return
  }

  try {
    parseBudgetCsv(body.csvText)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'CSV invalide'
    response.status(400).json({ error: message })
    return
  }

  const state = readStore()

  const nextImport: StoredImport = {
    id: createId(),
    fileName: body.fileName ?? 'import.csv',
    uploadedAt: new Date().toISOString(),
    csvText: body.csvText,
    accountLabel: body.accountLabel,
    institution: body.institution,
    isActive: true,
  }

  // Only keep last 30 imports
  state.imports = [nextImport, ...state.imports].slice(0, 30)
  writeStore(state)

  const analysis = buildAnalysis(state)
  const patrimony = buildPatrimony(state, analysis)
  const suggestions = generateSuggestions(state, analysis, patrimony)

  response.json({
    import: {
      id: nextImport.id,
      fileName: nextImport.fileName,
      uploadedAt: nextImport.uploadedAt,
    },
    analysis,
    patrimony,
    suggestions,
  })
})

app.put('/api/rules', (request, response) => {
  const body = request.body as { rules?: CategoryRule[] }
  const state = readStore()

  state.rules = body.rules ?? []
  writeStore(state)

  const analysis = buildAnalysis(state)
  const patrimony = buildPatrimony(state, analysis)

  response.json({
    rules: state.rules,
    analysis,
    patrimony,
  })
})

app.put('/api/budgets', (request, response) => {
  const body = request.body as { budgetOverrides?: BudgetOverrides }
  const state = readStore()

  state.budgetOverrides = body.budgetOverrides ?? {}
  writeStore(state)

  const analysis = buildAnalysis(state)
  const patrimony = buildPatrimony(state, analysis)

  response.json({
    budgetOverrides: state.budgetOverrides,
    analysis,
    patrimony,
  })
})

app.put('/api/networth-items', (request, response) => {
  const body = request.body as { netWorthItems?: StoredNetWorthItem[] }
  const state = readStore()

  state.netWorthItems = (body.netWorthItems ?? []).map((item) => ({
    ...item,
    id: item.id || createId(),
    productType: item.productType || 'other',
  }))

  writeStore(state)

  const analysis = buildAnalysis(state)
  const patrimony = buildPatrimony(state, analysis)
  const suggestions = generateSuggestions(state, analysis, patrimony)

  response.json({
    netWorthItems: state.netWorthItems,
    patrimony,
    suggestions,
  })
})

app.post('/api/wealth/sync', async (_request, response) => {
  const state = readStore()
  let modified = false

  for (const item of state.netWorthItems) {
    if (item.symbol && item.quantity) {
      try {
        const quote = (await yahooFinance.quote(item.symbol as string)) as any
        if (quote && quote.regularMarketPrice) {
          const currentPrice = quote.regularMarketPrice
          item.value = item.quantity * currentPrice
          modified = true
        }
      } catch (err) {
        console.error(`Failed to sync price for ${item.symbol}:`, err)
      }
    }
  }

  if (modified) {
    writeStore(state)
  }

  const analysis = buildAnalysis(state)
  const patrimony = buildPatrimony(state, analysis)
  const suggestions = generateSuggestions(state, analysis, patrimony)

  response.json({
    netWorthItems: state.netWorthItems,
    patrimony,
    suggestions,
  })
})

app.put('/api/emergency-fund', (request, response) => {
  const body = request.body as {
    targetMonths?: number
    monthlyExpenses?: number | null
    designated?: string[]
  }
  const state = readStore()

  if (typeof body.targetMonths === 'number') {
    state.emergencyFundTargetMonths = body.targetMonths
    state.healthGoals.targetEmergencyFundMonths = body.targetMonths
  }
  if (Array.isArray(body.designated)) {
    state.emergencyFundDesignated = body.designated
  }
  if (typeof body.monthlyExpenses === 'number') {
    state.emergencyFundMonthlyExpenses = body.monthlyExpenses > 0 ? body.monthlyExpenses : null
  }
  if (body.monthlyExpenses === null) {
    state.emergencyFundMonthlyExpenses = null
  }

  writeStore(state)

  const analysis = buildAnalysis(state)
  const patrimony = buildPatrimony(state, analysis)
  const suggestions = generateSuggestions(state, analysis, patrimony)

  response.json({
    emergencyFundTargetMonths: state.emergencyFundTargetMonths,
    emergencyFundMonthlyExpenses: state.emergencyFundMonthlyExpenses,
    emergencyFundDesignated: state.emergencyFundDesignated,
    healthGoals: state.healthGoals,
    patrimony,
    suggestions,
  })
})

app.get('/api/health-goals', (_request, response) => {
  const state = readStore()
  response.json(state.healthGoals)
})

app.put('/api/health-goals', (request, response) => {
  const body = request.body as Partial<HealthGoals>
  const state = readStore()

  state.healthGoals = sanitizeHealthGoals({
    ...state.healthGoals,
    ...body,
  })
  state.emergencyFundTargetMonths = state.healthGoals.targetEmergencyFundMonths

  writeStore(state)

  const analysis = buildAnalysis(state)
  const patrimony = buildPatrimony(state, analysis)
  const suggestions = generateSuggestions(state, analysis, patrimony)

  response.json({
    healthGoals: state.healthGoals,
    emergencyFundTargetMonths: state.emergencyFundTargetMonths,
    patrimony,
    suggestions,
  })
})

app.get('/api/patrimony/breakdown', (_request, response) => {
  const state = readStore()
  const analysis = buildAnalysis(state)
  const patrimony = buildPatrimony(state, analysis)

  response.json({
    patrimony,
    breakdown: {
      bankCash: patrimony.bankCash,
      externalAssets: patrimony.externalAssets,
      assetsByProductType: patrimony.assetsByProductType,
      debts: patrimony.debts,
      netWorth: patrimony.netWorth,
    },
  })
})

app.post('/api/ai/ask', async (request, response) => {
  const body = request.body as {
    query?: string
    monthKey?: string
    promptKey?: 'executive' | 'actions' | 'risks' | 'allocation'
  }

  if (!body.query) {
    response.status(400).json({ error: 'query requis' })
    return
  }

  const state = readStore()
  const analysis = buildAnalysis(state)
  const patrimony = buildPatrimony(state, analysis)

  const hasFinancialData =
    (analysis && analysis.months.length > 0) ||
    (patrimony && (patrimony.netWorth > 0 || patrimony.bankCash > 0 || patrimony.debts > 0 || patrimony.livretTotal > 0))

  if (!hasFinancialData) {
    response.status(400).json({ error: 'Pas de données financières disponibles' })
    return
  }

  const monthKey = body.monthKey || analysis?.months?.[0]?.key || ''

  const liveSnapshot = await getCachedLiveInvestmentSnapshot(state, '24h').catch(() => null)

  // Check if user is asking for an action plan
  const normalizedQuery = normalizeAssistantQuery(body.query)
  const isActionPlanRequested =
    normalizedQuery.includes('plan d action') ||
    normalizedQuery.includes('plan action') ||
    normalizedQuery.includes('plan 30') ||
    normalizedQuery.includes('plan d\'action') ||
    normalizedQuery.includes('actions') ||
    normalizedQuery.includes('prochaines etapes') ||
    normalizedQuery.includes('prochaines étapes')

  // Generate action plan if requested
  const actionPlan = isActionPlanRequested ? generateActionPlan(analysis, patrimony, state.healthGoals, liveSnapshot) : undefined

  if (isActionPlanRequested && actionPlan) {
    const byWeek = [1, 2, 3, 4]
      .map((week) => {
        const tasks = actionPlan.tasks.filter((task) => task.week === week)
        if (tasks.length === 0) return null
        return [
          `### Semaine ${week}`,
          ...tasks.map((task) => `- ${task.title} (priorite: ${task.priority}, echeance: ${task.targetDate})`),
        ].join('\n')
      })
      .filter(Boolean)
      .join('\n\n')

    response.json({
      mode: 'local',
      title: 'Plan d action 30 jours',
      answer: [
        `## Plan d action 30 jours`,
        actionPlan.summary,
        '',
        byWeek,
        '',
        `Impact financier estime: ${formatEuroShort(actionPlan.estimatedFinancialImpact)} / mois`,
      ].join('\n'),
      transactions: [],
      actionPlan,
    })
    return
  }

  try {
    const answer = await askRemoteAi(
      body.query,
      analysis,
      monthKey,
      patrimony,
      liveSnapshot ?? undefined,
      state.healthGoals,
    )
    const promptCard = buildPromptKeyFinancialCard(analysis, monthKey, patrimony, liveSnapshot, body.promptKey)
    const investmentLinesRequested =
      normalizedQuery.includes('pea') ||
      normalizedQuery.includes('assurance vie') ||
      normalizedQuery.includes('assurance-vie') ||
      normalizedQuery.includes('ligne')

    if (answer && !(investmentLinesRequested && isGenericInvestmentRemoteAnswer(answer))) {
      response.json({
        mode: 'remote',
        title: promptCard?.title ?? 'Assistant IA',
        answer: ensureAdvisorMarkdown(answer),
        transactions: [],
        actionPlan,
      })
    } else if (promptCard) {
      console.info('[AI] Falling back to local prompt card: empty remote answer')
      response.json({
        mode: 'local',
        title: promptCard.title,
        answer: promptCard.answer,
        transactions: promptCard.transactions,
        actionPlan,
      })
    } else {
      console.info('[AI] Falling back to local financial fallback: empty remote answer')
      const fallback = buildLocalFinancialFallback(body.query, analysis, monthKey, patrimony, liveSnapshot, body.promptKey)
      response.json({
        mode: 'local',
        title: fallback.title,
        answer: fallback.answer,
        transactions: fallback.transactions,
        actionPlan,
      })
    }
  } catch (err) {
    console.error('AI ask error:', err instanceof Error ? err.message : String(err))
    console.info('[AI] Falling back to local financial fallback: remote error')
    const fallback = buildLocalFinancialFallback(body.query, analysis, monthKey, patrimony, liveSnapshot, body.promptKey)
    response.json({
      mode: 'local',
      title: fallback.title,
      answer: fallback.answer,
      transactions: fallback.transactions,
      actionPlan,
    })
  }
})

app.post('/api/ai/suggest', (_request, response) => {
  const state = readStore()
  const analysis = buildAnalysis(state)
  const patrimony = buildPatrimony(state, analysis)
  const suggestions = generateSuggestions(state, analysis, patrimony)

  response.json({ suggestions })
})

app.post('/api/ai/actions/health-goals', (request, response) => {
  const body = request.body as {
    query?: string
    updates?: Partial<HealthGoals>
    dryRun?: boolean
  }

  const state = readStore()
  const dryRun = body.dryRun !== false
  const parsedFromQuery = body.query ? extractHealthGoalsUpdatesFromQuery(body.query) : {}
  const requestedUpdates = {
    ...parsedFromQuery,
    ...(body.updates ?? {}),
  }

  const updateEntries = Object.entries(requestedUpdates) as Array<[keyof HealthGoals, number | undefined]>
  if (updateEntries.length === 0) {
    response.json({
      kind: 'health-goals-update',
      dryRun,
      hasChanges: false,
      message: 'Aucune modification de paramètre détectée dans la demande.',
      changes: [],
    })
    return
  }

  const nextGoals = sanitizeHealthGoals({
    ...state.healthGoals,
    ...requestedUpdates,
  })

  const changes = (Object.keys(nextGoals) as Array<keyof HealthGoals>)
    .filter((field) => nextGoals[field] !== state.healthGoals[field])
    .map((field) => ({
      field,
      from: state.healthGoals[field],
      to: nextGoals[field],
    }))

  if (changes.length === 0) {
    response.json({
      kind: 'health-goals-update',
      dryRun,
      hasChanges: false,
      message: 'Les paramètres détectés sont déjà appliqués.',
      changes: [],
    })
    return
  }

  if (!dryRun) {
    state.healthGoals = nextGoals
    state.emergencyFundTargetMonths = nextGoals.targetEmergencyFundMonths
    writeStore(state)
    const analysis = buildAnalysis(state)
    const patrimony = buildPatrimony(state, analysis)
    const suggestions = generateSuggestions(state, analysis, patrimony)
    response.json({
      kind: 'health-goals-update',
      dryRun: false,
      hasChanges: true,
      message: 'Objectifs de santé financière mis à jour.',
      changes,
      healthGoals: state.healthGoals,
      suggestions,
    })
    return
  }

  response.json({
    kind: 'health-goals-update',
    dryRun: true,
    hasChanges: true,
    message: 'Modifications détectées. Confirmez pour appliquer.',
    changes,
    healthGoals: nextGoals,
  })
})

// ─── Investment imports routes ────────────────────────────────────────────────

app.get('/api/investment-imports', (_request, response) => {
  const state = readStore()
  response.json({
    imports: state.investmentImports.map((imp) => ({
      id: imp.id,
      fileName: imp.fileName,
      uploadedAt: imp.uploadedAt,
      accountLabel: imp.accountLabel,
      csvType: imp.csvType,
      periodStartDate: imp.periodStartDate,
      periodEndDate: imp.periodEndDate,
      isActive: imp.isActive,
    })),
    portfolio: buildInvestmentPortfolio(state),
  })
})

app.post('/api/investment-import', (request, response) => {
  const body = request.body as {
    fileName?: string
    csvText?: string
    accountLabel?: string
  }

  if (!body.csvText) {
    response.status(400).json({ error: 'csvText requis' })
    return
  }

  const csvType = detectInvestmentCsvType(body.csvText)
  let periodStartDate: string | undefined
  let periodEndDate: string | undefined

  if (csvType === 'operations') {
    const ops = parseInvestmentOperationsCsv(body.csvText)
    const { start, end } = getOperationsPeriod(ops)
    periodStartDate = start
    periodEndDate = end
  }

  const state = readStore()
  const nextImport: StoredInvestmentImport = {
    id: createId(),
    fileName: body.fileName ?? 'import.csv',
    uploadedAt: new Date().toISOString(),
    csvText: body.csvText,
    accountLabel: body.accountLabel ?? 'Investissement',
    csvType,
    periodStartDate,
    periodEndDate,
    isActive: true,
  }

  state.investmentImports = [nextImport, ...state.investmentImports].slice(0, 50)
  writeStore(state)

  response.json({
    import: {
      id: nextImport.id,
      fileName: nextImport.fileName,
      uploadedAt: nextImport.uploadedAt,
      csvType: nextImport.csvType,
      periodStartDate: nextImport.periodStartDate,
      periodEndDate: nextImport.periodEndDate,
    },
    portfolio: buildInvestmentPortfolio(state),
  })
})

app.delete('/api/investment-imports/:id', (request, response) => {
  const { id } = request.params
  const state = readStore()
  const before = state.investmentImports.length
  state.investmentImports = state.investmentImports.filter((imp) => imp.id !== id)
  if (state.investmentImports.length === before) {
    response.status(404).json({ error: 'Import non trouvé' })
    return
  }
  writeStore(state)
  response.json({ portfolio: buildInvestmentPortfolio(state) })
})

app.patch('/api/investment-imports/:id', (request, response) => {
  const { id } = request.params
  const body = request.body as { isActive?: boolean; accountLabel?: string }
  const state = readStore()

  const imp = state.investmentImports.find((i) => i.id === id)
  if (!imp) {
    response.status(404).json({ error: 'Import non trouvé' })
    return
  }

  if (typeof body.isActive === 'boolean') imp.isActive = body.isActive
  if (body.accountLabel) imp.accountLabel = body.accountLabel

  writeStore(state)
  response.json({ import: imp, portfolio: buildInvestmentPortfolio(state) })
})

// ─── Account CRUD routes ──────────────────────────────────────────────────────

// List all accounts with computed balances
app.get('/api/accounts', (_request, response) => {
  const state = readStore()
  const analysis = buildAnalysis(state)
  const patrimony = buildPatrimony(state, analysis)

  const accountsWithBalance = state.accounts.map((account) => serializeAccount(account))

  response.json({ accounts: accountsWithBalance, patrimony })
})

app.get('/api/markets/investments', async (request, response) => {
  response.setHeader('Cache-Control', 'no-store')

  const state = readStore()
  const period = parsePerformancePeriod(
    typeof request.query.period === 'string' ? request.query.period : undefined,
  )
  const freshParam = request.query.fresh
  const forceRefresh = freshParam === '1' || freshParam === 'true'

  const snapshot = await getCachedLiveInvestmentSnapshot(state, period, { forceRefresh })
  const analysis = buildAnalysis(state)
  const patrimony = buildPatrimony(state, analysis)

  persistDashboardHistoryPoint(state, patrimony, snapshot)
  writeStore(state)

  response.json({
    ...snapshot,
    history: getDashboardHistory(state, patrimony, snapshot),
    alerts: generateDashboardAlerts(state, patrimony, snapshot),
  })
})

// Create a new account
app.post('/api/accounts', (request, response) => {
  const body = request.body as {
    name?: string
    productType?: ProductType
    institution?: string
    manualBalance?: number
    cryptoHolding?: CryptoHolding
    notes?: string
    kind?: 'asset' | 'debt'
  }

  if (!body.name || !body.productType) {
    response.status(400).json({ error: 'name et productType requis' })
    return
  }

  if (body.productType === 'crypto') {
    const quantity = body.cryptoHolding?.quantity
    const averageBuyPrice = body.cryptoHolding?.averageBuyPrice
    const hasIdentifier = Boolean(body.cryptoHolding?.coinId || body.cryptoHolding?.symbol || body.cryptoHolding?.name)

    if (!hasIdentifier || !quantity || quantity <= 0 || averageBuyPrice === undefined || averageBuyPrice <= 0) {
      response.status(400).json({
        error: 'Pour un compte crypto, renseignez la crypto, la quantité et le prix d\'achat.',
      })
      return
    }
  }

  const state = readStore()
  const account: StoredAccount = {
    id: createId(),
    name: body.name,
    productType: body.productType,
    institution: body.institution,
    manualBalance: body.manualBalance,
    cryptoHolding: body.cryptoHolding,
    notes: body.notes,
    kind: body.kind ?? 'asset',
    isEligibleEmergencyFund: isLivretType(body.productType),
    csvImports: [],
  }

  state.accounts = [...state.accounts, account]
  writeStore(state)

  const analysis = buildAnalysis(state)
  const patrimony = buildPatrimony(state, analysis)

  response.json({ account, patrimony })
})

// Update account metadata
app.patch('/api/accounts/:id', (request, response) => {
  const { id } = request.params
  const body = request.body as {
    name?: string
    productType?: ProductType
    institution?: string
    manualBalance?: number
    cryptoHolding?: CryptoHolding
    notes?: string
    kind?: 'asset' | 'debt'
    isEligibleEmergencyFund?: boolean
  }
  const state = readStore()

  const account = state.accounts.find((a) => a.id === id)
  if (!account) {
    response.status(404).json({ error: 'Compte non trouvé' })
    return
  }

  if (body.name) account.name = body.name
  if (body.productType) account.productType = body.productType
  if (body.institution !== undefined) account.institution = body.institution
  if (body.manualBalance !== undefined) account.manualBalance = body.manualBalance
  if (body.cryptoHolding !== undefined) account.cryptoHolding = body.cryptoHolding
  if (body.notes !== undefined) account.notes = body.notes
  if (body.kind) account.kind = body.kind
  if (typeof body.isEligibleEmergencyFund === 'boolean') {
    account.isEligibleEmergencyFund = body.isEligibleEmergencyFund
  }

  writeStore(state)

  const analysis = buildAnalysis(state)
  const patrimony = buildPatrimony(state, analysis)

  response.json({ account, patrimony })
})

// Delete account
app.delete('/api/accounts/:id', (request, response) => {
  const { id } = request.params
  const state = readStore()
  const before = state.accounts.length
  state.accounts = state.accounts.filter((a) => a.id !== id)
  if (state.accounts.length === before) {
    response.status(404).json({ error: 'Compte non trouvé' })
    return
  }
  writeStore(state)
  const analysis = buildAnalysis(state)
  const patrimony = buildPatrimony(state, analysis)
  response.json({ patrimony })
})

// Add a CSV export to an account
app.post('/api/accounts/:id/imports', (request, response) => {
  const { id } = request.params
  const body = request.body as { fileName?: string; csvText?: string }
  const state = readStore()

  const account = state.accounts.find((a) => a.id === id)
  if (!account) {
    response.status(404).json({ error: 'Compte non trouvé' })
    return
  }

  if (!body.csvText) {
    response.status(400).json({ error: 'csvText requis' })
    return
  }

  const importKind = detectAccountImportKind(body.csvText)

  // Detect period from CSV
  const lines = body.csvText.replace(/^\uFEFF/, '').split('\n').filter((l) => l.trim())
  const normalizedHeaders = (lines[0] ?? '')
    .split(';')
    .map((header) => normalizeHeader(header))
  const dateColumnIndex =
    importKind === 'positions' && normalizedHeaders.includes('datedevaleur')
      ? normalizedHeaders.indexOf('datedevaleur')
      : 0
  const dates: string[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = (lines[i] ?? '').split(';').map((c) => c.replace(/^"(.*)"$/, '$1').trim())
    const d = parseDateToIso(cols[dateColumnIndex])
    if (d) dates.push(d)
  }
  dates.sort()

  const positionSnapshotDate = importKind === 'positions' ? new Date().toISOString().slice(0, 10) : undefined

  const imp: StoredImport = {
    id: createId(),
    fileName: body.fileName ?? 'import.csv',
    uploadedAt: new Date().toISOString(),
    csvText: body.csvText,
    accountLabel: account.name,
    periodStartDate: dates[0] ?? positionSnapshotDate,
    periodEndDate: dates[dates.length - 1] ?? positionSnapshotDate,
    isActive: true,
  }

  account.csvImports = [imp, ...account.csvImports].slice(0, 30)
  writeStore(state)

  const analysis = buildAnalysis(state)
  const patrimony = buildPatrimony(state, analysis)

  response.json({
    import: {
      id: imp.id,
      fileName: imp.fileName,
      uploadedAt: imp.uploadedAt,
      periodStartDate: imp.periodStartDate,
      periodEndDate: imp.periodEndDate,
      isActive: imp.isActive,
      importKind,
    },
    balance: getAccountBalance(account),
    patrimony,
  })
})

// Delete a CSV import from an account
app.delete('/api/accounts/:accountId/imports/:importId', (request, response) => {
  const { accountId, importId } = request.params
  const state = readStore()

  const account = state.accounts.find((a) => a.id === accountId)
  if (!account) {
    response.status(404).json({ error: 'Compte non trouvé' })
    return
  }

  const before = account.csvImports.length
  account.csvImports = account.csvImports.filter((imp) => imp.id !== importId)
  if (account.csvImports.length === before) {
    response.status(404).json({ error: 'Import non trouvé' })
    return
  }

  writeStore(state)

  const analysis = buildAnalysis(state)
  const patrimony = buildPatrimony(state, analysis)

  response.json({ balance: getAccountBalance(account), patrimony })
})

// Toggle an account import active/inactive
app.patch('/api/accounts/:accountId/imports/:importId', (request, response) => {
  const { accountId, importId } = request.params
  const body = request.body as { isActive?: boolean }
  const state = readStore()

  const account = state.accounts.find((a) => a.id === accountId)
  if (!account) {
    response.status(404).json({ error: 'Compte non trouvé' })
    return
  }

  const imp = account.csvImports.find((i) => i.id === importId)
  if (!imp) {
    response.status(404).json({ error: 'Import non trouvé' })
    return
  }

  if (typeof body.isActive === 'boolean') imp.isActive = body.isActive
  writeStore(state)

  const analysis = buildAnalysis(state)
  const patrimony = buildPatrimony(state, analysis)

  response.json({ balance: getAccountBalance(account), patrimony })
})

// Emergency fund target months update (GET for refresh too)
app.get('/api/emergency-fund', (_request, response) => {
  const state = readStore()
  const analysis = buildAnalysis(state)
  const patrimony = buildPatrimony(state, analysis)
  response.json({
    emergencyFundTargetMonths: state.emergencyFundTargetMonths,
    emergencyFundMonthlyExpenses: state.emergencyFundMonthlyExpenses,
    healthGoals: state.healthGoals,
    emergencyFund: patrimony.emergencyFund,
  })
})

// ─── Health Score ─────────────────────────────────────────────────────────────
app.get('/api/health-score', async (_request, response) => {
  const state = readStore()
  const analysis = buildAnalysis(state)
  const patrimony = buildPatrimony(state, analysis)
  const debts = getAllDebts()

  const LIVRET_TYPES = ['livret-a', 'livret-jeune', 'lep', 'ldds', 'livret-other']

  // 1. Liquidité — progress toward emergency fund target
  const efMonths = patrimony.emergencyFund.months
  const emergencyCoverageRatio = patrimony.emergencyFund.target > 0
    ? patrimony.emergencyFund.current / patrimony.emergencyFund.target
    : 0
  const liquidityScore = Math.max(0, Math.min(100, Math.round(emergencyCoverageRatio * 100)))

  const liquidityDetail = {
    kind: 'liquidity' as const,
    efCurrent: patrimony.emergencyFund.current,
    efTarget: patrimony.emergencyFund.target,
    efMonths: patrimony.emergencyFund.months,
    efTargetMonths: state.emergencyFundTargetMonths,
    livretDetails: patrimony.emergencyFund.livretDetails,
  }

  // 2. Diversification par type de placement (exposition)
  const placementTotals = new Map<string, number>()
  const addPlacement = (label: string, value: number) => {
    if (!Number.isFinite(value) || value <= 0) return
    placementTotals.set(label, (placementTotals.get(label) ?? 0) + value)
  }

  const bourseTotal =
    (patrimony.assetsByProductType['assurance-vie'] ?? 0) +
    (patrimony.assetsByProductType['pea'] ?? 0) +
    (patrimony.assetsByProductType['pea-pme'] ?? 0) +
    (patrimony.assetsByProductType['cto'] ?? 0)
  addPlacement('Bourse', bourseTotal)

  addPlacement('Crypto', patrimony.assetsByProductType.crypto ?? 0)

  const otherInvestments = Object.entries(patrimony.assetsByProductType)
    .filter(([key]) => !['assurance-vie', 'pea', 'pea-pme', 'cto', 'crypto'].includes(key) && !LIVRET_TYPES.includes(key))
    .reduce((sum, [, value]) => sum + value, 0)
  addPlacement('Autres placements', otherInvestments)

  const placementTotalValue = [...placementTotals.values()].reduce((sum, value) => sum + value, 0)
  const byPlacementType = placementTotalValue > 0
    ? [...placementTotals.entries()]
        .map(([label, value]) => ({ label, value, share: value / placementTotalValue }))
        .sort((left, right) => right.value - left.value)
    : []

  const largestPlacement = byPlacementType[0]
  const largestPlacementShare = largestPlacement?.share ?? 0
  const cryptoShareTotal =
    patrimony.totalAssets > 0
      ? (patrimony.assetsByProductType.crypto ?? 0) / patrimony.totalAssets
      : 0
  const maxCryptoShareTarget = state.healthGoals.maxCryptoShareTotal / 100
  const maxSinglePlacementTarget = state.healthGoals.maxSinglePositionShare / 100
  const placementDiversificationRawScore = placementTotalValue > 0
    ? Math.max(0, Math.min(100, Math.round(100 - Math.max(0, (largestPlacementShare - maxSinglePlacementTarget) * 140))))
    : 0

  const placementDiversificationDetail = {
    kind: 'placement-diversification' as const,
    byPlacementType,
    largestTypeLabel: largestPlacement?.label ?? 'N/A',
    largestTypeShare: largestPlacementShare,
  }

  // 3. Résilience — debt-to-asset ratio
  const allAssets = patrimony.bankCash + patrimony.livretTotal
    + Object.values(patrimony.assetsByProductType).reduce((s, v) => s + v, 0)
  const debtTotal = debts.reduce((s, d) => s + d.balance, 0)
  const totalDebtMonthlyPayment = debts.reduce((sum, debt) => sum + (debt.monthlyPayment ?? 0), 0)
  const debtToAsset = allAssets > 0 ? Math.min(1, debtTotal / allAssets) : 0
  const resilienceRawScore = Math.max(0, Math.min(100, 100 - debtToAsset * 80))
  const maxDebtRatioTarget = state.healthGoals.maxDebtToAssetRatio / 100
  const resilienceObjectiveAchievement = debtToAsset <= maxDebtRatioTarget || debtToAsset === 0
    ? 100
    : Math.max(0, Math.min(100, (maxDebtRatioTarget / debtToAsset) * 100))
  // Use configured monthly expenses for debt service ratio calculation
  const monthlyIncomeReference = state.emergencyFundMonthlyExpenses ?? 0
  const debtServiceToIncomeRatio = monthlyIncomeReference > 0 ? totalDebtMonthlyPayment / monthlyIncomeReference : 0
  const maxDebtServiceTarget = state.healthGoals.maxDebtServiceToIncomeRatio / 100
  const debtServiceObjectiveAchievement = totalDebtMonthlyPayment <= 0 || debtServiceToIncomeRatio <= maxDebtServiceTarget
    ? 100
    : Math.max(0, Math.min(100, (maxDebtServiceTarget / debtServiceToIncomeRatio) * 100))
  const resilienceAchievement = Math.round(
    resilienceObjectiveAchievement * 0.6 + debtServiceObjectiveAchievement * 0.4,
  )

  // 4. Diversification — use live snapshot to enrich each line with resolved symbols/metadata when possible
  let diversificationAnalysis: DiversificationAnalysis | null = null
  let analyzedPositionsCount = 0
  let marketPositionsForDetail: LiveInvestmentPosition[] = []
  try {
    const snapshot = await getCachedLiveInvestmentSnapshot(state, '24h')
    const marketPositions = snapshot.positions.filter((position) => position.productType !== 'crypto')
    marketPositionsForDetail = marketPositions
    analyzedPositionsCount = marketPositions.length

    if (marketPositions.length > 0) {
      const totalsByProductType = marketPositions.reduce<Record<string, number>>((accumulator, position) => {
        accumulator[position.productType] = (accumulator[position.productType] ?? 0) + position.currentValue
        return accumulator
      }, {})
      const totalCurrentValue = marketPositions.reduce((sum, position) => sum + position.currentValue, 0)
      diversificationAnalysis = buildDiversificationAnalysis(marketPositions, totalsByProductType, totalCurrentValue)
    } else {
      diversificationAnalysis = null
    }
  } catch {
    diversificationAnalysis = null
  }

  // Fallback: if no positions, use vehicle count score
  const investmentTypes = Object.keys(patrimony.assetsByProductType).filter((k) => !LIVRET_TYPES.includes(k))
  const finalDiversificationScore = diversificationAnalysis
    ? diversificationAnalysis.score
    : Math.min(100, investmentTypes.length * 22)

  const internalDiversificationTargetScore = 85

  const totalMarketValue = marketPositionsForDetail.reduce((sum, position) => sum + position.currentValue, 0)
  const enrichedSectorBuckets = await buildAutoSectorBuckets(marketPositionsForDetail, totalMarketValue)
  const effectiveGeoBuckets = diversificationAnalysis?.byGeography ?? []
  const effectiveSectorBuckets = enrichedSectorBuckets.length > 0 ? enrichedSectorBuckets : (diversificationAnalysis?.bySector ?? [])
  const geoCount = effectiveGeoBuckets.length
  const sectorCount = effectiveSectorBuckets.length
  const assetClassCount = byPlacementType.length
  const top3Share = diversificationAnalysis?.concentration.top3Share ?? 0

  const scoreTargetAchievement = internalDiversificationTargetScore <= 0
    ? 100
    : Math.max(0, Math.min(100, (finalDiversificationScore / internalDiversificationTargetScore) * 100))
  const geoTargetAchievement = Math.max(0, Math.min(100, (geoCount / state.healthGoals.minGeoBucketCount) * 100))
  const sectorTargetAchievement = Math.max(0, Math.min(100, (sectorCount / state.healthGoals.minSectorBucketCount) * 100))
  const assetClassTargetAchievement = Math.max(0, Math.min(100, (assetClassCount / state.healthGoals.minAssetClassCount) * 100))
  const top3Target = state.healthGoals.maxTop3PositionsShare / 100
  const top3TargetAchievement = top3Share <= top3Target || top3Share === 0
    ? 100
    : Math.max(0, Math.min(100, (top3Target / top3Share) * 100))
  const dominantPlacementAchievement = largestPlacementShare <= maxSinglePlacementTarget || largestPlacementShare === 0
    ? 100
    : Math.max(0, Math.min(100, (maxSinglePlacementTarget / largestPlacementShare) * 100))
  const cryptoTargetAchievement = placementTotalValue > 0
    ? (cryptoShareTotal <= maxCryptoShareTarget || cryptoShareTotal === 0
      ? 100
      : Math.max(0, Math.min(100, (maxCryptoShareTarget / cryptoShareTotal) * 100)))
    : 100

  const placementObjectiveAchievement = Math.round(
    cryptoTargetAchievement * 0.45 +
      dominantPlacementAchievement * 0.25 +
      assetClassTargetAchievement * 0.15 +
      top3TargetAchievement * 0.15,
  )

  const diversificationObjectiveAchievement = Math.round(
    geoTargetAchievement * 0.5 +
      sectorTargetAchievement * 0.5,
  )

  const diversificationDetail = {
    kind: 'diversification' as const,
    byGeography: effectiveGeoBuckets,
    bySector: effectiveSectorBuckets,
    score: finalDiversificationScore,
    level: diversificationAnalysis?.level ?? 'weak',
    concentration: diversificationAnalysis?.concentration ?? {
      largestPositionShare: 0,
      top3Share: 0,
    },
  }

  const axes = [
    {
      key: 'liquidity',
      label: 'Liquidité',
      score: patrimony.emergencyFund.target > 0
        ? Math.max(0, Math.min(100, Math.round((patrimony.emergencyFund.current / patrimony.emergencyFund.target) * 100)))
        : 100,
      rawScore: Math.round(liquidityScore),
      targetScore: 100,
      objectiveLabel: `${state.healthGoals.targetEmergencyFundMonths} mois d épargne de précaution`,
      objectiveMetric: `${efMonths.toFixed(1)} mois couverts`,
      objectiveBreakdown: [
        {
          label: 'Couverture de liquidité',
          target: `${state.healthGoals.targetEmergencyFundMonths.toFixed(0)} mois`,
          current: `${efMonths.toFixed(1)} mois`,
          achievement: patrimony.emergencyFund.target > 0
            ? Math.max(0, Math.min(100, (patrimony.emergencyFund.current / patrimony.emergencyFund.target) * 100))
            : 100,
        },
      ],
      description: `${(emergencyCoverageRatio * 100).toFixed(0)}% de l'objectif de réserve`,
      detail: liquidityDetail,
    },
    {
      key: 'placement-diversification',
      label: 'Types de placement',
      score: Math.round(placementObjectiveAchievement),
      rawScore: Math.round(placementDiversificationRawScore),
      targetScore: 100,
      objectiveLabel: `Cibles: crypto <= ${state.healthGoals.maxCryptoShareTotal.toFixed(0)}%, type dominant <= ${state.healthGoals.maxSinglePositionShare.toFixed(0)}%, top3 <= ${state.healthGoals.maxTop3PositionsShare.toFixed(0)}%, classes >= ${state.healthGoals.minAssetClassCount}`,
      objectiveMetric: `Actuel: crypto ${(cryptoShareTotal * 100).toFixed(1)}%, type dominant ${(largestPlacementShare * 100).toFixed(1)}%, top3 ${(top3Share * 100).toFixed(1)}%, classes ${assetClassCount}`,
      objectiveBreakdown: [
        {
          label: 'Poids crypto dans le patrimoine',
          target: `<= ${state.healthGoals.maxCryptoShareTotal.toFixed(0)}%`,
          current: `${(cryptoShareTotal * 100).toFixed(1)}%`,
          achievement: cryptoTargetAchievement,
        },
        {
          label: 'Concentration du type dominant',
          target: `<= ${(maxSinglePlacementTarget * 100).toFixed(0)}%`,
          current: `${(largestPlacementShare * 100).toFixed(1)}%`,
          achievement: dominantPlacementAchievement,
        },
        {
          label: 'Concentration top 3',
          target: `<= ${(top3Target * 100).toFixed(0)}%`,
          current: `${(top3Share * 100).toFixed(1)}%`,
          achievement: top3TargetAchievement,
        },
        {
          label: 'Nombre de classes d actifs',
          target: `>= ${state.healthGoals.minAssetClassCount}`,
          current: `${assetClassCount}`,
          achievement: assetClassTargetAchievement,
        },
      ],
      description: largestPlacement
        ? `${largestPlacement.label} ${(largestPlacement.share * 100).toFixed(1)}% des placements · crypto ${(cryptoShareTotal * 100).toFixed(1)}% du patrimoine`
        : 'Aucune exposition détectée',
      detail: placementDiversificationDetail,
    },
    {
      key: 'resilience',
      label: 'Résilience',
      score: Math.round(resilienceAchievement),
      rawScore: Math.round(resilienceRawScore),
      targetScore: 100,
      objectiveLabel: `Cibles: dette/actifs <= ${state.healthGoals.maxDebtToAssetRatio.toFixed(0)}%, mensualités/dépenses configurées <= ${state.healthGoals.maxDebtServiceToIncomeRatio.toFixed(0)}%`,
      objectiveMetric: `Actuel: dette/actifs ${(debtToAsset * 100).toFixed(1)}%, mensualités/dépenses configurées ${monthlyIncomeReference > 0 ? debtServiceToIncomeRatio > 1 ? ">100%" : (debtServiceToIncomeRatio * 100).toFixed(1) : "Dépenses mensuelles non configurées"}${monthlyIncomeReference > 0 ? "%" : ""}`,
      objectiveBreakdown: [
        {
          label: 'Ratio dette / actifs',
          target: `<= ${state.healthGoals.maxDebtToAssetRatio.toFixed(0)}%`,
          current: `${(debtToAsset * 100).toFixed(1)}%`,
          achievement: resilienceObjectiveAchievement,
        },
        {
          label: 'Mensualités dettes / dépenses configurées',
          target: `<= ${state.healthGoals.maxDebtServiceToIncomeRatio.toFixed(0)}%`,
          current: monthlyIncomeReference > 0 ? debtServiceToIncomeRatio > 1 ? '>100%' : `${(debtServiceToIncomeRatio * 100).toFixed(1)}%` : 'Dépenses mensuelles non configurées',
          achievement: debtServiceObjectiveAchievement,
        },
      ],
      description: `Endettement ${(debtToAsset * 100).toFixed(0)} % des actifs`,
    },
    {
      key: 'diversification',
      label: 'Diversification',
      score: Math.round(diversificationObjectiveAchievement),
      rawScore: Math.round(finalDiversificationScore),
      targetScore: 100,
      objectiveLabel: `Cibles: géographie >= ${state.healthGoals.minGeoBucketCount} zones, secteurs >= ${state.healthGoals.minSectorBucketCount}`,
      objectiveMetric: `Actuel: géographie ${geoCount} zones, secteurs ${sectorCount}`,
      objectiveBreakdown: [
        {
          label: 'Diversification géographique',
          target: `>= ${state.healthGoals.minGeoBucketCount}`,
          current: `${geoCount}`,
          achievement: geoTargetAchievement,
        },
        {
          label: 'Diversification sectorielle',
          target: `>= ${state.healthGoals.minSectorBucketCount}`,
          current: `${sectorCount}`,
          achievement: sectorTargetAchievement,
        },
      ],
      description: analyzedPositionsCount > 0 ? `${analyzedPositionsCount} ligne(s) analysée(s) pour mesurer la diversification réelle` : `${investmentTypes.length} type(s) de placement investis`,
      detail: diversificationDetail,
    },
  ]

  const globalScore = Math.round(axes.reduce((s, a) => s + a.score, 0) / axes.length)
  response.json({ axes, globalScore })
})

// ─── Patrimony Timeline ───────────────────────────────────────────────────────
app.get('/api/timeline', (_request, response) => {
  const state = readStore()
  const snapshots = getDailySnapshots() as Array<{
    date: string
    net_worth: number
    cash: number
    investments: number
    debts: number
  }>
  const realEstate = getAllRealEstate()
  const vehicles = getAllVehicles()
  const debts = getAllDebts()
  const goals = getAllGoals()

  const fmt = (v: number) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)

  const events: Array<{
    id: string
    date: string
    type: string
    icon: string
    title: string
    amount?: number
    description?: string
  }> = []

  for (const re of realEstate) {
    events.push({
      id: `re-${re.id}`,
      date: re.purchaseDate,
      type: 'real_estate',
      icon: re.isRental ? '🏘️' : '🏠',
      title: `Acquisition : ${re.name}`,
      amount: re.purchasePrice,
      description: `Valeur estimée actuelle ${fmt(re.currentValue)}`,
    })
  }

  for (const v of vehicles) {
    events.push({
      id: `veh-${v.id}`,
      date: v.purchaseDate,
      type: 'vehicle',
      icon: '🚗',
      title: `Acquisition véhicule : ${v.name}`,
      amount: v.purchasePrice,
      description: `Valeur actuelle ${fmt(v.currentValue)}`,
    })
  }

  for (const d of debts) {
    events.push({
      id: `debt-${d.id}`,
      date: d.startDate,
      type: 'debt',
      icon: '🏦',
      title: `Emprunt souscrit : ${d.name}`,
      amount: d.originalAmount,
      description: `Taux ${d.interestRate} % · Mensualité ${fmt(d.monthlyPayment)}`,
    })
  }

  for (const g of goals.filter((goal) => goal.isCompleted)) {
    events.push({
      id: `goal-${g.id}`,
      date: g.targetDate,
      type: 'goal_completed',
      icon: g.icon ?? '✅',
      title: `Objectif atteint : ${g.name}`,
      amount: g.targetAmount,
      description: 'Félicitations !',
    })
  }

  for (const account of state.accounts) {
  const firstImport = account.csvImports?.[0]
  if (firstImport?.uploadedAt) {
    const balance = getAccountBalance(account) // computed balance

    events.push({
      id: `acc-${account.id}`,
      date: firstImport.uploadedAt.slice(0, 10),
      type: 'account',
      icon: '💼',
      title: `Compte suivi : ${account.name}`,
      amount: balance > 0 ? balance : undefined,
      description: account.institution ?? account.productType,
    })
  }
}

  // Net worth milestones — detect crossing 10k multiples
  if (snapshots.length > 1) {
    const milestones = new Set<number>()
    for (let i = 1; i < snapshots.length; i++) {
      const prev = snapshots[i - 1]
      const curr = snapshots[i]
      const lo = Math.min(prev.net_worth, curr.net_worth)
      const hi = Math.max(prev.net_worth, curr.net_worth)
      const step = 10000
      const firstM = Math.ceil(lo / step) * step
      for (let m = firstM; m <= hi; m += step) {
        if (m > 0 && !milestones.has(m)) {
          milestones.add(m)
          events.push({
            id: `nw-${m}`,
            date: curr.date,
            type: 'milestone',
            icon: '💎',
            title: `${(m / 1000).toFixed(0)} 000 € de patrimoine net`,
            description: 'Jalon patrimonial franchi',
          })
        }
      }
    }
  }

  events.sort((a, b) => b.date.localeCompare(a.date))
  response.json(events.slice(0, 60))
})

registerCrudRoutes(app)
app.use(notFoundHandler)
app.use(errorHandler)

// ─────────────────────────────────────────────────────────────────────────────

app.listen(API_PORT, () => {
  logger.info(`MyMoney API running on http://localhost:${API_PORT}`)
})
