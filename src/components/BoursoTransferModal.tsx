import { useState } from 'react'
import { Send, AlertCircle, Loader } from 'lucide-react'
import { apiBourso } from '../lib/api-bourso'
import type { BoursoAccount, Transfer } from '../types-bourso'

interface BoursoTransferModalProps {
  isOpen: boolean
  onClose: () => void
  accounts: BoursoAccount[]
  onSuccess?: () => void
}

export function BoursoTransferModal({ isOpen, onClose, accounts, onSuccess }: BoursoTransferModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [fromAccountId, setFromAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [amount, setAmount] = useState('')

  console.log('[BoursoTransferModal] Rendering with isOpen:', isOpen, 'accounts:', accounts.length)

  if (!isOpen) {
    console.log('[BoursoTransferModal] isOpen is false, returning null')
    return null
  }

  console.log('[BoursoTransferModal] Rendering modal UI')

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (!fromAccountId || !toAccountId || !amount || !password) {
        throw new Error('All fields are required')
      }

      if (fromAccountId === toAccountId) {
        throw new Error('Source and destination must be different')
      }

      const transfer: Transfer = {
        fromAccountId,
        toAccountId,
        amount: parseFloat(amount),
      }

      await apiBourso.transfer(transfer, password)

      // Reset form
      setFromAccountId('')
      setToAccountId('')
      setAmount('')
      setPassword('')

      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transfer failed')
    } finally {
      setLoading(false)
    }
  }

  const transferableAccounts = accounts
  const noTransferableAccounts = transferableAccounts.length === 0

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
        <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '16px' }}>Virer de l'argent</h2>

        {noTransferableAccounts && (
          <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', color: '#1e3a8a', fontSize: '0.875rem' }}>
            Aucun compte Bourso disponible. Lancez d'abord "Sync Comptes" dans le widget Bourso, puis rouvrez cette modale.
          </div>
        )}

        {error && (
          <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', display: 'flex', gap: '8px', color: '#b91c1c', alignItems: 'flex-start' }}>
            <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0, marginTop: '4px' }} />
            <span style={{ fontSize: '0.875rem' }}>{error}</span>
          </div>
        )}

        <form onSubmit={handleTransfer} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '8px' }}>Compte source</label>
            <select
              value={fromAccountId}
              onChange={(e) => setFromAccountId(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '1rem', outline: 'none' }}
              required
              disabled={noTransferableAccounts}
            >
              <option value="">Sélectionner...</option>
              {transferableAccounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.balance.toFixed(2)}€)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '8px' }}>Compte destination</label>
            <select
              value={toAccountId}
              onChange={(e) => setToAccountId(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '1rem', outline: 'none' }}
              required
              disabled={noTransferableAccounts}
            >
              <option value="">Sélectionner...</option>
              {transferableAccounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '8px' }}>Montant (€)</label>
            <input
              type="number"
              step="0.01"
              min="10"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '1rem', outline: 'none' }}
              placeholder="10.00"
              required
              disabled={noTransferableAccounts}
            />
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px' }}>Minimum 10€</p>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '8px' }}>Mot de passe Bourso</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '1rem', outline: 'none' }}
              required
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
              style={{ flex: 1, padding: '8px 16px', backgroundColor: loading || noTransferableAccounts ? '#3b82f6cc' : '#3b82f6', color: 'white', borderRadius: '8px', border: 'none', cursor: loading || noTransferableAccounts ? 'not-allowed' : 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: loading || noTransferableAccounts ? 0.5 : 1 }}
              disabled={loading || noTransferableAccounts}
            >
              {loading ? (
                <>
                  <Loader style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
                  Traitement...
                </>
              ) : (
                <>
                  <Send style={{ width: '16px', height: '16px' }} />
                  Virer
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
