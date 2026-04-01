import { useState, useEffect } from 'react'
import { CheckCircle, AlertCircle, Clock } from 'lucide-react'
import { apiBourso } from '../lib/api-bourso'
import type { BoursoAction } from '../types-bourso'

interface BoursoActionsWidgetProps {
  onRefresh?: () => void
}

export function BoursoActionsWidget({}: BoursoActionsWidgetProps) {
  const [actions, setActions] = useState<BoursoAction[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadActions()
  }, [])

  const loadActions = async () => {
    setLoading(true)
    try {
      const result = await apiBourso.getActions()
      setActions(result)
    } catch (err) {
      console.error('Failed to load actions:', err)
    } finally {
      setLoading(false)
    }
  }



  const getActionIcon = (type: BoursoAction['type']) => {
    switch (type) {
      case 'transfer':
        return '💸'
      case 'trade':
        return '📈'
      case 'sync-accounts':
        return '🔄'
      default:
        return '•'
    }
  }

  const getStatusIcon = (status: BoursoAction['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle style={{ width: '16px', height: '16px', color: '#16a34a' }} />
      case 'pending':
        return <Clock style={{ width: '16px', height: '16px', color: '#ca8a04' }} />
      case 'failed':
        return <AlertCircle style={{ width: '16px', height: '16px', color: '#dc2626' }} />
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat('fr-FR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }

  const recentActions = actions.slice(0, 10)

  return (
    <div style={{ background: 'var(--bg-panel, #ffffff)', borderRadius: '14px', border: '1px solid var(--border-color, #e5e7eb)', padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary, #111827)' }}>Actions Bourso</h3>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted, #6b7280)' }}>Chargement...</div>
      ) : recentActions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted, #6b7280)' }}>Aucune action pour le moment</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {recentActions.map((action) => (
            <div
              key={action.id}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px', backgroundColor: 'var(--bg-soft, #f9fafb)', borderRadius: '10px', border: '1px solid var(--border-soft, #e5e7eb)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                <span style={{ fontSize: '1.1rem' }}>{getActionIcon(action.type)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary, #111827)', textTransform: 'capitalize' }}>
                    {action.type === 'sync-accounts' ? 'Synchronisation' : action.type}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #6b7280)' }}>{formatDate(action.createdAt)}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {getStatusIcon(action.status)}
                {action.error && (
                  <span style={{ fontSize: '0.75rem', color: '#dc2626' }} title={action.error}>
                    ⚠️
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {recentActions.length > 0 && (
        <div style={{ marginTop: '12px', fontSize: '0.75rem', color: 'var(--text-muted, #6b7280)', textAlign: 'center' }}>
          Affichage des 10 dernières actions
        </div>
      )}
    </div>
  )
}
