import express from 'express'

import {
  deleteDebt,
  deleteGoal,
  deleteRealEstate,
  deleteTaxEvent,
  deleteTransactionOverride,
  deleteVehicle,
  getAllDebts,
  getAllGoals,
  getAllRealEstate,
  getAllTaxEvents,
  getAllTransactionOverrides,
  getAllVehicles,
  insertDebt,
  insertGoal,
  insertRealEstate,
  insertTaxEvent,
  insertVehicle,
  updateDebt,
  updateGoal,
  updateRealEstate,
  updateVehicle,
  upsertTransactionOverride,
  readStoreFromDB,
} from '../db'
import { validateBody, validateParams, validateQuery } from '../http'
import {
  debtBodySchema,
  fireQuerySchema,
  forecastQuerySchema,
  goalBodySchema,
  idParamsSchema,
  realEstateBodySchema,
  realEstateSimulationQuerySchema,
  taxEventBodySchema,
  transactionOverrideBodySchema,
  vehicleBodySchema,
  yearQuerySchema,
} from '../validation/schemas'

const router = express.Router()

router.get('/debts', (_req, res) => {
  const manualDebts = getAllDebts()
  const state = readStoreFromDB()
  const appAccounts = state?.accounts || []
  
  const apiDebts = appAccounts
    .filter((a: any) => a.kind === 'debt' && a.id.startsWith('bourso-'))
    .map((a: any) => ({
      id: a.id,
      name: a.name,
      type: 'consumer',
      originalAmount: a.manualBalance ? Math.abs(a.manualBalance) : 0,
      balance: a.manualBalance ? Math.abs(a.manualBalance) : 0,
      interestRate: 0,
      monthlyPayment: 0,
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10),
      isApi: true
    }))

  res.json([...manualDebts, ...apiDebts])
})

router.post('/debts', validateBody(debtBodySchema), (req, res) => {
  const debt = { ...req.body, id: `debt-${Date.now()}` }
  insertDebt(debt)
  res.json(debt)
})

router.put('/debts/:id', validateParams(idParamsSchema), validateBody(debtBodySchema), (req, res) => {
  if (String(req.params.id).startsWith('bourso-')) {
    return res.status(400).json({ error: 'Cannot edit API imported debt' })
  }
  const debt = { ...req.body, id: req.params.id }
  updateDebt(debt)
  res.json(debt)
})

router.delete('/debts/:id', validateParams(idParamsSchema), (req, res) => {
  if (String(req.params.id).startsWith('bourso-')) {
    return res.status(400).json({ error: 'Cannot delete API imported debt' })
  }
  deleteDebt(req.params.id as string)
  res.json({ ok: true })
})

router.get('/goals', (_req, res) => {
  res.json(getAllGoals())
})

router.post('/goals', validateBody(goalBodySchema), (req, res) => {
  const goal = { ...req.body, id: `goal-${Date.now()}` }
  insertGoal(goal)
  res.json(goal)
})

router.put('/goals/:id', validateParams(idParamsSchema), validateBody(goalBodySchema), (req, res) => {
  const goal = { ...req.body, id: req.params.id }
  updateGoal(goal)
  res.json(goal)
})

router.delete('/goals/:id', validateParams(idParamsSchema), (req, res) => {
  deleteGoal(req.params.id as string)
  res.json({ ok: true })
})

router.get('/real-estate', (_req, res) => {
  res.json(getAllRealEstate())
})

router.post('/real-estate', validateBody(realEstateBodySchema), (req, res) => {
  const property = { ...req.body, id: `re-${Date.now()}` }
  insertRealEstate(property)
  res.json(property)
})

router.put('/real-estate/:id', validateParams(idParamsSchema), validateBody(realEstateBodySchema), (req, res) => {
  const property = { ...req.body, id: req.params.id }
  updateRealEstate(property)
  res.json(property)
})

router.delete('/real-estate/:id', validateParams(idParamsSchema), (req, res) => {
  deleteRealEstate(req.params.id as string)
  res.json({ ok: true })
})

router.get('/vehicles', (_req, res) => {
  res.json(getAllVehicles())
})

router.post('/vehicles', validateBody(vehicleBodySchema), (req, res) => {
  const vehicle = { ...req.body, id: `veh-${Date.now()}` }
  insertVehicle(vehicle)
  res.json(vehicle)
})

router.put('/vehicles/:id', validateParams(idParamsSchema), validateBody(vehicleBodySchema), (req, res) => {
  const vehicle = { ...req.body, id: req.params.id }
  updateVehicle(vehicle)
  res.json(vehicle)
})

router.delete('/vehicles/:id', validateParams(idParamsSchema), (req, res) => {
  deleteVehicle(req.params.id as string)
  res.json({ ok: true })
})

router.get('/transaction-overrides', (_req, res) => {
  res.json(getAllTransactionOverrides())
})

router.post('/transactions/:id/override', validateParams(idParamsSchema), validateBody(transactionOverrideBodySchema), (req, res) => {
  const override = { transactionId: req.params.id, ...req.body }
  upsertTransactionOverride(override)
  res.json(override)
})

router.delete('/transactions/:id/override', validateParams(idParamsSchema), (req, res) => {
  deleteTransactionOverride(req.params.id as string)
  res.json({ ok: true })
})

router.get('/tax-events', validateQuery(yearQuerySchema), (req, res) => {
  const query = res.locals.validatedQuery as { year?: number }
  const year = query.year
  res.json(getAllTaxEvents(year))
})

router.post('/tax-events', validateBody(taxEventBodySchema), (req, res) => {
  const event = { ...req.body, id: `tax-${Date.now()}` }
  insertTaxEvent(event)
  res.json(event)
})

router.delete('/tax-events/:id', validateParams(idParamsSchema), (req, res) => {
  deleteTaxEvent(req.params.id as string)
  res.json({ ok: true })
})

router.get('/tax/estimate', validateQuery(yearQuerySchema), (req, res) => {
  const query = res.locals.validatedQuery as { year?: number }
  const year = query.year ?? new Date().getFullYear()
  const taxEvents = getAllTaxEvents(year)
  const realEstate = getAllRealEstate()
  const debts = getAllDebts()

  const dividends = taxEvents.filter((event) => event.type === 'dividend').reduce((sum, event) => sum + event.grossAmount, 0)
  const capitalGains = taxEvents.filter((event) => event.type === 'capital-gain').reduce((sum, event) => sum + event.grossAmount, 0)
  const pfuBase = dividends + capitalGains
  const pfuTotal = pfuBase * 0.3

  const rentalProperties = realEstate.filter((property) => property.isRental)
  const rentalGross = rentalProperties.reduce((sum, property) => sum + (property.monthlyRent ?? 0) * 12, 0)
  const totalCharges = rentalProperties.reduce((sum, property) => sum + (property.monthlyCharges ?? 0) * 12, 0)
  const microFoncierBase = rentalGross * 0.7
  const realBase = Math.max(0, rentalGross - totalCharges)
  const bestRegime: 'micro-foncier' | 'real' | 'none' = rentalGross === 0 ? 'none' : (realBase < microFoncierBase ? 'real' : 'micro-foncier')
  const taxBase = bestRegime === 'real' ? realBase : microFoncierBase
  const rentalTaxEstimate = taxBase * 0.3
  const realEstateNetValue = realEstate.reduce((sum, property) => sum + property.currentValue, 0)
    - debts.filter((debt) => debt.type === 'mortgage').reduce((sum, debt) => sum + debt.balance, 0)

  res.json({
    year,
    pfuDividendsGross: dividends,
    pfuCapitalGainsGross: capitalGains,
    pfuTotal,
    rentalGross,
    rentalRegime: bestRegime,
    rentalAbattement: bestRegime === 'micro-foncier' ? rentalGross * 0.3 : totalCharges,
    rentalTaxBase: taxBase,
    rentalTaxEstimate,
    totalEstimated: pfuTotal + rentalTaxEstimate,
    isNearIFIThreshold: realEstateNetValue >= 1_200_000,
    realEstateNetValue,
  })
})

router.get('/fire', validateQuery(fireQuerySchema), (req, res) => {
  const query = res.locals.validatedQuery as {
    annualExpenses: number
    monthlyContribution: number
    expectedReturnRate: number
    safeWithdrawalRate: number
    currentPortfolio: number
  }

  const annualExpenses = query.annualExpenses
  const monthlyContribution = query.monthlyContribution
  const expectedReturnRate = query.expectedReturnRate / 100
  const safeWithdrawalRate = query.safeWithdrawalRate / 100
  const currentPortfolio = query.currentPortfolio

  const fireNumber = annualExpenses / safeWithdrawalRate
  const monthlyRate = expectedReturnRate / 12

  let months = 0
  let portfolio = currentPortfolio
  if (monthlyContribution > 0 || currentPortfolio < fireNumber) {
    while (portfolio < fireNumber && months < 1200) {
      portfolio = portfolio * (1 + monthlyRate) + monthlyContribution
      months += 1
    }
  }

  const fireDate = new Date()
  fireDate.setMonth(fireDate.getMonth() + months)

  res.json({
    fireNumber,
    annualExpenses,
    portfolioValue: currentPortfolio,
    monthlyContribution,
    expectedReturnRate: expectedReturnRate * 100,
    safeWithdrawalRate: safeWithdrawalRate * 100,
    currentProgress: Math.min(100, (currentPortfolio / fireNumber) * 100),
    yearsToFire: months / 12,
    fireDate: fireDate.toISOString().slice(0, 10),
    monthsToFire: months,
  })
})

router.get('/forecast', validateQuery(forecastQuerySchema), (req, res) => {
  const query = res.locals.validatedQuery as {
    years: number
    monthlyContribution: number
    currentPortfolio: number
  }

  const years = query.years
  const monthlyContribution = query.monthlyContribution
  const currentPortfolio = query.currentPortfolio

  const rates = { conservative: 0.04, base: 0.07, optimistic: 0.1 }
  const yearLabels: string[] = []
  const conservative: number[] = []
  const base: number[] = []
  const optimistic: number[] = []
  const currentYear = new Date().getFullYear()

  for (let yearIndex = 0; yearIndex <= years; yearIndex += 1) {
    yearLabels.push(String(currentYear + yearIndex))
    const months = yearIndex * 12
    for (const [key, rate] of Object.entries(rates)) {
      const monthlyRate = rate / 12
      const futureValue = currentPortfolio * Math.pow(1 + monthlyRate, months)
        + monthlyContribution * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate)

      if (key === 'conservative') conservative.push(Math.round(futureValue))
      else if (key === 'base') base.push(Math.round(futureValue))
      else optimistic.push(Math.round(futureValue))
    }
  }

  res.json({ years: yearLabels, conservative, base, optimistic })
})

router.get('/simulate/real-estate', validateQuery(realEstateSimulationQuerySchema), (req, res) => {
  const query = res.locals.validatedQuery as {
    price: number
    apportPct: number
    apport?: number
    rate: number
    years: number
    income: number
    currentRent: number
  }

  const propertyPrice = query.price
  const apportPct = query.apportPct / 100
  const apport = query.apport ?? propertyPrice * apportPct
  const loanRate = query.rate / 100
  const durationYears = query.years
  const monthlyIncome = query.income
  const currentRent = query.currentRent

  const loanAmount = propertyPrice - apport
  const months = durationYears * 12
  const monthlyRate = loanRate / 12
  const monthlyPayment = monthlyRate === 0
    ? loanAmount / months
    : (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1)
  const totalCostOfCredit = monthlyPayment * months - loanAmount
  const totalCost = loanAmount + totalCostOfCredit + apport
  const affordabilityRatio = monthlyIncome > 0 ? (monthlyPayment / monthlyIncome) * 100 : 999

  let breakEvenMonths: number | undefined
  if (currentRent > 0 && monthlyPayment > currentRent) {
    const monthlySavings = currentRent
    breakEvenMonths = monthlySavings > 0 ? Math.ceil(apport / monthlySavings) : undefined
  }

  res.json({
    propertyPrice,
    apport,
    loanAmount,
    loanRate: loanRate * 100,
    loanDurationYears: durationYears,
    monthlyPayment: Math.round(monthlyPayment),
    totalCostOfCredit: Math.round(totalCostOfCredit),
    totalCost: Math.round(totalCost),
    currentRent,
    breakEvenMonths,
    affordabilityRatio: Math.round(affordabilityRatio * 10) / 10,
    isAffordable: affordabilityRatio <= 33,
  })
})

export const registerCrudRoutes = (app: express.Express) => {
  app.use('/api', router)
}