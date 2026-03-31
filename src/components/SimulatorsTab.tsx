import { useState, useEffect, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { api } from '../lib/api'
const fmt = (v: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
const fmtM = (v: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, notation: 'compact' }).format(v)

type Tab = 'fire' | 'projection' | 'immo' | 'whatif'

type FIREResult = {
  fireNumber: number
  currentProgress: number
  yearsToFire: number
  monthsToFire: number
  fireDate: string
}

type ProjectionResult = {
  years: string[]
  conservative: number[]
  base: number[]
  optimistic: number[]
}

type ImmoResult = {
  propertyPrice: number
  apport: number
  loanAmount: number
  loanRate: number
  loanDurationYears: number
  monthlyPayment: number
  totalCostOfCredit: number
  totalCost: number
  affordabilityRatio: number
  isAffordable: boolean
  breakEvenMonths?: number
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '10px 20px', borderRadius: '10px', border: '1px solid var(--border-color)', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', transition: 'all 0.2s',
  background: active ? 'linear-gradient(135deg,var(--accent-blue),var(--accent-purple))' : 'rgba(255,255,255,0.04)',
  color: active ? '#fff' : 'var(--text-secondary)',
})

const sliderStyle: React.CSSProperties = { width: '100%', accentColor: 'var(--accent-blue)', cursor: 'pointer', height: '6px' }

function SliderField({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange(v: number): void }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
        <input type="number" value={value} onChange={e => onChange(Number(e.target.value))} min={min} max={max} step={step}
          style={{ width: '100px', textAlign: 'right', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '3px 8px', color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 700 }} />
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} style={sliderStyle} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
        <span>{min}{unit}</span><span>{max}{unit}</span>
      </div>
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'rgba(15,23,42,0.96)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '12px', padding: '12px 16px' }}>
      <p style={{ margin: '0 0 8px', fontWeight: 700, color: 'var(--text-primary)' }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ margin: '2px 0', color: p.color, fontSize: '0.88rem' }}>{p.name}: {fmt(p.value)}</p>
      ))}
    </div>
  )
}

type Props = {
  currentNetWorth?: number
}

export default function SimulatorsTab({ currentNetWorth = 0 }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('fire')
  const safeNetWorth = Math.max(0, currentNetWorth)

  // ─── FIRE state ─────────────────────────────────────────────────────────
  const [annualExpenses, setAnnualExpenses] = useState(30000)
  const [monthlyContribution, setMonthlyContribution] = useState(1000)
  const [returnRate, setReturnRate] = useState(7)
  const [swr, setSwr] = useState(4)
  const [portfolioValue, setPortfolioValue] = useState(safeNetWorth)
  const [fireResult, setFireResult] = useState<FIREResult | null>(null)
  const [loadingFire, setLoadingFire] = useState(false)
  const [fireError, setFireError] = useState<string | null>(null)

  useEffect(() => { setPortfolioValue(safeNetWorth) }, [safeNetWorth])

  const computeFIRE = async () => {
    setLoadingFire(true)
    setFireError(null)
    try {
      setFireResult(await api.get<FIREResult>('/fire', {
        query: {
          annualExpenses,
          monthlyContribution,
          expectedReturnRate: returnRate,
          safeWithdrawalRate: swr,
          currentPortfolio: Math.max(0, portfolioValue),
        },
      }))
    } catch {
      setFireResult(null)
      setFireError('Impossible de calculer FIRE pour le moment.')
    } finally {
      setLoadingFire(false)
    }
  }

  // Auto-compute on param change
  useEffect(() => {
    const t = setTimeout(computeFIRE, 400)
    return () => clearTimeout(t)
  }, [annualExpenses, monthlyContribution, returnRate, swr, portfolioValue])

  // ─── Projection state ────────────────────────────────────────────────────
  const [projYears, setProjYears] = useState(20)
  const [projMonthly, setProjMonthly] = useState(1000)
  const [projPortfolio, setProjPortfolio] = useState(safeNetWorth)
  const [projResult, setProjResult] = useState<ProjectionResult | null>(null)
  const [projectionError, setProjectionError] = useState<string | null>(null)

  useEffect(() => { setProjPortfolio(safeNetWorth) }, [safeNetWorth])

  const computeProjection = async () => {
    setProjectionError(null)
    try {
      setProjResult(await api.get<ProjectionResult>('/forecast', {
        query: {
          years: projYears,
          monthlyContribution: projMonthly,
          currentPortfolio: Math.max(0, projPortfolio),
        },
      }))
    } catch {
      setProjResult(null)
      setProjectionError('Impossible de calculer la projection pour le moment.')
    }
  }

  useEffect(() => {
    const t = setTimeout(computeProjection, 400)
    return () => clearTimeout(t)
  }, [projYears, projMonthly, projPortfolio])

  // Convert projection to recharts format
  const projChartData = useMemo(() => {
    if (!projResult) return []
    return projResult.years.map((y, i) => ({
      year: y,
      Conservateur: projResult.conservative[i],
      Modéré: projResult.base[i],
      Optimiste: projResult.optimistic[i],
    }))
  }, [projResult])

  // ─── Immo Simulator ──────────────────────────────────────────────────────
  const [immoPrice, setImmoPrice] = useState(300000)
  const [immoApport, setImmoApport] = useState(30000)
  const [immoRate, setImmoRate] = useState(3.5)
  const [immoDuration, setImmoDuration] = useState(20)
  const [immoIncome, setImmoIncome] = useState(3000)
  const [immoCurrentRent, setImmoCurrentRent] = useState(0)
  const [immoResult, setImmoResult] = useState<ImmoResult | null>(null)

  const computeImmo = async () => {
    setImmoResult(await api.get<ImmoResult>('/simulate/real-estate', { query: { price: immoPrice, apport: immoApport, rate: immoRate, years: immoDuration, income: immoIncome, currentRent: immoCurrentRent } }))
  }

  useEffect(() => {
    const t = setTimeout(computeImmo, 400)
    return () => clearTimeout(t)
  }, [immoPrice, immoApport, immoRate, immoDuration, immoIncome, immoCurrentRent])

  // ─── What-if ─────────────────────────────────────────────────────────────
  const [wiBase, setWiBase] = useState(1000)
  const [wiExtra, setWiExtra] = useState(200)

  const wiFireBase = useMemo(() => {
    const mr = returnRate / 100 / 12
    const fn = annualExpenses / (swr / 100)
    let p = portfolioValue, m = 0
    while (p < fn && m < 1200) { p = p * (1 + mr) + wiBase; m++ }
    return m
  }, [wiBase, annualExpenses, swr, returnRate, portfolioValue])

  const wiFireWithExtra = useMemo(() => {
    const mr = returnRate / 100 / 12
    const fn = annualExpenses / (swr / 100)
    let p = portfolioValue, m = 0
    while (p < fn && m < 1200) { p = p * (1 + mr) + (wiBase + wiExtra); m++ }
    return m
  }, [wiBase, wiExtra, annualExpenses, swr, returnRate, portfolioValue])

  const monthsSaved = wiFireBase - wiFireWithExtra

  return (
    <div className="tab-content">
      <div style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '2rem', margin: '0 0 6px', fontWeight: 800 }}>Simulateurs & Prévisions</h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Projetez votre avenir financier et planifiez votre liberté.</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '28px', flexWrap: 'wrap' }}>
        {[
          { key: 'fire', label: '🔥 Calculateur FIRE' },
          { key: 'projection', label: '📈 Projections Patrimoine' },
          { key: 'immo', label: '🏠 Simulateur Achat Immo' },
          { key: 'whatif', label: '🤔 Et si…' },
        ].map(t => (
          <button key={t.key} style={tabStyle(activeTab === t.key)} onClick={() => setActiveTab(t.key as Tab)}>{t.label}</button>
        ))}
      </div>

      {/* ─── FIRE ───────────────────────────────────────────────────────── */}
      {activeTab === 'fire' && (
        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '24px', alignItems: 'start' }}>
          {/* Controls */}
          <div className="glass-panel" style={{ padding: '28px' }}>
            <h3 style={{ margin: '0 0 24px', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>⚙️ Paramètres</h3>
            <SliderField label="Portefeuille actuel" value={portfolioValue} min={0} max={1000000} step={1000} unit="€" onChange={setPortfolioValue} />
            <SliderField label="Dépenses annuelles" value={annualExpenses} min={10000} max={120000} step={1000} unit="€" onChange={setAnnualExpenses} />
            <SliderField label="Épargne mensuelle" value={monthlyContribution} min={0} max={5000} step={50} unit="€" onChange={setMonthlyContribution} />
            <SliderField label="Rendement attendu" value={returnRate} min={1} max={15} step={0.5} unit="%" onChange={setReturnRate} />
            <SliderField label="Taux de retrait sécurisé (SWR)" value={swr} min={2} max={6} step={0.5} unit="%" onChange={setSwr} />
          </div>

          {/* Results */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {fireResult && (
              <>
                {/* FIRE Number hero */}
                <div className="glass-panel" style={{ padding: '28px', background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.08))', border: '1px solid rgba(139,92,246,0.2)' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>🔥 Votre Numéro FIRE</div>
                  <div style={{ fontSize: '3rem', fontWeight: 900, background: 'linear-gradient(135deg,#fff,#94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1.1 }}>{fmt(fireResult.fireNumber)}</div>
                  <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginTop: '6px' }}>= {annualExpenses}€/an ÷ {swr}% SWR</div>
                </div>

                {/* Progress */}
                <div className="glass-panel" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontWeight: 700 }}>Progression vers FIRE</span>
                    <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-blue)' }}>{fireResult.currentProgress.toFixed(1)}%</span>
                  </div>
                  <div style={{ height: '12px', background: 'rgba(255,255,255,0.06)', borderRadius: '6px', overflow: 'hidden', marginBottom: '8px' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, fireResult.currentProgress)}%`, background: 'linear-gradient(90deg,var(--accent-blue),var(--accent-purple))', borderRadius: '6px', transition: 'width 0.6s ease' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    <span>{fmt(portfolioValue)} actuellement</span>
                    <span>{fmt(fireResult.fireNumber)} cible</span>
                  </div>
                </div>

                {/* Key metrics grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '14px' }}>
                  {[
                    { label: 'Années restantes', value: fireResult.yearsToFire <= 100 ? `${fireResult.yearsToFire.toFixed(1)} ans` : '> 100 ans', color: 'var(--warning)', icon: '⏱️' },
                    { label: 'Date FIRE estimée', value: fireResult.yearsToFire <= 100 ? fireResult.fireDate.slice(0, 7) : '—', color: 'var(--success)', icon: '🗓️' },
                    { label: 'Revenu passif cible', value: `${fmt(annualExpenses / 12)}/mois`, color: 'var(--accent-blue)', icon: '💰' },
                  ].map(m => (
                    <div key={m.label} className="glass-panel" style={{ padding: '16px' }}>
                      <div style={{ fontSize: '1.4rem', marginBottom: '6px' }}>{m.icon}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{m.label}</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: m.color }}>{m.value}</div>
                    </div>
                  ))}
                </div>

                {/* Sensitivity table */}
                <div className="glass-panel" style={{ padding: '24px' }}>
                  <h4 style={{ margin: '0 0 16px', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Sensibilité : Années vers FIRE selon épargne mensuelle</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '8px' }}>
                    {[500, 1000, 1500, 2000, 3000].map(contrib => {
                      const mr = returnRate / 100 / 12
                      const fn = fireResult.fireNumber
                      let p = portfolioValue, m = 0
                      while (p < fn && m < 1200) { p = p * (1 + mr) + contrib; m++ }
                      const years = m > 0 ? (m / 12).toFixed(1) : '—'
                      const isActive = contrib === monthlyContribution
                      return (
                        <div key={contrib} style={{ textAlign: 'center', padding: '12px 8px', background: isActive ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${isActive ? 'var(--accent-blue)' : 'var(--border-color)'}`, borderRadius: '10px' }}>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{fmt(contrib)}/mois</div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: isActive ? 'var(--accent-blue)' : 'var(--text-primary)' }}>{years} ans</div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div style={{ padding: '12px 16px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '10px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  ⚠️ Simulation à titre indicatif. Ne tient pas compte de l'inflation, des impôts sur les retraits ou des aléas de marché. Rendement nominal (avant inflation).
                </div>
              </>
            )}
            {loadingFire && <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Calcul en cours…</div>}
            {!loadingFire && fireError && <div style={{ textAlign: 'center', padding: '20px', color: 'var(--danger)' }}>{fireError}</div>}
          </div>
        </div>
      )}

      {/* ─── PROJECTION ───────────────────────────────────────────────────── */}
      {activeTab === 'projection' && (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '24px', alignItems: 'start' }}>
          <div className="glass-panel" style={{ padding: '28px' }}>
            <h3 style={{ margin: '0 0 24px', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Paramètres</h3>
            <SliderField label="Capital de départ" value={projPortfolio} min={0} max={500000} step={1000} unit="€" onChange={setProjPortfolio} />
            <SliderField label="Épargne mensuelle" value={projMonthly} min={0} max={5000} step={50} unit="€" onChange={setProjMonthly} />
            <SliderField label="Horizon" value={projYears} min={5} max={40} step={5} unit=" ans" onChange={setProjYears} />
            <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', fontSize: '0.82rem' }}>
              <div style={{ color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>Taux utilisés :</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ color: '#10b981' }}>■ Conservateur : 4%/an</span>
                <span style={{ color: '#3b82f6' }}>■ Modéré : 7%/an</span>
                <span style={{ color: '#8b5cf6' }}>■ Optimiste : 10%/an</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h3 style={{ margin: '0 0 20px', fontSize: '1.05rem', fontWeight: 700 }}>Projection sur {projYears} ans</h3>
              <ResponsiveContainer width="100%" height={380}>
                <AreaChart data={projChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <defs>
                    {[{ id: 'conserv', color: '#10b981' }, { id: 'base', color: '#3b82f6' }, { id: 'optim', color: '#8b5cf6' }].map(g => (
                      <linearGradient key={g.id} id={g.id} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={g.color} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={g.color} stopOpacity={0.02} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="year" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                  <YAxis tickFormatter={v => fmtM(v)} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="Conservateur" stroke="#10b981" fill="url(#conserv)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="Modéré" stroke="#3b82f6" fill="url(#base)" strokeWidth={2.5} dot={false} />
                  <Area type="monotone" dataKey="Optimiste" stroke="#8b5cf6" fill="url(#optim)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {projResult && (
              <div className="glass-panel" style={{ padding: '20px' }}>
                <h4 style={{ margin: '0 0 16px', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Valeur estimée dans {projYears} ans</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px' }}>
                  {[
                    { label: 'Conservateur (4%)', value: projResult.conservative.at(-1) ?? 0, color: '#10b981' },
                    { label: 'Modéré (7%)', value: projResult.base.at(-1) ?? 0, color: '#3b82f6' },
                    { label: 'Optimiste (10%)', value: projResult.optimistic.at(-1) ?? 0, color: '#8b5cf6' },
                  ].map(s => (
                    <div key={s.label} style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>{s.label}</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: s.color }}>{fmt(s.value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── IMMO SIMULATOR ──────────────────────────────────────────────── */}
      {activeTab === 'immo' && (
        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '24px', alignItems: 'start' }}>
          <div className="glass-panel" style={{ padding: '28px' }}>
            <h3 style={{ margin: '0 0 24px', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>⚙️ Paramètres du projet</h3>
            <SliderField label="Prix du bien" value={immoPrice} min={50000} max={1000000} step={5000} unit="€" onChange={setImmoPrice} />
            <SliderField label="Apport personnel" value={immoApport} min={0} max={300000} step={1000} unit="€" onChange={setImmoApport} />
            <SliderField label="Taux d'emprunt" value={immoRate} min={0.5} max={7} step={0.1} unit="%" onChange={setImmoRate} />
            <SliderField label="Durée du prêt" value={immoDuration} min={5} max={30} step={1} unit=" ans" onChange={setImmoDuration} />
            <SliderField label="Tes revenus nets/mois" value={immoIncome} min={1000} max={15000} step={100} unit="€" onChange={setImmoIncome} />
            <SliderField label="Loyer actuel payé" value={immoCurrentRent} min={0} max={3000} step={50} unit="€" onChange={setImmoCurrentRent} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {immoResult && (
              <>
                {/* Affordability */}
                <div className="glass-panel" style={{ padding: '24px', background: immoResult.isAffordable ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${immoResult.isAffordable ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px' }}>
                    <div>

                    {!projResult && projectionError && (
                      <div className="glass-panel" style={{ padding: '24px', color: 'var(--danger)' }}>
                        {projectionError}
                      </div>
                    )}
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Mensualité</div>
                      <div style={{ fontSize: '3rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>{fmt(immoResult.monthlyPayment)}<span style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>/mois</span></div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Taux d'effort</div>
                      <div style={{ fontSize: '2.5rem', fontWeight: 900, color: immoResult.isAffordable ? 'var(--success)' : 'var(--danger)' }}>{immoResult.affordabilityRatio.toFixed(1)}%</div>
                      <div style={{ fontSize: '0.85rem', color: immoResult.isAffordable ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>{immoResult.isAffordable ? '✅ Finançable (< 33%)' : '❌ Dépasse 33% (risqué)'}</div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '14px' }}>
                  {[
                    { label: 'Apport versé', value: fmt(immoResult.apport), icon: '💰', color: 'var(--accent-blue)' },
                    { label: 'Montant emprunté', value: fmt(immoResult.loanAmount), icon: '🏦', color: 'var(--warning)' },
                    { label: 'Coût total du crédit', value: fmt(immoResult.totalCostOfCredit), icon: '📊', color: 'var(--danger)' },
                    { label: 'Coût total acquisition', value: fmt(immoResult.totalCost), icon: '💎', color: 'var(--text-primary)' },
                  ].map(m => (
                    <div key={m.label} className="glass-panel" style={{ padding: '16px 20px' }}>
                      <div style={{ fontSize: '1.2rem', marginBottom: '6px' }}>{m.icon}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{m.label}</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: m.color }}>{m.value}</div>
                    </div>
                  ))}
                </div>

                {/* Visual: cost breakdown bar */}
                <div className="glass-panel" style={{ padding: '20px' }}>
                  <div style={{ fontWeight: 700, marginBottom: '12px' }}>Décomposition du coût</div>
                  <div style={{ display: 'flex', height: '24px', borderRadius: '12px', overflow: 'hidden' }}>
                    <div title="Apport" style={{ flex: immoResult.apport, background: 'var(--accent-blue)' }} />
                    <div title="Capital remboursé" style={{ flex: immoResult.loanAmount, background: 'var(--warning)' }} />
                    <div title="Intérêts" style={{ flex: immoResult.totalCostOfCredit, background: 'var(--danger)' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '16px', marginTop: '10px', fontSize: '0.82rem' }}>
                    <span style={{ color: 'var(--accent-blue)' }}>■ Apport {fmt(immoResult.apport)}</span>
                    <span style={{ color: 'var(--warning)' }}>■ Capital {fmt(immoResult.loanAmount)}</span>
                    <span style={{ color: 'var(--danger)' }}>■ Intérêts {fmt(immoResult.totalCostOfCredit)}</span>
                  </div>
                </div>

                {immoCurrentRent > 0 && (
                  <div className="glass-panel" style={{ padding: '16px 20px', background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)' }}>
                    <div style={{ fontWeight: 700, marginBottom: '8px' }}>📊 vs Location actuelle</div>
                    <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                      Tu paies actuellement {fmt(immoCurrentRent)}/mois de loyer. La mensualité du prêt est {immoResult.monthlyPayment > immoCurrentRent
                        ? `${fmt(immoResult.monthlyPayment - immoCurrentRent)} de plus par mois.`
                        : `${fmt(immoCurrentRent - immoResult.monthlyPayment)} de moins par mois.`}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── WHAT IF ─────────────────────────────────────────────────────── */}
      {activeTab === 'whatif' && (
        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '24px', alignItems: 'start' }}>
          <div className="glass-panel" style={{ padding: '28px' }}>
            <h3 style={{ margin: '0 0 24px', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tes paramètres FIRE actuels</h3>
            <SliderField label="Dépenses annuelles" value={annualExpenses} min={10000} max={120000} step={1000} unit="€" onChange={setAnnualExpenses} />
            <SliderField label="Portefeuille actuel" value={portfolioValue} min={0} max={1000000} step={1000} unit="€" onChange={setPortfolioValue} />
            <SliderField label="Épargne mensuelle actuelle" value={wiBase} min={0} max={5000} step={50} unit="€" onChange={setWiBase} />
            <SliderField label="Épargne supplémentaire" value={wiExtra} min={0} max={2000} step={50} unit="€" onChange={setWiExtra} />
            <SliderField label="Rendement" value={returnRate} min={1} max={15} step={0.5} unit="%" onChange={setReturnRate} />
            <SliderField label="SWR" value={swr} min={2} max={6} step={0.5} unit="%" onChange={setSwr} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="glass-panel" style={{ padding: '28px', background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.08))', border: '1px solid rgba(139,92,246,0.2)', textAlign: 'center' }}>
              <div style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 600 }}>
                Et si tu épargnais <strong style={{ color: '#fff' }}>{fmt(wiExtra)}</strong> de plus par mois ?
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--success)', marginBottom: '4px' }}>
                {monthsSaved > 0 ? `${(monthsSaved / 12).toFixed(1)} ans gagnés` : 'Déjà FIRE ! 🎉'}
              </div>
              <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                ({monthsSaved} mois d'avance sur l'indépendance financière)
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div className="glass-panel" style={{ padding: '20px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>Sans surplus</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>{wiFireBase > 0 ? `${(wiFireBase / 12).toFixed(1)} ans` : 'Déjà FIRE'}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{fmt(wiBase)}/mois</div>
              </div>
              <div className="glass-panel" style={{ padding: '20px', textAlign: 'center', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>Avec surplus</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--success)' }}>{wiFireWithExtra > 0 ? `${(wiFireWithExtra / 12).toFixed(1)} ans` : 'FIRE ! 🎉'}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{fmt(wiBase + wiExtra)}/mois</div>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '20px' }}>
              <h4 style={{ margin: '0 0 14px', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Impact de différents surplus mensuels
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[100, 200, 300, 500, 1000].map(extra => {
                  const mr = returnRate / 100 / 12
                  const fn = annualExpenses / (swr / 100)
                  let p = portfolioValue, m = 0
                  while (p < fn && m < 1200) { p = p * (1 + mr) + (wiBase + extra); m++ }
                  const saved = wiFireBase - m
                  return (
                    <div key={extra} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>+{fmt(extra)}/mois</span>
                      <span style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>{(m / 12).toFixed(1)} ans</span>
                      <span style={{ fontSize: '0.8rem', color: saved > 0 ? 'var(--success)' : 'var(--text-muted)', fontWeight: 600 }}>
                        {saved > 0 ? `-${(saved / 12).toFixed(1)} ans` : '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
