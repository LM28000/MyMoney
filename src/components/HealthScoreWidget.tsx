import { useEffect, useState } from 'react'
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
} from 'recharts'
import { api } from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

type Bucket = { label: string; value: number; share: number }

type LiquidityDetail = {
  kind: 'liquidity'
  efCurrent: number
  efTarget: number
  efMonths: number
  efTargetMonths: number
  livretDetails: Array<{ name: string; balance: number }>
}

type DiversificationDetail = {
  kind: 'diversification'
  byGeography: Bucket[]
  bySector: Bucket[]
  score: number
  level: string
  concentration: { largestPositionShare: number; top3Share: number }
}

type PlacementDiversificationDetail = {
  kind: 'placement-diversification'
  byPlacementType: Bucket[]
  largestTypeLabel: string
  largestTypeShare: number
}

type Axis = {
  key: string
  label: string
  score: number
  rawScore?: number
  targetScore?: number
  objectiveLabel?: string
  objectiveMetric?: string
  objectiveBreakdown?: Array<{
    label: string
    target: string
    current: string
    achievement: number
  }>
  description: string
  detail?: LiquidityDetail | DiversificationDetail | PlacementDiversificationDetail
}

type HealthScore = {
  axes: Axis[]
  globalScore: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const levelLabel = (score: number) => {
  if (score >= 80) return 'Excellente'
  if (score >= 60) return 'Bonne'
  if (score >= 40) return 'Moyenne'
  return 'À renforcer'
}

const levelColor = (score: number) => {
  if (score >= 80) return 'var(--success)'
  if (score >= 60) return 'var(--accent-blue)'
  if (score >= 40) return 'var(--warning)'
  return 'var(--danger)'
}

const fmt = (v: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)

// ─── BucketBar ────────────────────────────────────────────────────────────────

function BucketBar({ buckets, title }: { buckets: Bucket[]; title: string }) {
  if (buckets.length === 0) return null
  return (
    <div className="health-popup-bucket-block">
      <h4 className="health-popup-bucket-title">{title}</h4>
      {buckets.slice(0, 6).map((b) => (
        <div key={b.label} className="health-popup-bucket-row">
          <span className="health-popup-bucket-label">{b.label}</span>
          <div className="health-popup-bucket-bar-bg">
            <div
              className="health-popup-bucket-bar-fill"
              style={{ width: `${(b.share * 100).toFixed(1)}%` }}
            />
          </div>
          <span className="health-popup-bucket-pct">{(b.share * 100).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  )
}

// ─── LiquidityPopup ───────────────────────────────────────────────────────────

function LiquidityPopup({
  detail,
  backendStatus,
  onSaved,
}: {
  detail: LiquidityDetail
  backendStatus: 'connecting' | 'online' | 'offline'
  onSaved: () => void
}) {
  const [targetMonthsInput, setTargetMonthsInput] = useState(String(detail.efTargetMonths))
  const [monthlyExpensesInput, setMonthlyExpensesInput] = useState(
    detail.efTargetMonths > 0 && detail.efTarget > 0
      ? String(Math.round(detail.efTarget / detail.efTargetMonths))
      : '',
  )
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    setTargetMonthsInput(String(detail.efTargetMonths))
    setMonthlyExpensesInput(
      detail.efTargetMonths > 0 && detail.efTarget > 0
        ? String(Math.round(detail.efTarget / detail.efTargetMonths))
        : '',
    )
  }, [detail.efTargetMonths, detail.efTarget])

  const efPct = detail.efTarget > 0 ? Math.min(1, detail.efCurrent / detail.efTarget) : 0
  const efColor = efPct >= 1 ? 'var(--success)' : efPct >= 0.5 ? 'var(--warning)' : 'var(--danger)'

  const handleSave = async () => {
    const parsedMonths = Number.parseInt(targetMonthsInput, 10)
    const parsedMonthlyExpenses = Number.parseFloat(monthlyExpensesInput.replace(',', '.'))

    const targetMonths = Number.isFinite(parsedMonths) && parsedMonths > 0 ? parsedMonths : null
    if (!targetMonths) {
      setFeedback('Le nombre de mois doit être supérieur à 0.')
      return
    }

    const monthlyExpenses = Number.isFinite(parsedMonthlyExpenses) && parsedMonthlyExpenses > 0
      ? parsedMonthlyExpenses
      : null

    setSaving(true)
    setFeedback(null)
    try {
      await api.put('/emergency-fund', {
        targetMonths,
        monthlyExpenses,
      })
      setFeedback('Paramètres enregistrés.')
      onSaved()
    } catch {
      setFeedback('Impossible d\'enregistrer les paramètres pour le moment.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="health-popup-content">
      {/* Emergency fund */}
      <section className="health-popup-section">
        <h4 className="health-popup-section-title">Épargne de précaution</h4>
        <div className="health-popup-ef-amounts">
          <span>{fmt(detail.efCurrent)}</span>
          <span className="health-popup-ef-sep">/</span>
          <span style={{ color: efColor }}>{fmt(detail.efTarget)}</span>
          <span className="health-popup-ef-months">({detail.efTargetMonths} mois)</span>
        </div>
        <div style={{ color: efColor, fontSize: '0.85rem', marginBottom: '8px' }}>
          {detail.efMonths.toFixed(1)} mois couverts
          {efPct >= 1 ? ' — couverture solide' : ` — manque ${fmt(detail.efTarget - detail.efCurrent)}`}
        </div>
        {detail.livretDetails.length > 0 && (
          <div className="health-popup-livret-list">
            {detail.livretDetails.map((l) => (
              <div key={l.name} className="health-popup-livret-row">
                <span>{l.name}</span>
                <strong>{fmt(l.balance)}</strong>
              </div>
            ))}
          </div>
        )}

        <div className="health-popup-settings-grid">
          <label className="health-popup-setting-field">
            Mois d'avance
            <input
              type="number"
              min={1}
              step={1}
              value={targetMonthsInput}
              onChange={(e) => setTargetMonthsInput(e.target.value)}
            />
          </label>
          <label className="health-popup-setting-field">
            Dépenses mensuelles (€)
            <input
              type="number"
              min={0}
              step={10}
              value={monthlyExpensesInput}
              onChange={(e) => setMonthlyExpensesInput(e.target.value)}
              placeholder="Auto si vide"
            />
          </label>
        </div>
        <div className="health-popup-settings-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void handleSave()}
            disabled={saving || backendStatus !== 'online'}
          >
            {saving ? 'Enregistrement…' : 'Mettre à jour'}
          </button>
          {feedback && <span className="health-popup-feedback">{feedback}</span>}
        </div>
      </section>
    </div>
  )
}

// ─── DiversificationPopup ─────────────────────────────────────────────────────

function DiversificationPopup({ detail }: { detail: DiversificationDetail }) {
  return (
    <div className="health-popup-content">
      <div className="health-popup-divers-grid">
        <BucketBar buckets={detail.byGeography} title="Géographie" />
        <BucketBar buckets={detail.bySector} title="Secteur" />
      </div>
      {detail.byGeography.length === 0 && detail.bySector.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Aucune position détectée. Importez un relevé de positions (PEA, assurance vie) pour activer l'analyse de diversification.
        </p>
      )}
      <div className="health-popup-concentration" style={{ marginTop: '16px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
        Plus grosse ligne : {(detail.concentration.largestPositionShare * 100).toFixed(1)}% — Top 3 : {(detail.concentration.top3Share * 100).toFixed(1)}%
      </div>
    </div>
  )
}

function PlacementDiversificationPopup({ detail }: { detail: PlacementDiversificationDetail }) {
  return (
    <div className="health-popup-content">
      <div className="health-popup-divers-grid placement-divers-grid">
        <BucketBar buckets={detail.byPlacementType} title="Type de placement" />
      </div>
      <div className="health-popup-concentration" style={{ marginTop: '16px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
        Exposition principale : {detail.largestTypeLabel} ({(detail.largestTypeShare * 100).toFixed(1)}%)
      </div>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  backendStatus: 'connecting' | 'online' | 'offline'
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function HealthScoreWidget({ backendStatus }: Props) {
  const [data, setData] = useState<HealthScore | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedAxisKey, setExpandedAxisKey] = useState<string | null>(null)

  const load = (cancelled: { v: boolean }) => {
    setLoading(true)
    api
      .get<HealthScore>('/health-score')
      .then((payload) => {
        if (!cancelled.v) setData(payload)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled.v) setLoading(false)
      })
  }

  const reload = () => {
    if (backendStatus !== 'online') return
    const cancelled = { v: false }
    load(cancelled)
  }

  useEffect(() => {
    if (backendStatus !== 'online') return
    const cancelled = { v: false }
    load(cancelled)
    return () => { cancelled.v = true }
  }, [backendStatus])

  if (loading) {
    return (
      <div className="premium-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-muted)' }}>
        <div className="loading-dot" style={{ background: 'var(--accent-copper)' }} />
        Calcul du score de santé…
      </div>
    )
  }

  if (!data) return null

  const chartData = data.axes.map((a) => ({
    subject: a.label,
    score: a.score,
    fullMark: 100,
  }))

  const color = levelColor(data.globalScore)
  const circumference = 2 * Math.PI * 66

  return (
    <div className="premium-panel health-score-widget">
        <span className="panel-kicker">Santé financière</span>
        <h3>Score de santé</h3>
        <p className="health-score-subtitle">
          Vue multi-axes de la solidité, liquidité et diversification du patrimoine.
        </p>

        <div className="health-score-layout">
          {/* Score ring */}
          <div className="health-score-ring-col">
            <div className="health-score-ring-wrap">
              <svg width={160} height={160} style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={80} cy={80} r={66} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={14} />
                <circle
                  cx={80}
                  cy={80}
                  r={66}
                  fill="none"
                  stroke={color}
                  strokeWidth={14}
                  strokeDasharray={`${(data.globalScore / 100) * circumference} ${circumference}`}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dasharray 0.7s ease' }}
                />
              </svg>
              <div className="health-score-ring-label">
                <strong style={{ color }}>{data.globalScore}</strong>
                <span>/100</span>
              </div>
            </div>
            <div className="health-score-level" style={{ color }}>{levelLabel(data.globalScore)}</div>
          </div>

          {/* Radar chart */}
          <div className="health-score-radar-col">
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={chartData} cx="50%" cy="50%">
                <PolarGrid stroke="rgba(255,255,255,0.08)" />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-body)', fontWeight: 600 }}
                />
                <Radar
                  name="Score"
                  dataKey="score"
                  stroke={color}
                  fill={color}
                  fillOpacity={0.14}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Axes detail cards — expandable for liquidity & diversification */}
        <div className="health-axes-grid">
          {data.axes.map((ax) => {
            const axColor = levelColor(ax.score)
            const isClickable = true
            const isExpanded = expandedAxisKey === ax.key
            const targetScore = typeof ax.targetScore === 'number' ? ax.targetScore : 100
            const scoreDelta = ax.score - targetScore
            const rawScore = typeof ax.rawScore === 'number' ? ax.rawScore : ax.score
            return (
              <div
                key={ax.key}
                className={`health-axis-card${isClickable ? ' health-axis-card--clickable' : ''}`}
                onClick={isClickable ? () => setExpandedAxisKey((current) => (current === ax.key ? null : ax.key)) : undefined}
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onKeyDown={isClickable ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setExpandedAxisKey((current) => (current === ax.key ? null : ax.key))
                  }
                } : undefined}
              >
                <div className="health-axis-topline">
                  <span className="health-axis-label">{ax.label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <strong className="health-axis-score" style={{ color: axColor }}>{ax.score}</strong>
                    {isClickable && <span className={`health-axis-chevron${isExpanded ? ' expanded' : ''}`}>›</span>}
                  </div>
                </div>
                <div className="health-axis-bar-bg">
                  <div
                    className="health-axis-bar-fill"
                    style={{ width: `${ax.score}%`, background: axColor }}
                  />
                </div>
                <p className="health-axis-desc">{ax.description}</p>
                <div className="health-axis-objective-strip">
                  <span>{ax.objectiveLabel ?? `Objectif ${targetScore}/100`}</span>
                  <strong className={scoreDelta >= 0 ? 'positive' : 'negative'}>
                    {Math.round(ax.score)}%
                  </strong>
                </div>

                {isExpanded && (
                  <div className="health-axis-details-inline" onClick={(e) => e.stopPropagation()}>
                    <div className="health-axis-objective-detail-grid">
                      <div>
                        <span>Atteinte objectif</span>
                        <strong>{Math.round(ax.score)}%</strong>
                      </div>
                      <div>
                        <span>Seuil objectif</span>
                        <strong>{targetScore}%</strong>
                      </div>
                      <div>
                        <span>Score mesure brute</span>
                        <strong>{Math.round(rawScore)}/100</strong>
                      </div>
                      <div>
                        <span>Indicateur</span>
                        <strong>{ax.objectiveMetric ?? ax.description}</strong>
                      </div>
                    </div>
                    {ax.objectiveBreakdown && ax.objectiveBreakdown.length > 0 && (
                      <div className="health-axis-breakdown-list">
                        {ax.objectiveBreakdown.map((item) => (
                          <div key={item.label} className="health-axis-breakdown-row">
                            <div>
                              <span>{item.label}</span>
                              <p>Cible: {item.target} · Actuel: {item.current}</p>
                            </div>
                            <strong className={item.achievement >= 100 ? 'positive' : 'negative'}>
                              {Math.round(item.achievement)}%
                            </strong>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {isExpanded && ax.detail?.kind === 'liquidity' && (
                  <div className="health-axis-details-inline" onClick={(e) => e.stopPropagation()}>
                    <LiquidityPopup detail={ax.detail} backendStatus={backendStatus} onSaved={reload} />
                  </div>
                )}
                {isExpanded && ax.detail?.kind === 'diversification' && (
                  <div className="health-axis-details-inline" onClick={(e) => e.stopPropagation()}>
                    <DiversificationPopup detail={ax.detail} />
                  </div>
                )}
                {isExpanded && ax.detail?.kind === 'placement-diversification' && (
                  <div className="health-axis-details-inline" onClick={(e) => e.stopPropagation()}>
                    <PlacementDiversificationPopup detail={ax.detail} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
  )
}
