import { useEffect, useState } from 'react'
import { Plus, Trash2, AlertTriangle } from 'lucide-react'
import { api } from '../lib/api'
const fmt = (v: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)

type TaxEstimate = {
  year: number
  pfuDividendsGross: number
  pfuCapitalGainsGross: number
  pfuTotal: number
  rentalGross: number
  rentalRegime: 'micro-foncier' | 'real' | 'none'
  rentalAbattement: number
  rentalTaxBase: number
  rentalTaxEstimate: number
  totalEstimated: number
  isNearIFIThreshold: boolean
  realEstateNetValue: number
}

type TaxEvent = {
  id: string
  date: string
  type: 'dividend' | 'capital-gain' | 'other'
  grossAmount: number
  accountId?: string
  description?: string
}

const EVENT_TYPES = [
  { value: 'dividend', label: '💰 Dividende', color: 'var(--success)' },
  { value: 'capital-gain', label: '📈 Plus-value mobilière', color: 'var(--accent-blue)' },
  { value: 'other', label: '📄 Autre', color: 'var(--text-secondary)' },
]

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', borderRadius: '8px',
  padding: '10px 12px', color: 'var(--text-primary)', fontSize: '0.95rem', width: '100%', boxSizing: 'border-box',
}

export default function TaxTab() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [estimate, setEstimate] = useState<TaxEstimate | null>(null)
  const [events, setEvents] = useState<TaxEvent[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ type: 'dividend', grossAmount: 0, date: new Date().toISOString().slice(0, 10), description: '' })
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [est, evts] = await Promise.all([
      api.get<TaxEstimate>('/tax/estimate', { query: { year } }),
      api.get<TaxEvent[]>('/tax-events', { query: { year } }),
    ])
    setEstimate(est)
    setEvents(evts)
    setLoading(false)
  }

  useEffect(() => { load() }, [year])

  const addEvent = async () => {
    const created = await api.post<TaxEvent>('/tax-events', form)
    setEvents(prev => [...prev, created])
    setShowForm(false)
    setForm({ type: 'dividend', grossAmount: 0, date: new Date().toISOString().slice(0, 10), description: '' })
    // Refresh estimate
    const est = await api.get<TaxEstimate>('/tax/estimate', { query: { year } })
    setEstimate(est)
  }

  const deleteEvent = async (id: string) => {
    await api.delete(`/tax-events/${id}`)
    setEvents(prev => prev.filter(e => e.id !== id))
    const est = await api.get<TaxEstimate>('/tax/estimate', { query: { year } })
    setEstimate(est)
  }

  const setF = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }))

  return (
    <div className="tab-content">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '2rem', margin: '0 0 6px', fontWeight: 800 }}>Fiscalité</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Estimation à titre indicatif — ne remplace pas une déclaration officielle.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)', borderRadius: '10px', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
            {[currentYear, currentYear - 1, currentYear - 2].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: 'linear-gradient(135deg,var(--accent-blue),var(--accent-purple))', border: 'none', borderRadius: '10px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>
            <Plus size={16} /> Ajouter un revenu
          </button>
        </div>
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)' }}>Chargement…</div> : estimate ? (
        <>
          {/* IFI Alert */}
          {estimate.isNearIFIThreshold && (
            <div style={{ padding: '16px 20px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '12px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <AlertTriangle size={20} style={{ color: 'var(--warning)', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, color: 'var(--warning)' }}>⚠️ Attention — Seuil IFI approchant</div>
                <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Votre patrimoine immobilier net est estimé à <strong>{fmt(estimate.realEstateNetValue)}</strong>. Le seuil de l'IFI est de 1 300 000€.
                </div>
              </div>
            </div>
          )}

          {/* Total hero */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '20px', marginBottom: '24px' }}>
            <div className="glass-panel" style={{ padding: '28px', background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.08))', border: '1px solid rgba(139,92,246,0.2)' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Estimation impôts {year}</div>
              <div style={{ fontSize: '3rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>{fmt(estimate.totalEstimated)}</div>
              <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginTop: '6px' }}>PFU + Revenus fonciers (estimation)</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '220px' }}>
              <div className="glass-panel" style={{ padding: '16px 20px' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>PFU (30%)</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent-blue)', marginTop: '4px' }}>{fmt(estimate.pfuTotal)}</div>
              </div>
              <div className="glass-panel" style={{ padding: '16px 20px' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Revenus Fonciers</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent-purple)', marginTop: '4px' }}>{fmt(estimate.rentalTaxEstimate)}</div>
              </div>
            </div>
          </div>

          {/* PFU Section */}
          <div className="glass-panel" style={{ padding: '24px', marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '1rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              💹 PFU — Prélèvement Forfaitaire Unique (30%)
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '14px', marginBottom: '20px' }}>
              {[
                { label: 'Dividendes bruts', value: estimate.pfuDividendsGross, icon: '💰' },
                { label: 'Plus-values brutes', value: estimate.pfuCapitalGainsGross, icon: '📈' },
                { label: 'PFU total estimé', value: estimate.pfuTotal, icon: '🏛️', accent: true },
              ].map(m => (
                <div key={m.label} style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: m.accent ? '1px solid rgba(59,130,246,0.3)' : '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '1.3rem', marginBottom: '6px' }}>{m.icon}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{m.label}</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: m.accent ? 'var(--accent-blue)' : 'var(--text-primary)' }}>{fmt(m.value)}</div>
                </div>
              ))}
            </div>
            {estimate.pfuDividendsGross === 0 && estimate.pfuCapitalGainsGross === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>Aucun dividende ou plus-value enregistré pour {year}. Ajoutez des événements avec le bouton ci-dessus.</p>
            )}
          </div>

          {/* Rental Section */}
          {estimate.rentalGross > 0 && (
            <div className="glass-panel" style={{ padding: '24px', marginBottom: '20px' }}>
              <h3 style={{ margin: '0 0 20px', fontSize: '1rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                🏘️ Revenus Fonciers
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '14px', marginBottom: '16px' }}>
                {[
                  { label: 'Loyers annuels bruts', value: estimate.rentalGross },
                  { label: estimate.rentalRegime === 'micro-foncier' ? 'Abattement 30%' : 'Charges déductibles', value: estimate.rentalAbattement },
                  { label: 'Base imposable', value: estimate.rentalTaxBase },
                  { label: 'Impôt estimé (TMI 30%)', value: estimate.rentalTaxEstimate },
                ].map(m => (
                  <div key={m.label} style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{m.label}</span>
                    <span style={{ fontWeight: 700 }}>{fmt(m.value)}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: '10px 14px', background: 'rgba(59,130,246,0.06)', borderRadius: '8px', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                Régime appliqué : <strong style={{ color: 'var(--accent-blue)' }}>{estimate.rentalRegime === 'micro-foncier' ? 'Micro-foncier (30% abattement)' : estimate.rentalRegime === 'real' ? 'Régime réel (déduction charges)' : '—'}</strong>
                {' '}— calculé automatiquement depuis l'onglet Patrimoine (biens locatifs).
              </div>
            </div>
          )}

          {/* Tax Events List */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              📋 Événements fiscaux {year}
            </h3>
            {events.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Aucun événement fiscal enregistré pour {year}.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {events.map(e => {
                  const typeInfo = EVENT_TYPES.find(t => t.value === e.type) ?? EVENT_TYPES[2]
                  return (
                    <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '0.85rem', padding: '3px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', color: typeInfo.color, fontWeight: 600 }}>{typeInfo.label}</span>
                        <div>
                          <div style={{ fontWeight: 600 }}>{fmt(e.grossAmount)}</div>
                          {e.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{e.description}</div>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{e.date}</span>
                        <button onClick={() => deleteEvent(e.id)} style={{ padding: '4px 6px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', cursor: 'pointer', color: 'var(--danger)' }}><Trash2 size={13} /></button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Disclaimer */}
          <div style={{ marginTop: '20px', padding: '14px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px dashed var(--border-color)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            ⚠️ <strong>Estimation à titre indicatif uniquement.</strong> Ces calculs simplifient la fiscalité française et ne tiennent pas compte de la progressivité de l'IR, des abattements spéciaux ou de votre situation personnelle. Consultez un conseiller fiscal pour votre déclaration officielle.
          </div>
        </>
      ) : (
        <div className="empty-state">
          <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🧾</div>
          <p style={{ margin: 0, fontWeight: 600 }}>Aucune donnée fiscale pour {year}</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '6px' }}>Ajoutez des dividendes ou plus-values via "Ajouter un revenu" pour générer une estimation.</p>
        </div>
      )}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-panel" style={{ width: '420px', padding: '32px' }}>
            <h3 style={{ margin: '0 0 24px', fontSize: '1.2rem' }}>Ajouter un événement fiscal</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Type
                <select value={form.type} onChange={e => setF('type', e.target.value)} style={inputStyle}>
                  {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Montant brut (€)
                <input type="number" value={form.grossAmount || ''} onChange={e => setF('grossAmount', Number(e.target.value))} style={inputStyle} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Date
                <input type="date" value={form.date} onChange={e => setF('date', e.target.value)} style={inputStyle} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Description (optionnel)
                <input value={form.description} onChange={e => setF('description', e.target.value)} placeholder="Ex: Dividendes AMUNDI" style={inputStyle} />
              </label>
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '10px', color: 'var(--text-secondary)', cursor: 'pointer' }}>Annuler</button>
                <button onClick={addEvent} disabled={!form.grossAmount} style={{ flex: 2, padding: '12px', background: 'linear-gradient(135deg,var(--accent-blue),var(--accent-purple))', border: 'none', borderRadius: '10px', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Ajouter</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
