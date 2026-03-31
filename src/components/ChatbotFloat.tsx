import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { BudgetAnalysis, ActionPlan } from '../types'
import { api, ApiError } from '../lib/api'
import ActionPlanWidget from './ActionPlanWidget'

type Props = {
  analysis: BudgetAnalysis | null
  backendStatus: 'connecting' | 'online' | 'offline'
}

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  mode?: 'remote' | 'local'
  title?: string
  actionProposal?: {
    changes: Array<{ field: string; from: number; to: number }>
    applying?: boolean
    applied?: boolean
  }
  actionPlan?: ActionPlan
}

type HealthGoalsActionResponse = {
  kind: 'health-goals-update'
  dryRun: boolean
  hasChanges: boolean
  message: string
  changes: Array<{ field: string; from: number; to: number }>
}

const HEALTH_GOAL_FIELD_LABELS: Record<string, string> = {
  targetEmergencyFundMonths: 'Liquidité cible (mois)',
  maxCryptoShareTotal: 'Crypto max (%)',
  maxSinglePositionShare: 'Position unique max (%)',
  maxTop3PositionsShare: 'Top 3 max (%)',
  maxDebtToAssetRatio: 'Dette/actifs max (%)',
  maxDebtServiceToIncomeRatio: 'Mensualités/revenus max (%)',
  allocationDriftTolerance: 'Tolérance allocation (pts)',
  minAssetClassCount: 'Classes d actifs min',
  minGeoBucketCount: 'Zones géographiques min',
  minSectorBucketCount: 'Secteurs min',
}

export default function ChatbotFloat({ analysis, backendStatus }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const quickPrompts = [
    'Fais mon diagnostic financier',
    'Crée un plan d action sur 30 jours',
    'Quel est mon principal risque actuel ?',
    'Propose une modification de mes objectifs de santé',
    'Anomalies détectées ?',
  ]

  const formatProposalSummary = (changes: Array<{ field: string; from: number; to: number }>) => {
    return changes
      .map((change) => {
        const label = HEALTH_GOAL_FIELD_LABELS[change.field] ?? change.field
        return `• ${label}: ${change.from} → ${change.to}`
      })
      .join('\n')
  }

  const applyHealthGoalProposal = async (
    messageId: string,
    changes: Array<{ field: string; from: number; to: number }>,
  ) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId && msg.actionProposal
          ? { ...msg, actionProposal: { ...msg.actionProposal, applying: true } }
          : msg,
      ),
    )

    try {
      const updates = Object.fromEntries(changes.map((change) => [change.field, change.to]))
      const result = await api.post<HealthGoalsActionResponse>('/ai/actions/health-goals', {
        updates,
        dryRun: false,
      })

      setMessages((prev) => [
        ...prev.map((msg) =>
          msg.id === messageId && msg.actionProposal
            ? { ...msg, actionProposal: { ...msg.actionProposal, applying: false, applied: true } }
            : msg,
        ),
        {
          id: `msg-${Date.now()}-apply-success`,
          role: 'assistant',
          title: 'Mise à jour appliquée',
          content: result.message,
          mode: 'local',
        },
      ])
    } catch (error) {
      setMessages((prev) => [
        ...prev.map((msg) =>
          msg.id === messageId && msg.actionProposal
            ? { ...msg, actionProposal: { ...msg.actionProposal, applying: false } }
            : msg,
        ),
        {
          id: `msg-${Date.now()}-apply-error`,
          role: 'assistant',
          content: error instanceof ApiError ? error.message : 'Impossible d appliquer les modifications.',
        },
      ])
    }
  }

  const handleSend = async (text?: string) => {
    const query = text || input
    if (!query.trim() || backendStatus !== 'online') return

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: query,
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const [result, proposal] = await Promise.all([
        api.post<{ mode: string; title: string; answer: string; actionPlan?: ActionPlan }>('/ai/ask', {
          query,
          monthKey: analysis?.months[0]?.key,
        }),
        api.post<HealthGoalsActionResponse>('/ai/actions/health-goals', {
          query,
          dryRun: true,
        }).catch(() => null),
      ])

      const nextMessages: Message[] = [
        {
          id: `msg-${Date.now()}-reply`,
          role: 'assistant',
          content: result.answer || 'Impossible de générer une réponse.',
          mode: result.mode as 'remote' | 'local',
          title: result.title,
          actionPlan: result.actionPlan,
        },
      ]

      if (proposal?.hasChanges && proposal.changes.length > 0) {
        nextMessages.push({
          id: `msg-${Date.now()}-proposal`,
          role: 'assistant',
          title: 'Proposition de mise à jour',
          content: `${proposal.message}\n\n${formatProposalSummary(proposal.changes)}`,
          mode: 'local',
          actionProposal: {
            changes: proposal.changes,
            applying: false,
            applied: false,
          },
        })
      }

      setMessages((prev) => [...prev, ...nextMessages])
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}-error`,
          role: 'assistant',
          content: error instanceof ApiError ? error.message : 'Erreur de connexion au backend.',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const isOnline = backendStatus === 'online'
  const hasData = Boolean(analysis && analysis.months.length > 0)

  return (
    <div className="chatbot-container">
      <button
        className={`chatbot-float-btn ${open ? 'open' : ''}`}
        onClick={() => setOpen(!open)}
        title="Assistant financier"
      >
        {open ? '✕' : '💬'}
      </button>

      {open && (
        <div className="chatbot-window">
          <div className="chatbot-header">
            <h3>🤖 Assistant Financier</h3>
            <small>
              {!isOnline
                ? '🔴 Hors ligne'
                : !hasData
                  ? '⚠️ Pas de données'
                  : '🟢 Analyse locale active'}
            </small>
          </div>

          <div className="chatbot-messages">
            {messages.length === 0 ? (
              <div className="chatbot-initial">
                {!hasData ? (
                  <p className="chatbot-hint">Importez un CSV pour activer l'assistant.</p>
                ) : (
                  <>
                    <p className="chatbot-hint">
                      Posez une question sur vos finances ou utilisez un raccourci :
                    </p>
                    <div className="quick-prompts">
                      {quickPrompts.map((prompt) => (
                        <button
                          key={prompt}
                          className="quick-prompt-btn"
                          onClick={() => handleSend(prompt)}
                          disabled={!isOnline || loading}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`message message-${msg.role}`}>
                  {msg.role === 'assistant' && msg.title && (
                    <div className="message-title">
                      {msg.title}
                      {msg.mode === 'remote' && (
                        <span className="mode-badge ai">✨ IA</span>
                      )}
                    </div>
                  )}
                  <div className="message-content markdown-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </div>
                  {msg.role === 'assistant' && msg.actionPlan && (
                    <div style={{ marginTop: '1rem', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '4px' }}>
                      <ActionPlanWidget plan={msg.actionPlan} />
                    </div>
                  )}
                  {msg.role === 'assistant' && msg.actionProposal && !msg.actionProposal.applied && (
                    <button
                      type="button"
                      className="quick-prompt-btn"
                      style={{ marginTop: '10px' }}
                      disabled={Boolean(msg.actionProposal.applying) || loading}
                      onClick={() => void applyHealthGoalProposal(msg.id, msg.actionProposal?.changes ?? [])}
                    >
                      {msg.actionProposal.applying ? 'Application…' : 'Appliquer ces paramètres'}
                    </button>
                  )}
                  {msg.role === 'assistant' && msg.actionProposal?.applied && (
                    <div style={{ marginTop: '8px', fontSize: '0.78rem', color: 'var(--success)' }}>
                      Modifications appliquées.
                    </div>
                  )}
                </div>
              ))
            )}
            {loading && (
              <div className="message message-assistant loading">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="chatbot-input">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !loading) handleSend()
              }}
              placeholder={hasData ? 'Votre question...' : 'Importez un CSV d\'abord'}
              disabled={!isOnline || loading || !hasData}
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || !isOnline || loading || !hasData}
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

