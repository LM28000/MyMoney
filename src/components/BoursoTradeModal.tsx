import { useState } from 'react'
import { TrendingUp, AlertCircle, Loader } from 'lucide-react'
import { apiBourso } from '../lib/api-bourso'
import type { BoursoAccount, TradeOrder, OrderSide } from '../types-bourso'

interface BoursoTradeModalProps {
  isOpen: boolean
  onClose: () => void
  accounts: BoursoAccount[]
  onSuccess?: () => void
}

export function BoursoTradeModal({ isOpen, onClose, accounts, onSuccess }: BoursoTradeModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [accountId, setAccountId] = useState('')
  const [symbol, setSymbol] = useState('')
  const [side, setSide] = useState<OrderSide>('buy')
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')

  console.log('[BoursoTradeModal] isOpen:', isOpen, 'accounts count:', accounts.length)

  if (!isOpen) return null

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (!accountId || !symbol || !quantity || !password) {
        throw new Error('All fields are required')
      }

      const order: TradeOrder = {
        symbol,
        side,
        quantity: parseFloat(quantity),
        accountId,
        ...(price && { price: parseFloat(price) }),
      }

      await apiBourso.placeOrder(order, password)

      // Reset form
      setAccountId('')
      setSymbol('')
      setQuantity('')
      setPrice('')
      setPassword('')
      setSide('buy')

      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Order failed')
    } finally {
      setLoading(false)
    }
  }

  const tradingAccounts = accounts.filter(a => a.kind === 'Trading')
  const noTradingAccounts = tradingAccounts.length === 0

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '24px', width: '100%', maxWidth: '448px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '16px' }}>Passer un ordre</h2>

        {noTradingAccounts && (
          <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', color: '#1e3a8a', fontSize: '0.875rem' }}>
            Aucun compte Bourso trading disponible. Lancez d'abord "Sync Comptes" dans le widget Bourso, puis rouvrez cette modale.
          </div>
        )}

        {error && (
          <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', display: 'flex', gap: '8px', color: '#b91c1c', alignItems: 'flex-start' }}>
            <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0, marginTop: '4px' }} />
            <span style={{ fontSize: '0.875rem' }}>{error}</span>
          </div>
        )}

        <form onSubmit={handlePlaceOrder} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '8px' }}>Compte de trading</label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '1rem', outline: 'none' }}
              required
              disabled={noTradingAccounts}
            >
              <option value="">Sélectionner...</option>
              {tradingAccounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.balance.toFixed(2)}€)
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '8px' }}>Type</label>
              <select
                value={side}
                onChange={(e) => setSide(e.target.value as OrderSide)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '1rem', outline: 'none' }}
                disabled={noTradingAccounts}
              >
                <option value="buy">Achat</option>
                <option value="sell">Vente</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '8px' }}>Quantité</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '1rem', outline: 'none' }}
                placeholder="1"
                required
                disabled={noTradingAccounts}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '8px' }}>
              Symbole (ex: 1rTCW8 pour AMUNDI MSCI WORLD)
            </label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '1rem', outline: 'none' }}
              placeholder="1rTCW8"
              required
              disabled={noTradingAccounts}
            />
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px' }}>
              Trouvez le symbole dans l'URL Boursorama du produit
            </p>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '8px' }}>Prix limite (optionnel)</label>
            <input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '1rem', outline: 'none' }}
              placeholder="Marché"
              disabled={noTradingAccounts}
            />
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px' }}>Laissez vide pour un ordre au marché</p>
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
              disabled={loading || noTradingAccounts}
              style={{ flex: 1, padding: '8px 16px', backgroundColor: loading || noTradingAccounts ? '#16a34acc' : '#16a34a', color: 'white', borderRadius: '8px', border: 'none', cursor: loading || noTradingAccounts ? 'not-allowed' : 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: loading || noTradingAccounts ? 0.5 : 1 }}
            >
              {loading ? (
                <>
                  <Loader style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
                  Traitement...
                </>
              ) : (
                <>
                  <TrendingUp style={{ width: '16px', height: '16px' }} />
                  Placer l'ordre
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
