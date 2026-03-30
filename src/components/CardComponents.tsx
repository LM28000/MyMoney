/**
 * Reusable card components to reduce duplication across the dashboard.
 * Pattern-based consolidation: 11 card patterns → 4 composable components
 */

import type { ReactNode } from 'react'

export type CardVariant = 'primary' | 'accent' | 'premium-accent' | 'default'

/* ─── MetricCard ─── */
export type MetricCardProps = {
  label: string
  value: string | number
  meta?: string | ReactNode
  variant?: CardVariant
  className?: string
}

export function MetricCard({
  label,
  value,
  meta,
  variant = 'default',
  className = '',
}: MetricCardProps) {
  const variantClass = `card-${variant}`
  return (
    <div className={`metric-card ${variantClass} ${className}`}>
      <div className="metric-card-label">{label}</div>
      <div className="metric-card-value">{value}</div>
      {meta && <div className="metric-card-meta">{meta}</div>}
    </div>
  )
}

/* ─── CompactMetricCard ─── */
export type CompactMetricCardProps = {
  label: string
  value: string | number
  meta?: string | ReactNode
  variant?: CardVariant
  className?: string
}

export function CompactMetricCard({
  label,
  value,
  meta,
  variant = 'default',
  className = '',
}: CompactMetricCardProps) {
  const variantClass = variant !== 'default' ? `compact-metric-card-${variant}` : ''
  return (
    <div className={`compact-metric-card ${variantClass} ${className}`}>
      <span className="compact-metric-label">{label}</span>
      <strong className="compact-metric-value">{value}</strong>
      {meta && <small className="compact-metric-meta">{meta}</small>}
    </div>
  )
}

/* ─── AlertCard ─── */
export type AlertCardProps = {
  severity: 'high' | 'medium' | 'low'
  title: string
  description: string
  className?: string
}

export function AlertCard({ severity, title, description, className = '' }: AlertCardProps) {
  return (
    <div className={`alert-card alert-severity-${severity} ${className}`}>
      <div className="alert-card-title">{title}</div>
      <div className="alert-card-description">{description}</div>
    </div>
  )
}

/* ─── PriorityCapsule ─── */
export type PriorityCapsuleProps = {
  priority: 'high' | 'medium' | 'low'
  title: string
  description: string
  adviceText?: string
  className?: string
}

export function PriorityCapsule({
  priority,
  title,
  description,
  adviceText,
  className = '',
}: PriorityCapsuleProps) {
  return (
    <div className={`priority-capsule priority-${priority} ${className}`}>
      <strong className="priority-title">{title}</strong>
      <span className="priority-description">{description}</span>
      {adviceText && <span className="priority-advice">{adviceText}</span>}
    </div>
  )
}

/* ─── StatRow (monthly, allocation items) ─── */
export type StatRowProps = {
  label: string
  value: ReactNode
  subValue?: ReactNode
  meta?: ReactNode
  progress?: number
  valueColor?: string
  isBold?: boolean
  className?: string
}

export function StatRow({ label, value, subValue, meta, progress, valueColor, isBold, className = '' }: StatRowProps) {
  return (
    <div className={`stat-row ${className}`}>
      <div className="stat-row-content">
        <span className="stat-label">
          {label}
          {meta && <span className="stat-meta" style={{ marginLeft: '8px', opacity: 0.6, fontSize: '0.85em' }}>{meta}</span>}
        </span>
        <span 
          className="stat-value" 
          style={{ 
            color: valueColor, 
            fontWeight: isBold ? 600 : undefined 
          }}
        >
          {value}
        </span>
        {subValue && <span className="stat-subvalue">{subValue}</span>}
      </div>
      {typeof progress === 'number' && (
        <div className="stat-progress-bg">
          <div className="stat-progress-fill" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      )}
    </div>
  )
}

/* ─── PanelHeader ─── */
export type PanelHeaderProps = {
  kicker?: string
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}

export function PanelHeader({
  kicker,
  title,
  description,
  actions,
  className = '',
}: PanelHeaderProps) {
  return (
    <div className={`panel-header-block ${className}`}>
      <div className="panel-header-content">
        {kicker && <span className="panel-kicker">{kicker}</span>}
        <h3 className="panel-header-title">{title}</h3>
        {description && <p className="panel-header-description">{description}</p>}
      </div>
      {actions && <div className="panel-header-actions">{actions}</div>}
    </div>
  )
}

/* ─── SplitLayout (for hero / 2-col panels) ─── */
export type SplitLayoutProps = {
  left: ReactNode
  right: ReactNode
  className?: string
}

export function SplitLayout({ left, right, className = '' }: SplitLayoutProps) {
  return (
    <div className={`split-layout ${className}`}>
      <div className="split-left">{left}</div>
      <div className="split-right">{right}</div>
    </div>
  )
}
