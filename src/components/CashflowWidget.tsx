import { formatCurrency } from '../lib/finance'
import type { CashflowProjection } from './DashboardTab'
import { StatRow } from './CardComponents'

type Props = {
  cashflow: CashflowProjection | null
}

export default function CashflowWidget({ cashflow }: Props) {
  if (!cashflow) return null

  const isWarning = cashflow.projectedEndBalance < 0

  return (
    <div className="section premium-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
      <div style={{ marginBottom: '1rem' }}>
        <span className="panel-kicker">Cashflow</span>
        <h3 style={{ marginBottom: '0.35rem' }}>Trésorerie prévisionnelle</h3>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Ce qui reste à vivre après les charges fixes déjà détectées.</p>
      </div>
      <div className="card" style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.02)' }}>
        <StatRow
          label="Solde Courant (Comptes Chèques)"
          value={formatCurrency(cashflow.currentBalance)}
        />
        <div style={{ padding: '0.75rem 0', opacity: 0.8 }}>
          <StatRow
            label={`Dépenses fixes à venir (${cashflow.pendingRecurringList.length})`}
            value={`- ${formatCurrency(cashflow.pendingRecurringExpenses)}`}
            valueColor="#e63946"
          />
        </div>
        
        <div style={{ marginTop: '0.5rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <StatRow
            label="Reste à vivre (Solde prévisionnel)"
            value={formatCurrency(cashflow.projectedEndBalance)}
            valueColor={isWarning ? 'var(--danger)' : 'var(--accent-teal)'}
            isBold={true}
          />
        </div>

        {cashflow.pendingRecurringList.length > 0 && (
          <div style={{ marginTop: '1.5rem' }}>
            <p style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '0.5rem', textTransform: 'uppercase' }}>Détail des charges à venir</p>
            {cashflow.pendingRecurringList.map((exp, idx) => (
              <StatRow
                key={idx}
                label={exp.name}
                value={formatCurrency(exp.amount)}
                meta={exp.cadence}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
