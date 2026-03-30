import { useEffect, useState } from 'react'
import { Plus, Trash2, Edit2, X, Home, Car, Landmark } from 'lucide-react'
import type { RealEstate, Vehicle, Debt } from '../types'
import type { Account } from './AccountsTab'
import { api } from '../lib/api'
import TimelineWidget from './TimelineWidget'
const fmt = (v: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', borderRadius: '8px',
  padding: '10px 12px', color: 'var(--text-primary)', fontSize: '0.95rem', width: '100%', boxSizing: 'border-box',
}

// ─── Real Estate Modal ─────────────────────────────────────────────────────
type REForm = Omit<RealEstate, 'id'> & { id?: string }
const emptyRE = (): REForm => ({
  name: '', purchasePrice: 0, currentValue: 0, purchaseDate: new Date().toISOString().slice(0, 10),
  isRental: false, monthlyRent: undefined, monthlyCharges: undefined, taxRegime: undefined, linkedDebtId: undefined,
})

function REModal({ onClose, onSave, debts, initial }: { onClose(): void; onSave(data: REForm): void; debts: Debt[]; initial?: REForm }) {
  const [form, setForm] = useState<REForm>(initial ?? emptyRE())
  const setF = (k: keyof REForm, v: any) => setForm(p => ({ ...p, [k]: v }))

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass-panel" style={{ width: '540px', maxHeight: '90vh', overflowY: 'auto', padding: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h3 style={{ margin: 0, fontSize: '1.3rem' }}>{initial?.id ? 'Modifier le bien' : '🏠 Ajouter un bien immobilier'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={22} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
            Nom / Adresse
            <input value={form.name} onChange={e => setF('name', e.target.value)} placeholder="Ex: Appartement Lyon 69001" style={inputStyle} />
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={form.isRental} onChange={e => setF('isRental', e.target.checked)} style={{ width: '16px', height: '16px' }} />
              Bien locatif (génère des revenus)
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              Prix d'achat (€)
              <input type="number" value={form.purchasePrice || ''} onChange={e => setF('purchasePrice', Number(e.target.value))} style={inputStyle} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              Valeur actuelle estimée (€)
              <input type="number" value={form.currentValue || ''} onChange={e => setF('currentValue', Number(e.target.value))} style={inputStyle} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              Date d'achat
              <input type="date" value={form.purchaseDate} onChange={e => setF('purchaseDate', e.target.value)} style={inputStyle} />
            </label>
            {form.isRental && (
              <>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  Loyer mensuel (€)
                  <input type="number" value={form.monthlyRent ?? ''} onChange={e => setF('monthlyRent', Number(e.target.value))} style={inputStyle} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  Charges mensuelles (€)
                  <input type="number" value={form.monthlyCharges ?? ''} onChange={e => setF('monthlyCharges', Number(e.target.value))} style={inputStyle} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  Régime fiscal
                  <select value={form.taxRegime ?? ''} onChange={e => setF('taxRegime', e.target.value || undefined)} style={inputStyle}>
                    <option value="">Non défini</option>
                    <option value="micro-foncier">Micro-foncier</option>
                    <option value="real">Régime réel</option>
                  </select>
                </label>
              </>
            )}
          </div>

          {debts.filter(d => d.type === 'mortgage').length > 0 && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              Lier à un prêt immobilier
              <select value={form.linkedDebtId ?? ''} onChange={e => setF('linkedDebtId', e.target.value || undefined)} style={inputStyle}>
                <option value="">Aucun</option>
                {debts.filter(d => d.type === 'mortgage').map(d => <option key={d.id} value={d.id}>{d.name} ({fmt(d.balance)} restant)</option>)}
              </select>
            </label>
          )}

          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button onClick={onClose} style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '10px', color: 'var(--text-secondary)', cursor: 'pointer' }}>Annuler</button>
            <button onClick={() => form.name && onSave(form)} disabled={!form.name} style={{ flex: 2, padding: '12px', background: 'linear-gradient(135deg,var(--accent-blue),var(--accent-purple))', border: 'none', borderRadius: '10px', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
              {initial?.id ? 'Modifier' : 'Ajouter'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Vehicle Modal ────────────────────────────────────────────────────────
type VehForm = Omit<Vehicle, 'id'> & { id?: string }
const emptyVeh = (): VehForm => ({ name: '', purchasePrice: 0, purchaseDate: new Date().toISOString().slice(0, 10), currentValue: 0 })

function VehicleModal({ onClose, onSave, initial }: { onClose(): void; onSave(d: VehForm): void; initial?: VehForm }) {
  const [form, setForm] = useState<VehForm>(initial ?? emptyVeh())
  const setF = (k: keyof VehForm, v: any) => setForm(p => ({ ...p, [k]: v }))

  // Auto-compute depreciated value (linear 10-year)
  const autoDepreciated = () => {
    if (!form.purchaseDate || !form.purchasePrice) return 0
    const years = (Date.now() - new Date(form.purchaseDate).getTime()) / (1000 * 60 * 60 * 24 * 365)
    return Math.max(0, form.purchasePrice * (1 - Math.min(1, years / 10)))
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass-panel" style={{ width: '480px', padding: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h3 style={{ margin: 0, fontSize: '1.3rem' }}>{initial?.id ? 'Modifier le véhicule' : '🚗 Ajouter un véhicule'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={22} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
            Nom / Modèle
            <input value={form.name} onChange={e => setF('name', e.target.value)} placeholder="Ex: Renault Clio 2022" style={inputStyle} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              Prix d'achat (€)
              <input type="number" value={form.purchasePrice || ''} onChange={e => setF('purchasePrice', Number(e.target.value))} style={inputStyle} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              Date d'achat
              <input type="date" value={form.purchaseDate} onChange={e => setF('purchaseDate', e.target.value)} style={inputStyle} />
            </label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
            Valeur actuelle (€)
            <input type="number" value={form.currentValue || ''} onChange={e => setF('currentValue', Number(e.target.value))} style={inputStyle} placeholder={`Auto: ${fmt(autoDepreciated())}`} />
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Estimation linéaire 10 ans : {fmt(autoDepreciated())} — modifiable manuellement</span>
          </label>
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button onClick={onClose} style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '10px', color: 'var(--text-secondary)', cursor: 'pointer' }}>Annuler</button>
            <button onClick={() => {
              const f = { ...form, currentValue: form.currentValue || autoDepreciated() }
              if (f.name) onSave(f)
            }} disabled={!form.name} style={{ flex: 2, padding: '12px', background: 'linear-gradient(135deg,var(--accent-blue),var(--accent-purple))', border: 'none', borderRadius: '10px', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
              {initial?.id ? 'Modifier' : 'Ajouter'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main PatrimoineTab ──────────────────────────────────────────────────────
type Props = {
  financialAccounts: Account[]
  backendStatus: 'connecting' | 'online' | 'offline'
  onRefresh?(): void
}

export default function PatrimoineTab({ financialAccounts, backendStatus }: Props) {
  const [realEstate, setRealEstate] = useState<RealEstate[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [loading, setLoading] = useState(true)
  const [showREModal, setShowREModal] = useState(false)
  const [showVehModal, setShowVehModal] = useState(false)
  const [editingRE, setEditingRE] = useState<RealEstate | null>(null)
  const [editingVeh, setEditingVeh] = useState<Vehicle | null>(null)

  const load = async () => {
    setLoading(true)
    const [re, veh, dbt] = await Promise.all([
      api.get<RealEstate[]>('/real-estate'),
      api.get<Vehicle[]>('/vehicles'),
      api.get<Debt[]>('/debts'),
    ])
    setRealEstate(re)
    setVehicles(veh)
    setDebts(dbt)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // ─── Computed totals ─────────────────────────────────────────────────────
  const financialTotal = financialAccounts.filter(a => a.kind === 'asset').reduce((s, a) => s + (a.balance ?? 0), 0)
  const reTotal = realEstate.reduce((s, r) => s + r.currentValue, 0)
  const vehicleTotal = vehicles.reduce((s, v) => s + v.currentValue, 0)
  const debtTotal = debts.reduce((s, d) => s + d.balance, 0)
  const totalAssets = financialTotal + reTotal + vehicleTotal
  const netWorth = totalAssets - debtTotal

  // ─── Real Estate ────────────────────────────────────────────────────────
  const saveRE = async (form: REForm) => {
    if (form.id) {
      const updated = await api.put<RealEstate>(`/real-estate/${form.id}`, form)
      setRealEstate(prev => prev.map(x => x.id === form.id ? updated : x))
    } else {
      const created = await api.post<RealEstate>('/real-estate', form)
      setRealEstate(prev => [...prev, created])
    }
    setShowREModal(false); setEditingRE(null)
  }

  const deleteRE = async (id: string) => {
    if (!confirm('Supprimer ce bien ?')) return
    await api.delete(`/real-estate/${id}`)
    setRealEstate(prev => prev.filter(x => x.id !== id))
  }

  // ─── Vehicles ────────────────────────────────────────────────────────────
  const saveVeh = async (form: VehForm) => {
    if (form.id) {
      const updated = await api.put<Vehicle>(`/vehicles/${form.id}`, form)
      setVehicles(prev => prev.map(x => x.id === form.id ? updated : x))
    } else {
      const created = await api.post<Vehicle>('/vehicles', form)
      setVehicles(prev => [...prev, created])
    }
    setShowVehModal(false); setEditingVeh(null)
  }

  const deleteVeh = async (id: string) => {
    if (!confirm('Supprimer ce véhicule ?')) return
    await api.delete(`/vehicles/${id}`)
    setVehicles(prev => prev.filter(x => x.id !== id))
  }

  const sectionHeader = (title: string, icon: React.ReactNode, btnLabel: string, onClick: () => void) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700, fontSize: '1.05rem' }}>{icon}{title}</div>
      <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '10px', color: 'var(--accent-blue)', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>
        <Plus size={15} /> {btnLabel}
      </button>
    </div>
  )

  return (
    <div className="tab-content">
      {/* Header + Net Worth */}
      <div style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '2rem', margin: '0 0 6px', fontWeight: 800 }}>Vue Patrimoniale</h2>
        <p style={{ color: 'var(--text-secondary)', margin: '0 0 24px' }}>Tous vos actifs et passifs au {new Date().toLocaleDateString('fr-FR')}.</p>

        {/* KPI hero */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '14px' }}>
          {[
            { label: 'Actifs totaux', value: totalAssets, color: 'var(--success)', icon: '📈' },
            { label: 'Actifs financiers', value: financialTotal, color: 'var(--accent-blue)', icon: '🏦' },
            { label: 'Immobilier & biens', value: reTotal + vehicleTotal, color: 'var(--accent-purple)', icon: '🏠' },
            { label: 'Patrimoine net', value: netWorth, color: netWorth >= 0 ? 'var(--success)' : 'var(--danger)', icon: '💎' },
          ].map(kpi => (
            <div key={kpi.label} className="glass-panel" style={{ padding: '20px' }}>
              <div style={{ fontSize: '1.4rem', marginBottom: '8px' }}>{kpi.icon}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{kpi.label}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: kpi.color }}>{fmt(kpi.value)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Financial Accounts */}
      {financialAccounts.filter(a => a.kind === 'asset').length > 0 && (
        <div className="glass-panel" style={{ padding: '24px', marginBottom: '28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700, fontSize: '1.05rem' }}>
              <Landmark size={20} style={{ color: 'var(--accent-teal)' }} /> Comptes financiers
            </div>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{financialAccounts.filter(a => a.kind === 'asset').length} compte(s)</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {financialAccounts.filter(a => a.kind === 'asset').map(acc => (
              <div key={acc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{acc.name}</div>
                  {acc.institution && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{acc.institution}</div>}
                </div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--accent-teal)' }}>{fmt(acc.balance)}</div>
              </div>
            ))}
            <div style={{ padding: '10px 16px', background: 'rgba(20,184,166,0.06)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 600, marginTop: '4px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Total actifs financiers</span>
              <span style={{ color: 'var(--accent-teal)' }}>{fmt(financialTotal)}</span>
            </div>
          </div>
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Chargement…</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

          {/* Real Estate */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            {sectionHeader('Immobilier', <Home size={20} style={{ color: 'var(--accent-blue)' }} />, 'Ajouter un bien', () => { setEditingRE(null); setShowREModal(true) })}
            {realEstate.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '20px' }}>Aucun bien immobilier enregistré</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {realEstate.map(r => {
                  const linkedDebt = debts.find(d => d.id === r.linkedDebtId)
                  const equity = r.currentValue - (linkedDebt?.balance ?? 0)
                  const plusValue = r.currentValue - r.purchasePrice
                  const grossYield = r.isRental && r.monthlyRent ? (r.monthlyRent * 12 / r.currentValue) * 100 : null

                  return (
                    <div key={r.id} style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '4px' }}>
                            {r.isRental ? '🏘️' : '🏠'} {r.name}
                          </div>
                          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                            <span>Acheté {r.purchaseDate?.slice(0, 7)} pour {fmt(r.purchasePrice)}</span>
                            {r.isRental && r.monthlyRent && <span>• Loyer: {fmt(r.monthlyRent)}/mois</span>}
                            {grossYield && <span>• Rendement brut: {grossYield.toFixed(2)}%</span>}
                            {linkedDebt && <span>• Lié: {linkedDebt.name}</span>}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '1.2rem' }}>{fmt(r.currentValue)}</div>
                            <div style={{ fontSize: '0.8rem', color: plusValue >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                              {plusValue >= 0 ? '▲' : '▼'} {fmt(Math.abs(plusValue))} plus-value
                            </div>
                            {linkedDebt && <div style={{ fontSize: '0.78rem', color: 'var(--accent-blue)' }}>Équité: {fmt(equity)}</div>}
                          </div>
                          <div style={{ display: 'flex', gap: '5px' }}>
                            <button onClick={() => { setEditingRE(r); setShowREModal(true) }} style={{ padding: '5px 6px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-secondary)' }}><Edit2 size={13} /></button>
                            <button onClick={() => deleteRE(r.id)} style={{ padding: '5px 6px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', cursor: 'pointer', color: 'var(--danger)' }}><Trash2 size={13} /></button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div style={{ padding: '10px 16px', background: 'rgba(59,130,246,0.06)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 600 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Total Immobilier</span>
                  <span style={{ color: 'var(--accent-blue)' }}>{fmt(reTotal)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Vehicles */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            {sectionHeader('Véhicules & Biens', <Car size={20} style={{ color: 'var(--accent-purple)' }} />, 'Ajouter un véhicule', () => { setEditingVeh(null); setShowVehModal(true) })}
            {vehicles.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '20px' }}>Aucun véhicule enregistré</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {vehicles.map(v => {
                  const yearsOwned = (Date.now() - new Date(v.purchaseDate).getTime()) / (1000 * 60 * 60 * 24 * 365)
                  const depreciation = v.purchasePrice - v.currentValue
                  const depreciationPct = v.purchasePrice > 0 ? (depreciation / v.purchasePrice) * 100 : 0

                  return (
                    <div key={v.id} style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '4px' }}>🚗 {v.name}</div>
                          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', gap: '10px' }}>
                            <span>Acheté {v.purchaseDate?.slice(0, 7)} pour {fmt(v.purchasePrice)}</span>
                            <span>• {yearsOwned.toFixed(1)} ans de possession</span>
                            <span>• Dépréciation: {depreciationPct.toFixed(1)}%</span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '1.2rem' }}>{fmt(v.currentValue)}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>-{fmt(depreciation)} dépréciation</div>
                          </div>
                          <div style={{ display: 'flex', gap: '5px' }}>
                            <button onClick={() => { setEditingVeh(v); setShowVehModal(true) }} style={{ padding: '5px 6px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-secondary)' }}><Edit2 size={13} /></button>
                            <button onClick={() => deleteVeh(v.id)} style={{ padding: '5px 6px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', cursor: 'pointer', color: 'var(--danger)' }}><Trash2 size={13} /></button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div style={{ padding: '10px 16px', background: 'rgba(139,92,246,0.06)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 600 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Total Véhicules</span>
                  <span style={{ color: 'var(--accent-purple)' }}>{fmt(vehicleTotal)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Debts summary */}
          {debts.length > 0 && (
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span>💳</span> Passif — Dettes & Crédits
              </div>
              {debts.map(d => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{d.name}</span>
                  <span style={{ fontWeight: 700, color: 'var(--danger)' }}>-{fmt(d.balance)}</span>
                </div>
              ))}
              <div style={{ padding: '10px 16px', background: 'rgba(239,68,68,0.06)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 600, marginTop: '4px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Total Passif</span>
                <span style={{ color: 'var(--danger)' }}>-{fmt(debtTotal)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Timeline */}
      {!loading && (
        <div className="glass-panel" style={{ padding: '28px', marginTop: '8px' }}>
          <TimelineWidget backendStatus={backendStatus} />
        </div>
      )}

      {/* Modals */}
      {showREModal && (
        <REModal
          debts={debts}
          onClose={() => { setShowREModal(false); setEditingRE(null) }}
          onSave={saveRE}
          initial={editingRE ? { ...editingRE } : undefined}
        />
      )}
      {showVehModal && (
        <VehicleModal
          onClose={() => { setShowVehModal(false); setEditingVeh(null) }}
          onSave={saveVeh}
          initial={editingVeh ? { ...editingVeh } : undefined}
        />
      )}
    </div>
  )
}
