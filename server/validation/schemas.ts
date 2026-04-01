import { z } from 'zod'

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const optionalString = z.string().trim().optional().or(z.literal('').transform(() => undefined))

export const idParamsSchema = z.object({ id: z.string().min(1) })
export const accountImportParamsSchema = z.object({ accountId: z.string().min(1), importId: z.string().min(1) })
export const yearQuerySchema = z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() })

export const debtBodySchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(['mortgage', 'consumer', 'auto', 'student', 'other']),
  originalAmount: z.coerce.number().finite().nonnegative(),
  balance: z.coerce.number().finite().nonnegative(),
  interestRate: z.coerce.number().finite().min(0).max(100),
  monthlyPayment: z.coerce.number().finite().nonnegative(),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  linkedAssetId: optionalString,
  insuranceRate: z.coerce.number().finite().min(0).max(100).optional(),
  deferredMonths: z.coerce.number().int().nonnegative().optional(),
  deferredType: z.enum(['none', 'partial', 'total']).optional(),
})

export const goalBodySchema = z.object({
  name: z.string().trim().min(1),
  icon: z.string().trim().min(1),
  color: z.string().trim().min(1),
  targetAmount: z.coerce.number().finite().nonnegative(),
  targetDate: isoDateSchema,
  currentAmount: z.coerce.number().finite().nonnegative().default(0),
  monthlyContribution: z.coerce.number().finite().nonnegative().default(0),
  linkedAccountId: optionalString,
  isCompleted: z.boolean().optional().default(false),
})

export const realEstateBodySchema = z.object({
  name: z.string().trim().min(1),
  address: optionalString,
  purchasePrice: z.coerce.number().finite().nonnegative(),
  currentValue: z.coerce.number().finite().nonnegative(),
  purchaseDate: isoDateSchema,
  isRental: z.boolean(),
  monthlyRent: z.coerce.number().finite().nonnegative().optional(),
  monthlyCharges: z.coerce.number().finite().nonnegative().optional(),
  taxRegime: z.enum(['micro-foncier', 'real']).optional(),
  linkedDebtId: optionalString,
})

export const vehicleBodySchema = z.object({
  name: z.string().trim().min(1),
  purchasePrice: z.coerce.number().finite().nonnegative(),
  purchaseDate: isoDateSchema,
  currentValue: z.coerce.number().finite().nonnegative(),
})

export const transactionOverrideBodySchema = z.object({
  category: z.string().trim().min(1),
  categoryParent: z.string().trim().min(1),
  supplier: z.string().trim().default(''),
  note: z.string().trim().default(''),
})

export const taxEventBodySchema = z.object({
  date: isoDateSchema,
  type: z.enum(['dividend', 'capital-gain', 'other']),
  grossAmount: z.coerce.number().finite().nonnegative(),
  accountId: optionalString,
  description: optionalString,
})

export const fireQuerySchema = z.object({
  annualExpenses: z.coerce.number().finite().nonnegative().default(30000),
  monthlyContribution: z.coerce.number().finite().nonnegative().default(1000),
  expectedReturnRate: z.coerce.number().finite().min(0).max(100).default(7),
  safeWithdrawalRate: z.coerce.number().finite().min(0.1).max(100).default(4),
  currentPortfolio: z.coerce.number().finite().nonnegative().default(0),
})

export const forecastQuerySchema = z.object({
  years: z.coerce.number().int().min(1).max(100).default(20),
  monthlyContribution: z.coerce.number().finite().nonnegative().default(1000),
  currentPortfolio: z.coerce.number().finite().nonnegative().default(0),
})

export const realEstateSimulationQuerySchema = z.object({
  price: z.coerce.number().finite().positive().default(300000),
  apportPct: z.coerce.number().finite().min(0).max(100).default(10),
  apport: z.coerce.number().finite().nonnegative().optional(),
  rate: z.coerce.number().finite().min(0).max(100).default(3.5),
  years: z.coerce.number().int().min(1).max(40).default(20),
  income: z.coerce.number().finite().nonnegative().default(3000),
  currentRent: z.coerce.number().finite().nonnegative().default(0),
})