import { useState, useEffect } from 'react'
import { RefreshCw, CheckCircle, AlertCircle, Clock } from 'lucide-react'
import { apiBourso } from '../lib/api-bourso'
import type { BoursoAction } from '../types-bourso'

interface BoursoActionsWidgetProps {
  onRefresh?: () => void
}

export function BoursoActionsWidget({ onRefresh }: BoursoActionsWidgetProps) {
  const [actions, setActions] = useState<BoursoAction[]>([])
  const [loading, setLoading] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncPassword, setSyncPassword] = useState('')
  const [showSyncInput, setShowSyncInput] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const handleSyncAccounts = async () => {
    if (!syncPassword) return

    setSyncLoading(true)
    setError(null)

    try {
      await apiBourso.syncAndReplaceAccounts(syncPassword)
      setSyncPassword('')
      setShowSyncInput(false)
      onRefresh?.()
      // Reload actions
      await loadActions()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncLoading(false)
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
        <button
          onClick={() => setShowSyncInput(!showSyncInput)}
          style={{ padding: '8px 12px', fontSize: '0.875rem', background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', borderRadius: '10px', border: 'none', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600 }}
        >
          <RefreshCw style={{ width: '16px', height: '16px' }} />
          Sync comptes
        </button>
      </div>

      {showSyncInput && (
        <div style={{ marginBottom: '14px', padding: '12px', backgroundColor: 'rgba(37,99,235,0.08)', borderRadius: '10px', display: 'flex', gap: '8px' }}>
          <input
            type="password"
            value={syncPassword}
            onChange={(e) => setSyncPassword(e.target.value)}
            placeholder="Mot de passe Bourso"
            style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border-color, #d1d5db)', borderRadius: '8px', fontSize: '0.875rem', backgroundColor: '#fff' }}
          />
          <button
            onClick={handleSyncAccounts}
            disabled={syncLoading || !syncPassword}
            style={{ padding: '8px 12px', fontSize: '0.875rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', cursor: syncLoading || !syncPassword ? 'not-allowed' : 'pointer', opacity: syncLoading || !syncPassword ? 0.6 : 1 }}
          >
            {syncLoading ? 'Syncing...' : 'OK'}
          </button>
          <button
            onClick={() => setShowSyncInput(false)}
            style={{ padding: '8px 10px', fontSize: '0.875rem', color: '#6b7280', background: '#fff', border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div style={{ marginBottom: '14px', padding: '10px', backgroundColor: '#fef2f2', color: '#b91c1c', fontSize: '0.875rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle style={{ width: '16px', height: '16px' }} />
          {error}
        </div>
      )}

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
