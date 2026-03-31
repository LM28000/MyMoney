import { useState } from 'react'
import type { ActionPlan } from '../types'

type Props = {
  plan: ActionPlan
}

const WEEK_COLORS: Record<number, string> = {
  1: 'rgba(255, 107, 107, 0.15)', // red week 1
  2: 'rgba(255, 193, 7, 0.15)',   // yellow week 2
  3: 'rgba(66, 165, 245, 0.15)',   // blue week 3
  4: 'rgba(102, 187, 106, 0.15)',  // green week 4
}

const PRIORITY_LABELS: Record<string, string> = {
  critical: '🔴 Critique',
  high: '🟠 Haute',
  medium: '🟡 Moyenne',
  low: '🟢 Basse',
}

const TYPE_ICONS: Record<string, string> = {
  budget: '💰',
  investment: '📈',
  debt: '💳',
  savings: '🏦',
  categorization: '📋',
  review: '📊',
}

export default function ActionPlanWidget({ plan }: Props) {
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())

  const toggleTaskExpanded = (taskId: string) => {
    const next = new Set(expandedTasks)
    if (next.has(taskId)) {
      next.delete(taskId)
    } else {
      next.add(taskId)
    }
    setExpandedTasks(next)
  }

  const tasksByWeek = Array.from({ length: 4 }, (_, i) => 
    plan.tasks.filter(task => task.week === i + 1)
  )

  return (
    <div style={{ padding: '0.5rem' }}>
      <div
        style={{
          fontSize: '0.85rem',
          fontWeight: 500,
          color: 'rgba(255,255,255,0.8)',
          marginBottom: '1rem',
          paddingBottom: '0.5rem',
          borderBottom: '1px solid rgba(255,255,255,0.2)',
        }}
      >
        <div>{plan.summary}</div>
        <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>
          📅 {plan.startDate} → {plan.endDate} | 💵 Impact: €{plan.estimatedFinancialImpact.toFixed(0)}/mois
        </div>
      </div>

      {tasksByWeek.map((weekTasks, weekIdx) => {
        const week = weekIdx + 1
        if (weekTasks.length === 0) return null

        return (
          <div
            key={`week-${week}`}
            style={{
              backgroundColor: WEEK_COLORS[week],
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '4px',
              marginBottom: '1rem',
              padding: '0.75rem',
              overflow: 'hidden',
            }}
          >
            <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Semaine {week} ({plan.tasks
                .filter((t) => t.week === week)
                .filter((t) => t.priority === 'critical').length > 0
                ? '🔥 '
                : ''}
              {weekTasks.length} actions)
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {weekTasks.map((task) => {
                const isExpanded = expandedTasks.has(task.id)
                return (
                  <div
                    key={task.id}
                    onClick={() => toggleTaskExpanded(task.id)}
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '3px',
                      padding: '0.5rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(255,255,255,0.08)'
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(255,255,255,0.05)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                          {TYPE_ICONS[task.type] ?? '📌'} {task.title}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', marginTop: '0.25rem' }}>
                          {PRIORITY_LABELS[task.priority]} • Due: {task.targetDate}
                        </div>
                      </div>
                      <div style={{ fontSize: '1rem', marginLeft: '0.5rem' }}>
                        {isExpanded ? '▼' : '▶'}
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', marginBottom: '0.5rem' }}>
                          {task.description}
                        </div>

                        {task.actionableSteps && task.actionableSteps.length > 0 && (
                          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>
                            <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>Étapes:</div>
                            <ul
                              style={{
                                margin: '0',
                                paddingLeft: '1rem',
                                listStyle: 'disc',
                              }}
                            >
                              {task.actionableSteps.map((step, idx) => (
                                <li key={idx} style={{ marginBottom: '0.25rem' }}>
                                  {step}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {task.estimatedImpact && task.estimatedImpact > 0 && (
                          <div
                            style={{
                              marginTop: '0.5rem',
                              padding: '0.5rem',
                              backgroundColor: 'rgba(102, 187, 106, 0.2)',
                              borderRadius: '3px',
                              fontSize: '0.8rem',
                              fontWeight: 500,
                              color: 'rgba(255,255,255,0.9)',
                            }}
                          >
                            💰 Impact: €{task.estimatedImpact.toFixed(0)}/mois
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
