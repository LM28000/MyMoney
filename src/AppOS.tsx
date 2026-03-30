import { useEffect, useState } from 'react'
import {
  LayoutDashboard, PieChart, Landmark, BarChart2, Banknote,
  Target, Calculator, Upload, Home, Flame,
  Sun, Moon
} from 'lucide-react'
import './AppOS.css'
import type {
  BudgetAnalysis,
  BudgetOverrides,
  CategoryRule,
  ManualNetWorthItem,
} from './types'
import DashboardTab, { type PatrimonySummary } from './components/DashboardTab'
import AccountsTab, { type Account } from './components/AccountsTab'
import BudgetTab from './components/BudgetTab'
import ImportsTab from './components/ImportsTab'
import ChatbotFloat from './components/ChatbotFloat'
import DebtsTab from './components/DebtsTab'
import GoalsTab from './components/GoalsTab'
import PatrimoineTab from './components/PatrimoineTab'
import SimulatorsTab from './components/SimulatorsTab'
import TaxTab from './components/TaxTab'
import { api } from './lib/api'

type Suggestion = {
  id: string
  category: string
  priority: 'high' | 'medium' | 'low'
  title: string
  description: string
  actionableAdvice: string
}

type ApiStateResponse = {
  rules: CategoryRule[]
  budgetOverrides: BudgetOverrides
  netWorthItems: ManualNetWorthItem[]
  emergencyFundTargetMonths: number
  emergencyFundMonthlyExpenses: number | null
  analysis: BudgetAnalysis | null
  patrimony: PatrimonySummary
  suggestions: Suggestion[]
  history: Array<{
    date: string
    net_worth: number
    cash: number
    investments: number
    debts: number
  }>
  accounts: Account[]
  imports: Array<{
    id: string
    fileName: string
    uploadedAt: string
    accountLabel?: string
    isActive: boolean
  }>
}

type TabType =
  | 'dashboard'
  | 'patrimoine'
  | 'comptes'
  | 'budget'
  | 'dettes'
  | 'objectifs'
  | 'simulateurs'
  | 'fiscalite'
  | 'imports'

type NavGroup = {
  label: string
  items: { key: TabType; label: string; icon: React.ReactNode }[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Pilotage',
    items: [
      { key: 'dashboard', label: 'Cockpit', icon: <LayoutDashboard size={18} /> },
    ]
  },
  {
    label: 'Patrimoine',
    items: [
      { key: 'patrimoine', label: 'Vue globale', icon: <Home size={18} /> },
      { key: 'comptes', label: 'Comptes & positions', icon: <Landmark size={18} /> },
      { key: 'dettes', label: 'Dettes & Crédits', icon: <Banknote size={18} /> },
    ]
  },
  {
    label: 'Budget',
    items: [
      { key: 'budget', label: 'Flux & budget', icon: <BarChart2 size={18} /> },
      { key: 'imports', label: 'Imports', icon: <Upload size={18} /> },
    ]
  },
  {
    label: 'Plan',
    items: [
      { key: 'objectifs', label: 'Objectifs', icon: <Target size={18} /> },
      { key: 'simulateurs', label: 'Simulateurs & FIRE', icon: <Flame size={18} /> },
      { key: 'fiscalite', label: 'Fiscalité', icon: <Calculator size={18} /> },
    ]
  },
]

export default function AppOS() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard')
  const [loading, setLoading] = useState(true)
  const [backendStatus, setBackendStatus] = useState<'connecting' | 'online' | 'offline'>('connecting')
  const [isHydrated, setIsHydrated] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof localStorage !== 'undefined') return (localStorage.getItem('theme') as 'dark' | 'light') ?? 'dark'
    return 'dark'
  })

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const [analysis, setAnalysis] = useState<BudgetAnalysis | null>(null)
  const [patrimony, setPatrimony] = useState<PatrimonySummary | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [rules, setRules] = useState<CategoryRule[]>([])
  const [budgetOverrides, setBudgetOverrides] = useState<BudgetOverrides>({})
  const [netWorthItems, setNetWorthItems] = useState<ManualNetWorthItem[]>([])
  const [emergencyFundTargetMonths, setEmergencyFundTargetMonths] = useState(6)
  const [emergencyFundMonthlyExpenses, setEmergencyFundMonthlyExpenses] = useState<number | null>(null)
  const [history, setHistory] = useState<ApiStateResponse['history']>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [imports, setImports] = useState<ApiStateResponse['imports']>([])

  const activeTabMeta = NAV_GROUPS.flatMap((group) => group.items).find((item) => item.key === activeTab)

  const refreshState = async () => {
    try {
      const data = await api.get<ApiStateResponse>('/state')
      setAnalysis(data.analysis)
      setPatrimony(data.patrimony)
      setSuggestions(data.suggestions)
      setHistory(data.history ?? [])
      setAccounts(data.accounts ?? [])
      setImports(data.imports ?? [])
      setEmergencyFundTargetMonths(data.emergencyFundTargetMonths ?? 6)
      setEmergencyFundMonthlyExpenses(data.emergencyFundMonthlyExpenses ?? null)
    } catch {
      // silent
    }
  }

  const updateEmergencyFundSettings = async (targetMonths: number, monthlyExpenses: number | null) => {
    if (backendStatus !== 'online') return false
    try {
      const data = await api.put<{
        emergencyFundTargetMonths: number
        emergencyFundMonthlyExpenses: number | null
        patrimony: PatrimonySummary
        suggestions: Suggestion[]
      }>('/emergency-fund', { targetMonths, monthlyExpenses })
      setEmergencyFundTargetMonths(data.emergencyFundTargetMonths)
      setEmergencyFundMonthlyExpenses(data.emergencyFundMonthlyExpenses)
      setPatrimony(data.patrimony)
      setSuggestions(data.suggestions)
      return true
    } catch {
      return false
    }
  }

  useEffect(() => {
    const hydrateFromBackend = async () => {
      try {
        setBackendStatus('connecting')
        const payload = await api.get<ApiStateResponse>('/state')
        setBackendStatus('online')
        setAnalysis(payload.analysis)
        setPatrimony(payload.patrimony)
        setSuggestions(payload.suggestions)
        setRules(payload.rules)
        setBudgetOverrides(payload.budgetOverrides)
        setNetWorthItems(payload.netWorthItems)
        setEmergencyFundTargetMonths(payload.emergencyFundTargetMonths)
        setEmergencyFundMonthlyExpenses(payload.emergencyFundMonthlyExpenses ?? null)
        setHistory(payload.history ?? [])
        setAccounts(payload.accounts ?? [])
        setImports(payload.imports ?? [])
        setIsHydrated(true)
        setLoading(false)
      } catch (error) {
        console.error('Hydration error:', error)
        setBackendStatus('offline')
        setIsHydrated(true)
        setLoading(false)
      }
    }
    hydrateFromBackend()
    setTimeout(async () => {
      try {
        const payload = await api.post<{ patrimony: PatrimonySummary; netWorthItems: ManualNetWorthItem[] }>('/wealth/sync')
        setPatrimony(payload.patrimony)
        setNetWorthItems(payload.netWorthItems)
      } catch { /* silent */ }
    }, 2000)
  }, [])

  useEffect(() => {
    if (!isHydrated || backendStatus !== 'online') return
    api.put('/rules', { rules }).catch(() => {})
  }, [rules, isHydrated, backendStatus])

  useEffect(() => {
    if (!isHydrated || backendStatus !== 'online') return
    api.put('/budgets', { budgetOverrides }).catch(() => {})
  }, [budgetOverrides, isHydrated, backendStatus])

  useEffect(() => {
    if (!isHydrated || backendStatus !== 'online') return
    api.put('/networth-items', { netWorthItems }).catch(() => {})
  }, [netWorthItems, isHydrated, backendStatus])

  if (loading) {
    return (
      <div className="app-container loading-state">
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>💎</div>
          <div style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Chargement de votre patrimoine…</div>
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '16px' }}>
            {[0, 1, 2].map(i => <div key={i} className="loading-dot" style={{ animationDelay: `${i * -0.16}s` }} />)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">
            <PieChart size={22} color="#fff" />
          </div>
          <div>
            <h1 className="app-title">MyMoney</h1>
            <p className="app-subtitle">Personal Wealth OS</p>
          </div>
        </div>

        <div className="sidebar-brief-card">
          <span className="sidebar-brief-kicker">Focus actuel</span>
          <strong>{activeTabMeta?.label ?? 'Cockpit'}</strong>
          <p>Une base unique pour piloter cash, patrimoine, budget et trajectoire.</p>
        </div>

        <nav className="nav-menu" style={{ flex: 1, overflowY: 'auto' }}>
          {NAV_GROUPS.map(group => (
            <div key={group.label} style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '8px 16px 4px' }}>
                {group.label}
              </div>
              {group.items.map(item => (
                <button
                  key={item.key}
                  className={`nav-item ${activeTab === item.key ? 'active' : ''}`}
                  onClick={() => setActiveTab(item.key)}
                >
                  {item.icon}
                  <span style={{ marginLeft: '10px' }}>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Bottom controls */}
        <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
          {/* Theme toggle */}
          <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 16px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', borderRadius: '10px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, marginBottom: '10px' }}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            {theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
          </button>

          <div className="backend-indicator">
            <div className={`status-dot ${backendStatus}`} />
            <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
              {backendStatus === 'online' ? 'Serveur connecté' : backendStatus === 'connecting' ? 'Connexion…' : 'Hors ligne'}
            </span>
          </div>
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────────────────────── */}
      <div className="main-wrapper">
        <main className="content-area-scroll">
          <div className="content-area-inner">
            {activeTab === 'dashboard' && (
              <DashboardTab
                patrimony={patrimony}
                history={history}
                netWorthItems={netWorthItems}
                onAddAsset={(item) => {
                  const fullItem = { ...item, id: Date.now().toString() } as ManualNetWorthItem
                  const newItems = [...netWorthItems, fullItem]
                  setNetWorthItems(newItems)
                  api.put('/networth-items', { netWorthItems: newItems })
                    .then(() => api.post<{ patrimony: PatrimonySummary; netWorthItems: ManualNetWorthItem[] }>('/wealth/sync'))
                    .then(payload => { if (payload) { setPatrimony(payload.patrimony); setNetWorthItems(payload.netWorthItems) } })
                }}
                suggestions={suggestions}
                analysis={analysis}
                backendStatus={backendStatus}
                emergencyFundTargetMonths={emergencyFundTargetMonths}
                emergencyFundMonthlyExpenses={emergencyFundMonthlyExpenses}
                onEmergencyFundSettingsChange={updateEmergencyFundSettings}
                onSuggestionsRefresh={setSuggestions}
                onNavigate={setActiveTab}
              />
            )}

            {activeTab === 'patrimoine' && (
              <PatrimoineTab
                financialAccounts={accounts}
                backendStatus={backendStatus}
                onRefresh={refreshState}
              />
            )}

            {activeTab === 'comptes' && (
              <AccountsTab
                accounts={accounts}
                backendStatus={backendStatus}
                onRefresh={refreshState}
              />
            )}

            {activeTab === 'budget' && (
              <BudgetTab
                analysis={analysis}
                budgetOverrides={budgetOverrides}
                onBudgetOverrideChange={(category, value) => {
                  setBudgetOverrides(prev => {
                    const next = { ...prev }
                    if (value === null) delete next[category]
                    else next[category] = value
                    return next
                  })
                  setTimeout(() => { void refreshState() }, 500)
                }}
              />
            )}

            {activeTab === 'dettes' && <DebtsTab />}

            {activeTab === 'objectifs' && <GoalsTab />}

            {activeTab === 'simulateurs' && (
              <SimulatorsTab currentNetWorth={patrimony?.netWorth ?? 0} />
            )}

            {activeTab === 'fiscalite' && <TaxTab />}

            {activeTab === 'imports' && (
              <ImportsTab
                imports={imports}
                analysis={analysis}
                backendStatus={backendStatus}
                onImport={refreshState}
              />
            )}
          </div>
        </main>

        <ChatbotFloat analysis={analysis} backendStatus={backendStatus} />
      </div>
    </div>
  )
}
