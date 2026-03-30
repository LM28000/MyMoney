import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { BudgetAnalysis, Goal, RecurringExpense } from '../types'
import { formatCurrency, formatPercent } from '../lib/finance'
import type { ManualNetWorthItem } from '../types'
import { api } from '../lib/api'
import { CompactMetricCard, MetricCard, AlertCard, PanelHeader, StatRow } from './CardComponents'
import CashflowWidget from './CashflowWidget'
import NetWorthChart from './NetWorthChart'
import AssetAllocationWidget from './AssetAllocationWidget'
import HealthScoreWidget from './HealthScoreWidget'

export type CashflowProjection = {
  currentBalance: number
  pendingRecurringExpenses: number
  pendingRecurringList: RecurringExpense[]
  projectedEndBalance: number
}

export type PatrimonySummary = {
  bankCash: number
  externalAssets: Record<string, number>
  debts: number
  netWorth: number
  emergencyFund: {
    current: number
    target: number
    isHealthy: boolean
    months: number
    livretDetails: Array<{ name: string; balance: number }>
  }
  assetsByProductType: Record<string, number>
  livretTotal: number
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

type Suggestion = {
  id: string
  category: string
  priority: 'high' | 'medium' | 'low'
  title: string
  description: string
  actionableAdvice: string
}

type PerformancePeriod = '24h' | '7d' | '1m' | '1y' | 'all'

type LiveInvestmentPosition = {
  accountId: string
  accountName: string
  productType: string
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
  diversification: {
    score: number
    level: 'excellent' | 'good' | 'moderate' | 'weak'
    byAssetType: Array<{ label: string; value: number; share: number }>
    byGeography: Array<{ label: string; value: number; share: number }>
    bySector: Array<{ label: string; value: number; share: number }>
    concentration: {
      largestPositionShare: number
      top3Share: number
    }
    summary: string[]
  }
  history: DashboardHistoryPoint[]
  alerts: DashboardAlert[]
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

type AiBrief = {
  title: string
  content: string
  mode: 'remote' | 'local'
  promptKey: keyof typeof AI_PROMPTS
}

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  'livret-a': 'Livret A',
  'livret-jeune': 'Livret Jeune',
  lep: 'LEP',
  ldds: 'LDDS',
  'livret-other': 'Autres livrets',
  pea: 'PEA',
  'pea-pme': 'PEA-PME',
  'assurance-vie': 'Assurance vie',
  per: 'PER',
  cto: 'CTO',
  crypto: 'Crypto',
  'real-estate': 'Immobilier',
  other: 'Autres actifs',
}

const PERIOD_LABELS: Record<PerformancePeriod, string> = {
  '24h': '24h',
  '7d': '1s',
  '1m': '1m',
  '1y': '1an',
  all: 'depuis le début',
}

const LIVRET_TYPES = ['livret-a', 'livret-jeune', 'lep', 'ldds', 'livret-other']
const MARKET_REFRESH_INTERVAL_MS = 60 * 1000

const AI_PROMPTS = {
  executive:
    'Fais une synthèse exécutive premium de ma situation financière actuelle en 6 phrases maximum avec ton direct, décisions prioritaires et signaux à surveiller.',
  actions:
    'Donne-moi un plan d’action financier en 3 priorités maximum pour le mois en cours, avec des actions concrètes et chiffrées si possible.',
  risks:
    'Identifie les principaux risques ou déséquilibres de mon profil financier actuel et explique les corrections les plus efficaces.',
  allocation:
    'Propose une allocation patrimoniale cible simple et concrète à partir de ma situation actuelle, en distinguant trésorerie, épargne de précaution, investissements et points de rééquilibrage.',
} as const

const AI_BRIEF_KEYS = Object.keys(AI_PROMPTS) as Array<keyof typeof AI_PROMPTS>

const AI_BRIEF_META: Record<
  keyof typeof AI_PROMPTS,
  { label: string; title: string; description: string; icon: string; tone: string }
> = {
  executive: {
    label: 'Vue exécutive',
    title: 'Synthèse globale',
    description: 'Lecture rapide de la situation patrimoniale et budgétaire.',
    icon: '◉',
    tone: 'executive',
  },
  actions: {
    label: 'Plan prioritaire',
    title: 'Actions à mener',
    description: 'Décisions concrètes à prendre maintenant.',
    icon: '→',
    tone: 'actions',
  },
  risks: {
    label: 'Zone de vigilance',
    title: 'Risques et déséquilibres',
    description: 'Points de tension à surveiller et à corriger.',
    icon: '!',
    tone: 'risks',
  },
  allocation: {
    label: 'Allocation cible',
    title: 'Rééquilibrage recommandé',
    description: 'Vue d ensemble sur la structure patrimoniale à viser.',
    icon: '□',
    tone: 'allocation',
  },
}

const formatSignedCurrency = (value: number) => `${value >= 0 ? '+' : ''}${formatCurrency(value)}`

const formatSignedPercent = (value: number | null) => {
  if (value === null) return '—'
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`
}

const DIVERSIFICATION_LEVEL_LABEL: Record<'excellent' | 'good' | 'moderate' | 'weak', string> = {
  excellent: 'Excellent',
  good: 'Bonne',
  moderate: 'Moyenne',
  weak: 'Faible',
}

// Legacy SVG chart path builder removed

// Old HistoryChartCard removed in favor of Recharts

type Props = {
  patrimony: PatrimonySummary | null
  history: Array<{
    date: string
    net_worth: number
    cash: number
    investments: number
    debts: number
  }>
  netWorthItems: ManualNetWorthItem[]
  onAddAsset: (item: Partial<ManualNetWorthItem>) => void
  suggestions: Suggestion[]
  analysis: BudgetAnalysis | null
  backendStatus: 'connecting' | 'online' | 'offline'
  emergencyFundTargetMonths: number
  emergencyFundMonthlyExpenses: number | null
  onEmergencyFundSettingsChange: (targetMonths: number, monthlyExpenses: number | null) => Promise<boolean>
  onSuggestionsRefresh: (suggestions: Suggestion[]) => void
  onNavigate: (tab: 'patrimoine' | 'comptes' | 'budget' | 'objectifs' | 'simulateurs' | 'imports') => void
}

type DecisionAction = {
  id: string
  title: string
  description: string
  impact: string
  tone: 'high' | 'medium' | 'low'
  ctaLabel: string
  target: 'patrimoine' | 'comptes' | 'budget' | 'objectifs' | 'simulateurs' | 'imports'
}

const AI_BRIEF_CTA: Record<keyof typeof AI_PROMPTS, { label: string; target: DecisionAction['target'] }> = {
  executive: { label: 'Ouvrir la vue patrimoniale', target: 'patrimoine' },
  actions: { label: 'Corriger le budget', target: 'budget' },
  risks: { label: 'Inspecter les risques', target: 'comptes' },
  allocation: { label: 'Lancer un scénario', target: 'simulateurs' },
}

const daysUntil = (date: string) => {
  const now = new Date()
  const target = new Date(date)
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

export default function DashboardTab({
  patrimony,
  history,
  analysis,
  backendStatus,
  suggestions,
  emergencyFundTargetMonths,
  emergencyFundMonthlyExpenses,
  onEmergencyFundSettingsChange,
  onSuggestionsRefresh,
  onNavigate,
}: Props) {
  const [refreshing, setRefreshing] = useState(false)
  const [savingEmergency, setSavingEmergency] = useState(false)
  const [showEmergencySettings, setShowEmergencySettings] = useState(false)
  const [performancePeriod, setPerformancePeriod] = useState<PerformancePeriod>('all')
  const [liveInvestments, setLiveInvestments] = useState<LiveInvestmentSnapshot | null>(null)
  const [loadingLiveInvestments, setLoadingLiveInvestments] = useState(false)
  const [refreshingLiveInvestments, setRefreshingLiveInvestments] = useState(false)
  const [refreshingPositionKey, setRefreshingPositionKey] = useState<string | null>(null)
  const [liveInvestmentsError, setLiveInvestmentsError] = useState<string | null>(null)
  const hasLoadedLiveInvestmentsRef = useRef(false)
  const aiBriefMonthKeyRef = useRef<string | null>(null)
  const aiBriefInFlightRef = useRef(false)
  const [aiBriefs, setAiBriefs] = useState<Partial<Record<keyof typeof AI_PROMPTS, AiBrief>>>({})
  const [loadingAiBriefs, setLoadingAiBriefs] = useState<Record<keyof typeof AI_PROMPTS, boolean>>({
    executive: false,
    actions: false,
    risks: false,
    allocation: false,
  })
  const [aiBriefError, setAiBriefError] = useState<string | null>(null)
  const [aiBriefLastRefreshAt, setAiBriefLastRefreshAt] = useState<string | null>(null)
  const [targetMonthsInput, setTargetMonthsInput] = useState(String(emergencyFundTargetMonths))
  const [monthlyExpensesInput, setMonthlyExpensesInput] = useState(
    emergencyFundMonthlyExpenses !== null ? String(emergencyFundMonthlyExpenses) : '',
  )
  const [goals, setGoals] = useState<Goal[]>([])

  useEffect(() => {
    setTargetMonthsInput(String(emergencyFundTargetMonths))
    setMonthlyExpensesInput(
      emergencyFundMonthlyExpenses !== null ? String(emergencyFundMonthlyExpenses) : '',
    )
  }, [emergencyFundTargetMonths, emergencyFundMonthlyExpenses])

  useEffect(() => {
    if (backendStatus !== 'online') return

    let cancelled = false

    void api.get<Goal[]>('/goals')
      .then((payload) => {
        if (!cancelled) {
          setGoals(payload)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGoals([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [backendStatus])

  const hasPatrimony = Boolean(patrimony)

  const mergeLiveSnapshot = (
    previous: LiveInvestmentSnapshot | null,
    next: LiveInvestmentSnapshot,
  ): LiveInvestmentSnapshot => {
    if (!previous) return next

    const previousByKey = new Map(
      previous.positions.map((position) => [`${position.accountId}-${position.investmentName}`, position]),
    )

    const positions = next.positions.map((position) => {
      if (position.productType !== 'crypto' || position.source !== 'manual') return position
      const key = `${position.accountId}-${position.investmentName}`
      const previousPosition = previousByKey.get(key)
      if (!previousPosition || previousPosition.source !== 'live') return position
      return previousPosition
    })

    const totalsByProductType = positions.reduce<Record<string, number>>((accumulator, position) => {
      accumulator[position.productType] = (accumulator[position.productType] ?? 0) + position.currentValue
      return accumulator
    }, {})

    const totalCurrentValue = positions.reduce((sum, position) => sum + position.currentValue, 0)
    const periodChangeAmount = positions.reduce((sum, position) => sum + position.periodChangeAmount, 0)
    const referenceValue = totalCurrentValue - periodChangeAmount

    return {
      ...next,
      positions,
      totalsByProductType,
      totalCurrentValue,
      periodChangeAmount,
      periodChangePercent: referenceValue > 0 ? periodChangeAmount / referenceValue : null,
    }
  }

  const fetchAiBriefCard = async (promptKey: keyof typeof AI_PROMPTS) => {
    setLoadingAiBriefs((current) => ({ ...current, [promptKey]: true }))
    try {
      const monthKey = analysis?.months?.[0]?.key
      const payload = await api.post<{ title: string; answer: string; mode: 'remote' | 'local' }>(
        '/ai/ask',
        {
          query: AI_PROMPTS[promptKey],
          promptKey,
          monthKey,
        },
        { cache: 'no-store' },
      )
      setAiBriefs((current) => ({
        ...current,
        [promptKey]: {
          title: payload.title || AI_BRIEF_META[promptKey].title,
          content: payload.answer || 'Aucune analyse disponible.',
          mode: payload.mode,
          promptKey,
        },
      }))
      setAiBriefError(null)
      return true
    } catch {
      return false
    } finally {
      setLoadingAiBriefs((current) => ({ ...current, [promptKey]: false }))
    }
  }

  const handleGenerateAiBriefs = async (force = false) => {
    if (aiBriefInFlightRef.current) return

    const monthKey = analysis?.months?.[0]?.key ?? null
    const hasAllCards = AI_BRIEF_KEYS.every((key) => Boolean(aiBriefs[key]))
    if (!force && monthKey && aiBriefMonthKeyRef.current === monthKey && hasAllCards) {
      return
    }

    aiBriefInFlightRef.current = true
    setAiBriefError(null)

    try {
      const results = await Promise.all(AI_BRIEF_KEYS.map((promptKey) => fetchAiBriefCard(promptKey)))
      if (results.some((result) => !result)) {
        setAiBriefError('Impossible de générer toutes les cartes IA pour le moment.')
      } else {
        aiBriefMonthKeyRef.current = monthKey
        setAiBriefError(null)
      }
      setAiBriefLastRefreshAt(new Date().toISOString())
    } finally {
      aiBriefInFlightRef.current = false
    }
  }

  useEffect(() => {
    const currentMonthKey = analysis?.months?.[0]?.key
    if (!currentMonthKey || backendStatus !== 'online') return
    void handleGenerateAiBriefs(false)
  }, [analysis, backendStatus])

  useEffect(() => {
    if (!hasPatrimony || backendStatus !== 'online') {
      setLiveInvestments(null)
      setLiveInvestmentsError(null)
      hasLoadedLiveInvestmentsRef.current = false
      return
    }

    let cancelled = false

    const fetchLiveInvestments = async (mode: 'initial' | 'auto') => {
      if (mode === 'initial' && !hasLoadedLiveInvestmentsRef.current) {
        setLoadingLiveInvestments(true)
      }

      try {
        const payload = await api.get<LiveInvestmentSnapshot>('/markets/investments', {
          query: { period: performancePeriod },
          cache: 'no-store',
        })
        if (!cancelled) {
          setLiveInvestments((previous) => mergeLiveSnapshot(previous, payload))
          setLiveInvestmentsError(null)
          hasLoadedLiveInvestmentsRef.current = true
        }
      } catch {
        if (!cancelled && mode === 'initial') {
          setLiveInvestmentsError('Impossible de rafraîchir les cours pour le moment.')
        }
      } finally {
        if (!cancelled && mode === 'initial') {
          setLoadingLiveInvestments(false)
        }
      }
    }

    void fetchLiveInvestments('initial')

    const intervalId = window.setInterval(() => {
      void fetchLiveInvestments('auto')
    }, MARKET_REFRESH_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [hasPatrimony, backendStatus, performancePeriod])

  const handleManualLiveRefresh = async () => {
    if (!hasPatrimony || backendStatus !== 'online') return

    setRefreshingLiveInvestments(true)
    try {
      const payload = await api.get<LiveInvestmentSnapshot>('/markets/investments', {
        query: { period: performancePeriod, fresh: 1 },
        cache: 'no-store',
      })
      setLiveInvestments((previous) => mergeLiveSnapshot(previous, payload))
      setLiveInvestmentsError(null)
      hasLoadedLiveInvestmentsRef.current = true
    } catch {
      setLiveInvestmentsError('Impossible de rafraîchir les cours pour le moment.')
    } finally {
      setRefreshingLiveInvestments(false)
    }
  }

  const handleRefreshPosition = async (positionKey: string) => {
    if (!hasPatrimony || backendStatus !== 'online') return

    setRefreshingPositionKey(positionKey)
    try {
      const payload = await api.get<LiveInvestmentSnapshot>('/markets/investments', {
        query: { period: performancePeriod, fresh: 1 },
        cache: 'no-store',
      })
      setLiveInvestments((previous) => mergeLiveSnapshot(previous, payload))
      setLiveInvestmentsError(null)
      hasLoadedLiveInvestmentsRef.current = true
    } catch {
      setLiveInvestmentsError('Impossible de rafraîchir la ligne demandée pour le moment.')
    } finally {
      setRefreshingPositionKey(null)
    }
  }

  const handleRefreshAnalysis = async () => {
    setRefreshing(true)
    try {
      await handleGenerateAiBriefs()
      const data = await api.post<{ suggestions: Suggestion[] }>('/ai/suggest')
      onSuggestionsRefresh(data.suggestions)
    } catch {
      // silent fail
    } finally {
      setRefreshing(false)
    }
  }

  const handleSaveEmergencySettings = async () => {
    const targetMonths = Math.max(1, Math.round(Number(targetMonthsInput) || emergencyFundTargetMonths || 1))
    const monthlyRaw = Number(monthlyExpensesInput)
    const monthlyExpenses = monthlyExpensesInput.trim() === ''
      ? null
      : Number.isFinite(monthlyRaw) && monthlyRaw > 0
        ? monthlyRaw
        : null

    setSavingEmergency(true)
    try {
      await onEmergencyFundSettingsChange(targetMonths, monthlyExpenses)
    } finally {
      setSavingEmergency(false)
    }
  }

  if (!patrimony) {
    return (
      <div className="tab-content">
        <h2>📊 Tableau de Bord Patrimoine</h2>
        <p className="empty-state">Aucune donnée financière disponible. Commencez par importer un CSV.</p>
      </div>
    )
  }

  const mergedAssetsByProductType = {
    ...patrimony.assetsByProductType,
    ...(liveInvestments?.totalsByProductType ?? {}),
  }

  const currentMonthKey = analysis?.months?.[0]?.key
  const currentMonth = currentMonthKey ? analysis?.monthly[currentMonthKey] : null

  const investedAssets = Object.entries(mergedAssetsByProductType)
    .filter(([type]) => !LIVRET_TYPES.includes(type))
    .reduce((sum, [, value]) => sum + value, 0)

  const assetTotal = patrimony.bankCash + patrimony.livretTotal + investedAssets
  const allocationPercent = {
    cash: assetTotal > 0 ? patrimony.bankCash / assetTotal : 0,
    investments: assetTotal > 0 ? investedAssets / assetTotal : 0,
  }
  const emergencyProgress =
    patrimony.emergencyFund.target > 0
      ? Math.min(100, (patrimony.emergencyFund.current / patrimony.emergencyFund.target) * 100)
      : 0
  const emergencyMissing = Math.max(0, patrimony.emergencyFund.target - patrimony.emergencyFund.current)

  const investmentBreakdown = Object.entries(mergedAssetsByProductType)
    .filter(([type]) => !LIVRET_TYPES.includes(type))
    .sort((left, right) => right[1] - left[1])

  const fallbackPositions: LiveInvestmentPosition[] = patrimony.positionDetails.map((position, index) => ({
    accountId: `${position.accountName}-${index}`,
    accountName: position.accountName,
    productType: 'other',
    investmentName: position.investmentName,
    quantity: position.quantity,
    buyingPrice: 0,
    currentPrice: position.lastPrice,
    referencePrice: position.lastPrice,
    currentValue: position.currentValue,
    costBasis: 0,
    periodChangeAmount: 0,
    periodChangePercent: position.variation / 100,
    source: 'csv',
  }))

  const displayedPositions = liveInvestments?.positions.length ? liveInvestments.positions : fallbackPositions
  const liveInvestmentsFetchedAt = liveInvestments?.fetchedAt
  const lastHistoryPoint = history[history.length - 1]
  const baselineHistoryPoint = history[Math.max(0, history.length - 31)]
  const netWorthDelta = lastHistoryPoint && baselineHistoryPoint
    ? lastHistoryPoint.net_worth - baselineHistoryPoint.net_worth
    : 0
  const savingsRate = currentMonth && currentMonth.income > 0 ? currentMonth.net / currentMonth.income : null
  const activeGoals = goals.filter((goal) => !goal.isCompleted)
  const nearestGoals = [...activeGoals]
    .sort((left, right) => new Date(left.targetDate).getTime() - new Date(right.targetDate).getTime())
    .slice(0, 3)

  const decisionItems: DecisionAction[] = []

  if (currentMonth && currentMonth.budgetGap < 0) {
    decisionItems.push({
      id: 'budget-gap',
      title: 'Corriger la dérive du mois',
      description: `Les dépenses de ${currentMonth.label} dépassent la cible sur les enveloppes suivies.`,
      impact: `${formatCurrency(Math.abs(currentMonth.budgetGap))} à réabsorber pour revenir dans le cadre`,
      tone: 'high',
      ctaLabel: 'Ouvrir Flux & budget',
      target: 'budget',
    })
  }

  if (currentMonth && currentMonth.uncategorizedCount > 0) {
    decisionItems.push({
      id: 'uncategorized',
      title: 'Nettoyer les opérations non classées',
      description: `${currentMonth.uncategorizedCount} opération(s) restent ambiguës et brouillent la lecture du mois.`,
      impact: `${formatCurrency(currentMonth.uncategorizedAmount)} à fiabiliser avant arbitrage`,
      tone: 'medium',
      ctaLabel: 'Catégoriser maintenant',
      target: 'budget',
    })
  }

  if (emergencyMissing > 0) {
    decisionItems.push({
      id: 'emergency-fund',
      title: 'Compléter la réserve de sécurité',
      description: `Le coussin de sécurité ne couvre pas encore ${emergencyFundTargetMonths} mois de dépenses.`,
      impact: `${formatCurrency(emergencyMissing)} manquants pour atteindre la cible`,
      tone: patrimony.emergencyFund.months < 3 ? 'high' : 'medium',
      ctaLabel: 'Ajuster les comptes',
      target: 'comptes',
    })
  }

  if (liveInvestments?.alerts[0]) {
    decisionItems.push({
      id: 'investment-alert',
      title: liveInvestments.alerts[0].title,
      description: liveInvestments.alerts[0].description,
      impact: 'Un rééquilibrage ciblé peut réduire le risque global du portefeuille',
      tone: liveInvestments.alerts[0].severity,
      ctaLabel: 'Analyser les positions',
      target: 'comptes',
    })
  }

  suggestions
    .filter((suggestion) => suggestion.priority !== 'low')
    .slice(0, 2)
    .forEach((suggestion) => {
      decisionItems.push({
        id: suggestion.id,
        title: suggestion.title,
        description: suggestion.description,
        impact: suggestion.actionableAdvice,
        tone: suggestion.priority,
        ctaLabel: suggestion.category.toLowerCase().includes('objectif') ? 'Ouvrir les objectifs' : 'Traiter le sujet',
        target: suggestion.category.toLowerCase().includes('objectif') ? 'objectifs' : 'budget',
      })
    })

  if (nearestGoals[0]) {
    const nextGoal = nearestGoals[0]
    const remaining = Math.max(0, nextGoal.targetAmount - nextGoal.currentAmount)
    decisionItems.push({
      id: `goal-${nextGoal.id}`,
      title: `Sécuriser l'objectif ${nextGoal.name}`,
      description: `Le prochain jalon arrive dans ${Math.max(0, daysUntil(nextGoal.targetDate))} jours.`,
      impact: `${formatCurrency(remaining)} restent à financer`,
      tone: daysUntil(nextGoal.targetDate) <= 45 ? 'high' : 'low',
      ctaLabel: 'Revoir le plan',
      target: 'objectifs',
    })
  }

  const topDecisionItems = decisionItems.slice(0, 4)
  const pulseItems = [
    {
      label: 'Budget du mois',
      value: currentMonth
        ? currentMonth.budgetGap < 0
          ? `${formatCurrency(Math.abs(currentMonth.budgetGap))} au-dessus`
          : 'Dans la cible'
        : 'En attente',
      tone: currentMonth ? (currentMonth.budgetGap < 0 ? 'negative' : 'positive') : 'neutral',
    },
    {
      label: 'Réserve',
      value: `${patrimony.emergencyFund.months.toFixed(1)} / ${emergencyFundTargetMonths} mois`,
      tone: patrimony.emergencyFund.isHealthy ? 'positive' : 'negative',
    },
    {
      label: 'Allocation',
      value: liveInvestments?.diversification
        ? `${liveInvestments.diversification.score}/100 ${DIVERSIFICATION_LEVEL_LABEL[liveInvestments.diversification.level]}`
        : 'Analyse en attente',
      tone: liveInvestments?.diversification?.level === 'weak' ? 'negative' : 'neutral',
    },
    {
      label: 'Objectifs',
      value: activeGoals.length > 0 ? `${activeGoals.length} actifs` : 'Aucun objectif actif',
      tone: activeGoals.length > 0 ? 'positive' : 'neutral',
    },
  ]

  return (
    <div className="tab-content dashboard-tab">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h2 style={{ fontSize: '2rem', margin: '0 0 6px', fontWeight: 800 }}>Tableau de bord</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{ padding: '6px 14px', borderRadius: '20px', background: backendStatus === 'online' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${backendStatus === 'online' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, fontSize: '0.8rem', color: backendStatus === 'online' ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
            {backendStatus === 'online' ? '● IA & marchés actifs' : '● Backend indisponible'}
          </div>
          <button
            onClick={handleRefreshAnalysis}
            disabled={refreshing || backendStatus !== 'online'}
            style={{ padding: '10px 20px', background: 'linear-gradient(135deg,var(--accent-blue),var(--accent-copper))', border: 'none', borderRadius: '999px', color: '#fff', fontWeight: 600, cursor: 'pointer', opacity: refreshing || backendStatus !== 'online' ? 0.6 : 1, fontSize: '0.9rem' }}
          >
            {refreshing ? 'Actualisation…' : "Rafraîchir l'analyse"}
          </button>
        </div>
      </div>

      <div className="dashboard-command-grid">
        <section className="dashboard-command-card command-primary">
          <span className="panel-kicker">Situation</span>
          <h3>Votre poste de pilotage financier</h3>
          <div className="command-hero-value">{formatCurrency(assetTotal - patrimony.debts)}</div>
          <p className="command-hero-copy">
            {netWorthDelta >= 0 ? 'Progression' : 'Retrait'} de {formatSignedCurrency(netWorthDelta)} sur la période récente,
            avec {formatCurrency(investedAssets)} investis et {formatCurrency(patrimony.bankCash + patrimony.livretTotal)} mobilisables rapidement.
          </p>
          <div className="command-chip-row">
            <span className="command-chip">Épargne de précaution {patrimony.emergencyFund.months.toFixed(1)} mois</span>
            {savingsRate !== null && <span className="command-chip">Taux d'épargne {formatPercent(savingsRate)}</span>}
            <span className="command-chip">Dettes {formatCurrency(patrimony.debts)}</span>
          </div>
        </section>

        <section className="dashboard-command-card command-secondary">
          <span className="panel-kicker">Pulse</span>
          <h3>État du système</h3>
          <div className="system-pulse-list">
            {pulseItems.map((item) => (
              <div key={item.label} className="system-pulse-item">
                <div>
                  <span className="system-pulse-label">{item.label}</span>
                  <strong className={`system-pulse-value ${item.tone}`}>{item.value}</strong>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="dashboard-overview-grid">
        <MetricCard
          label="Patrimoine net"
          value={formatCurrency(assetTotal - patrimony.debts)}
          meta={`Actifs ${formatCurrency(assetTotal)} • Dettes ${formatCurrency(patrimony.debts)}`}
          className="networth-card"
          variant="primary"
        />
        <CompactMetricCard
          label="Cash utile"
          value={formatCurrency(patrimony.bankCash)}
          meta={formatPercent(allocationPercent.cash) + ' du total'}
        />
        <CompactMetricCard
          label="Livrets"
          value={formatCurrency(patrimony.livretTotal)}
          meta={formatPercent(assetTotal > 0 ? patrimony.livretTotal / assetTotal : 0) + ' du total'}
        />
        <CompactMetricCard
          label="Investissements"
          value={formatCurrency(investedAssets)}
          meta={
            liveInvestments
              ? `${formatSignedCurrency(liveInvestments.periodChangeAmount)} • ${PERIOD_LABELS[performancePeriod]}`
              : `${formatPercent(allocationPercent.investments)} du total`
          }
          variant="premium-accent"
        />
      </div>

      <section className="premium-panel decision-panel">
        <PanelHeader
          kicker="Decision Center"
          title="Ce qu'il faut traiter maintenant"
          description="Priorités générées à partir du budget, de la réserve, des objectifs et des signaux de marché."
        />
        <div className="decision-grid">
          {topDecisionItems.map((item) => (
            <article key={item.id} className={`decision-card decision-${item.tone}`}>
              <div className="decision-card-header">
                <span className="decision-impact-pill">{item.impact}</span>
              </div>
              <h4>{item.title}</h4>
              <p>{item.description}</p>
              <button type="button" className="decision-card-button" onClick={() => onNavigate(item.target)}>
                {item.ctaLabel}
              </button>
            </article>
          ))}
        </div>
      </section>

      <div className="dashboard-strategy-grid">
        <section className="premium-panel monthly-pulse-panel">
          <PanelHeader
            kicker="Trajectoire"
            title={currentMonth ? `Lecture rapide de ${currentMonth.label}` : 'Lecture mensuelle'}
            description="Une synthèse courte pour savoir si le mois est sous contrôle avant d'entrer dans le détail."
          />
          {currentMonth ? (
            <div className="monthly-pulse-grid">
              <div className="monthly-pulse-card">
                <span>Revenus</span>
                <strong>{formatCurrency(currentMonth.income)}</strong>
                <small>{currentMonth.allTransactions.filter((transaction) => transaction.direction === 'income').length} flux entrants</small>
              </div>
              <div className="monthly-pulse-card">
                <span>Dépenses</span>
                <strong>{formatCurrency(currentMonth.expenses)}</strong>
                <small>{currentMonth.allTransactions.filter((transaction) => transaction.direction === 'expense').length} flux sortants</small>
              </div>
              <div className="monthly-pulse-card">
                <span>Résultat</span>
                <strong className={currentMonth.net >= 0 ? 'positive' : 'negative'}>{formatSignedCurrency(currentMonth.net)}</strong>
                <small>{savingsRate !== null ? `Épargne ${formatPercent(savingsRate)}` : 'Sans référence de revenu'}</small>
              </div>
              <div className="monthly-pulse-card">
                <span>Points à traiter</span>
                <strong>{currentMonth.uncategorizedCount}</strong>
                <small>{currentMonth.anomalies.length} anomalie(s) détectée(s)</small>
              </div>
            </div>
          ) : (
            <p className="section-info">Importez un relevé pour activer la lecture mensuelle.</p>
          )}
        </section>

        <section className="premium-panel milestones-panel">
          <PanelHeader
            kicker="Plan"
            title="Jalons à venir"
            description="Les objectifs actifs et leur horizon pour garder la trajectoire visible."
          />
          {nearestGoals.length > 0 ? (
            <div className="milestone-list">
              {nearestGoals.map((goal) => {
                const progress = goal.targetAmount > 0 ? Math.min(100, (goal.currentAmount / goal.targetAmount) * 100) : 0
                return (
                  <div key={goal.id} className="milestone-item">
                    <div className="milestone-topline">
                      <div>
                        <span className="milestone-icon">{goal.icon}</span>
                        <strong>{goal.name}</strong>
                      </div>
                      <span className="milestone-deadline">J-{Math.max(0, daysUntil(goal.targetDate))}</span>
                    </div>
                    <div className="milestone-meta">
                      <span>{formatCurrency(goal.currentAmount)} / {formatCurrency(goal.targetAmount)}</span>
                      <span>{goal.monthlyContribution > 0 ? `${formatCurrency(goal.monthlyContribution)}/mois` : 'Sans contribution planifiée'}</span>
                    </div>
                    <div className="milestone-progress"><span style={{ width: `${progress}%`, background: goal.color }} /></div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="milestone-empty-state">
              <p>Aucun objectif actif. La vue Plan sera beaucoup plus utile dès que vous posez des jalons d'épargne.</p>
              <button type="button" className="btn-secondary" onClick={() => onNavigate('objectifs')}>Créer un objectif</button>
            </div>
          )}
        </section>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <AssetAllocationWidget 
          cash={patrimony.bankCash + patrimony.livretTotal} 
          investments={investedAssets - (mergedAssetsByProductType['crypto'] ?? 0) - (mergedAssetsByProductType['real-estate'] ?? 0)} 
          realEstate={mergedAssetsByProductType['real-estate'] ?? 0}
          crypto={mergedAssetsByProductType['crypto'] ?? 0}
        />
        <NetWorthChart data={history} />
      </div>

      <HealthScoreWidget backendStatus={backendStatus} />

      <CashflowWidget cashflow={patrimony.cashflow} />

      <div className="premium-grid premium-grid-main">
        <div className="section premium-panel ai-brief-panel">
          <div className="section-header-row premium-panel-header">
            <div>
              <span className="panel-kicker">Copilot Brief</span>
              <h3>Analyse IA par angle</h3>
              <p className="section-info">Chaque carte est générée séparément pour donner une vision globale en un seul regard.</p>
            </div>
            <div className="ai-actions-row">
              <button
                className="btn-secondary"
                onClick={() => void handleGenerateAiBriefs(true)}
                disabled={AI_BRIEF_KEYS.some((key) => loadingAiBriefs[key])}
                type="button"
              >
                {AI_BRIEF_KEYS.some((key) => loadingAiBriefs[key]) ? 'Génération…' : 'Régénérer les cartes'}
              </button>
              {aiBriefLastRefreshAt && (
                <span className="market-updated-at">
                  Dernière régénération à {new Date(aiBriefLastRefreshAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
            </div>
          </div>
          <div className="ai-brief-grid">
            {AI_BRIEF_KEYS.map((promptKey) => {
              const card = aiBriefs[promptKey]
              const meta = AI_BRIEF_META[promptKey]

              return (
                <div key={promptKey} className={`ai-brief-card ai-brief-card-${meta.tone}`}>
                  <div className="ai-brief-card-header">
                    <div>
                      <span className="panel-kicker ai-brief-kicker">
                        <span className="ai-brief-icon" aria-hidden="true">{meta.icon}</span>
                        {meta.label}
                      </span>
                      <h4>{card?.title ?? meta.title}</h4>
                      <p>{meta.description}</p>
                    </div>
                    {card?.mode && <span className={`ai-mode-pill ${card.mode}`}>{card.mode === 'remote' ? 'IA distante' : 'Analyse locale'}</span>}
                  </div>
                  {loadingAiBriefs[promptKey] ? (
                    <p className="ai-brief-loading">Génération de la carte…</p>
                  ) : card?.content ? (
                    <div className="ai-brief-markdown">
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p className="ai-markdown-p">{children}</p>,
                          strong: ({ children }) => <strong className="ai-markdown-strong">{children}</strong>,
                          em: ({ children }) => <em className="ai-markdown-em">{children}</em>,
                          ul: ({ children }) => <ul className="ai-markdown-list">{children}</ul>,
                          ol: ({ children }) => <ol className="ai-markdown-ol">{children}</ol>,
                          li: ({ children }) => <li className="ai-markdown-li">{children}</li>,
                          h1: ({ children }) => <h4 className="ai-markdown-h">{children}</h4>,
                          h2: ({ children }) => <h4 className="ai-markdown-h">{children}</h4>,
                          h3: ({ children }) => <h4 className="ai-markdown-h">{children}</h4>,
                          h4: ({ children }) => <h5 className="ai-markdown-h">{children}</h5>,
                          code: ({ children }) => <code className="ai-markdown-code">{children}</code>,
                          blockquote: ({ children }) => <blockquote className="ai-markdown-blockquote">{children}</blockquote>,
                        }}
                      >
                        {card.content}
                      </ReactMarkdown>
                      <div className="ai-brief-footer">
                        <button
                          type="button"
                          className="btn-secondary ai-brief-button"
                          onClick={() => onNavigate(AI_BRIEF_CTA[promptKey].target)}
                        >
                          {AI_BRIEF_CTA[promptKey].label}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="ai-brief-placeholder">Carte en attente de génération.</p>
                  )}
                </div>
              )
            })}
          </div>
          {aiBriefError && <p className="market-error ai-brief-error">{aiBriefError}</p>}
        </div>

        <div className="section premium-panel pilot-panel">
          <div className="section-header-row premium-panel-header">
            <div>
              <span className="panel-kicker">Pilotage</span>
              <h3>Réserve de sécurité</h3>
            </div>
            <button
              className="section-toggle"
              onClick={() => setShowEmergencySettings((value) => !value)}
              type="button"
            >
              {showEmergencySettings ? 'Masquer les paramètres' : 'Afficher les paramètres'}
            </button>
          </div>

          {showEmergencySettings && (
            <div className="emergency-controls">
            <div className="emergency-control-field">
              <label>Dépense mensuelle de référence (€)</label>
              <input
                type="number"
                min={0}
                step="10"
                value={monthlyExpensesInput}
                placeholder="Laisser vide pour calcul auto"
                onChange={(e) => setMonthlyExpensesInput(e.target.value)}
              />
            </div>
            <div className="emergency-control-field">
              <label>Mois d'avance souhaités</label>
              <input
                type="number"
                min={1}
                step="1"
                value={targetMonthsInput}
                onChange={(e) => setTargetMonthsInput(e.target.value)}
              />
            </div>
            <button
              className="btn-primary"
              onClick={handleSaveEmergencySettings}
              disabled={backendStatus !== 'online' || savingEmergency}
            >
              {savingEmergency ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            </div>
          )}

          <div className="emergency-fund-widget premium-widget">
          <div className="ef-header">
            <div className="ef-amounts">
              <span className="ef-current">{formatCurrency(patrimony.emergencyFund.current)}</span>
              <span className="ef-sep"> / </span>
              <span className="ef-target">{formatCurrency(patrimony.emergencyFund.target)}</span>
              <span className="ef-badge-inline">
                {patrimony.emergencyFund.isHealthy ? (
                  <span className="ef-badge healthy">✅ {patrimony.emergencyFund.months.toFixed(1)} mois</span>
                ) : (
                  <span className="ef-badge warning">⚠️ {patrimony.emergencyFund.months.toFixed(1)} mois</span>
                )}
              </span>
            </div>
            <div className="ef-meta">
              Objectif : {emergencyFundTargetMonths} mois de dépenses
              {emergencyMissing > 0 ? ` • manque ${formatCurrency(emergencyMissing)}` : ' • objectif atteint'}
            </div>
          </div>
          <div className="ef-progress-bar">
            <div
              className={`ef-progress-fill ${patrimony.emergencyFund.isHealthy ? 'healthy' : 'warning'}`}
              style={{ width: `${emergencyProgress}%` }}
            />
          </div>
          <div className="ef-progress-meta">
            <span>{emergencyProgress.toFixed(0)}% de l'objectif</span>
            <span>{formatCurrency(patrimony.emergencyFund.target)}</span>
          </div>
          {patrimony.emergencyFund.livretDetails.length > 0 ? (
            <div className="ef-livret-list">
              {patrimony.emergencyFund.livretDetails.map((livret) => (
                <div key={livret.name} className="ef-livret-row">
                  <span className="ef-livret-name">💚 {livret.name}</span>
                  <span className="ef-livret-balance">{formatCurrency(livret.balance)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="ef-empty">Aucun livret configuré. Ajoutez des comptes de type livret dans l'onglet Comptes.</p>
          )}
          </div>

          {liveInvestments?.alerts.length ? (
            <div className="investment-alerts compact-alerts">
              {liveInvestments.alerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  severity={alert.severity}
                  title={alert.title}
                  description={alert.description}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {(investmentBreakdown.length > 0 || displayedPositions.length > 0) && (
        <div className="section premium-panel investments-panel">
          <div className="section-header-row investments-header-row premium-panel-header">
            <div>
              <span className="panel-kicker">Investment Studio</span>
              <h3>Détail des investissements</h3>
              <p className="section-info">
                Cours temps réel pour PEA, assurance vie et crypto avec repli sur les dernières données connues.
              </p>
            </div>
            <div className="investments-toolbar">
              <label className="period-select-label">
                Période de plus-value
                <select
                  value={performancePeriod}
                  onChange={(e) => setPerformancePeriod(e.target.value as PerformancePeriod)}
                >
                  <option value="24h">24h</option>
                  <option value="7d">1s</option>
                  <option value="1m">1m</option>
                  <option value="1y">1an</option>
                  <option value="all">Depuis le début</option>
                </select>
              </label>
              <button
                className="btn-secondary btn-inline-refresh"
                onClick={() => void handleManualLiveRefresh()}
                disabled={backendStatus !== 'online' || refreshingLiveInvestments}
                type="button"
              >
                {refreshingLiveInvestments ? 'Actualisation…' : 'Rafraîchir les cours'}
              </button>
              {loadingLiveInvestments && <span className="market-loading">Actualisation…</span>}
              {liveInvestmentsFetchedAt && (
                <span className="market-updated-at">
                  Mis à jour à {new Date(liveInvestmentsFetchedAt!).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              {liveInvestmentsError && <span className="market-error">{liveInvestmentsError}</span>}
            </div>
          </div>

          <div className="investment-overview-card">
            <div className="investment-overview-main">
              <span className="investment-overview-label">Valorisation totale</span>
              <strong>{formatCurrency(liveInvestments?.totalCurrentValue ?? investedAssets)}</strong>
            </div>
            <div className="investment-overview-side">
              <span className="investment-overview-label">Variation {PERIOD_LABELS[performancePeriod]}</span>
              <strong className={(liveInvestments?.periodChangeAmount ?? 0) >= 0 ? 'positive' : 'negative'}>
                {formatSignedCurrency(liveInvestments?.periodChangeAmount ?? 0)}
              </strong>
              <span className="investment-overview-meta">
                {formatSignedPercent(liveInvestments?.periodChangePercent ?? null)}
              </span>
            </div>
          </div>

          {liveInvestments && liveInvestments.diversification && (
            <div className="diversification-card">
              <div className="diversification-header">
                <div>
                  <span className="investment-overview-label">Score de diversification</span>
                  <strong className={`diversification-score ${liveInvestments.diversification.level}`}>
                    {liveInvestments.diversification.score}/100
                  </strong>
                  <span className="diversification-level">
                    {DIVERSIFICATION_LEVEL_LABEL[liveInvestments.diversification.level]}
                  </span>
                </div>
                <div className="diversification-concentration">
                  <span>Plus grosse ligne: {(liveInvestments.diversification.concentration.largestPositionShare * 100).toFixed(1)}%</span>
                  <span>Top 3 lignes: {(liveInvestments.diversification.concentration.top3Share * 100).toFixed(1)}%</span>
                </div>
              </div>

              <div className="diversification-grid">
                <div className="diversification-block">
                  <h4>Type d’actif</h4>
                  {liveInvestments.diversification.byAssetType.slice(0, 4).map((bucket) => (
                    <div key={`asset-${bucket.label}`} className="diversification-row">
                      <span>{bucket.label}</span>
                      <strong>{(bucket.share * 100).toFixed(1)}%</strong>
                    </div>
                  ))}
                </div>
                <div className="diversification-block">
                  <h4>Géographie</h4>
                  {liveInvestments.diversification.byGeography.slice(0, 4).map((bucket) => (
                    <div key={`geo-${bucket.label}`} className="diversification-row">
                      <span>{bucket.label}</span>
                      <strong>{(bucket.share * 100).toFixed(1)}%</strong>
                    </div>
                  ))}
                </div>
                <div className="diversification-block">
                  <h4>Secteur</h4>
                  {liveInvestments.diversification.bySector.slice(0, 4).map((bucket) => (
                    <div key={`sector-${bucket.label}`} className="diversification-row">
                      <span>{bucket.label}</span>
                      <strong>{(bucket.share * 100).toFixed(1)}%</strong>
                    </div>
                  ))}
                </div>
              </div>

              
            </div>
          )}


          {investmentBreakdown.length > 0 && (
            <div className="allocation-grid investment-breakdown-grid">
              {investmentBreakdown.map(([type, value]) => {
                const sharePercent = assetTotal > 0 ? value / assetTotal : 0
                return (
                  <StatRow
                    key={type}
                    label={PRODUCT_TYPE_LABELS[type] ?? type}
                    value={formatCurrency(value)}
                    subValue={`${formatPercent(sharePercent)} du patrimoine`}
                    progress={sharePercent * 100}
                    className="allocation-item"
                  />
                )
              })}
            </div>
          )}

          {displayedPositions.length > 0 && (
            <div className="positions-section">
              <div className="position-table-header position-row">
                <div>Compte</div>
                <div>Actif</div>
                <div>Qté</div>
                <div>Cours</div>
                <div>Valorisation</div>
                <div>Plus-value</div>
                <div>Action</div>
              </div>
              <div className="positions-list">
                {displayedPositions.map((position) => (
                  <div key={`${position.accountId}-${position.investmentName}`} className="position-row">
                    <div className="position-account">
                      <div>{position.accountName}</div>
                      {position.symbol && <span className="position-subtext">{position.symbol}</span>}
                    </div>
                    <div className="position-name" title={position.investmentName}>
                      {position.investmentName}
                      {position.buyingPrice > 0 && (
                        <span className="position-subtext">PRU {formatCurrency(position.buyingPrice)}</span>
                      )}
                    </div>
                    <div className="position-quantity">{position.quantity.toFixed(4)}</div>
                    <div className="position-price">{formatCurrency(position.currentPrice)}</div>
                    <div className="position-value">
                      {formatCurrency(position.currentValue)}
                      <span className="position-subtext position-source">{position.source}</span>
                    </div>
                    <div className={`position-variation ${(position.periodChangeAmount ?? 0) >= 0 ? 'positive' : 'negative'}`}>
                      {formatSignedCurrency(position.periodChangeAmount)}
                      <span className="position-subtext">{formatSignedPercent(position.periodChangePercent)}</span>
                    </div>
                    <div>
                      <button
                        type="button"
                        className="btn-secondary btn-inline-refresh"
                        onClick={() => void handleRefreshPosition(`${position.accountId}-${position.investmentName}`)}
                        disabled={backendStatus !== 'online' || refreshingPositionKey === `${position.accountId}-${position.investmentName}`}
                      >
                        {refreshingPositionKey === `${position.accountId}-${position.investmentName}` ? '…' : '↻'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  )
}