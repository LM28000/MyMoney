import type { ManualNetWorthItem } from '../types'
import { formatCurrency } from '../lib/finance'
import { api } from '../lib/api'

type EmergencyFund = {
  current: number
  target: number
  isHealthy: boolean
  months: number
}

type Props = {
  emergencyFund: EmergencyFund | undefined
  targetMonths: number
  designated: string[]
  netWorthItems: ManualNetWorthItem[]
  onUpdate: (items: string[]) => void
}

export default function EmergencyFundTab({
  emergencyFund,
  targetMonths,
  designated,
  netWorthItems,
  onUpdate,
}: Props) {
  const assetItems = netWorthItems.filter((item) => item.kind === 'asset')

  const toggleDesignated = async (label: string) => {
    const updated = designated.includes(label)
      ? designated.filter((d) => d !== label)
      : [...designated, label]

    try {
      await api.put('/emergency-fund', { designated: updated })
      onUpdate(updated)
    } catch {
      alert('Erreur lors de la mise à jour')
    }
  }

  return (
    <div className="tab-content">
      <div className="section-header">
        <h2>⏰ Épargne de Précaution</h2>
      </div>

      {emergencyFund && (
        <div className="section">
          <div className="emergency-fund-card">
            <div className="ef-status" style={{ color: emergencyFund.isHealthy ? '#10b981' : '#ef4444' }}>
              {emergencyFund.isHealthy ? '✅' : '⚠️'} Épargne de Précaution{' '}
              <strong>{emergencyFund.months.toFixed(1)} mois</strong>
            </div>
            <div className="ef-bar">
              <div
                className="ef-fill"
                style={{
                  width: `${Math.min((emergencyFund.current / emergencyFund.target) * 100, 100)}%`,
                  backgroundColor: emergencyFund.isHealthy ? '#10b981' : '#f97316',
                }}
              />
            </div>
            <div className="ef-labels">
              <span>{formatCurrency(emergencyFund.current)}</span>
              <span>{formatCurrency(emergencyFund.target)}</span>
            </div>
            <p className="ef-recommendation">
              Objectif recommandé: {targetMonths} mois de dépenses = {formatCurrency(emergencyFund.target)}
            </p>
          </div>
        </div>
      )}

      {/* Designate Assets */}
      {assetItems.length > 0 && (
        <div className="section">
          <h3>💾 Désigner Vos Comptes d'Épargne de Précaution</h3>
          <p className="section-info">
            Cochez les comptes à inclure dans votre épargne de précaution (Livret A, Compte courant, etc)
          </p>
          <div className="checklist">
            {assetItems.map((item) => (
              <label key={item.id} className="checkbox-item">
                <input
                  type="checkbox"
                  checked={designated.includes(item.label)}
                  onChange={() => toggleDesignated(item.label)}
                />
                <span>{item.label}</span>
                <span className="amount">{formatCurrency(item.value)}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Tips */}
      <div className="section tips-section">
        <h3>💡 Conseil</h3>
        <p>
          Une épargne de précaution représente généralement <strong>3 à 6 mois de dépenses</strong>. Elle permet
          de faire face aux imprévus sans avoir besoin d'endettement.
        </p>
      </div>
    </div>
  )
}
