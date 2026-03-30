import type {
  Anomaly,
  BudgetOverrides,
  CategorySummary,
  Insight,
  MerchantSummary,
  RecurringExpense,
  SummaryCard,
  Transaction,
} from '../types'
import {
  average,
  daysBetween,
  formatCurrency,
  groupBy,
  normalizedKey,
  normalizeText,
  safePercentage,
  toSuggestedBudget,
} from './finance-format'

type CsvRow = {
  category?: string
  categoryParent?: string
  label?: string
}

export const categoryLabel = (transaction: Transaction) => {
  if (!transaction.categoryParent || transaction.categoryParent === 'Non catégorisé') {
    return transaction.category || 'Non catégorisé'
  }

  return transaction.categoryParent
}

export const merchantLabel = (transaction: Transaction) => transaction.supplier || transaction.label

export const isTransferRow = (row: CsvRow) => {
  const category = normalizeText(row.category).toLowerCase()
  const parent = normalizeText(row.categoryParent).toLowerCase()
  const label = normalizeText(row.label).toLowerCase()

  return (
    category.includes('virement') ||
    parent.includes('virement') ||
    parent.includes('mouvements internes') ||
    label.startsWith('vir ')
  )
}

export const isUncategorizedRow = (row: CsvRow) => {
  const category = normalizeText(row.category).toLowerCase()
  const parent = normalizeText(row.categoryParent).toLowerCase()

  return category.includes('non catégorisé') || parent.includes('non catégorisé')
}

export const buildCategorySummary = (
  transactions: Transaction[],
  totalExpenses: number,
  budgetOverrides: BudgetOverrides,
) => {
  const byCategory = groupBy(transactions, (transaction) => categoryLabel(transaction))

  return [...byCategory.entries()]
    .map(([name, categoryTransactions]) => {
      const amount = categoryTransactions.reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0)
      const parent = categoryTransactions[0]?.categoryParent ?? 'Non catégorisé'
      const suggestedBudget = budgetOverrides[name] ?? toSuggestedBudget(amount)
      const ratio = safePercentage(amount, suggestedBudget)
      const status: CategorySummary['status'] = ratio > 1 ? 'over' : ratio > 0.85 ? 'close' : 'under'

      return {
        name,
        parent,
        amount,
        share: safePercentage(amount, totalExpenses),
        transactionCount: categoryTransactions.length,
        suggestedBudget,
        status,
      }
    })
    .sort((left, right) => right.amount - left.amount)
}

export const buildMerchantSummary = (transactions: Transaction[]) => {
  const byMerchant = groupBy(transactions, (transaction) => merchantLabel(transaction))

  return [...byMerchant.entries()]
    .map(([name, merchantTransactions]) => {
      const amount = merchantTransactions.reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0)

      return {
        name,
        amount,
        transactionCount: merchantTransactions.length,
        category: categoryLabel(merchantTransactions[0]),
      }
    })
    .sort((left, right) => right.amount - left.amount)
}

export const buildRecurringExpenses = (transactions: Transaction[]): RecurringExpense[] => {
  const expenseTransactions = transactions.filter((transaction) => transaction.direction === 'expense' && !transaction.isTransfer)
  const byMerchant = groupBy(expenseTransactions, (transaction) => normalizedKey(merchantLabel(transaction)))

  return [...byMerchant.entries()]
    .map(([, merchantTransactions]) => {
      if (merchantTransactions.length < 2) return null

      const sortedByDate = [...merchantTransactions].sort((left, right) => left.operationDate.localeCompare(right.operationDate))
      const intervals = sortedByDate.slice(1).map((transaction, index) => daysBetween(sortedByDate[index].operationDate, transaction.operationDate))
      const averageInterval = average(intervals)
      const cadence: RecurringExpense['cadence'] = averageInterval <= 10 ? 'weekly' : averageInterval <= 40 ? 'monthly' : 'irregular'

      return {
        name: merchantLabel(sortedByDate[0]),
        amount: average(sortedByDate.map((transaction) => Math.abs(transaction.amount))),
        occurrences: sortedByDate.length,
        category: categoryLabel(sortedByDate[0]),
        lastDate: sortedByDate[sortedByDate.length - 1]?.operationDate ?? '',
        cadence,
      }
    })
    .filter((expense): expense is RecurringExpense => expense !== null)
    .sort((left, right) => right.occurrences - left.occurrences || right.amount - left.amount)
    .slice(0, 8)
}

export const buildAnomalies = (monthTransactions: Transaction[], allTransactions: Transaction[]): Anomaly[] => {
  const historicalByMerchant = groupBy(
    allTransactions.filter((transaction) => transaction.direction === 'expense' && !transaction.isTransfer),
    (transaction) => normalizedKey(merchantLabel(transaction)),
  )

  return monthTransactions
    .filter((transaction) => transaction.direction === 'expense' && !transaction.isTransfer)
    .map((transaction) => {
      const peers = historicalByMerchant.get(normalizedKey(merchantLabel(transaction))) ?? []
      const peerAmounts = peers.map((peer) => Math.abs(peer.amount))
      const expectedAmount = average(peerAmounts)
      const currentAmount = Math.abs(transaction.amount)

      if (peers.length >= 3 && currentAmount > expectedAmount * 1.7 && currentAmount - expectedAmount > 10) {
        return {
          id: transaction.id,
          label: transaction.label,
          amount: currentAmount,
          expectedAmount,
          merchant: merchantLabel(transaction),
          date: transaction.operationDate,
          reason: 'Montant significativement supérieur à l’historique du commerçant.',
          severity: currentAmount > expectedAmount * 2.2 ? 'high' : 'medium',
        }
      }

      if (transaction.isUncategorized && currentAmount >= 10) {
        return {
          id: transaction.id,
          label: transaction.label,
          amount: currentAmount,
          expectedAmount: currentAmount,
          merchant: merchantLabel(transaction),
          date: transaction.operationDate,
          reason: 'Dépense non catégorisée suffisamment élevée pour mériter une revue.',
          severity: 'medium',
        }
      }

      return null
    })
    .filter((anomaly): anomaly is Anomaly => anomaly !== null)
    .slice(0, 6)
}

export const buildSummaryCards = (
  expenses: number,
  transfers: number,
  uncategorizedAmount: number,
  projectedMonthEnd: number,
): SummaryCard[] => [
  { label: 'Dépenses suivies', value: expenses, accent: 'coral' },
  { label: 'Virements isolés', value: transfers, accent: 'sand' },
  { label: 'Non catégorisé', value: uncategorizedAmount, accent: 'slate' },
  { label: 'Projection fin de mois', value: projectedMonthEnd, accent: 'teal' },
]

export const buildInsights = (
  monthTransactions: Transaction[],
  categories: CategorySummary[],
  merchants: MerchantSummary[],
  transfers: number,
  projectedMonthEnd: number,
  uncategorizedCount: number,
  budgetGap: number,
  anomalies: Anomaly[],
): Insight[] => {
  const insights: Insight[] = []
  const topCategory = categories[0]
  const recurringCoffee = merchants.find((merchant) => normalizedKey(merchant.name).includes('atlanticcafe'))

  if (topCategory && topCategory.share > 0.35) {
    insights.push({
      title: `Le poste ${topCategory.name} concentre ${Math.round(topCategory.share * 100)} % des dépenses`,
      body: `C'est le premier levier à surveiller ce mois-ci, avec ${formatCurrency(topCategory.amount)} déjà engagés.`,
      tone: 'warning',
    })
  }

  if (budgetGap < 0) {
    insights.push({
      title: 'Le budget personnalisé est déjà dépassé',
      body: `Les catégories suivies dépassent l'objectif de ${formatCurrency(Math.abs(budgetGap))} sur la période.`,
      tone: 'warning',
    })
  }

  if (uncategorizedCount > 0) {
    insights.push({
      title: `${uncategorizedCount} opération${uncategorizedCount > 1 ? 's restent' : ' reste'} à qualifier`,
      body: 'Une correction de ces libellés améliorera immédiatement les analyses et les alertes du coach budgétaire.',
      tone: 'info',
    })
  }

  if (recurringCoffee && recurringCoffee.transactionCount >= 4) {
    insights.push({
      title: 'Les micro-dépenses café deviennent visibles',
      body: `${recurringCoffee.transactionCount} passages chez Atlanticcafe représentent déjà ${formatCurrency(recurringCoffee.amount)} sur la période sélectionnée.`,
      tone: 'info',
    })
  }

  if (anomalies.length > 0) {
    insights.push({
      title: `${anomalies.length} anomalie${anomalies.length > 1 ? 's détectées' : ' détectée'} ce mois-ci`,
      body: 'Le moteur compare chaque dépense au comportement habituel du commerçant pour faire ressortir les écarts nets.',
      tone: 'warning',
    })
  }

  if (transfers > 0) {
    insights.push({
      title: 'Les virements sont isolés du budget de vie',
      body: `${formatCurrency(transfers)} ont été exclus des dépenses de consommation pour éviter de biaiser les enveloppes mensuelles.`,
      tone: 'positive',
    })
  }

  if (projectedMonthEnd > 0 && monthTransactions.length > 5) {
    insights.push({
      title: 'La trajectoire de fin de mois est déjà estimable',
      body: `Au rythme actuel, les dépenses suivies termineraient autour de ${formatCurrency(projectedMonthEnd)}.`,
      tone: 'info',
    })
  }

  return insights.slice(0, 5)
}