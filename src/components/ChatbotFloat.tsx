import { useState, useRef, useEffect } from 'react'
import type { BudgetAnalysis } from '../types'
import { api, ApiError } from '../lib/api'

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
    'Résumé du mois',
    'Anomalies détectées ?',
    'Dépenses récurrentes',
    'Plus grosse dépense ?',
    'Non catégorisé',
  ]

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
      const result = await api.post<{ mode: string; title: string; answer: string }>('/ai/ask', {
          query,
          monthKey: analysis?.months[0]?.key,
      })

      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}-reply`,
          role: 'assistant',
          content: result.answer || 'Impossible de générer une réponse.',
          mode: result.mode as 'remote' | 'local',
          title: result.title,
        },
      ])
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
                  <div className="message-content">{msg.content}</div>
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

