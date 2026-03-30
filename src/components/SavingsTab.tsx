import type { ManualNetWorthItem } from '../types'
import { formatCurrency } from '../lib/finance'
import { useState } from 'react'
import { api } from '../lib/api'

type Props = {
  netWorthItems: ManualNetWorthItem[]
}

export default function SavingsTab({ netWorthItems }: Props) {
  const [showNewForm, setShowNewForm] = useState(false)
  const [label, setLabel] = useState('')
  const [value, setValue] = useState('')

  const savingsItems = netWorthItems.filter((item) => item.kind === 'asset')

  const handleAddSavings = async () => {
    if (!label || !value) return

    const newItem: ManualNetWorthItem = {
      id: `savings-${Date.now()}`,
      label,
      kind: 'asset',
      value: parseFloat(value),
    }

    try {
      await api.put('/networth-items', { netWorthItems: [...netWorthItems, newItem] })
      setLabel('')
      setValue('')
      setShowNewForm(false)
    } catch {
      alert('Erreur lors de la sauvegarde')
    }
  }

  return (
    <div className="tab-content">
      <div className="section-header">
        <h2>💳 Épargne & Investissements</h2>
      </div>

      {/* Add Form */}
      <div className="section">
        <button
          className="btn-secondary"
          onClick={() => setShowNewForm(!showNewForm)}
        >
          {showNewForm ? '❌ Annuler' : '➕ Ajouter un produit'}
        </button>

        {showNewForm && (
          <div className="form-group">
            <input
              type="text"
              placeholder="Nom du produit (ex: PEA Boursobank)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <input
              type="number"
              placeholder="Montant"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <button className="btn-primary" onClick={handleAddSavings}>
              Ajouter
            </button>
          </div>
        )}
      </div>

      {/* Savings Grid */}
      {savingsItems.length > 0 && (
        <div className="section">
          <h3>📈 Vos Produits d'Épargne ({savingsItems.length})</h3>
          <div className="savings-grid">
            {savingsItems.map((item) => (
              <div key={item.id} className="savings-card">
                <h4>{item.label}</h4>
                <div className="savings-value">{formatCurrency(item.value)}</div>
              </div>
            ))}
          </div>
          <div className="savings-total">
            <strong>Total Épargne:</strong>{' '}
            {formatCurrency(savingsItems.reduce((sum, item) => sum + item.value, 0))}
          </div>
        </div>
      )}

      {savingsItems.length === 0 && !showNewForm && (
        <p className="empty-state">Aucun produit d'épargne ajouté.</p>
      )}
    </div>
  )
}
