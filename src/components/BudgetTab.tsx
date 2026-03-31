import { useState, useMemo, useEffect } from 'react'
import type { BudgetAnalysis, Transaction } from '../types'
import { formatCurrency } from '../lib/finance'
import { api } from '../lib/api'

type Props = {
  analysis: BudgetAnalysis | null
}

const PARENT_COLORS: Record<string, string> = {
  'Alimentation': '#10b981',
  'Transports': '#3b82f6',
  'Loisirs': '#8b5cf6',
  'Logement': '#f59e0b',
  'Santé': '#ef4444',
  'Shopping': '#ec4899',
  'Abonnements': '#14b8a6',
  'Restaurants': '#f97316',
  'Voyages': '#06b6d4',
  'Autres': '#64748b',
}

type Override = { category: string; categoryParent: string; supplier: string; note: string }

export default function BudgetTab({ analysis }: Props) {
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterDir, setFilterDir] = useState<'all' | 'income' | 'expense'>('all')
  const [overrides, setOverrides] = useState<Record<string, Override>>({})
  const [editingTxId, setEditingTxId] = useState<string | null>(null)
  const [editTx, setEditTx] = useState<Partial<Override>>({})

  // Load existing overrides
  useEffect(() => {
    api.get<any[]>('/transaction-overrides').then((list) => {
      const map: Record<string, Override> = {}
      list.forEach(o => { map[o.transactionId] = { category: o.category, categoryParent: o.categoryParent, supplier: o.supplier, note: o.note } })
      setOverrides(map)
    }).catch(() => {})
  }, [])

  if (!analysis || analysis.months.length === 0) {
    return (
      <div className="tab-content">
        <div style={{ padding: '60px', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📊</div>
          <h3 style={{ color: 'var(--text-primary)', margin: '0 0 8px' }}>Aucune donnée budgétaire</h3>
          <p style={{ color: 'var(--text-secondary)' }}>Importez vos relevés bancaires dans l'onglet Imports.</p>
        </div>
      </div>
    )
  }

  const monthKey = selectedMonthKey ?? analysis.months[0]?.key
  const currentMonth = analysis.monthly[monthKey]
  if (!currentMonth) return null

  // Merge transactions with overrides
  const transactions = useMemo(() => (currentMonth.allTransactions ?? []).map(tx => {
    const ov = overrides[tx.id]
    if (!ov) return tx
    return { ...tx, category: ov.category, categoryParent: ov.categoryParent, supplier: ov.supplier }
  }), [currentMonth.allTransactions, overrides])

  // Filter + search
  const filtered = useMemo(() => {
    return transactions.filter(tx => {
      if (filterDir !== 'all' && tx.direction !== filterDir) return false
      if (filterCategory !== 'all' && tx.categoryParent !== filterCategory) return false
      if (search) {
        const q = search.toLowerCase()
        return tx.label.toLowerCase().includes(q) || tx.supplier.toLowerCase().includes(q) || tx.category.toLowerCase().includes(q)
      }
      return true
    })
  }, [transactions, filterDir, filterCategory, search])

  const categories = [...new Set(transactions.map(t => t.categoryParent).filter(Boolean))].sort()

  const startEdit = (tx: Transaction) => {
    setEditingTxId(tx.id)
    setEditTx({ category: overrides[tx.id]?.category ?? tx.category, categoryParent: overrides[tx.id]?.categoryParent ?? tx.categoryParent, supplier: overrides[tx.id]?.supplier ?? tx.supplier, note: overrides[tx.id]?.note ?? '' })
  }

  const saveEdit = async (tx: Transaction) => {
    const payload = { ...editTx, transactionId: tx.id }
    await api.post(`/transactions/${tx.id}/override`, payload)
    setOverrides(prev => ({ ...prev, [tx.id]: { category: editTx.category ?? tx.category, categoryParent: editTx.categoryParent ?? tx.categoryParent, supplier: editTx.supplier ?? tx.supplier, note: editTx.note ?? '' } }))
    setEditingTxId(null)
  }

  const clearEdit = async (tx: Transaction) => {
    await api.delete(`/transactions/${tx.id}/override`)
    setOverrides(prev => { const next = { ...prev }; delete next[tx.id]; return next })
  }

  const incomeTotal = useMemo(() => transactions.filter(t => t.direction === 'income').reduce((s, t) => s + t.amount, 0), [transactions])
  const expenseTotal = useMemo(() => transactions.filter(t => t.direction === 'expense').reduce((s, t) => s + t.amount, 0), [transactions])

  return (
    <div className="tab-content">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '2rem', margin: '0 0 6px', fontWeight: 800 }}>Budget & Transactions</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Analysez vos dépenses et corrigez les catégories.</p>
        </div>
        <select value={monthKey} onChange={e => setSelectedMonthKey(e.target.value)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)', borderRadius: '10px', color: 'var(--text-primary)', padding: '10px 16px', fontSize: '0.9rem', cursor: 'pointer' }}>
          {analysis.months.map(m => <option key={m.key} value={m.key}>{m.label} ({m.transactionCount} opérations)</option>)}
        </select>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '14px', marginBottom: '24px' }}>
        {[
          { label: 'Revenus', value: incomeTotal, color: 'var(--success)', icon: '💰' },
          { label: 'Dépenses', value: -expenseTotal, color: 'var(--danger)', icon: '💸' },
          { label: 'Net', value: incomeTotal - expenseTotal, color: incomeTotal - expenseTotal >= 0 ? 'var(--success)' : 'var(--danger)', icon: '📊' },
          { label: 'Taux d\'épargne', value: null, color: 'var(--accent-blue)', icon: '🎯', text: incomeTotal > 0 ? `${((1 - expenseTotal / incomeTotal) * 100).toFixed(1)}%` : '—' },
        ].map(kpi => (
          <div key={kpi.label} className="glass-panel" style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: '1.4rem', marginBottom: '6px' }}>{kpi.icon}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{kpi.label}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: kpi.color, marginTop: '4px' }}>
              {kpi.text ?? formatCurrency(kpi.value!)}
            </div>
          </div>
        ))}
      </div>

      <div>
          {/* Filters */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Rechercher…" style={{ flex: 1, minWidth: '200px', padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '10px', color: 'var(--text-primary)', fontSize: '0.9rem' }} />
            <select value={filterDir} onChange={e => setFilterDir(e.target.value as any)} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '10px', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
              <option value="all">Tout</option>
              <option value="expense">Dépenses</option>
              <option value="income">Revenus</option>
            </select>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '10px', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
              <option value="all">Toutes catégories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '10px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              {filtered.length} opération{filtered.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Transaction list */}
          <div className="glass-panel" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                    {['Date', 'Libellé', 'Fournisseur', 'Catégorie', 'Montant', ''].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: h === 'Montant' ? 'right' : 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 200).map((tx, i) => {
                    const hasOv = Boolean(overrides[tx.id])
                    const isEditing = editingTxId === tx.id
                    const parentColor = PARENT_COLORS[tx.categoryParent] ?? 'var(--accent-blue)'

                    return (
                      <tr key={tx.id} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: '10px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{tx.operationDate?.slice(0, 10)}</td>
                        <td style={{ padding: '10px 16px', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                          {tx.label}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          {isEditing ? (
                            <input value={editTx.supplier ?? ''} onChange={e => setEditTx(p => ({ ...p, supplier: e.target.value }))} style={{ width: '120px', padding: '4px 8px', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem' }} />
                          ) : (
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{tx.supplier}</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          {isEditing ? (
                            <input value={editTx.category ?? ''} onChange={e => setEditTx(p => ({ ...p, category: e.target.value }))} style={{ width: '140px', padding: '4px 8px', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem' }} />
                          ) : (
                            <span style={{ fontSize: '0.8rem', padding: '3px 8px', borderRadius: '6px', background: `${parentColor}22`, color: parentColor, fontWeight: 600 }}>
                              {tx.category || 'Non catégorisé'}
                              {hasOv && <span style={{ marginLeft: '4px', opacity: 0.7 }}>✏️</span>}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: tx.direction === 'income' ? 'var(--success)' : 'var(--text-primary)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                          {tx.direction === 'income' ? '+' : ''}{formatCurrency(tx.amount)}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {isEditing ? (
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              <button onClick={() => saveEdit(tx)} style={{ padding: '4px 10px', background: 'var(--accent-blue)', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Sauver</button>
                              <button onClick={() => setEditingTxId(null)} style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                              <button onClick={() => startEdit(tx)} style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.78rem' }}>✏️</button>
                              {hasOv && <button onClick={() => clearEdit(tx)} title="Restaurer l'original" style={{ padding: '4px 8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.78rem' }}>↩</button>}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {filtered.length > 200 && (
                <div style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', borderTop: '1px solid var(--border-color)' }}>
                  Affichage limité à 200 résultats — affinez la recherche
                </div>
              )}
            </div>
          </div>
        </div>
    </div>
  )
}

