const monthFormatter = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  year: 'numeric',
})

const currencyFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
})

const compactNumberFormatter = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 1,
})

export const normalizeText = (value: string | undefined) => (value ?? '').trim()

export const normalizedKey = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

export const parseAmount = (rawValue: string | undefined) => {
  const sanitized = normalizeText(rawValue).replace(/\s/g, '').replace(',', '.')
  if (!sanitized) return 0
  return Number(sanitized)
}

export const parseBalance = (rawValue: string | undefined) => {
  const value = parseAmount(rawValue)
  return Number.isFinite(value) ? value : null
}

export const monthKeyFromDate = (isoDate: string) => isoDate.slice(0, 7)

export const monthLabelFromKey = (monthKey: string) => {
  const [year, month] = monthKey.split('-').map(Number)
  const date = new Date(year, month - 1, 1)
  return monthFormatter.format(date)
}

export const safePercentage = (value: number, total: number) => {
  if (!total) return 0
  return value / total
}

export const groupBy = <TItem,>(items: TItem[], keySelector: (item: TItem) => string) => {
  const groups = new Map<string, TItem[]>()

  items.forEach((item) => {
    const key = keySelector(item)
    const existing = groups.get(key)

    if (existing) {
      existing.push(item)
      return
    }

    groups.set(key, [item])
  })

  return groups
}

export const toSuggestedBudget = (amount: number) => {
  if (amount <= 0) return 0
  return Math.ceil(amount * 1.12)
}

export const average = (values: number[]) => {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export const daysBetween = (left: string, right: string) => {
  const leftDate = new Date(left)
  const rightDate = new Date(right)
  const milliseconds = Math.abs(rightDate.getTime() - leftDate.getTime())
  return milliseconds / (1000 * 60 * 60 * 24)
}

export const formatCurrency = (value: number) => currencyFormatter.format(value)
export const formatPercent = (value: number) => `${Math.round(value * 100)} %`
export const formatCompactNumber = (value: number) => compactNumberFormatter.format(value)