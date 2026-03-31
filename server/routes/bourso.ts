import express from 'express'
import {
  getBoursoAccounts,
  placeBoursoOrder,
  performBoursoTransfer,
  getBoursoQuote,
  validateBoursoCredentials,
  getBoursoAccountPositions,
} from '../services/bourso'
import { readStoreFromDB, writeStoreToDB } from '../db'
import { logger } from '../logger'
import type { ProductType } from '../../src/types'
import type {
  BoursoAccount,
  BoursoAction,
  TradeOrder,
  Transfer,
} from '../../src/types-bourso'

const router = express.Router()

type PositionSummary = {
  symbol: string
  label: string
  quantity: { value: number; decimals: number }
  buyingPrice: { value: number; decimals: number }
  amount: { value: number; decimals: number }
  last: { value: number; decimals: number }
  var: { value: number; decimals: number }
  gainLoss: { value: number; decimals: number }
  gainLossPercent: { value: number; decimals: number }
  lastMovementDate: string
}

// In-memory store for bourso actions (in production, use database)
const boursoActions: BoursoAction[] = []
const lastSyncedBoursoAccounts: BoursoAccount[] = []

type PersistedBoursoPosition = {
  symbol?: string
  name: string
  isin?: string
  quantity: number
  buyingPrice: number
  lastPrice: number
  currentValue: number
  amountVariation?: number
  variation?: number
}

type PersistedAccount = {
  id: string
  name: string
  productType: ProductType
  institution?: string
  manualBalance?: number
  notes?: string
  isEligibleEmergencyFund: boolean
  csvImports: unknown[]
  boursoPositions?: PersistedBoursoPosition[]
  kind: 'asset' | 'debt'
}

type PersistedState = {
  accounts: PersistedAccount[]
  imports?: unknown[]
  investmentImports?: unknown[]
  [key: string]: unknown
}

const mapBoursoKindToProductType = (kind: BoursoAccount['kind'], accountName: string): ProductType => {
  if (kind === 'Banking') return 'checking'
  if (kind === 'Loans') return 'credit'
  if (kind === 'LifeInsurance') return 'assurance-vie'
  if (kind === 'Trading') {
    const normalized = accountName.toLowerCase()
    if (normalized.includes('assurance')) return 'assurance-vie'
    if (normalized.includes('cto')) return 'cto'
    return 'pea'
  }
  return 'livret-other'
}

const toPersistedAccount = (account: BoursoAccount, positions?: PositionSummary[]): PersistedAccount => {
  const hasPositions = positions && positions.length > 0
  
  return {
    id: `bourso-${account.id}`,
    name: account.name,
    productType: mapBoursoKindToProductType(account.kind, account.name),
    institution: account.bankName || 'Boursorama',
    manualBalance: account.balance,
    notes: 'Synchronisé via API Bourso',
    isEligibleEmergencyFund: account.kind === 'Savings',
    csvImports: [],
    boursoPositions: hasPositions
      ? positions.map((pos: any) => {
          // Calculate the expected price based on amount / quantity
          const quantity = pos.quantity.value / Math.pow(10, pos.quantity.decimals)
          const currentValue = pos.amount.value / Math.pow(10, pos.amount.decimals)
          const lastPrice = pos.last.value / Math.pow(10, pos.last.decimals)
          
          // Fix: If lastPrice seems too small (< 1) but amount/quantity is > 1, scale by 100
          let adjustedLastPrice = lastPrice
          if (quantity > 0 && lastPrice < 1) {
            const impliedPrice = currentValue / quantity
            // If the implied price is reasonable (> 0.1) but our calculated price is tiny (< 0.1 * implied), scale it
            if (impliedPrice > 1 && lastPrice < impliedPrice * 0.1) {
              adjustedLastPrice = lastPrice * 100
              logger.info(`Adjusted price for ${pos.label}: ${lastPrice}€ → ${adjustedLastPrice}€ (implied: ${impliedPrice}€)`)
            }
          }
          
          const buyingPrice = pos.buyingPrice.value / Math.pow(10, pos.buyingPrice.decimals)
          let adjustedBuyingPrice = buyingPrice
          if (quantity > 0 && buyingPrice < 1 && adjustedLastPrice > 1) {
            // If we scaled lastPrice, scale buyingPrice proportionally
            adjustedBuyingPrice = buyingPrice * 100
          }
          
          return {
            symbol: pos.symbol,
            name: pos.label,
            isin: pos.symbol, // Use symbol as isin for now
            quantity,
            buyingPrice: adjustedBuyingPrice,
            lastPrice: adjustedLastPrice,
            currentValue,
            amountVariation: pos.gainLoss.value / Math.pow(10, pos.gainLoss.decimals),
            variation: pos.gainLossPercent.value / Math.pow(10, pos.gainLossPercent.decimals),
          }
        })
      : undefined,
    kind: account.kind === 'Loans' ? 'debt' : 'asset',
  }
}

/**
 * GET /bourso/accounts
 * Get all accounts from Boursorama
 */
router.post('/accounts/sync', async (req, res) => {
  try {
    const { password } = req.body
    
    if (!password) {
      return res.status(400).json({ error: 'Password required' })
    }

    const accounts = await getBoursoAccounts(password)
    lastSyncedBoursoAccounts.length = 0
    lastSyncedBoursoAccounts.push(...accounts)
    
    // Create a sync action
    const action: BoursoAction = {
      id: `action-${Date.now()}`,
      type: 'sync-accounts',
      status: 'completed',
      source: 'bourso',
      data: { accountCount: accounts.length },
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    }
    
    boursoActions.push(action)
    
    res.json({ accounts, action })
  } catch (error) {
    logger.error('Failed to sync accounts:', error)
    res.status(500).json({ error: 'Failed to sync accounts from Boursorama' })
  }
})

/**
 * POST /bourso/accounts/sync-replace
 * Sync accounts and replace local account list (CSV-free mode)
 */
router.post('/accounts/sync-replace', async (req, res) => {
  try {
    const { password } = req.body

    if (!password) {
      return res.status(400).json({ error: 'Password required' })
    }

    const accounts = await getBoursoAccounts(password)
    lastSyncedBoursoAccounts.length = 0
    lastSyncedBoursoAccounts.push(...accounts)

    // Fetch positions for trading and life insurance accounts
    const positionsByAccountId = new Map<string, PositionSummary[]>()
    for (const account of accounts) {
      if (account.kind === 'Trading' || account.kind === 'LifeInsurance') {
        try {
          const positions = await getBoursoAccountPositions(account.id, password)
          logger.info(`Fetched ${positions.length} items from positions API for account ${account.name}`)
          // Extract positions from the trading summary response
          // The response is an array of TradingSummaryItem
          for (const item of positions) {
            if ('positions' in item && Array.isArray(item.positions)) {
              logger.info(`Found ${item.positions.length} positions for account ${account.id}`)
              if (item.positions.length > 0) {
                logger.info(`First position raw data: ${JSON.stringify(item.positions[0])}`)
              }
              positionsByAccountId.set(account.id, item.positions)
            }
          }
        } catch (error) {
          logger.warn(`Failed to fetch positions for account ${account.id}:`, error)
        }
      }
    }

    const state = (readStoreFromDB() ?? { accounts: [], imports: [], investmentImports: [] }) as PersistedState
    const replacedAccounts = accounts.map(account => toPersistedAccount(account, positionsByAccountId.get(account.id)))
    state.accounts = replacedAccounts
    state.imports = []
    state.investmentImports = []
    writeStoreToDB(state as any)

    const action: BoursoAction = {
      id: `action-${Date.now()}`,
      type: 'sync-accounts',
      status: 'completed',
      source: 'bourso',
      data: { accountCount: accounts.length, mode: 'sync-replace', positionsCount: Array.from(positionsByAccountId.values()).reduce((sum, pos) => sum + pos.length, 0) },
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    }

    boursoActions.push(action)

    res.json({
      accounts,
      replaced: replacedAccounts.length,
      action,
    })
  } catch (error) {
    logger.error('Failed to sync and replace accounts:', error)
    res.status(500).json({ error: 'Failed to sync and replace accounts from Boursorama' })
  }
})

/**
 * GET /bourso/accounts/last
 * Get last synced Boursorama accounts (memory cache)
 */
router.get('/accounts/last', (_req, res) => {
  res.json({ accounts: lastSyncedBoursoAccounts })
})

/**
 * POST /bourso/order
 * Place a trade order
 */
router.post('/order', async (req, res) => {
  try {
    const { order, password } = req.body as { order: TradeOrder; password: string }
    
    if (!order || !password) {
      return res.status(400).json({ error: 'Order and password required' })
    }

    // Create pending action
    const action: BoursoAction = {
      id: `action-${Date.now()}`,
      type: 'trade',
      status: 'pending',
      source: 'bourso',
      data: order,
      createdAt: new Date().toISOString(),
    }
    
    boursoActions.push(action)

    // Execute order
    const result = await placeBoursoOrder(order, password)
    
    // Update action
    action.status = 'completed'
    action.completedAt = new Date().toISOString()
    action.data = { ...order, result }

    res.json({ result, action })
  } catch (error) {
    logger.error('Failed to place order:', error)
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to place order' })
  }
})

/**
 * POST /bourso/transfer
 * Transfer funds between accounts
 */
router.post('/transfer', async (req, res) => {
  try {
    const { transfer, password } = req.body as { transfer: Transfer; password: string }
    
    if (!transfer || !password) {
      return res.status(400).json({ error: 'Transfer and password required' })
    }

    // Create pending action
    const action: BoursoAction = {
      id: `action-${Date.now()}`,
      type: 'transfer',
      status: 'pending',
      source: 'bourso',
      data: transfer,
      createdAt: new Date().toISOString(),
    }
    
    boursoActions.push(action)

    // Execute transfer
    const result = await performBoursoTransfer(transfer, password)
    
    // Update action
    action.status = 'completed'
    action.completedAt = new Date().toISOString()
    action.data = { ...transfer, result }

    res.json({ result, action })
  } catch (error) {
    logger.error('Failed to transfer:', error)
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to transfer funds' })
  }
})

/**
 * GET /bourso/quote/:symbol
 * Get quote for a symbol
 */
router.get('/quote/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params
    const { length = '30', interval = '1d' } = req.query
    
    const quote = await getBoursoQuote(
      symbol,
      parseInt(length as string),
      interval as string
    )
    
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' })
    }

    res.json(quote)
  } catch (error) {
    logger.error('Failed to get quote:', error)
    res.status(500).json({ error: 'Failed to get quote' })
  }
})

/**
 * GET /bourso/actions
 * Get all Bourso actions history
 */
router.get('/actions', (_req, res) => {
  res.json(boursoActions)
})

/**
 * GET /bourso/actions/:id
 * Get specific action
 */
router.get('/actions/:id', (req, res) => {
  const action = boursoActions.find(a => a.id === req.params.id)
  
  if (!action) {
    return res.status(404).json({ error: 'Action not found' })
  }

  res.json(action)
})

/**
 * POST /bourso/validate
 * Validate Bourso credentials
 */
router.post('/validate', async (req, res) => {
  try {
    const { customerId, password } = req.body
    
    if (!customerId || !password) {
      return res.status(400).json({ error: 'Customer ID and password required' })
    }

    const isValid = await validateBoursoCredentials(customerId, password)
    res.json({ isValid })
  } catch (error) {
    logger.error('Failed to validate credentials:', error)
    res.status(500).json({ error: 'Failed to validate credentials' })
  }
})

export { router as boursoRouter }
