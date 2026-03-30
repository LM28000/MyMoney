import { useEffect, useState } from 'react'
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
} from 'recharts'
import { api } from '../lib/api'

type Axis = {
  key: string
  label: string
  score: number
  description: string
}

type HealthScore = {
  axes: Axis[]
  globalScore: number
}

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

type Props = {
  backendStatus: 'connecting' | 'online' | 'offline'
}

export default function HealthScoreWidget({ backendStatus }: Props) {
  const [data, setData] = useState<HealthScore | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (backendStatus !== 'online') return
    let cancelled = false
    setLoading(true)
    api
      .get<HealthScore>('/health-score')
      .then((payload) => {
        if (!cancelled) setData(payload)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
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
        Vue multi-axes de la solidité, liquidité, discipline et trajectoire du patrimoine.
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

      {/* Axes detail */}
      <div className="health-axes-grid">
        {data.axes.map((ax) => {
          const axColor = levelColor(ax.score)
          return (
            <div key={ax.key} className="health-axis-card">
              <div className="health-axis-topline">
                <span className="health-axis-label">{ax.label}</span>
                <strong className="health-axis-score" style={{ color: axColor }}>{ax.score}</strong>
              </div>
              <div className="health-axis-bar-bg">
                <div
                  className="health-axis-bar-fill"
                  style={{ width: `${ax.score}%`, background: axColor }}
                />
              </div>
              <p className="health-axis-desc">{ax.description}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
