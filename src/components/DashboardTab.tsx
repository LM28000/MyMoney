import { useEffect, useState } from 'react'
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

type HealthScoreAxis = {
  key: string
  label: string
  score: number
  description: string
}

type HealthScoreResponse = {
  globalScore: number
  axes: HealthScoreAxis[]
}

const LIVRET_TYPES = ['livret-a', 'livret-jeune', 'lep', 'ldds', 'livret-other']
const MARKET_REFRESH_INTERVAL_MS = 60 * 1000

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
  // suggestions,
  // emergencyFundTargetMonths,
  onSuggestionsRefresh,
  onNavigate,
}: Props) {
  const [refreshing, setRefreshing] = useState(false)
  const [liveInvestments, setLiveInvestments] = useState<LiveInvestmentSnapshot | null>(null)
  const [goals, setGoals] = useState<Goal[]>([])
  const [healthScore, setHealthScore] = useState<HealthScoreResponse | null>(null)

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

  useEffect(() => {
    if (!hasPatrimony || backendStatus !== 'online') {
      setHealthScore(null)
      return
    }

    let cancelled = false

    void api.get<HealthScoreResponse>('/health-score', { cache: 'no-store' })
      .then((payload) => {
        if (!cancelled) {
          setHealthScore(payload)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHealthScore(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [hasPatrimony, backendStatus])

  const handleRefreshAnalysis = async () => {
    setRefreshing(true)
    try {
      const [suggestionsData, healthData] = await Promise.all([
        api.post<{ suggestions: Suggestion[] }>('/ai/suggest'),
        api.get<HealthScoreResponse>('/health-score', { cache: 'no-store' }).catch(() => null),
      ])
      onSuggestionsRefresh(suggestionsData.suggestions)
      if (healthData) {
        setHealthScore(healthData)
      }
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
  const assetTotal = patrimony.bankCash + liveMarketTotal + patrimony.livretTotal + patrimony.externalPatrimonyTotal
  // const emergencyMissing = Math.max(0, patrimony.emergencyFund.target - patrimony.emergencyFund.current)

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

  // Helper functions for health-based recommendations
  const healthAxisToTarget = (axisKey: string): DecisionAction['target'] => {
    if (axisKey === 'resilience') return 'simulateurs'
    if (axisKey === 'placement-diversification' || axisKey === 'diversification') return 'patrimoine'
    return 'objectifs'
  }

  const healthAxisToCta = (axisKey: string) => {
    if (axisKey === 'resilience') return 'Tester un plan de désendettement'
    if (axisKey === 'placement-diversification' || axisKey === 'diversification') return 'Analyser la diversification'
    return 'Ajuster les objectifs'
  }

  const getRecommendationDetail = (axisKey: string): string => {
    switch (axisKey) {
      case 'liquidity':
        return 'Augmentez votre fonds de roulement mensuel en accumulant dans vos livrets d\'épargne pour atteindre le coussin de crise recommandé.'
      case 'placement-diversification':
        return 'Variiez vos supports d\'investissement (PEA, assurance-vie, CTO) pour déployer vos actifs sur plusieurs produits plutôt que concentrés dans un seul.'
      case 'resilience':
        return 'Réduisez votre endettement en priorisant le remboursement des crédits les plus coûteux, ou renforcez votre base d\'actifs liquides.'
      case 'diversification':
        return 'Équilibrez votre portefeuille d\'investissement entre géographies, secteurs, et types de placements pour limiter la concentration du risque.'
      default:
        return 'Alignez votre situation avec les objectifs de santé financière configurés.'
    }
  }

  // Generate decision items ONLY from health score axes
  const decisionItems: DecisionAction[] = []

  if (healthScore?.axes) {
    // Filter low-scoring axes (< 85) and sort by severity
    const lowScoringAxes = healthScore.axes
      .filter((axis) => axis.score < 85)
      .sort((a, b) => {
        if (a.score < 70 && b.score >= 70) return -1 // high priority first
        if (a.score >= 70 && b.score < 70) return 1
        return a.score - b.score // then by numeric score
      })

    // Create a recommendation for each low-scoring axis
    lowScoringAxes.forEach((axis) => {
      decisionItems.push({
        id: `health-axis-${axis.key}`,
        title: `${axis.label}`,
        description: getRecommendationDetail(axis.key),
        impact: `Score: ${Math.round(axis.score)}/100`,
        tone: axis.score < 70 ? 'high' : axis.score < 85 ? 'medium' : 'low',
        ctaLabel: healthAxisToCta(axis.key),
        target: healthAxisToTarget(axis.key),
      })
    })
  }

  // If no low-scoring axes, provide a default positive message
  if (decisionItems.length === 0) {
    decisionItems.push({
      id: 'health-status-excellent',
      title: 'Situation financière excellente',
      description: 'Tous vos scores de santé sont alignés avec vos objectifs. Continuez à surveiller les tendances et à vous adapter selon votre évolution.',
      impact: `Score global: ${healthScore?.globalScore ?? 'N/A'}/100`,
      tone: 'low',
      ctaLabel: 'Consulter le détail',
      target: 'patrimoine',
    })
  }

  const topDecisionItems = decisionItems.slice(0, 5)
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
            {backendStatus === 'online' ? '● Recommandations actives' : '● Backend indisponible'}
          </div>
          <button
            onClick={handleRefreshAnalysis}
            disabled={refreshing || backendStatus !== 'online'}
            style={{ padding: '10px 20px', background: 'linear-gradient(135deg,var(--accent-blue),var(--accent-copper))', border: 'none', borderRadius: '999px', color: '#fff', fontWeight: 600, cursor: 'pointer', opacity: refreshing || backendStatus !== 'online' ? 0.6 : 1, fontSize: '0.9rem' }}
          >
            {refreshing ? 'Actualisation…' : 'Rafraîchir les recommandations'}
          </button>
        </div>
      </div>

      <div className="dashboard-command-grid">
        <section className="dashboard-command-card command-primary">
          <span className="panel-kicker">Situation</span>
          <h3>Votre poste de pilotage financier</h3>
          <div className="command-hero-value">{formatCurrency(assetTotal)}</div>
          <p className="command-hero-copy">
            {/* {netWorthDelta >= 0 ? 'Progression' : 'Retrait'} de {formatSignedCurrency(netWorthDelta)} sur la période récente,
            avec {formatCurrency(investedAssets)} investis et {formatCurrency(patrimony.bankCash + patrimony.livretTotal)} mobilisables rapidement. */}
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

      <HealthScoreWidget backendStatus={backendStatus} />

      <section className="premium-panel decision-panel">
        <PanelHeader
          kicker="Decision Center"
          title="Recommandations personnalisées"
          description="Actions priorisées selon vos objectifs de santé financière, votre budget et les signaux de concentration."
        />
        <div className="decision-grid">
          {topDecisionItems.length > 0 ? topDecisionItems.map((item) => (
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
          )) : (
            <article className="decision-card decision-low">
              <div className="decision-card-header">
                <span className="decision-impact-pill">Aucune action prioritaire</span>
              </div>
              <h4>Situation globalement alignée</h4>
              <p>Vos indicateurs sont actuellement proches des objectifs configurés.</p>
              <button type="button" className="decision-card-button" onClick={() => onNavigate('objectifs')}>
                Ajuster les objectifs
              </button>
            </article>
          )}
        </div>
      </section>

    </div>
  )
}