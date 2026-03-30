import { useEffect, useState } from 'react'
import { Plus, Trash2, Edit2, X, ChevronDown, ChevronUp, TrendingDown } from 'lucide-react'
import type { Debt, DebtType, AmortizationRow } from '../types'
import { api } from '../lib/api'

const fmt = (v: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
const fmtPct = (v: number) => `${v.toFixed(2)}%`

const DEBT_TYPES: { value: DebtType; label: string; icon: string }[] = [
  { value: 'mortgage', label: 'Prêt Immobilier', icon: '🏠' },
  { value: 'consumer', label: 'Crédit Conso', icon: '🛒' },
  { value: 'auto', label: 'Crédit Auto', icon: '🚗' },
  { value: 'student', label: 'Prêt Étudiant', icon: '🎓' },
  { value: 'other', label: 'Autre', icon: '📄' },
]

function computeAmortization(debt: Debt): AmortizationRow[] {
  const rows: AmortizationRow[] = []
  const mr = debt.interestRate / 100 / 12
  let balance = debt.balance
  const start = new Date(debt.startDate)
  const end = new Date(debt.endDate)
  const totalMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
  const n = Math.max(1, totalMonths)

  const payment = mr === 0 ? balance / n : (debt.balance * mr * Math.pow(1 + mr, n)) / (Math.pow(1 + mr, n) - 1)
  const monthly = debt.monthlyPayment || payment

  const today = new Date()
  let month = 0
  const cursor = new Date(today)

  while (balance > 0.01 && month < 360) {
    month++
    const interest = balance * mr
    const principal = Math.min(Math.max(0, monthly - interest), balance)
    balance = Math.max(0, balance - principal)
    const d = new Date(cursor)
    d.setMonth(d.getMonth() + month)
    rows.push({
      month,
      date: d.toISOString().slice(0, 7),
      payment: interest + principal,
      principal,
      interest,
      balance,
    })
    if (rows.length >= 360) break
  }
  return rows
}

type FormState = Omit<Debt, 'id'> & { id?: string }
const emptyForm = (): FormState => ({
  name: '',
  type: 'consumer',
  originalAmount: 0,
  balance: 0,
  interestRate: 0,
  monthlyPayment: 0,
  startDate: new Date().toISOString().slice(0, 10),
  endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 5)).toISOString().slice(0, 10),
})

export default function DebtsTab() {
  const [debts, setDebts] = useState<Debt[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    setDebts(await api.get<Debt[]>('/debts'))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openCreate = () => { setForm(emptyForm()); setEditingId(null); setShowModal(true) }
  const openEdit = (d: Debt) => { setForm({ ...d }); setEditingId(d.id); setShowModal(true) }
  const closeModal = () => { setShowModal(false); setEditingId(null) }

  const save = async () => {
    setSaving(true)
    if (editingId) {
      const updated = await api.put<Debt>(`/debts/${editingId}`, { ...form, id: editingId })
      setDebts(prev => prev.map(d => d.id === editingId ? updated : d))
    } else {
      const created = await api.post<Debt>('/debts', form)
      setDebts(prev => [...prev, created])
    }
    setSaving(false)
    closeModal()
  }

  const remove = async (id: string) => {
    if (!confirm('Supprimer ce crédit ?')) return
    await api.delete(`/debts/${id}`)
    setDebts(prev => prev.filter(d => d.id !== id))
  }

  const totalBalance = debts.reduce((s, d) => s + d.balance, 0)
  const totalMonthly = debts.reduce((s, d) => s + d.monthlyPayment, 0)
  const totalInterestRemaining = debts.reduce((d_acc, d) => {
    const rows = computeAmortization(d)
    return d_acc + rows.reduce((s, r) => s + r.interest, 0)
  }, 0)

  const setF = (k: keyof FormState, v: any) => setForm(prev => ({ ...prev, [k]: v }))

  return (
    <div className="tab-content">
      <div className="section-header-row" style={{ marginBottom: '28px' }}>
        <div>
          <h2 style={{ fontSize: '2rem', margin: '0 0 6px', fontWeight: 800 }}>Dettes & Crédits</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Suivi de vos emprunts avec tableaux d'amortissement détaillés.</p>
        </div>
        <button className="btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: 'linear-gradient(135deg,var(--accent-blue),var(--accent-purple))', border: 'none', borderRadius: '12px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem' }}>
          <Plus size={18} /> Ajouter un crédit
        </button>
      </div>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px', marginBottom: '28px' }}>
        {[
          { label: 'Capital Restant Dû', value: fmt(totalBalance), color: 'var(--danger)', icon: '💳' },
          { label: 'Mensualités Totales', value: `${fmt(totalMonthly)}/mois`, color: 'var(--warning)', icon: '📅' },
          { label: 'Intérêts Restants', value: fmt(totalInterestRemaining), color: 'var(--accent-purple)', icon: '📈' },
        ].map(kpi => (
          <div key={kpi.label} className="glass-panel" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '2rem' }}>{kpi.icon}</span>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{kpi.label}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Debt List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)' }}>Chargement…</div>
      ) : debts.length === 0 ? (
        <div className="glass-panel" style={{ padding: '60px', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🎉</div>
          <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>Aucun crédit enregistré</h3>
          <p style={{ color: 'var(--text-secondary)', margin: '0 0 20px' }}>Ajoutez vos emprunts pour suivre vos remboursements.</p>
          <button onClick={openCreate} style={{ padding: '10px 24px', background: 'var(--accent-blue)', border: 'none', borderRadius: '10px', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Ajouter un crédit</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {debts.map(d => {
            const typeInfo = DEBT_TYPES.find(t => t.value === d.type) ?? DEBT_TYPES[4]
            const remainingPct = d.originalAmount > 0 ? ((d.originalAmount - d.balance) / d.originalAmount) * 100 : 0
            const isExpanded = expandedId === d.id
            const amortRows = isExpanded ? computeAmortization(d) : []

            return (
              <div key={d.id} className="glass-panel" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '1.8rem' }}>{typeInfo.icon}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{d.name}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', gap: '12px', marginTop: '2px' }}>
                          <span>{typeInfo.label}</span>
                          <span>• {fmtPct(d.interestRate)}</span>
                          <span>• {d.startDate} → {d.endDate}</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ textAlign: 'right', marginRight: '8px' }}>
                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--danger)' }}>{fmt(d.balance)}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{fmt(d.monthlyPayment)}/mois</div>
                      </div>
                      <button onClick={() => openEdit(d)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px', cursor: 'pointer', color: 'var(--text-secondary)' }}><Edit2 size={15} /></button>
                      <button onClick={() => remove(d.id)} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '6px', cursor: 'pointer', color: 'var(--danger)' }}><Trash2 size={15} /></button>
                      <button onClick={() => setExpandedId(isExpanded ? null : d.id)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                        {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${remainingPct}%`, background: 'linear-gradient(90deg,var(--accent-blue),var(--accent-purple))', borderRadius: '3px', transition: 'width 0.6s ease' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    <span>Remboursé {remainingPct.toFixed(1)}%</span>
                    <span>{fmt(d.originalAmount - d.balance)} / {fmt(d.originalAmount)}</span>
                  </div>
                </div>

                {/* Amortization Table */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border-color)', padding: '0 24px 20px' }}>
                    <h4 style={{ margin: '16px 0 12px', fontSize: '0.95rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      <TrendingDown size={14} style={{ marginRight: 6 }} />
                      Tableau d'amortissement — {amortRows.length} mensualités restantes
                    </h4>
                    <div style={{ maxHeight: '320px', overflowY: 'auto', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                        <thead>
                          <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                            {['Mois', 'Date', 'Mensualité', 'Capital', 'Intérêts', 'Capital restant'].map(h => (
                              <th key={h} style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border-color)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {amortRows.map((r, i) => (
                            <tr key={r.month} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)', transition: 'background 0.15s' }}>
                              <td style={{ padding: '7px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>{r.month}</td>
                              <td style={{ padding: '7px 12px', textAlign: 'right' }}>{r.date}</td>
                              <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600 }}>{fmt(r.payment)}</td>
                              <td style={{ padding: '7px 12px', textAlign: 'right', color: 'var(--accent-blue)' }}>{fmt(r.principal)}</td>
                              <td style={{ padding: '7px 12px', textAlign: 'right', color: 'var(--accent-coral)' }}>{fmt(r.interest)}</td>
                              <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600 }}>{fmt(r.balance)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-panel" style={{ width: '520px', maxHeight: '90vh', overflowY: 'auto', padding: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ margin: 0, fontSize: '1.3rem' }}>{editingId ? 'Modifier le crédit' : 'Nouveau crédit'}</h3>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={22} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Nom du crédit
                <input value={form.name} onChange={e => setF('name', e.target.value)} placeholder="Ex: Prêt conso Cetelem" style={inputStyle} />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Type
                <select value={form.type} onChange={e => setF('type', e.target.value)} style={inputStyle}>
                  {DEBT_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                </select>
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  Montant initial (€)
                  <input type="number" value={form.originalAmount || ''} onChange={e => setF('originalAmount', Number(e.target.value))} style={inputStyle} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  Capital restant dû (€)
                  <input type="number" value={form.balance || ''} onChange={e => setF('balance', Number(e.target.value))} style={inputStyle} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  Taux d'intérêt (%)
                  <input type="number" step="0.01" value={form.interestRate || ''} onChange={e => setF('interestRate', Number(e.target.value))} style={inputStyle} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  Mensualité (€)
                  <input type="number" value={form.monthlyPayment || ''} onChange={e => setF('monthlyPayment', Number(e.target.value))} style={inputStyle} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  Date de début
                  <input type="date" value={form.startDate} onChange={e => setF('startDate', e.target.value)} style={inputStyle} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  Date de fin
                  <input type="date" value={form.endDate} onChange={e => setF('endDate', e.target.value)} style={inputStyle} />
                </label>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button onClick={closeModal} style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '10px', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 500 }}>Annuler</button>
                <button onClick={save} disabled={saving || !form.name} style={{ flex: 2, padding: '12px', background: 'linear-gradient(135deg,var(--accent-blue),var(--accent-purple))', border: 'none', borderRadius: '10px', color: '#fff', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Enregistrement…' : editingId ? 'Modifier' : 'Ajouter'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  padding: '10px 12px',
  color: 'var(--text-primary)',
  fontSize: '0.95rem',
  width: '100%',
  boxSizing: 'border-box',
}

