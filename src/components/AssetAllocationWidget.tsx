import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { formatCurrency } from '../lib/finance'

interface AllocationItem {
  name: string
  value: number
  color: string
}

interface Props {
  cash: number
  investments: number
  realEstate: number
  crypto: number
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div style={{ background: 'var(--bg-panel-solid)', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '12px', color: 'var(--text-primary)', boxShadow: 'var(--shadow-panel)' }}>
        <p style={{ margin: 0, fontWeight: 600 }}>{data.name}</p>
        <p style={{ margin: '4px 0 0 0', color: data.color }}>{formatCurrency(data.value)}</p>
      </div>
    )
  }
  return null
}

export default function AssetAllocationWidget({ cash, investments, realEstate, crypto }: Props) {
  const data: AllocationItem[] = [
    { name: 'Liquidités', value: cash, color: '#33836e' },
    { name: 'Bourse & Placements', value: investments, color: '#2f6c74' },
    { name: 'Immobilier', value: realEstate, color: '#b9895c' },
    { name: 'Cryptomonnaies', value: crypto, color: '#d4a13c' },
  ].filter(item => item.value > 0)

  if (data.length === 0) return null

  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', padding: '1.5rem', background: 'linear-gradient(145deg, rgba(47, 108, 116, 0.14), rgba(185, 137, 92, 0.06))' }}>
      <div style={{ width: '200px', height: '200px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
              stroke="none"
              cornerRadius={4}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      
      <div style={{ flex: 1, paddingLeft: '2rem' }}>
        <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.2rem', fontWeight: 700 }}>Allocation d'actifs</h3>
        <p style={{ margin: '0 0 1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>La structure actuelle du patrimoine par grande poche.</p>
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {data.map(item => (
            <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: item.color }} />
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{item.name}</span>
              </div>
              <span style={{ fontWeight: 500 }}>{formatCurrency(item.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
