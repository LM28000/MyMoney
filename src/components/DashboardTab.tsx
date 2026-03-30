import { useEffect, useRef, useState } from 'react'
import type { BudgetAnalysis, Goal, RecurringExpense } from '../types'
import { formatCurrency, formatPercent } from '../lib/finance'
import type { ManualNetWorthItem } from '../types'
import { api } from '../lib/api'
import { PanelHeader } from './CardComponents'
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
  onSuggestionsRefresh,
  onNavigate,
}: Props) {
  const [refreshing, setRefreshing] = useState(false)
  const [liveInvestments, setLiveInvestments] = useState<LiveInvestmentSnapshot | null>(null)
  const aiBriefMonthKeyRef = useRef<string | null>(null)
  const aiBriefInFlightRef = useRef(false)
  const [aiBriefs, setAiBriefs] = useState<Partial<Record<keyof typeof AI_PROMPTS, AiBrief>>>({})
  const [, setLoadingAiBriefs] = useState<Record<keyof typeof AI_PROMPTS, boolean>>({
    executive: false,
    actions: false,
    risks: false,
    allocation: false,
  })
  const [, setAiBriefError] = useState<string | null>(null)
  const [, setAiBriefLastRefreshAt] = useState<string | null>(null)
  const [goals, setGoals] = useState<Goal[]>([])

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
      return
    }

    let cancelled = false

    const fetchLiveInvestments = async () => {
      try {
        const payload = await api.get<LiveInvestmentSnapshot>('/markets/investments', {
          query: { period: 'all' },
          cache: 'no-store',
        })
        if (!cancelled) {
          setLiveInvestments(payload)
        }
      } catch {
        if (!cancelled) {
          setLiveInvestments(null)
        }
      }
    }

    void fetchLiveInvestments()

    const intervalId = window.setInterval(() => {
      void fetchLiveInvestments()
    }, MARKET_REFRESH_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [hasPatrimony, backendStatus])

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

  const liveMarketTotal = liveInvestments?.totalCurrentValue ?? investedAssets
  const assetTotal = liveMarketTotal + patrimony.livretTotal + patrimony.externalPatrimonyTotal
  const emergencyMissing = Math.max(0, patrimony.emergencyFund.target - patrimony.emergencyFund.current)

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
  const bourseTotal =
    (mergedAssetsByProductType['assurance-vie'] ?? 0) +
    (mergedAssetsByProductType.pea ?? 0) +
    (mergedAssetsByProductType['pea-pme'] ?? 0) +
    (mergedAssetsByProductType.cto ?? 0)

  const allocationRows = [
    {
      label: 'Cash courant',
      value: patrimony.bankCash,
    },
    {
      label: 'Livrets',
      value: patrimony.livretTotal,
    },
    {
      label: 'Bourse (PEA/AV/CTO)',
      value: bourseTotal,
    },
    {
      label: 'Crypto',
      value: mergedAssetsByProductType.crypto ?? 0,
    },
    {
      label: 'Immobilier',
      value: mergedAssetsByProductType['real-estate'] ?? 0,
    },
  ].filter((row) => row.value > 0)

  const nextGoal = nearestGoals[0] ?? null
  const nextGoalRemaining = nextGoal
    ? Math.max(0, nextGoal.targetAmount - nextGoal.currentAmount)
    : null
  const priorityPulseItems = [
    {
      label: 'Cash utile',
      value: formatCurrency(patrimony.bankCash),
      tone: 'neutral',
    },
    {
      label: 'Livrets',
      value: formatCurrency(patrimony.livretTotal),
      tone: 'neutral',
    },
    {
      label: 'Investissements',
      value: formatCurrency(investedAssets),
      tone: liveInvestments && liveInvestments.periodChangeAmount >= 0 ? 'positive' : 'neutral',
    },
    {
      label: 'Jalon prioritaire',
      value: nextGoal
        ? `${nextGoal.name} (J-${Math.max(0, daysUntil(nextGoal.targetDate))} • reste ${formatCurrency(nextGoalRemaining ?? 0)})`
        : 'Aucun jalon actif',
      tone: nextGoal ? (daysUntil(nextGoal.targetDate) <= 45 ? 'negative' : 'positive') : 'neutral',
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
          <div className="command-hero-value">{formatCurrency(assetTotal)}</div>
          <p className="command-hero-copy">
            {netWorthDelta >= 0 ? 'Progression' : 'Retrait'} de {formatSignedCurrency(netWorthDelta)} sur la période récente,
            avec {formatCurrency(investedAssets)} investis et {formatCurrency(patrimony.bankCash + patrimony.livretTotal)} mobilisables rapidement.
          </p>
          <div className="command-chip-row">
            <span className="command-chip">Épargne de précaution {patrimony.emergencyFund.months.toFixed(1)} mois</span>
            {savingsRate !== null && <span className="command-chip">Taux d'épargne {formatPercent(savingsRate)}</span>}
            <span className="command-chip">Dettes {formatCurrency(patrimony.debts)}</span>
          </div>
          <div className="command-allocation-list">
            {allocationRows.map((row) => {
              const share = assetTotal > 0 ? (row.value / assetTotal) * 100 : 0
              return (
                <div key={row.label} className="command-allocation-row">
                  <div className="command-allocation-topline">
                    <span>{row.label}</span>
                    <strong>{formatCurrency(row.value)} • {share.toFixed(1)}%</strong>
                  </div>
                  <div className="command-allocation-bar">
                    <span style={{ width: `${Math.max(0, Math.min(100, share))}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="dashboard-command-card command-secondary">
          <span className="panel-kicker">Priorités</span>
          <h3>Repères rapides</h3>
          <div className="system-pulse-list">
            {priorityPulseItems.map((item) => (
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

      <HealthScoreWidget backendStatus={backendStatus} />

    </div>
  )
}