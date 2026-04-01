import { useState } from 'react'
import { RefreshCw, AlertCircle, Loader } from 'lucide-react'
import { apiBourso } from '../lib/api-bourso'

interface BoursoSyncModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function BoursoSyncModal({ isOpen, onClose, onSuccess }: BoursoSyncModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState('')

  if (!isOpen) return null

  const handleSync = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (!password) {
        throw new Error('Mot de passe requis')
      }

      await apiBourso.syncAndReplaceAccounts(password)
      
      setPassword('')
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ 
      position: 'fixed', 
      inset: 0, 
      backgroundColor: 'rgba(0,0,0,0.5)', 
      zIndex: 50, 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '24px',
        width: '100%',
        maxWidth: '448px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
      }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '16px' }}>Synchronisation Boursorama</h2>

        {error && (
          <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', display: 'flex', gap: '8px', color: '#b91c1c', alignItems: 'flex-start' }}>
            <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0, marginTop: '4px' }} />
            <span style={{ fontSize: '0.875rem' }}>{error}</span>
          </div>
        )}

        <form onSubmit={handleSync} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '8px' }}>Mot de passe Bourso</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '1rem', outline: 'none' }}
              placeholder="Votre mot de passe"
              required
              autoFocus
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', paddingTop: '16px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{ flex: 1, padding: '8px 16px', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', backgroundColor: 'white', cursor: 'pointer', fontSize: '1rem' }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading || !password}
              style={{ flex: 1, padding: '8px 16px', backgroundColor: loading || !password ? '#3b82f6cc' : '#3b82f6', color: 'white', borderRadius: '8px', border: 'none', cursor: loading || !password ? 'not-allowed' : 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: loading || !password ? 0.5 : 1 }}
            >
              {loading ? (
                <>
                  <Loader style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
                  Sync en cours...
                </>
              ) : (
                <>
                  <RefreshCw style={{ width: '16px', height: '16px' }} />
                  Synchroniser
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
