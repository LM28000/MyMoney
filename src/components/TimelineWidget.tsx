import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { formatCurrency } from '../lib/finance'

type TimelineEvent = {
  id: string
  date: string
  type: 'real_estate' | 'vehicle' | 'debt' | 'goal_completed' | 'milestone' | 'account'
  icon: string
  title: string
  amount?: number
  description?: string
}

const TYPE_ACCENT: Record<string, string> = {
  real_estate: 'var(--accent-copper)',
  vehicle: 'var(--accent-teal)',
  debt: 'var(--danger)',
  goal_completed: 'var(--success)',
  milestone: 'var(--accent-blue)',
  account: 'var(--text-muted)',
}

const TYPE_LABEL: Record<string, string> = {
  real_estate: 'Immobilier',
  vehicle: 'Véhicule',
  debt: 'Emprunt',
  goal_completed: 'Objectif',
  milestone: 'Jalon',
  account: 'Compte',
}

type Props = {
  backendStatus: 'connecting' | 'online' | 'offline'
}

export default function TimelineWidget({ backendStatus }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    if (backendStatus !== 'online') return
    let cancelled = false
    setLoading(true)
    api
      .get<TimelineEvent[]>('/timeline')
      .then((payload) => {
        if (!cancelled) setEvents(payload)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [backendStatus])

  const activeTypes = [...new Set(events.map((e) => e.type))]
  const displayed = filter === 'all' ? events : events.filter((e) => e.type === filter)

  return (
    <div className="timeline-widget">
      <div className="timeline-header">
        <div>
          <span className="panel-kicker">Historique</span>
          <h3>Timeline patrimoniale</h3>
          <p>Chronologie des événements financiers majeurs depuis le début du suivi.</p>
        </div>
        {activeTypes.length > 1 && (
          <div className="timeline-filter-row">
            <button
              className={`timeline-filter-pill ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
              type="button"
            >
              Tout
            </button>
            {activeTypes.map((type) => (
              <button
                key={type}
                className={`timeline-filter-pill ${filter === type ? 'active' : ''}`}
                onClick={() => setFilter(type)}
                type="button"
                style={{ borderColor: filter === type ? TYPE_ACCENT[type] : undefined }}
              >
                {TYPE_LABEL[type] ?? type}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div style={{ padding: '24px', color: 'var(--text-muted)', textAlign: 'center' }}>
          Chargement de la timeline…
        </div>
      )}

      {!loading && displayed.length === 0 && (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🗓️</div>
          <p style={{ margin: 0 }}>
            Aucun événement patrimonial encore. Ajoutez des biens, dettes et objectifs pour alimenter la timeline.
          </p>
        </div>
      )}

      {!loading && displayed.length > 0 && (
        <div className="timeline-rail">
          {displayed.map((evt, idx) => {
            const accent = TYPE_ACCENT[evt.type] ?? 'var(--text-muted)'
            return (
              <div key={evt.id} className="timeline-event">
                <div className="timeline-dot-col">
                  <div className="timeline-dot" style={{ background: accent, boxShadow: `0 0 0 4px ${accent}22` }} />
                  {idx < displayed.length - 1 && <div className="timeline-connector" />}
                </div>
                <div className="timeline-body">
                  <div className="timeline-event-topline">
                    <span className="timeline-event-icon">{evt.icon}</span>
                    <span className="timeline-event-type" style={{ color: accent }}>{TYPE_LABEL[evt.type] ?? evt.type}</span>
                    <time className="timeline-event-date">
                      {new Date(evt.date).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' })}
                    </time>
                  </div>
                  <h4 className="timeline-event-title">{evt.title}</h4>
                  {evt.amount !== undefined && (
                    <strong className="timeline-event-amount">{formatCurrency(evt.amount)}</strong>
                  )}
                  {evt.description && (
                    <p className="timeline-event-desc">{evt.description}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
