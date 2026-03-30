import { useEffect, useState } from 'react'
import { Plus, Trash2, Edit2, X } from 'lucide-react'
import type { Goal } from '../types'
import { api } from '../lib/api'

const fmt = (v: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)

const ICONS = ['🎯', '🚗', '✈️', '🏠', '💍', '🎓', '🏖️', '💻', '🎨', '🌍', '🎉', '💰', '🏋️', '📚', '❤️']
const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16']

type FormState = Omit<Goal, 'id' | 'isCompleted'> & { id?: string }

const emptyForm = (): FormState => ({
  name: '',
  icon: '🎯',
  color: '#3b82f6',
  targetAmount: 0,
  targetDate: new Date(new Date().setFullYear(new Date().getFullYear() + 2)).toISOString().slice(0, 10),
  currentAmount: 0,
  monthlyContribution: 0,
})

function ProgressRing({ pct, color, size = 80 }: { pct: number; color: string; size?: number }) {
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  const dash = (pct / 100) * c
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={8} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={8} strokeDasharray={`${dash} ${c}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.6s ease' }} />
    </svg>
  )
}

export default function GoalsTab() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    setGoals(await api.get<Goal[]>('/goals'))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openCreate = () => { setForm(emptyForm()); setEditingId(null); setShowModal(true) }
  const openEdit = (g: Goal) => { setForm({ ...g }); setEditingId(g.id); setShowModal(true) }
  const closeModal = () => { setShowModal(false); setEditingId(null) }

  const save = async () => {
    setSaving(true)
    if (editingId) {
      const updated = await api.put<Goal>(`/goals/${editingId}`, { ...form, id: editingId, isCompleted: false })
      setGoals(prev => prev.map(g => g.id === editingId ? updated : g))
    } else {
      const created = await api.post<Goal>('/goals', form)
      setGoals(prev => [...prev, created])
    }
    setSaving(false)
    closeModal()
  }

  const remove = async (id: string) => {
    if (!confirm('Supprimer cet objectif ?')) return
    await api.delete(`/goals/${id}`)
    setGoals(prev => prev.filter(g => g.id !== id))
  }

  const toggle = async (g: Goal) => {
    const updated = { ...g, isCompleted: !g.isCompleted }
    await api.put(`/goals/${g.id}`, updated)
    setGoals(prev => prev.map(x => x.id === g.id ? updated : x))
  }

  const setF = (k: keyof FormState, v: any) => setForm(prev => ({ ...prev, [k]: v }))

  const active = goals.filter(g => !g.isCompleted)
  const completed = goals.filter(g => g.isCompleted)

  const totalTarget = active.reduce((s, g) => s + g.targetAmount, 0)
  const totalCurrent = active.reduce((s, g) => s + g.currentAmount, 0)
  const totalMonthly = active.reduce((s, g) => s + g.monthlyContribution, 0)

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', borderRadius: '8px',
    padding: '10px 12px', color: 'var(--text-primary)', fontSize: '0.95rem', width: '100%', boxSizing: 'border-box',
  }

  return (
    <div className="tab-content">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '2rem', margin: '0 0 6px', fontWeight: 800 }}>Objectifs d'Épargne</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Visualisez et suivez vos projets financiers.</p>
        </div>
        <button onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: 'linear-gradient(135deg,var(--accent-blue),var(--accent-purple))', border: 'none', borderRadius: '12px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem' }}>
          <Plus size={18} /> Nouvel objectif
        </button>
      </div>

      {/* Overview KPIs */}
      {active.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '14px', marginBottom: '28px' }}>
          {[
            { label: 'Objectifs actifs', value: `${active.length}`, sub: `sur ${goals.length} total`, icon: '🎯' },
            { label: 'Total à atteindre', value: fmt(totalTarget - totalCurrent), sub: `${fmt(totalCurrent)} déjà épargné`, icon: '💰' },
            { label: 'Effort mensuel', value: `${fmt(totalMonthly)}/mois`, sub: 'contributions planifiées', icon: '📅' },
          ].map(kpi => (
            <div key={kpi.label} className="glass-panel" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ fontSize: '2rem' }}>{kpi.icon}</span>
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{kpi.label}</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', margin: '2px 0' }}>{kpi.value}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{kpi.sub}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)' }}>Chargement…</div>
      ) : goals.length === 0 ? (
        <div className="glass-panel" style={{ padding: '60px', textAlign: 'center' }}>
          <div style={{ fontSize: '4rem', marginBottom: '16px' }}>🎯</div>
          <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>Aucun objectif défini</h3>
          <p style={{ color: 'var(--text-secondary)', margin: '0 0 24px' }}>Créez des objectifs pour visualiser votre progression vers vos grands projets.</p>
          <button onClick={openCreate} style={{ padding: '12px 28px', background: 'linear-gradient(135deg,var(--accent-blue),var(--accent-purple))', border: 'none', borderRadius: '12px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '1rem' }}>Créer mon premier objectif</button>
        </div>
      ) : (
        <>
          {/* Active goals */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px', marginBottom: '32px' }}>
            {active.map(g => {
              const pct = g.targetAmount > 0 ? Math.min(100, (g.currentAmount / g.targetAmount) * 100) : 0
              const remaining = Math.max(0, g.targetAmount - g.currentAmount)
              const monthsLeft = g.monthlyContribution > 0 ? Math.ceil(remaining / g.monthlyContribution) : null
              const targetDate = new Date(g.targetDate)
              const now = new Date()
              const daysLeft = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

              return (
                <div key={g.id} className="glass-panel" style={{ padding: '24px', position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '2rem' }}>{g.icon}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{g.name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {daysLeft > 0 ? `Dans ${daysLeft} jours (${g.targetDate})` : 'Date dépassée'}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => toggle(g)} title="Marquer comme atteint" style={{ padding: '5px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem' }}>✅</button>
                      <button onClick={() => openEdit(g)} style={{ padding: '5px 6px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-secondary)' }}><Edit2 size={13} /></button>
                      <button onClick={() => remove(g.id)} style={{ padding: '5px 6px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', cursor: 'pointer', color: 'var(--danger)' }}><Trash2 size={13} /></button>
                    </div>
                  </div>

                  {/* Progress ring + amounts */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '16px' }}>
                    <div style={{ position: 'relative', width: 80, height: 80 }}>
                      <ProgressRing pct={pct} color={g.color} size={80} />
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 800, color: g.color }}>
                        {pct.toFixed(0)}%
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>{fmt(g.currentAmount)}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>sur {fmt(g.targetAmount)}</div>
                      {remaining > 0 && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                          Reste : {fmt(remaining)}
                          {monthsLeft && ` · ~${monthsLeft} mois`}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: g.color, borderRadius: '3px', transition: 'width 0.6s ease' }} />
                  </div>

                  {g.monthlyContribution > 0 && (
                    <div style={{ marginTop: '10px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      Contribution : {fmt(g.monthlyContribution)}/mois
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Completed */}
          {completed.length > 0 && (
            <>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>✅ Objectifs Atteints</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
                {completed.map(g => (
                  <div key={g.id} className="glass-panel" style={{ padding: '16px 20px', opacity: 0.6, display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <span style={{ fontSize: '1.8rem' }}>{g.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, textDecoration: 'line-through' }}>{g.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--success)' }}>{fmt(g.targetAmount)} atteint 🎉</div>
                    </div>
                    <button onClick={() => remove(g.id)} style={{ padding: '5px 6px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', cursor: 'pointer', color: 'var(--danger)' }}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-panel" style={{ width: '500px', maxHeight: '90vh', overflowY: 'auto', padding: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ margin: 0, fontSize: '1.3rem' }}>{editingId ? 'Modifier l\'objectif' : 'Nouvel objectif'}</h3>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={22} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Icon picker */}
              <div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500, marginBottom: '8px' }}>Icône</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {ICONS.map(icon => (
                    <button key={icon} onClick={() => setF('icon', icon)} style={{ fontSize: '1.4rem', padding: '6px', background: form.icon === icon ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.04)', border: `2px solid ${form.icon === icon ? 'var(--accent-blue)' : 'transparent'}`, borderRadius: '8px', cursor: 'pointer', transition: 'all 0.15s' }}>{icon}</button>
                  ))}
                </div>
              </div>

              {/* Color picker */}
              <div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500, marginBottom: '8px' }}>Couleur</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setF('color', c)} style={{ width: '28px', height: '28px', borderRadius: '50%', background: c, border: `3px solid ${form.color === c ? '#fff' : 'transparent'}`, cursor: 'pointer', transition: 'all 0.15s' }} />
                  ))}
                </div>
              </div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Nom de l'objectif
                <input value={form.name} onChange={e => setF('name', e.target.value)} placeholder="Ex: Voyage au Japon" style={inputStyle} />
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  Montant cible (€)
                  <input type="number" value={form.targetAmount || ''} onChange={e => setF('targetAmount', Number(e.target.value))} style={inputStyle} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  Déjà épargné (€)
                  <input type="number" value={form.currentAmount || ''} onChange={e => setF('currentAmount', Number(e.target.value))} style={inputStyle} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  Contrib. mensuelle (€)
                  <input type="number" value={form.monthlyContribution || ''} onChange={e => setF('monthlyContribution', Number(e.target.value))} style={inputStyle} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  Date cible
                  <input type="date" value={form.targetDate} onChange={e => setF('targetDate', e.target.value)} style={inputStyle} />
                </label>
              </div>

              {/* Preview */}
              {form.name && form.targetAmount > 0 && form.monthlyContribution > 0 && (
                <div style={{ padding: '12px 16px', background: 'rgba(59,130,246,0.08)', borderRadius: '10px', border: '1px solid rgba(59,130,246,0.2)', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                  💡 Avec {fmt(form.monthlyContribution)}/mois depuis {fmt(form.currentAmount)}, vous atteindrez {fmt(form.targetAmount)} dans <strong style={{ color: 'var(--text-primary)' }}>~{Math.ceil(Math.max(0, form.targetAmount - form.currentAmount) / form.monthlyContribution)} mois</strong>.
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button onClick={closeModal} style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '10px', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 500 }}>Annuler</button>
                <button onClick={save} disabled={saving || !form.name || !form.targetAmount} style={{ flex: 2, padding: '12px', background: `linear-gradient(135deg,${form.color},var(--accent-purple))`, border: 'none', borderRadius: '10px', color: '#fff', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Enregistrement…' : editingId ? 'Modifier' : 'Créer l\'objectif'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
