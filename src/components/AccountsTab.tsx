import { useEffect, useRef, useState } from 'react'

import { api, ApiError } from '../lib/api'
import { apiBourso } from '../lib/api-bourso'
import { formatCurrency } from '../lib/finance'
import CsvMappingDialog from './CsvMappingDialog'
import { BoursoTransferModal } from './BoursoTransferModal'
import { BoursoTradeModal } from './BoursoTradeModal'
import { BoursoActionsWidget } from './BoursoActionsWidget'
import { ErrorBoundary } from './ErrorBoundary'
import type { BoursoAccount } from '../types-bourso'

export type ProductType =
  | 'checking'
  | 'credit'
  | 'livret-a'
  | 'livret-jeune'
  | 'lep'
  | 'ldds'
  | 'livret-other'
  | 'pea'
  | 'pea-pme'
  | 'assurance-vie'
  | 'per'
  | 'cto'
  | 'crypto'
  | 'real-estate'
  | 'other'

export type AccountImport = {
  id: string
  fileName: string
  uploadedAt: string
  periodStartDate?: string
  periodEndDate?: string
  isActive: boolean
  importKind?: 'operations' | 'positions' | 'unknown'
}

export type CryptoHolding = {
  coinId?: string
  symbol?: string
  name?: string
  quantity?: number
  averageBuyPrice?: number
  walletAddress?: string
  walletNetwork?: 'bitcoin' | 'ethereum'
}

export type Account = {
  id: string
  name: string
  productType: ProductType
  institution?: string
  balance: number
  manualBalance?: number
  cryptoHolding?: CryptoHolding
  notes?: string
  kind: 'asset' | 'debt'
  isEligibleEmergencyFund: boolean
  importKind?: 'operations' | 'positions' | 'unknown'
  trendAmount?: number | null
  trendPercent?: number | null
  trendLabel?: string | null
  sourceLabel?: string | null
  csvImports: AccountImport[]
}

type Props = {
  accounts: Account[]
  backendStatus: 'connecting' | 'online' | 'offline'
  onRefresh: () => void
}

type NewAccountForm = {
  name: string
  productType: ProductType
  institution: string
  manualBalance: string
  cryptoWalletAddress: string
  cryptoWalletNetwork: 'bitcoin' | 'ethereum'
  cryptoName: string
  cryptoSymbol: string
  cryptoQuantity: string
  cryptoAverageBuyPrice: string
  kind: 'asset' | 'debt'
  notes: string
}

const PRODUCT_LABELS: Record<ProductType, string> = {
  checking: '🏦 Compte courant',
  credit: '💳 Crédit',
  'livret-a': '💚 Livret A',
  'livret-jeune': '💚 Livret Jeune',
  lep: '💚 LEP',
  ldds: '💚 LDDS',
  'livret-other': '💚 Livret autre',
  pea: '📈 PEA',
  'pea-pme': '📈 PEA-PME',
  'assurance-vie': '🛡 Assurance vie',
  per: '🏦 PER',
  cto: '📊 CTO',
  crypto: '₿ Crypto',
  'real-estate': '🏠 Immobilier',
  other: '💼 Autre',
}

const LIVRET_TYPES: ProductType[] = ['livret-a', 'livret-jeune', 'lep', 'ldds', 'livret-other']

const emptyForm: NewAccountForm = {
  name: '',
  productType: 'checking',
  institution: '',
  manualBalance: '',
  cryptoWalletAddress: '',
  cryptoWalletNetwork: 'bitcoin',
  cryptoName: '',
  cryptoSymbol: '',
  cryptoQuantity: '',
  cryptoAverageBuyPrice: '',
  kind: 'asset',
  notes: '',
}

const formatDate = (iso?: string) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR')
}

const formatSignedCurrency = (value: number) => `${value >= 0 ? '+' : ''}${formatCurrency(value)}`
const formatSignedPercent = (value: number) => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)} %`

export default function AccountsTab({ accounts, backendStatus, onRefresh }: Props) {
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<NewAccountForm>(emptyForm)
  const [creating, setCreating] = useState(false)
  const [resolvingCreateCryptoAddress, setResolvingCreateCryptoAddress] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)
  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  const [editingNameValue, setEditingNameValue] = useState('')
  const [editingCryptoId, setEditingCryptoId] = useState<string | null>(null)
  const [syncingCryptoAddressId, setSyncingCryptoAddressId] = useState<string | null>(null)
  const [refreshingAccountId, setRefreshingAccountId] = useState<string | null>(null)
  const [cryptoDraft, setCryptoDraft] = useState({
    name: '',
    symbol: '',
    quantity: '',
    averageBuyPrice: '',
    walletAddress: '',
    walletNetwork: 'bitcoin' as 'bitcoin' | 'ethereum',
  })
  const [csvMapping, setCsvMapping] = useState<{ accountId: string; fileName: string; csvText: string; productType: ProductType } | null>(null)
  const [showBoursoTransfer, setShowBoursoTransfer] = useState(false)
  const [showBoursoTrade, setShowBoursoTrade] = useState(false)
  const [boursoAccounts, setBoursoAccounts] = useState<BoursoAccount[]>([])
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const isOnline = backendStatus === 'online'
  const isCryptoForm = form.productType === 'crypto'

  const handleRenameAccount = async (id: string, newName: string) => {
    if (!newName.trim()) return
    try {
      await api.patch(`/accounts/${id}`, { name: newName.trim() })
      setEditingNameId(null)
      onRefresh()
    } catch (error) {
      alert(error instanceof ApiError ? error.message : 'Erreur lors de la sauvegarde')
    }
  }

  const startEditCrypto = (account: Account) => {
    setEditingCryptoId(account.id)
    setCryptoDraft({
      name: account.cryptoHolding?.name ?? '',
      symbol: account.cryptoHolding?.symbol ?? '',
      quantity: account.cryptoHolding?.quantity !== undefined ? String(account.cryptoHolding.quantity) : '',
      averageBuyPrice: account.cryptoHolding?.averageBuyPrice !== undefined ? String(account.cryptoHolding.averageBuyPrice) : '',
      walletAddress: account.cryptoHolding?.walletAddress ?? '',
      walletNetwork: account.cryptoHolding?.walletNetwork ?? 'bitcoin',
    })
  }

  const handleSaveCrypto = async (accountId: string) => {
    const quantity = Number(cryptoDraft.quantity)
    const averageBuyPrice = Number(cryptoDraft.averageBuyPrice)

    if (!cryptoDraft.name.trim() || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(averageBuyPrice) || averageBuyPrice <= 0) {
      alert('Renseignez un nom, une quantité et un prix d\'achat valides.')
      return
    }

    try {
      await api.patch(`/accounts/${accountId}`, {
        cryptoHolding: {
          name: cryptoDraft.name.trim(),
          symbol: cryptoDraft.symbol.trim() || undefined,
          quantity,
          averageBuyPrice,
          walletAddress: cryptoDraft.walletAddress.trim() || undefined,
          walletNetwork: cryptoDraft.walletAddress.trim() ? cryptoDraft.walletNetwork : undefined,
        },
      })
      setEditingCryptoId(null)
      onRefresh()
    } catch (error) {
      alert(error instanceof ApiError ? error.message : 'Erreur lors de la mise à jour crypto')
    }
  }

  const handleImportCryptoAddress = async (accountId: string) => {
    const address = cryptoDraft.walletAddress.trim()
    if (!address) {
      alert('Renseignez une adresse de wallet.')
      return
    }

    const averageBuyPrice = Number(cryptoDraft.averageBuyPrice)

    setSyncingCryptoAddressId(accountId)
    try {
      const response = await api.post<{
        account: { cryptoHolding?: CryptoHolding }
        imported: { quantity: number }
      }>(`/accounts/${accountId}/crypto/address-import`, {
        address,
        network: cryptoDraft.walletNetwork,
        averageBuyPrice:
          Number.isFinite(averageBuyPrice) && averageBuyPrice > 0
            ? averageBuyPrice
            : undefined,
      })

      const holding = response.account.cryptoHolding
      if (holding) {
        setCryptoDraft((current) => ({
          ...current,
          name: holding.name ?? current.name,
          symbol: holding.symbol ?? current.symbol,
          quantity: holding.quantity !== undefined ? String(holding.quantity) : current.quantity,
          averageBuyPrice:
            holding.averageBuyPrice !== undefined
              ? String(holding.averageBuyPrice)
              : current.averageBuyPrice,
          walletAddress: holding.walletAddress ?? current.walletAddress,
          walletNetwork: holding.walletNetwork ?? current.walletNetwork,
        }))
      }

      onRefresh()
    } catch (error) {
      alert(error instanceof ApiError ? error.message : 'Impossible de récupérer cette adresse crypto')
    } finally {
      setSyncingCryptoAddressId(null)
    }
  }

  const handleCreateAccount = async () => {
    if (!form.name.trim()) return
    if (isCryptoForm && (!form.cryptoName.trim() || !form.cryptoQuantity.trim() || !form.cryptoAverageBuyPrice.trim())) {
      alert('Renseignez la crypto, la quantité et le prix d\'achat moyen.')
      return
    }

    setCreating(true)
    try {
      await api.post('/accounts', {
        name: form.name,
        productType: form.productType,
        institution: form.institution || undefined,
        manualBalance: form.manualBalance ? Number(form.manualBalance) : undefined,
        cryptoHolding: isCryptoForm
          ? {
              coinId:
                form.cryptoWalletNetwork === 'bitcoin'
                  ? 'bitcoin'
                  : form.cryptoWalletNetwork === 'ethereum'
                    ? 'ethereum'
                    : undefined,
              name: form.cryptoName.trim(),
              symbol: form.cryptoSymbol.trim() || undefined,
              quantity: Number(form.cryptoQuantity),
              averageBuyPrice: Number(form.cryptoAverageBuyPrice),
              walletAddress: form.cryptoWalletAddress.trim() || undefined,
              walletNetwork: form.cryptoWalletAddress.trim() ? form.cryptoWalletNetwork : undefined,
            }
          : undefined,
        kind: form.kind,
        notes: form.notes || undefined,
      })
      setForm(emptyForm)
      setShowCreate(false)
      onRefresh()
    } catch (error) {
      alert(error instanceof ApiError ? error.message : 'Erreur lors de la création')
    } finally {
      setCreating(false)
    }
  }

  const handleResolveCreateCryptoAddress = async () => {
    const address = form.cryptoWalletAddress.trim()
    if (!address) {
      alert('Renseignez une adresse wallet.')
      return
    }

    setResolvingCreateCryptoAddress(true)
    try {
      const response = await api.post<{
        quantity: number
        symbol: string
        name: string
        coinId: string
        network: 'bitcoin' | 'ethereum'
      }>('/crypto/address/resolve', {
        address,
        network: form.cryptoWalletNetwork,
      })

      setForm((current) => ({
        ...current,
        cryptoName: response.name || current.cryptoName,
        cryptoSymbol: response.symbol || current.cryptoSymbol,
        cryptoQuantity: String(response.quantity),
        cryptoWalletNetwork: response.network,
      }))
    } catch (error) {
      alert(error instanceof ApiError ? error.message : 'Impossible de récupérer cette adresse')
    } finally {
      setResolvingCreateCryptoAddress(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Supprimer le compte "${name}" ?`)) return
    await api.delete(`/accounts/${id}`)
    if (expandedId === id) setExpandedId(null)
    onRefresh()
  }

  const handleUploadCsv = async (accountId: string, file: File) => {
    const text = await file.text()
    const account = accounts.find((item) => item.id === accountId)
    if (!account) return

    setCsvMapping({
      accountId,
      fileName: file.name,
      csvText: text,
      productType: account.productType,
    })
  }

  const handleUploadCsvConfirmed = async (csvText: string) => {
    if (!csvMapping) return

    setUploadingFor(csvMapping.accountId)
    try {
      await api.post(`/accounts/${csvMapping.accountId}/imports`, { fileName: csvMapping.fileName, csvText })
      setCsvMapping(null)
      onRefresh()
    } catch (error) {
      alert(error instanceof ApiError ? error.message : 'Erreur import')
    } finally {
      setUploadingFor(null)
      if (csvMapping) {
        const ref = fileRefs.current[csvMapping.accountId]
        if (ref) ref.value = ''
      }
    }
  }

  const handleDeleteImport = async (accountId: string, importId: string) => {
    if (!confirm('Supprimer cet export CSV ?')) return
    await api.delete(`/accounts/${accountId}/imports/${importId}`)
    onRefresh()
  }

  const handleToggleImport = async (accountId: string, importId: string, current: boolean) => {
    await api.patch(`/accounts/${accountId}/imports/${importId}`, { isActive: !current })
    onRefresh()
  }

  const handleToggleEmergency = async (account: Account) => {
    await api.patch(`/accounts/${account.id}`, { isEligibleEmergencyFund: !account.isEligibleEmergencyFund })
    onRefresh()
  }

  const handleRefreshAccount = async (account: Account) => {
    setRefreshingAccountId(account.id)
    try {
      if (account.productType === 'crypto' || account.productType === 'pea' || account.productType === 'pea-pme' || account.productType === 'assurance-vie' || account.productType === 'cto') {
        await api.get('/markets/investments', {
          query: { period: '24h', fresh: 1 },
          cache: 'no-store',
        })
      }
      onRefresh()
    } catch {
      alert('Impossible de rafraîchir ce compte pour le moment.')
    } finally {
      setRefreshingAccountId(null)
    }
  }

  const assets = accounts.filter((account) => account.kind === 'asset')
  const debts = accounts.filter((account) => account.kind === 'debt')
  const livrets = assets.filter((account) => LIVRET_TYPES.includes(account.productType))
  const checking = assets.filter((account) => account.productType === 'checking')
  const investments = assets.filter((account) => !LIVRET_TYPES.includes(account.productType) && account.productType !== 'checking')

  const groups = [
    { label: '🏦 Comptes courants', description: 'Liquidités disponibles immédiatement', items: checking, accent: 'checking' },
    { label: '💚 Livrets', description: 'Base de votre épargne de précaution', items: livrets, accent: 'savings' },
    { label: '📈 Investissements & épargne long terme', description: 'Valorisation et performance des supports investis', items: investments, accent: 'investments' },
    { label: '💳 Dettes rattachées', description: 'Comptes ou passifs suivis dans cette vue', items: debts, accent: 'debts' },
  ].filter((group) => group.items.length > 0)

  const summaryCards = [
    { label: 'Actifs', value: assets.reduce((sum, account) => sum + account.balance, 0) },
    { label: 'Dettes', value: debts.reduce((sum, account) => sum + account.balance, 0) },
    { label: 'Livrets', value: livrets.reduce((sum, account) => sum + account.balance, 0) },
    { label: 'Investissements', value: investments.reduce((sum, account) => sum + account.balance, 0) },
  ]

  const loadLastBoursoAccounts = async () => {
    try {
      const response = await apiBourso.getLastSyncedAccounts()
      setBoursoAccounts(response.accounts)
    } catch {
      setBoursoAccounts([])
    }
  }

  useEffect(() => {
    if (!showBoursoTransfer && !showBoursoTrade) return
    void loadLastBoursoAccounts()
  }, [showBoursoTransfer, showBoursoTrade])

  return (
    <div className="tab-content">
      <div className="section-header-row" style={{ marginBottom: '28px' }}>
        <div>
          <h2 style={{ fontSize: '2rem', margin: '0 0 6px', fontWeight: 800 }}>Comptes & Investissements</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Gérez vos comptes, exports CSV et paramètres crypto.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            className="btn-primary"
            onClick={() => {
              console.log('[AccountsTab] Virement button clicked')
              setShowBoursoTransfer(true)
            }}
            style={{ padding: '10px 18px', border: 'none', borderRadius: '12px', color: '#fff', fontWeight: 700, background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}
          >
            💸 Virement
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              console.log('[AccountsTab] Trading button clicked')
              setShowBoursoTrade(true)
            }}
            style={{ padding: '10px 18px', border: 'none', borderRadius: '12px', color: '#fff', fontWeight: 700, background: 'linear-gradient(135deg, #10b981, #059669)' }}
          >
            📈 Trading
          </button>
          <button
            className="btn-primary"
            onClick={() => setShowCreate((current) => !current)}
            style={{ padding: '10px 18px', border: 'none', borderRadius: '12px', color: '#fff', fontWeight: 700, background: 'linear-gradient(135deg,var(--accent-blue),var(--accent-purple))' }}
          >
            {showCreate ? 'Fermer' : 'Nouveau compte'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        {summaryCards.map((card) => (
          <div key={card.label} className="glass-panel" style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{card.label}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '6px' }}>{formatCurrency(card.value)}</div>
          </div>
        ))}
      </div>

      {showCreate && (
        <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
            <div className="form-field">
              <label>Nom *</label>
              <input type="text" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </div>
            <div className="form-field">
              <label>Produit</label>
              <select value={form.productType} onChange={(event) => setForm((current) => ({ ...current, productType: event.target.value as ProductType }))}>
                <optgroup label="Banque">
                  <option value="checking">Compte courant</option>
                  <option value="livret-a">Livret A</option>
                  <option value="livret-jeune">Livret Jeune</option>
                   <option value="credit">Crédit</option>
                  <option value="lep">LEP</option>
                  <option value="ldds">LDDS</option>
                  <option value="livret-other">Autre livret</option>
                </optgroup>
                <optgroup label="Investissements">
                  <option value="pea">PEA</option>
                  <option value="pea-pme">PEA-PME</option>
                  <option value="assurance-vie">Assurance vie</option>
                  <option value="per">PER</option>
                  <option value="cto">CTO</option>
                  <option value="crypto">Crypto</option>
                  <option value="real-estate">Immobilier</option>
                </optgroup>
                <optgroup label="Autre">
                  <option value="other">Autre</option>
                </optgroup>
              </select>
            </div>
            <div className="form-field">
              <label>Établissement</label>
              <input type="text" value={form.institution} onChange={(event) => setForm((current) => ({ ...current, institution: event.target.value }))} />
            </div>
            <div className="form-field">
              <label>Solde manuel</label>
              <input type="number" min="0" step="0.01" value={form.manualBalance} onChange={(event) => setForm((current) => ({ ...current, manualBalance: event.target.value }))} />
            </div>
            {isCryptoForm && (
              <>
                <div className="form-field">
                  <label>Réseau wallet</label>
                  <select value={form.cryptoWalletNetwork} onChange={(event) => setForm((current) => ({ ...current, cryptoWalletNetwork: event.target.value as 'bitcoin' | 'ethereum' }))}>
                    <option value="bitcoin">Bitcoin (BTC)</option>
                    <option value="ethereum">Ethereum (ETH)</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>Adresse wallet</label>
                  <input type="text" value={form.cryptoWalletAddress} placeholder="bc1... ou 0x..." onChange={(event) => setForm((current) => ({ ...current, cryptoWalletAddress: event.target.value }))} />
                </div>
                <div className="form-field" style={{ alignSelf: 'end' }}>
                  <button className="btn-secondary" type="button" onClick={() => void handleResolveCreateCryptoAddress()} disabled={resolvingCreateCryptoAddress || !form.cryptoWalletAddress.trim()}>
                    {resolvingCreateCryptoAddress ? 'Import…' : 'Importer depuis adresse'}
                  </button>
                </div>
                <div className="form-field">
                  <label>Crypto *</label>
                  <input type="text" value={form.cryptoName} onChange={(event) => setForm((current) => ({ ...current, cryptoName: event.target.value }))} />
                </div>
                <div className="form-field">
                  <label>Symbole</label>
                  <input type="text" value={form.cryptoSymbol} onChange={(event) => setForm((current) => ({ ...current, cryptoSymbol: event.target.value.toUpperCase() }))} />
                </div>
                <div className="form-field">
                  <label>Quantité *</label>
                  <input type="number" min="0" step="0.00000001" value={form.cryptoQuantity} onChange={(event) => setForm((current) => ({ ...current, cryptoQuantity: event.target.value }))} />
                </div>
                <div className="form-field">
                  <label>Prix d'achat moyen *</label>
                  <input type="number" min="0" step="0.01" value={form.cryptoAverageBuyPrice} onChange={(event) => setForm((current) => ({ ...current, cryptoAverageBuyPrice: event.target.value }))} />
                </div>
              </>
            )}
            <div className="form-field">
              <label>Type</label>
              <select value={form.kind} onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value as 'asset' | 'debt' }))}>
                <option value="asset">Actif</option>
                <option value="debt">Dette</option>
              </select>
            </div>
            <div className="form-field form-field-full">
              <label>Notes</label>
              <input type="text" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
            </div>
          </div>
          <div className="form-actions" style={{ marginTop: '16px' }}>
            <button className="btn-primary" onClick={handleCreateAccount} disabled={creating || !form.name.trim()}>
              {creating ? 'Création…' : 'Créer le compte'}
            </button>
          </div>
        </div>
      )}

      {accounts.length === 0 && !showCreate && (
        <div className="glass-panel" style={{ padding: '36px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Aucun compte. Créez votre premier compte pour suivre votre patrimoine.
        </div>
      )}

      {groups.map((group) => (
        <div key={group.label} className="section">
          <div className="account-group-header">
            <div>
              <h3>{group.label}</h3>
              <p className="section-info">{group.description}</p>
            </div>
            <div className={`account-group-total ${group.accent}`}>{formatCurrency(group.items.reduce((sum, account) => sum + account.balance, 0))}</div>
          </div>

          <div className="account-cards-list">
            {group.items.map((account) => {
              const expanded = expandedId === account.id
              const trendTone = account.trendAmount === undefined || account.trendAmount === null ? 'neutral' : account.trendAmount >= 0 ? 'up' : 'down'

              return (
                <div key={account.id} className={`account-card ${expanded ? 'expanded' : ''} ${account.kind === 'debt' ? 'debt' : ''}`}>
                  <div className="account-card-header">
                    <div className="account-card-main">
                      <span className="account-type-badge">{PRODUCT_LABELS[account.productType]}</span>
                      {editingNameId === account.id ? (
                        <input
                          type="text"
                          value={editingNameValue}
                          onChange={(event) => setEditingNameValue(event.target.value)}
                          onBlur={() => handleRenameAccount(account.id, editingNameValue)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') handleRenameAccount(account.id, editingNameValue)
                            if (event.key === 'Escape') setEditingNameId(null)
                          }}
                          autoFocus
                          className="account-name-input"
                        />
                      ) : (
                        <div className="account-card-name" onDoubleClick={() => { setEditingNameId(account.id); setEditingNameValue(account.name) }}>
                          {account.name}
                        </div>
                      )}
                      {account.institution && <div className="account-card-institution">{account.institution}</div>}
                    </div>

                    <div className="account-card-right">
                      <div className="account-card-balance" style={{ color: account.kind === 'debt' ? 'var(--danger)' : undefined }}>
                        {formatCurrency(account.balance)}
                      </div>
                      {account.trendAmount !== undefined && account.trendAmount !== null && (
                        <div className={`account-card-trend ${trendTone}`}>
                          <span>{formatSignedCurrency(account.trendAmount)}</span>
                          {account.trendPercent !== undefined && account.trendPercent !== null && (
                            <span className="account-card-trend-percent">{formatSignedPercent(account.trendPercent)}</span>
                          )}
                        </div>
                      )}
                      {account.trendLabel && <div className="account-card-trend-label">{account.trendLabel}</div>}
                      {account.sourceLabel && <div className="account-card-source">{account.sourceLabel}</div>}
                      <div className="account-card-actions">
                        {(account.productType === 'crypto' || account.productType === 'pea' || account.productType === 'pea-pme' || account.productType === 'assurance-vie' || account.productType === 'cto') && (
                          <button
                            className="btn-icon"
                            onClick={() => void handleRefreshAccount(account)}
                            title="Rafraîchir cette ligne"
                          >
                            {refreshingAccountId === account.id ? '…' : '↻'}
                          </button>
                        )}
                        {LIVRET_TYPES.includes(account.productType) && (
                          <button className={`btn-icon ${account.isEligibleEmergencyFund ? 'active' : ''}`} onClick={() => handleToggleEmergency(account)}>
                            {account.isEligibleEmergencyFund ? '🛡' : '⬜'}
                          </button>
                        )}
                        <button className="btn-icon" onClick={() => setExpandedId(expanded ? null : account.id)}>{expanded ? '▲' : '▼'}</button>
                        <button className="btn-icon danger" onClick={() => handleDelete(account.id, account.name)}>🗑</button>
                      </div>
                    </div>
                  </div>

                  {expanded && (
                    <div className="account-card-detail">
                      <div className="account-detail-section">
                        <h4>📤 Ajouter un export CSV</h4>
                        {account.id.startsWith('bourso-') ? (
                          <p className="section-info" style={{ margin: 0 }}>Compte synchronisé Bourso: import CSV désactivé.</p>
                        ) : (
                          <label className="btn-upload-file" style={{ opacity: isOnline ? 1 : 0.5 }}>
                            <input
                              ref={(element) => { fileRefs.current[account.id] = element }}
                              type="file"
                              accept=".csv"
                              style={{ display: 'none' }}
                              disabled={!isOnline || uploadingFor === account.id}
                              onChange={(event) => {
                                const file = event.target.files?.[0]
                                if (file) void handleUploadCsv(account.id, file)
                              }}
                            />
                            {uploadingFor === account.id ? '⏳ Import…' : '📁 Choisir un CSV'}
                          </label>
                        )}
                      </div>

                      {account.productType === 'crypto' && account.cryptoHolding && (
                        <div className="account-detail-section">
                          <h4>₿ Paramètres crypto</h4>
                          <div className="crypto-config-grid">
                            <div className="crypto-config-item">
                              <span className="crypto-config-label">Actif</span>
                              {editingCryptoId === account.id ? <input type="text" value={cryptoDraft.name} onChange={(event) => setCryptoDraft((draft) => ({ ...draft, name: event.target.value }))} /> : <span className="crypto-config-value">{account.cryptoHolding.name ?? '—'}</span>}
                            </div>
                            <div className="crypto-config-item">
                              <span className="crypto-config-label">Symbole</span>
                              {editingCryptoId === account.id ? <input type="text" value={cryptoDraft.symbol} onChange={(event) => setCryptoDraft((draft) => ({ ...draft, symbol: event.target.value.toUpperCase() }))} /> : <span className="crypto-config-value">{account.cryptoHolding.symbol ?? '—'}</span>}
                            </div>
                            <div className="crypto-config-item">
                              <span className="crypto-config-label">Quantité</span>
                              {editingCryptoId === account.id ? <input type="number" min="0" step="0.00000001" value={cryptoDraft.quantity} onChange={(event) => setCryptoDraft((draft) => ({ ...draft, quantity: event.target.value }))} /> : <span className="crypto-config-value">{account.cryptoHolding.quantity ?? '—'}</span>}
                            </div>
                            <div className="crypto-config-item">
                              <span className="crypto-config-label">Prix d'achat moyen</span>
                              {editingCryptoId === account.id ? <input type="number" min="0" step="0.01" value={cryptoDraft.averageBuyPrice} onChange={(event) => setCryptoDraft((draft) => ({ ...draft, averageBuyPrice: event.target.value }))} /> : <span className="crypto-config-value">{account.cryptoHolding.averageBuyPrice !== undefined ? formatCurrency(account.cryptoHolding.averageBuyPrice) : '—'}</span>}
                            </div>
                            <div className="crypto-config-item">
                              <span className="crypto-config-label">Réseau wallet</span>
                              {editingCryptoId === account.id ? (
                                <select value={cryptoDraft.walletNetwork} onChange={(event) => setCryptoDraft((draft) => ({ ...draft, walletNetwork: event.target.value as 'bitcoin' | 'ethereum' }))}>
                                  <option value="bitcoin">Bitcoin (BTC)</option>
                                  <option value="ethereum">Ethereum (ETH)</option>
                                </select>
                              ) : (
                                <span className="crypto-config-value">
                                  {account.cryptoHolding.walletNetwork === 'ethereum' ? 'Ethereum' : account.cryptoHolding.walletNetwork === 'bitcoin' ? 'Bitcoin' : '—'}
                                </span>
                              )}
                            </div>
                            <div className="crypto-config-item">
                              <span className="crypto-config-label">Adresse wallet</span>
                              {editingCryptoId === account.id ? <input type="text" value={cryptoDraft.walletAddress} onChange={(event) => setCryptoDraft((draft) => ({ ...draft, walletAddress: event.target.value }))} placeholder="bc1... ou 0x..." /> : <span className="crypto-config-value">{account.cryptoHolding.walletAddress ?? '—'}</span>}
                            </div>
                          </div>
                          <div className="crypto-config-actions">
                            {editingCryptoId === account.id ? (
                              <>
                                <button className="btn-secondary" onClick={() => setEditingCryptoId(null)}>Annuler</button>
                                <button className="btn-secondary" onClick={() => void handleImportCryptoAddress(account.id)} disabled={syncingCryptoAddressId === account.id}>
                                  {syncingCryptoAddressId === account.id ? 'Sync…' : 'Importer adresse'}
                                </button>
                                <button className="btn-primary" onClick={() => handleSaveCrypto(account.id)}>Enregistrer</button>
                              </>
                            ) : (
                              <button className="btn-secondary" onClick={() => startEditCrypto(account)}>Modifier</button>
                            )}
                          </div>
                        </div>
                      )}

                      {account.csvImports.length > 0 && (
                        <div className="account-detail-section">
                          <h4>📋 Exports importés ({account.csvImports.length})</h4>
                          <div className="csv-imports-list">
                            {account.csvImports.map((entry) => (
                              <div key={entry.id} className={`csv-import-row ${entry.isActive ? '' : 'inactive'}`}>
                                <div className="csv-import-info">
                                  <span className="csv-file-name">{entry.fileName}</span>
                                  <span className="csv-meta">Import: {formatDate(entry.uploadedAt)}</span>
                                  {(entry.periodStartDate || entry.periodEndDate) && (
                                    <span className="csv-meta">Période: {formatDate(entry.periodStartDate)} → {formatDate(entry.periodEndDate)}</span>
                                  )}
                                </div>
                                <div className="csv-import-actions">
                                  <button className={`btn-icon ${entry.isActive ? 'active' : ''}`} onClick={() => handleToggleImport(account.id, entry.id, entry.isActive)}>{entry.isActive ? '✅' : '⊘'}</button>
                                  <button className="btn-icon danger" onClick={() => handleDeleteImport(account.id, entry.id)}>🗑</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {account.notes && <div className="account-detail-section"><span className="account-notes">{account.notes}</span></div>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {csvMapping && (
        <CsvMappingDialog
          fileName={csvMapping.fileName}
          csvText={csvMapping.csvText}
          productType={csvMapping.productType}
          onConfirm={handleUploadCsvConfirmed}
          onCancel={() => setCsvMapping(null)}
        />
      )}

      <div style={{ marginTop: '32px' }}>
        <ErrorBoundary>
          <BoursoActionsWidget onRefresh={onRefresh} />
        </ErrorBoundary>
      </div>

      <BoursoTransferModal
        isOpen={showBoursoTransfer}
        onClose={() => setShowBoursoTransfer(false)}
        accounts={boursoAccounts}
        onSuccess={onRefresh}
      />

      <BoursoTradeModal
        isOpen={showBoursoTrade}
        onClose={() => setShowBoursoTrade(false)}
        accounts={boursoAccounts}
        onSuccess={onRefresh}
      />
    </div>
  )
}