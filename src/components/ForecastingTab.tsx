import { useState, useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts'
import { TrendingUp, Calculator, Calendar } from 'lucide-react'

type ForecastingTabProps = {
  currentNetWorth: number
}

export default function ForecastingTab({ currentNetWorth }: ForecastingTabProps) {
  const [monthlySavings, setMonthlySavings] = useState(1000)
  const [annualReturnRate, setAnnualReturnRate] = useState(6.5)
  const [years, setYears] = useState(20)

  // Calculate projections
  const data = useMemo(() => {
    let current = currentNetWorth
    const results = []
    
    for (let i = 0; i <= years; i++) {
      results.push({
        year: new Date().getFullYear() + i,
        capitalVested: currentNetWorth + (monthlySavings * 12 * i),
        projectedValue: current
      })
      // Compound for next year
      const yearlyContribution = monthlySavings * 12
      current = current * (1 + annualReturnRate / 100) + yearlyContribution
    }
    
    return results
  }, [currentNetWorth, monthlySavings, annualReturnRate, years])

  const finalValue = data[data.length - 1]?.projectedValue ?? 0
  const finalCapital = data[data.length - 1]?.capitalVested ?? 0
  const totalInterest = finalValue - finalCapital
  
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val)
  }

  return (
    <div className="tab-content" style={{ animation: 'fadeUp 0.5s ease' }}>
      <div className="section-header-row" style={{ marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '2.2rem', margin: '0 0 8px 0', textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
            Machine à Voyager dans le Temps 🚀
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
            Visualisez la croissance spectaculaire de votre patrimoine grâce aux intérêts composés.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '32px' }}>
        {/* Settings Panel */}
        <div className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Calculator size={24} className="text-gradient-accent" /> Variables
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Épargne Mensuelle</label>
            <div style={{ position: 'relative' }}>
              <BanknoteIconWrapper />
              <input 
                type="number" 
                value={monthlySavings} 
                onChange={e => setMonthlySavings(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '16px 16px 16px 48px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)',
                  background: 'rgba(0,0,0,0.3)',
                  color: '#fff',
                  fontSize: '1.2rem',
                  fontWeight: 600,
                  outline: 'none'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Rendement Annuel Estimé (%)</label>
            <div style={{ position: 'relative' }}>
              <TrendingUp size={20} color="var(--text-muted)" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
              <input 
                type="number" 
                step="0.1"
                value={annualReturnRate} 
                onChange={e => setAnnualReturnRate(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '16px 16px 16px 48px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)',
                  background: 'rgba(0,0,0,0.3)',
                  color: '#fff',
                  fontSize: '1.2rem',
                  fontWeight: 600,
                  outline: 'none'
                }}
              />
            </div>
            <input 
              type="range" 
              min="0" max="15" step="0.5" 
              value={annualReturnRate} 
              onChange={e => setAnnualReturnRate(Number(e.target.value))}
              style={{ width: '100%', marginTop: '8px' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Horizon de Temps (Années)</label>
            <div style={{ position: 'relative' }}>
              <Calendar size={20} color="var(--text-muted)" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
              <input 
                type="number" 
                value={years} 
                onChange={e => setYears(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '16px 16px 16px 48px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)',
                  background: 'rgba(0,0,0,0.3)',
                  color: '#fff',
                  fontSize: '1.2rem',
                  fontWeight: 600,
                  outline: 'none'
                }}
              />
            </div>
            <input 
              type="range" 
              min="1" max="40" step="1" 
              value={years} 
              onChange={e => setYears(Number(e.target.value))}
              style={{ width: '100%', marginTop: '8px' }}
            />
          </div>
        </div>

        {/* Projection Chart & Summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            <div className="glass-panel" style={{ padding: '24px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Valeur Finale</div>
              <div className="text-gradient" style={{ fontSize: '2.5rem', fontWeight: 800 }}>{formatCurrency(finalValue)}</div>
            </div>
            <div className="glass-panel" style={{ padding: '24px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Capital Investi</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#e2e8f0' }}>{formatCurrency(finalCapital)}</div>
            </div>
            <div className="glass-panel" style={{ padding: '24px', textAlign: 'center', borderTop: '4px solid var(--accent-purple)' }}>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Intérêts Générés</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--accent-purple)' }}>+{formatCurrency(totalInterest)}</div>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '32px', height: '450px' }}>
            <h3 style={{ margin: '0 0 24px 0', fontSize: '1.2rem', fontWeight: 600 }}>Évolution du Patrimoine</h3>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent-purple)" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="var(--accent-purple)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="year" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                <YAxis 
                  tickFormatter={(value) => `${(value / 1000).toFixed(0)}k€`} 
                  stroke="var(--text-muted)" 
                  tick={{ fill: 'var(--text-muted)' }} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <Tooltip 
                  formatter={(value: any) => [formatCurrency(value as number), '']}
                  labelStyle={{ color: '#fff', fontWeight: 700, marginBottom: '8px' }}
                  contentStyle={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="projectedValue" 
                  name="Valeur"
                  stroke="var(--accent-purple)" 
                  strokeWidth={4}
                  fillOpacity={1} 
                  fill="url(#colorValue)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}

function BanknoteIconWrapper() {
  return (
    <svg 
      width="20" height="20" viewBox="0 0 24 24" fill="none" 
      stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" 
      style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }}
    >
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M6 12h.01M18 12h.01" />
    </svg>
  )
}
