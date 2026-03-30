import Papa from 'papaparse'

import type {
  BudgetAnalysis,
  BudgetOverrides,
  CategoryRule,
  MonthlyAnalysis,
  QueryResponse,
  Transaction,
} from '../types'
import {
  formatCurrency,
  formatPercent,
  groupBy,
  monthKeyFromDate,
  monthLabelFromKey,
  normalizedKey,
  normalizeText,
  parseAmount,
  parseBalance,
  safePercentage,
} from './finance-format'
import {
  buildAnomalies,
  buildCategorySummary,
  buildInsights,
  buildMerchantSummary,
  buildRecurringExpenses,
  buildSummaryCards,
  categoryLabel,
  isTransferRow,
  isUncategorizedRow,
  merchantLabel,
} from './finance-analysis'

export { formatCompactNumber, formatCurrency, formatPercent } from './finance-format'

type CsvRow = {
  dateOp?: string
  dateVal?: string
  label?: string
  category?: string
  categoryParent?: string
  supplierFound?: string
  amount?: string
  comment?: string
  accountNum?: string
  accountLabel?: string
  accountbalance?: string
}

type AnalyzeOptions = {
  budgetOverrides?: BudgetOverrides
}

export const parseBudgetCsv = (csvText: string): Transaction[] => {
  const parsed = Papa.parse<CsvRow>(csvText, {
    delimiter: ';',
    header: true,
    skipEmptyLines: true,
  })

  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors[0]?.message ?? 'CSV invalide')
  }

  return parsed.data
    .map((row, index) => {
      const operationDate = normalizeText(row.dateOp)
      const monthKey = monthKeyFromDate(operationDate)
      const amount = parseAmount(row.amount)
      const transaction: Transaction = {
        id: `${operationDate}-${normalizeText(row.label)}-${amount}-${index}`,
        operationDate,
        valueDate: normalizeText(row.dateVal),
        monthKey,
        monthLabel: monthLabelFromKey(monthKey),
        label: normalizeText(row.label),
        category: normalizeText(row.category) || 'Non catégorisé',
        categoryParent: normalizeText(row.categoryParent) || 'Non catégorisé',
        supplier: normalizeText(row.supplierFound),
        amount,
        direction: amount >= 0 ? 'income' : 'expense',
        comment: normalizeText(row.comment),
        accountNumber: normalizeText(row.accountNum),
        accountLabel: normalizeText(row.accountLabel),
        balance: parseBalance(row.accountbalance),
        isTransfer: isTransferRow(row),
        isUncategorized: isUncategorizedRow(row),
      }

      return transaction
    })
    .filter((transaction) => transaction.operationDate && Number.isFinite(transaction.amount))
    .sort((left, right) => right.operationDate.localeCompare(left.operationDate))
}

export const applyCategoryRules = (
  transactions: Transaction[],
  rules: CategoryRule[],
): Transaction[] => {
  if (rules.length === 0) {
    return transactions
  }

  return transactions.map((transaction) => {
    const matchedRule = [...rules]
      .reverse()
      .find((rule) => {
        const source = rule.field === 'supplier' ? transaction.supplier : transaction.label
        return normalizedKey(source).includes(normalizedKey(rule.match))
      })

    if (!matchedRule) {
      return transaction
    }

    return {
      ...transaction,
      category: matchedRule.category,
      categoryParent: matchedRule.categoryParent,
      isUncategorized: false,
    }
  })
}

export const analyzeTransactions = (
  transactions: Transaction[],
  options: AnalyzeOptions = {},
): BudgetAnalysis => {
  const budgetOverrides = options.budgetOverrides ?? {}
  const byMonth = groupBy(transactions, (transaction) => transaction.monthKey)
  const months = [...byMonth.entries()]
    .map(([key, monthTransactions]) => ({
      key,
      label: monthTransactions[0]?.monthLabel ?? monthLabelFromKey(key),
      transactionCount: monthTransactions.length,
    }))
    .sort((left, right) => right.key.localeCompare(left.key))

  const recurringExpenses = buildRecurringExpenses(transactions)

  const monthly = months.reduce<Record<string, MonthlyAnalysis>>((accumulator, month, index) => {
    const monthTransactions = byMonth.get(month.key) ?? []
    const expenseTransactions = monthTransactions.filter(
      (transaction) => transaction.direction === 'expense' && !transaction.isTransfer,
    )
    const incomeTransactions = monthTransactions.filter(
      (transaction) => transaction.direction === 'income' && !transaction.isTransfer,
    )
    const uncategorizedTransactions = expenseTransactions.filter(
      (transaction) => transaction.isUncategorized,
    )
    const expenses = expenseTransactions.reduce(
      (sum, transaction) => sum + Math.abs(transaction.amount),
      0,
    )
    const income = incomeTransactions.reduce((sum, transaction) => sum + transaction.amount, 0)
    const transfers = monthTransactions
      .filter((transaction) => transaction.isTransfer)
      .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0)
    const uncategorizedAmount = uncategorizedTransactions.reduce(
      (sum, transaction) => sum + Math.abs(transaction.amount),
      0,
    )
    const categories = buildCategorySummary(expenseTransactions, expenses, budgetOverrides)
    const merchants = buildMerchantSummary(expenseTransactions)
    const anomalies = buildAnomalies(monthTransactions, transactions)
    const daysObserved = new Set(monthTransactions.map((transaction) => transaction.operationDate)).size
    const dailyRunRate = daysObserved > 0 ? expenses / daysObserved : 0
    const projectedMonthEnd = dailyRunRate * 30
    const totalBudgetTarget = categories.reduce(
      (sum, category) => sum + category.suggestedBudget,
      0,
    )
    const budgetGap = totalBudgetTarget - expenses
    const previousMonth = months[index + 1]
    const previousMonthExpenses = previousMonth
      ? (byMonth.get(previousMonth.key) ?? [])
          .filter((transaction) => transaction.direction === 'expense' && !transaction.isTransfer)
          .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0)
      : null

    accumulator[month.key] = {
      key: month.key,
      label: month.label,
      income,
      expenses,
      transfers,
      net: income - expenses,
      dailyRunRate,
      projectedMonthEnd,
      totalBudgetTarget,
      budgetGap,
      expenseDelta:
        previousMonthExpenses === null || previousMonthExpenses === 0
          ? null
          : safePercentage(expenses - previousMonthExpenses, previousMonthExpenses),
      uncategorizedCount: uncategorizedTransactions.length,
      uncategorizedAmount,
      summaryCards: buildSummaryCards(
        expenses,
        transfers,
        uncategorizedAmount,
        projectedMonthEnd,
      ),
      categories,
      merchants,
      anomalies,
      insights: buildInsights(
        monthTransactions,
        categories,
        merchants,
        transfers,
        projectedMonthEnd,
        uncategorizedTransactions.length,
        budgetGap,
        anomalies,
      ),
      allTransactions: monthTransactions,
      recentTransactions: monthTransactions.slice(0, 12),
      uncategorizedTransactions: uncategorizedTransactions.slice(0, 8),
    }

    return accumulator
  }, {})

  const accounts = [...groupBy(transactions, (transaction) => transaction.accountLabel).entries()].map(
    ([accountLabel, accountTransactions]) => ({
      accountLabel,
      balance: accountTransactions[0]?.balance ?? null,
    }),
  )

  return {
    months,
    monthly,
    transactions,
    recurringExpenses,
    accounts,
  }
}

export const searchTransactions = (transactions: Transaction[], query: string) => {
  const terms = normalizedKey(query)
    .split(/\s+/)
    .filter(Boolean)

  if (terms.length === 0) {
    return transactions.slice(0, 12)
  }

  return transactions.filter((transaction) => {
    const haystack = normalizedKey(
      [
        transaction.label,
        transaction.supplier,
        transaction.category,
        transaction.categoryParent,
        transaction.operationDate,
      ].join(' '),
    )

    return terms.every((term) => haystack.includes(term))
  })
}

export const answerBudgetQuestion = (
  query: string,
  analysis: BudgetAnalysis,
  monthKey: string,
): QueryResponse => {
  const activeMonth = analysis.monthly[monthKey]
  const normalizedQuery = normalizedKey(query)

  if (!activeMonth || normalizedQuery.length === 0) {
    return {
      title: 'Vue rapide',
      body: 'Pose une question sur une catégorie, un commerçant, les anomalies ou les dépenses non catégorisées.',
      matchingTransactions: [],
    }
  }

  if (normalizedQuery.includes('non categor')) {
    return {
      title: 'Lignes à recatégoriser',
      body: `${activeMonth.uncategorizedCount} opération(s) représentent ${formatCurrency(activeMonth.uncategorizedAmount)} sur ${activeMonth.label}.`,
      matchingTransactions: activeMonth.uncategorizedTransactions,
    }
  }

  if (normalizedQuery.includes('anomal')) {
    return {
      title: 'Dépenses atypiques',
      body:
        activeMonth.anomalies.length > 0
          ? `${activeMonth.anomalies.length} anomalie(s) ont été détectées sur ${activeMonth.label}.`
          : `Aucune anomalie marquée n'a été détectée sur ${activeMonth.label}.`,
      matchingTransactions: activeMonth.anomalies
        .map((anomaly) => activeMonth.allTransactions.find((transaction) => transaction.id === anomaly.id))
        .filter((transaction): transaction is Transaction => transaction !== undefined),
    }
  }

  if (normalizedQuery.includes('recurr') || normalizedQuery.includes('abonnement')) {
    const recurring = analysis.recurringExpenses.slice(0, 5)

    return {
      title: 'Dépenses récurrentes',
      body:
        recurring.length > 0
          ? `Les récurrences les plus visibles sont ${recurring.map((expense) => expense.name).join(', ')}.`
          : 'Aucune dépense récurrente nette n’a été détectée pour le moment.',
      matchingTransactions: activeMonth.allTransactions.filter((transaction) =>
        recurring.some((expense) => normalizedKey(expense.name) === normalizedKey(merchantLabel(transaction))),
      ),
    }
  }

  if (
    normalizedQuery.includes('plus grosse') ||
    normalizedQuery.includes('top depense') ||
    normalizedQuery.includes('plus gros')
  ) {
    const biggestExpense = [...activeMonth.allTransactions]
      .filter((transaction) => transaction.direction === 'expense' && !transaction.isTransfer)
      .sort((left, right) => Math.abs(right.amount) - Math.abs(left.amount))[0]

    return biggestExpense
      ? {
          title: 'Plus grosse dépense du mois',
          body: `${biggestExpense.label} est la dépense la plus élevée avec ${formatCurrency(Math.abs(biggestExpense.amount))}.`,
          matchingTransactions: [biggestExpense],
        }
      : {
          title: 'Plus grosse dépense du mois',
          body: 'Aucune dépense trouvée sur la période.',
          matchingTransactions: [],
        }
  }

  const matchingCategory = activeMonth.categories.find((category) =>
    normalizedQuery.includes(normalizedKey(category.name)),
  )

  if (matchingCategory) {
    const matchingTransactions = activeMonth.allTransactions.filter(
      (transaction) => categoryLabel(transaction) === matchingCategory.name,
    )

    return {
      title: `Focus ${matchingCategory.name}`,
      body: `${formatCurrency(matchingCategory.amount)} dépensés sur ${matchingCategory.transactionCount} opération(s), soit ${formatPercent(matchingCategory.share)} du mois.`,
      matchingTransactions,
    }
  }

  const matchingMerchant = activeMonth.merchants.find((merchant) =>
    normalizedQuery.includes(normalizedKey(merchant.name)),
  )

  if (matchingMerchant) {
    const matchingTransactions = activeMonth.allTransactions.filter(
      (transaction) => normalizedKey(merchantLabel(transaction)) === normalizedKey(matchingMerchant.name),
    )

    return {
      title: `Focus ${matchingMerchant.name}`,
      body: `${formatCurrency(matchingMerchant.amount)} sur ${matchingMerchant.transactionCount} transaction(s) ce mois-ci.`,
      matchingTransactions,
    }
  }

  const matchingTransactions = searchTransactions(activeMonth.allTransactions, query).slice(0, 8)

  if (matchingTransactions.length > 0) {
    const total = matchingTransactions.reduce(
      (sum, transaction) => sum + Math.abs(transaction.amount),
      0,
    )

    return {
      title: 'Résultat de recherche',
      body: `${matchingTransactions.length} transaction(s) correspondent à la recherche, pour ${formatCurrency(total)} au total.`,
      matchingTransactions,
    }
  }

  return {
    title: `Résumé ${activeMonth.label}`,
    body: `${formatCurrency(activeMonth.expenses)} dépensés, ${formatCurrency(activeMonth.totalBudgetTarget)} de budget cible et ${activeMonth.anomalies.length} anomalie(s) détectée(s).`,
    matchingTransactions: activeMonth.recentTransactions,
  }
}