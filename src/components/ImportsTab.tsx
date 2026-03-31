import { useEffect, useState } from 'react'
import type { BudgetAnalysis } from '../types'
import { formatCurrency } from '../lib/finance'
import { api } from '../lib/api'

type SymbolOverride = {
  key: string
  name: string
  symbol: string
  updatedAt: string
}

type LivePosition = {
  investmentName: string
  symbol?: string
  source: 'live' | 'csv' | 'manual'
  productType: string
}

type Props = {
  imports: Array<{
    id: string
    fileName: string
    uploadedAt: string
    accountLabel?: string
    isActive: boolean
  }>
  analysis: BudgetAnalysis | null
  backendStatus: 'connecting' | 'online' | 'offline'
  onImport: () => void
}

export default function ImportsTab({ imports, analysis, backendStatus, onImport }: Props) {
  void onImport
  const [overrides, setOverrides] = useState<SymbolOverride[]>([])
  const [loadingOverrides, setLoadingOverrides] = useState(false)
  const [overrideName, setOverrideName] = useState('')
  const [overrideSymbol, setOverrideSymbol] = useState('')
  const [submittingOverride, setSubmittingOverride] = useState(false)
  const [overrideMessage, setOverrideMessage] = useState<string | null>(null)
  const [unresolvedPositions, setUnresolvedPositions] = useState<LivePosition[]>([])

  const loadSymbolOverrides = async () => {
    if (backendStatus !== 'online') {
      setOverrides([])
      setUnresolvedPositions([])
      return
    }

    setLoadingOverrides(true)
    try {
      const payload = await api.get<{ overrides: SymbolOverride[] }>('/markets/symbol-overrides', {
        cache: 'no-store',
      })
      setOverrides(payload.overrides)

      const marketsPayload = await api.get<{ positions: LivePosition[] }>('/markets/investments', {
        query: { period: '24h', fresh: 1 },
        cache: 'no-store',
      })
      const unresolved = marketsPayload.positions
        .filter((position) => position.source === 'csv' && position.productType !== 'crypto')
        .filter((position, index, self) => self.findIndex((item) => item.investmentName === position.investmentName) === index)
      setUnresolvedPositions(unresolved)
    } catch {
      setOverrideMessage('Impossible de charger les mappings ticker pour le moment.')
    } finally {
      setLoadingOverrides(false)
    }
  }

  useEffect(() => {
    void loadSymbolOverrides()
  }, [backendStatus])

  const handleSaveOverride = async () => {
    const name = overrideName.trim()
    const symbol = overrideSymbol.trim().toUpperCase()

    if (!name || !symbol) {
      setOverrideMessage('Renseigne un nom de fonds et un ticker Yahoo (ex: PSP5.PA).')
      return
    }

    setSubmittingOverride(true)
    try {
      await api.put('/markets/symbol-overrides', { name, symbol })
      setOverrideName('')
      setOverrideSymbol('')
      setOverrideMessage('Mapping enregistré. Les prochains refresh utiliseront ce ticker.')
      await loadSymbolOverrides()
    } catch {
      setOverrideMessage('Impossible d’enregistrer ce mapping ticker.')
    } finally {
      setSubmittingOverride(false)
    }
  }

  const handleDeleteOverride = async (key: string) => {
    try {
      await api.delete('/markets/symbol-overrides', { query: { key } })
      setOverrideMessage('Mapping supprimé.')
      await loadSymbolOverrides()
    } catch {
      setOverrideMessage('Suppression impossible pour ce mapping.')
    }
  }

  return (
    <div className="tab-content">
      <div className="section-header">
        <h2>🏦 Gestion de Vos Comptes Bancaires</h2>
      </div>

      {/* Bourso-only mode */}
      <div className="section upload-section">
        <h3>🔄 Synchronisation des comptes</h3>
        <div className="upload-box">
          <div className="upload-label">
            <span className="upload-text">
              Mode Bourso uniquement actif: les imports CSV sont désactivés. Utilise le bouton "Sync comptes" dans la section Actions Bourso.
            </span>
          </div>
        </div>
      </div>

      {/* Imports List */}
      {imports.length > 0 && (
        <div className="section">
          <h3>📋 Vos Comptes ({imports.length})</h3>
          <div className="imports-grid">
            {imports.map((imp) => (
              <div key={imp.id} className="import-card">
                <div className="import-header">
                  <h4>{imp.accountLabel || imp.fileName}</h4>
                  <span className={`import-status ${imp.isActive ? 'active' : 'inactive'}`}>
                    {imp.isActive ? '✅ Actif' : '⊘ Inactif'}
                  </span>
                </div>
                <div className="import-meta">
                  <small>{imp.fileName}</small>
                  <small>{new Date(imp.uploadedAt).toLocaleDateString('fr-FR')}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {analysis && (
        <div className="section">
          <h3>📊 Résumé de Vos Comptes</h3>
          <div className="accounts-summary">
            {analysis.accounts.map((acc, idx) => (
              <div key={idx} className="account-item">
                <span>{acc.accountLabel}</span>
                <strong>{formatCurrency(acc.balance ?? 0)}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <h3>🏷️ Mapping manuel des tickers bourse</h3>
        <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>
          Utilise ce mapping quand une ligne ETF/action reste en cours CSV (non live). Exemple ticker: PSP5.PA, CW8.PA, SP5C.SW.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px auto', gap: '10px', alignItems: 'center' }}>
          <input
            value={overrideName}
            onChange={(event) => setOverrideName(event.target.value)}
            placeholder="Nom exact du fonds (tel qu'importé)"
            disabled={backendStatus !== 'online' || submittingOverride}
            style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-panel-solid)', color: 'var(--text-primary)' }}
          />
          <input
            value={overrideSymbol}
            onChange={(event) => setOverrideSymbol(event.target.value.toUpperCase())}
            placeholder="Ticker Yahoo"
            disabled={backendStatus !== 'online' || submittingOverride}
            style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-panel-solid)', color: 'var(--text-primary)' }}
          />
          <button
            onClick={handleSaveOverride}
            disabled={backendStatus !== 'online' || submittingOverride}
            style={{ padding: '10px 14px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg,var(--accent-blue),var(--accent-copper))', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
          >
            Enregistrer
          </button>
        </div>

        {overrideMessage && (
          <p style={{ marginTop: '10px', color: 'var(--text-secondary)' }}>{overrideMessage}</p>
        )}

        {unresolvedPositions.length > 0 && (
          <div style={{ marginTop: '14px' }}>
            <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Lignes non résolues détectées:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {unresolvedPositions.map((position) => (
                <button
                  key={position.investmentName}
                  onClick={() => setOverrideName(position.investmentName)}
                  style={{ padding: '6px 10px', borderRadius: '999px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.78rem' }}
                >
                  {position.investmentName}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: '16px' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: '0.95rem' }}>Mappings actifs</h4>
          {loadingOverrides ? (
            <div style={{ color: 'var(--text-muted)' }}>Chargement…</div>
          ) : overrides.length === 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>Aucun mapping manuel enregistré.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {overrides.map((override) => (
                <div key={override.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)' }}>
                  <div>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{override.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{override.symbol}</div>
                  </div>
                  <button
                    onClick={() => void handleDeleteOverride(override.key)}
                    style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.12)', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                  >
                    Supprimer
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
