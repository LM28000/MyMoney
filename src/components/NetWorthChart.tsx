import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { formatCurrency } from '../lib/finance'

interface Snapshot {
  date: string
  net_worth: number
  cash: number
  investments: number
  debts: number
}

interface Props {
  data: Snapshot[]
}

const formatXAxis = (tickItem: string) => {
  const date = new Date(tickItem)
  return new Intl.DateTimeFormat('fr-FR', { month: 'short', day: 'numeric' }).format(date)
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: 'var(--bg-panel-solid)', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '12px', color: 'var(--text-primary)', boxShadow: 'var(--shadow-panel)' }}>
        <p style={{ margin: 0, opacity: 0.7, fontSize: '0.8rem' }}>{new Date(label).toLocaleDateString('fr-FR')}</p>
        <p style={{ margin: '5px 0 0 0', fontWeight: 'bold', color: 'var(--accent-blue)' }}>
          Net Worth : {formatCurrency(payload[0].value)}
        </p>
      </div>
    )
  }
  return null
}

export default function NetWorthChart({ data }: Props) {
  if (!data || data.length === 0) {
    return <div className="history-chart-empty">En attente de snapshots quotidiens.</div>
  }

  // Ensure minimum 2 points for a visually pleasing area chart
  const plotData = data.length === 1 ? [data[0], { ...data[0], date: new Date().toISOString().split('T')[0] }] : data

  return (
    <div className="card" style={{ height: 300, width: '100%', padding: '1rem' }}>
      <h3 style={{ marginBottom: '0.35rem', fontSize: '1.1rem' }}>Évolution du patrimoine net</h3>
      <p style={{ margin: '0 0 1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Lecture de tendance pour repérer l'accélération ou le tassement du patrimoine.</p>
      <ResponsiveContainer width="100%" height="80%">
        <AreaChart data={plotData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
          <defs>
            <linearGradient id="colorNetWorth" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2f6c74" stopOpacity={0.34}/>
              <stop offset="95%" stopColor="#2f6c74" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tickFormatter={formatXAxis} stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis hide domain={['auto', 'auto']} />
          <Tooltip content={<CustomTooltip />} />
          <Area type="monotone" dataKey="net_worth" stroke="#2f6c74" strokeWidth={3} fillOpacity={1} fill="url(#colorNetWorth)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
