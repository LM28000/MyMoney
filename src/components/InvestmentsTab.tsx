import { useRef, useState } from 'react'
import { formatCurrency } from '../lib/finance'
import { api } from '../lib/api'

type InvestmentCsvType = 'positions' | 'operations'

type InvestmentPosition = {
  name: string
  isin: string
  quantity: number
  buyingPrice: number
  lastPrice: number
  intradayVariation: number
  currentValue: number
  amountVariation: number
  variation: number
}

type InvestmentOperation = {
  date: string
  label: string
  amount: number
  balance: number | null
  accountLabel: string
}

type InvestmentImportSummary = {
  id: string
  fileName: string
  uploadedAt: string
  accountLabel: string
  csvType: InvestmentCsvType
  periodStartDate?: string
  periodEndDate?: string
  isActive: boolean
  positions?: InvestmentPosition[]
  operations?: InvestmentOperation[]
  totalCurrentValue?: number
  totalInvested?: number
  totalGain?: number
  performancePercent?: number
}

type InvestmentPortfolio = {
  totalCurrentValue: number
  totalInvested: number
  totalGain: number
  performancePercent: number
  accounts: InvestmentImportSummary[]
}

type Props = {
  investmentImports: Array<{
    id: string
    fileName: string
    uploadedAt: string
    accountLabel: string
    csvType: InvestmentCsvType
    periodStartDate?: string
    periodEndDate?: string
    isActive: boolean
  }>
  portfolio: InvestmentPortfolio | null
  backendStatus: 'connecting' | 'online' | 'offline'
  onRefresh: () => void
}

const formatDate = (iso: string | undefined) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR')
}

const formatPercent = (n: number) => {
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(2)} %`
}

export default function InvestmentsTab({
  investmentImports,
  portfolio,
  backendStatus,
  onRefresh,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [labelInput, setLabelInput] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detailData, setDetailData] = useState<Record<string, InvestmentImportSummary>>({})
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const label = labelInput.trim() || file.name.replace(/\.csv$/i, '')
    setUploading(true)
    try {
      await api.post('/investment-import', { fileName: file.name, csvText: text, accountLabel: label })
      setLabelInput('')
      onRefresh()
    } catch (error) {
      alert(error instanceof Error ? error.message : "Erreur lors de l'import")
    } finally {
      setUploading(false)
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cet import ?')) return
    try {
      await api.delete(`/investment-imports/${id}`)
      if (expandedId === id) setExpandedId(null)
      onRefresh()
    } catch {
      alert('Erreur lors de la suppression')
    }
  }

  const handleToggle = async (id: string, current: boolean) => {
    try {
      await api.patch(`/investment-imports/${id}`, { isActive: !current })
      onRefresh()
    } catch {
      alert('Erreur lors de la mise à jour')
    }
  }

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    if (detailData[id]) return
    setLoadingDetail(id)
    try {
      // We get the full portfolio from the portfolio prop's accounts
      const account = portfolio?.accounts.find((a) => a.id === id)
      if (account) {
        setDetailData((prev) => ({ ...prev, [id]: account }))
      }
    } finally {
      setLoadingDetail(null)
    }
  }

  const isOnline = backendStatus === 'online'

  return (
    <div className="tab-content investments-tab">
      <div className="section-header">
        <h2>🚀 Investissements</h2>
      </div>

      {/* Portfolio summary cards */}
      {portfolio && portfolio.accounts.length > 0 && (
        <div className="summary-cards">
          <div className="card card-primary">
            <div className="card-label">Valeur actuelle</div>
            <div className="card-value">{formatCurrency(portfolio.totalCurrentValue)}</div>
          </div>
          {portfolio.totalInvested > 0 && (
            <>
              <div className="card">
                <div className="card-label">Investi</div>
                <div className="card-value">{formatCurrency(portfolio.totalInvested)}</div>
              </div>
              <div className="card">
                <div className="card-label">Plus-value</div>
                <div
                  className="card-value"
                  style={{ color: portfolio.totalGain >= 0 ? '#10b981' : '#ef4444' }}
                >
                  {formatCurrency(portfolio.totalGain)}
                </div>
                <div
                  className={`card-meta ${portfolio.performancePercent >= 0 ? 'healthy' : 'warning'}`}
                >
                  {formatPercent(portfolio.performancePercent)}
                </div>
              </div>
            </>
          )}
          <div className="card">
            <div className="card-label">Comptes actifs</div>
            <div className="card-value">{portfolio.accounts.length}</div>
          </div>
        </div>
      )}

      {/* CSV Upload */}
      <div className="section">
        <h3>📤 Importer un CSV d'investissement</h3>
        <div className="upload-section invest-upload">
          <div className="invest-upload-row">
            <input
              type="text"
              className="invest-label-input"
              placeholder="Nom du compte (ex: PEA, Livret A…)"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              disabled={!isOnline}
            />
            <label className="btn-upload-file" style={{ opacity: isOnline ? 1 : 0.5 }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                disabled={!isOnline || uploading}
                style={{ display: 'none' }}
              />
              {uploading ? '⏳ Import…' : '📁 Choisir un CSV'}
            </label>
          </div>
          <p className="upload-hint">
            Accepte les exports de positions (colonnes: name, isin, quantity…) et les exports
            d'opérations (colonnes: dateOp, label, amount…)
          </p>
        </div>
      </div>

      {/* Imports list */}
      <div className="section">
        <h3>📋 Vos imports ({investmentImports.length})</h3>
        {investmentImports.length === 0 ? (
          <p className="empty-state">
            Aucun import. Ajoutez un CSV d'export de positions ou d'opérations.
          </p>
        ) : (
          <div className="invest-imports-list">
            {investmentImports.map((imp) => {
              const isExpanded = expandedId === imp.id
              const detail = detailData[imp.id] ?? portfolio?.accounts.find((a) => a.id === imp.id)
              return (
                <div
                  key={imp.id}
                  className={`invest-import-card ${imp.isActive ? '' : 'inactive'}`}
                >
                  <div className="invest-import-header">
                    <div className="invest-import-info">
                      <span className="invest-import-label">{imp.accountLabel}</span>
                      <span className={`invest-type-badge ${imp.csvType}`}>
                        {imp.csvType === 'positions' ? '📈 Positions' : '📋 Opérations'}
                      </span>
                    </div>
                    <div className="invest-import-actions">
                      <button
                        className={`btn-toggle-import ${imp.isActive ? 'active' : 'inactive'}`}
                        onClick={() => handleToggle(imp.id, imp.isActive)}
                        title={imp.isActive ? 'Désactiver' : 'Activer'}
                      >
                        {imp.isActive ? '✅' : '⊘'}
                      </button>
                      <button
                        className="btn-expand-import"
                        onClick={() => handleExpand(imp.id)}
                        title="Voir le détail"
                      >
                        {isExpanded ? '▲' : '▼'}
                      </button>
                      <button
                        className="btn-delete-import"
                        onClick={() => handleDelete(imp.id)}
                        title="Supprimer"
                      >
                        🗑
                      </button>
                    </div>
                  </div>

                  <div className="invest-import-meta">
                    <span className="meta-item">📄 {imp.fileName}</span>
                    <span className="meta-item">
                      🗓 Import: {formatDate(imp.uploadedAt)}
                    </span>
                    {(imp.periodStartDate || imp.periodEndDate) && (
                      <span className="meta-item">
                        📅 Période: {formatDate(imp.periodStartDate)} →{' '}
                        {formatDate(imp.periodEndDate)}
                      </span>
                    )}
                    {imp.csvType === 'positions' && detail?.totalCurrentValue !== undefined && (
                      <span className="meta-item meta-value">
                        💰 {formatCurrency(detail.totalCurrentValue)}
                        {detail.performancePercent !== undefined && detail.performancePercent !== 0 && (
                          <span
                            className={`perf-pill ${detail.performancePercent >= 0 ? 'pos' : 'neg'}`}
                          >
                            {formatPercent(detail.performancePercent)}
                          </span>
                        )}
                      </span>
                    )}
                    {imp.csvType === 'operations' && detail?.totalCurrentValue !== undefined && (
                      <span className="meta-item meta-value">
                        💰 Solde: {formatCurrency(detail.totalCurrentValue)}
                      </span>
                    )}
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="invest-detail">
                      {loadingDetail === imp.id && <p>Chargement…</p>}

                      {/* Positions table */}
                      {imp.csvType === 'positions' && detail?.positions && (
                        <div className="positions-table-wrap">
                          <table className="positions-table">
                            <thead>
                              <tr>
                                <th>Titre</th>
                                <th>ISIN</th>
                                <th>Qté</th>
                                <th>PRU</th>
                                <th>Cours</th>
                                <th>Jour</th>
                                <th>Valeur</th>
                                <th>+/-</th>
                                <th>Perf.</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.positions.map((pos, i) => (
                                <tr key={i}>
                                  <td className="pos-name">{pos.name}</td>
                                  <td className="pos-isin">{pos.isin}</td>
                                  <td className="pos-num">{pos.quantity}</td>
                                  <td className="pos-num">{formatCurrency(pos.buyingPrice)}</td>
                                  <td className="pos-num">{formatCurrency(pos.lastPrice)}</td>
                                  <td
                                    className={`pos-num ${pos.intradayVariation >= 0 ? 'pos' : 'neg'}`}
                                  >
                                    {formatPercent(pos.intradayVariation)}
                                  </td>
                                  <td className="pos-num">{formatCurrency(pos.currentValue)}</td>
                                  <td
                                    className={`pos-num ${pos.amountVariation >= 0 ? 'pos' : 'neg'}`}
                                  >
                                    {formatCurrency(pos.amountVariation)}
                                  </td>
                                  <td
                                    className={`pos-num ${pos.variation >= 0 ? 'pos' : 'neg'}`}
                                  >
                                    {formatPercent(pos.variation)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            {detail.positions.length > 1 && (
                              <tfoot>
                                <tr>
                                  <td colSpan={6} className="pos-total-label">
                                    Total
                                  </td>
                                  <td className="pos-num pos-total">
                                    {formatCurrency(detail.totalCurrentValue ?? 0)}
                                  </td>
                                  <td
                                    className={`pos-num pos-total ${(detail.totalGain ?? 0) >= 0 ? 'pos' : 'neg'}`}
                                  >
                                    {formatCurrency(detail.totalGain ?? 0)}
                                  </td>
                                  <td
                                    className={`pos-num pos-total ${(detail.performancePercent ?? 0) >= 0 ? 'pos' : 'neg'}`}
                                  >
                                    {formatPercent(detail.performancePercent ?? 0)}
                                  </td>
                                </tr>
                              </tfoot>
                            )}
                          </table>
                        </div>
                      )}

                      {/* Operations list */}
                      {imp.csvType === 'operations' && detail?.operations && (
                        <div className="invest-ops-list">
                          <table className="positions-table">
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Opération</th>
                                <th>Montant</th>
                                <th>Solde</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.operations.slice(0, 50).map((op, i) => (
                                <tr key={i}>
                                  <td className="pos-isin">{formatDate(op.date)}</td>
                                  <td className="pos-name">{op.label}</td>
                                  <td
                                    className={`pos-num ${op.amount >= 0 ? 'pos' : 'neg'}`}
                                  >
                                    {formatCurrency(op.amount)}
                                  </td>
                                  <td className="pos-num">
                                    {op.balance !== null ? formatCurrency(op.balance) : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {detail.operations.length > 50 && (
                            <p className="ops-truncated">
                              Affiche les 50 premières opérations sur {detail.operations.length}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
