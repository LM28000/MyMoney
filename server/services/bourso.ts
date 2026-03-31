import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import { homedir, tmpdir } from 'os'
import path from 'path'
import { logger } from '../logger'
import type {
  BoursoAccount,
  TradeOrder,
  TradeOrderResult,
  Transfer,
  TransferResult,
  Quote,
  OrderSide,
} from '../../src/types-bourso'

// Path to compiled bourso-cli binary
const BOURSO_CLI_PATH = process.env.BOURSO_CLI_PATH || '/Users/Louis-Marie PERRET DU CRAY/Documents/bourso api/bourso-api/target/release/bourso-cli'

type BoursoSettings = {
  clientId?: string
  password?: string
}

function normalizeAccountIdForCli(accountId: string): string {
  const normalized = accountId.replace(/-/g, '').trim()

  if (normalized.length !== 32) {
    throw new Error(`Invalid account id format: expected 32 chars after normalization, got ${normalized.length}`)
  }

  return normalized
}

function extractCliErrorMessage(error: unknown, fallback: string): string {
  const normalize = (message: string) => message.replace(/^Error:\s*/i, '').trim()

  if (error && typeof error === 'object') {
    const stdout = 'stdout' in error && typeof error.stdout === 'string' ? error.stdout : ''
    const stderr = 'stderr' in error && typeof error.stderr === 'string' ? error.stderr : ''
    const combined = `${stdout}\n${stderr}`

    const invalidTransfer = combined.match(/Error:\s*Invalid transfer\.[^\n]*/i)
    if (invalidTransfer && invalidTransfer[0]) {
      return normalize(invalidTransfer[0])
    }

    const accountNotFound = combined.match(/Error:\s*From account not found\.[^\n]*/i)
    if (accountNotFound && accountNotFound[0]) {
      return normalize(accountNotFound[0])
    }

    const genericErrorLine = combined.match(/Error:\s*([^\n]+)/i)
    if (genericErrorLine && genericErrorLine[1]) {
      return normalize(genericErrorLine[1])
    }
  }

  if (error instanceof Error && error.message) {
    return normalize(error.message)
  }

  return fallback
}

function normalizeBoursoBalance(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(value)) return 0

  // bourso-cli account balances are provided in centimes in current versions.
  // Keep decimal values untouched as a safety net if format changes.
  if (!Number.isInteger(value)) {
    return value
  }

  return value / 100
}

async function readConfiguredCustomerId(): Promise<string | null> {
  if (process.env.BOURSO_CUSTOMER_ID) {
    return process.env.BOURSO_CUSTOMER_ID.trim()
  }

  try {
    const settingsPath = path.join(homedir(), '.bourso', 'settings.json')
    const raw = await fs.readFile(settingsPath, 'utf-8')
    const settings = JSON.parse(raw) as BoursoSettings
    return settings.clientId?.trim() || null
  } catch {
    return null
  }
}

async function createTempCredentialsFile(password: string): Promise<string | null> {
  const customerId = await readConfiguredCustomerId()
  if (!customerId) {
    return null
  }

  const filePath = path.join(
    tmpdir(),
    `bourso-credentials-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  )

  const payload = JSON.stringify({ clientId: customerId, password })
  await fs.writeFile(filePath, payload, { mode: 0o600 })
  return filePath
}

/**
 * Execute bourso-cli command with optional password
 */
async function executeBoutsoCli(args: string[], password?: string): Promise<string> {
  let credentialsPath: string | null = null
  let cliArgs = [...args]

  if (password) {
    credentialsPath = await createTempCredentialsFile(password)
    if (credentialsPath) {
      cliArgs = ['--credentials', credentialsPath, ...args]
    }
  }

  logger.info(`Executing Bourso CLI: ${BOURSO_CLI_PATH} ${cliArgs.join(' ')}`)
  
  try {
    const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(BOURSO_CLI_PATH, cliArgs, {
        env: {
          ...process.env,
        },
        stdio: 'pipe',
      })

      let stdout = ''
      let stderr = ''

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
      })

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })

      child.on('error', (error) => {
        reject(error)
      })

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr })
          return
        }

        const error = new Error(`Command failed with code ${code}`) as Error & {
          code?: number | null
          stdout?: string
          stderr?: string
        }
        error.code = code
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
      })

      child.stdin.end()
    })

    if (stderr) {
      logger.warn('Bourso CLI stderr:', stderr)
    }

    return stdout
  } catch (error) {
    logger.error('Bourso CLI error:', error)
    throw error
  } finally {
    if (credentialsPath) {
      try {
        await fs.unlink(credentialsPath)
      } catch {
        logger.warn(`Failed to delete temporary Bourso credentials file: ${credentialsPath}`)
      }
    }
  }
}

/**
 * Get all accounts from Boursorama
 */
export async function getBoursoAccounts(password: string): Promise<BoursoAccount[]> {
  try {
    const output = await executeBoutsoCli(['accounts'], password)
    
    // Parse the output - bourso-cli outputs JSON or structured text
    // Extract accounts from output
    const accounts = parseAccountsOutput(output)
    logger.info(`Retrieved ${accounts.length} accounts from Boursorama`)
    
    return accounts
  } catch (error) {
    logger.error('Failed to get Bourso accounts:', error)
    throw new Error('Failed to retrieve accounts from Boursorama')
  }
}

/**
 * Get account details
 */
export async function getBoursoAccountDetails(accountId: string, password: string): Promise<BoursoAccount | null> {
  try {
    const accounts = await getBoursoAccounts(password)
    return accounts.find(acc => acc.id === accountId) || null
  } catch (error) {
    logger.error('Failed to get Bourso account details:', error)
    throw error
  }
}

/**
 * Get positions for a trading or life insurance account
 */
export async function getBoursoAccountPositions(accountId: string, password: string): Promise<Record<string, unknown>[]> {
  try {
    const normalizedId = normalizeAccountIdForCli(accountId)
    logger.info(`Fetching positions for account ${accountId} (normalized: ${normalizedId})`)
    const output = await executeBoutsoCli(['positions', '--account', normalizedId], password)
    logger.info(`Positions API returned ${output.length} bytes of data`)
    
    // Parse the JSON output from positions command
    try {
      const positionsData = JSON.parse(output)
      logger.info(`Parsed positions data: ${JSON.stringify(positionsData).length} bytes, ${Array.isArray(positionsData) ? positionsData.length : 'not array'} items`)
      // The response format should be an array of TradingSummaryItem with positions
      return positionsData
    } catch (e) {
      logger.warn('Failed to parse positions as JSON, treating as empty:', e)
      return []
    }
  } catch (error) {
    logger.warn('Failed to get Bourso trading positions:', error)
    // Return empty array instead of throwing to avoid blocking sync
    return []
  }
}

/**
 * Place a trade order
 */
export async function placeBoursoOrder(order: TradeOrder, password: string): Promise<TradeOrderResult> {
  try {
    const cliAccountId = normalizeAccountIdForCli(order.accountId)

    const args = [
      'trade',
      'order',
      'new',
      '--side', order.side,
      '--symbol', order.symbol,
      '--account', cliAccountId,
      '--quantity', order.quantity.toString(),
    ]

    if (order.price !== undefined) {
      args.push('--price', order.price.toString())
    }

    const output = await executeBoutsoCli(args, password)
    logger.info(`Order placed successfully: ${order.symbol} ${order.side} x${order.quantity}`)

    // Parse result from output
    const result: TradeOrderResult = {
      orderId: `bourso-${Date.now()}`,
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      price: order.price || 0, // Would need to extract from output
      accountId: order.accountId,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }

    return result
  } catch (error) {
    logger.error('Failed to place Bourso order:', error)
    throw new Error(extractCliErrorMessage(error, 'Failed to place order on Boursorama'))
  }
}

/**
 * Transfer funds between accounts
 */
export async function performBoursoTransfer(transfer: Transfer, password: string): Promise<TransferResult> {
  try {
    const fromAccountId = normalizeAccountIdForCli(transfer.fromAccountId)
    const toAccountId = normalizeAccountIdForCli(transfer.toAccountId)

    const args = [
      'transfer',
      '--account', fromAccountId,
      '--to', toAccountId,
      '--amount', transfer.amount.toString(),
    ]

    const output = await executeBoutsoCli(args, password)
    logger.info(`Transfer completed: ${transfer.amount}€ from ${transfer.fromAccountId} to ${transfer.toAccountId}`)

    const result: TransferResult = {
      transactionId: `bourso-transfer-${Date.now()}`,
      fromAccountId: transfer.fromAccountId,
      toAccountId: transfer.toAccountId,
      amount: transfer.amount,
      status: 'completed',
      createdAt: new Date().toISOString(),
    }

    return result
  } catch (error) {
    logger.error('Failed to perform Bourso transfer:', error)
    const message = extractCliErrorMessage(error, 'Failed to transfer funds on Boursorama')

    // bourso-cli v0.5.3 can occasionally return "Invalid transfer" even when transfer is applied.
    // Return a non-blocking pending result so UI does not report a hard failure for a possible false negative.
    if (/invalid transfer/i.test(message)) {
      logger.warn(`Bourso transfer returned ambiguous status: ${message}`)
      return {
        transactionId: `bourso-transfer-${Date.now()}`,
        fromAccountId: transfer.fromAccountId,
        toAccountId: transfer.toAccountId,
        amount: transfer.amount,
        status: 'pending',
        createdAt: new Date().toISOString(),
      }
    }

    throw new Error(message)
  }
}

/**
 * Get quote for a symbol
 */
export async function getBoursoQuote(symbol: string, length: number = 30, interval: string = '1d'): Promise<Quote | null> {
  try {
    const args = ['quote', '--symbol', symbol, '--length', length.toString(), '--interval', interval, 'last']

    const output = await executeBoutsoCli(args)
    logger.info(`Quote retrieved for ${symbol}`)

    // Parse quote from output
    const quote = parseQuoteOutput(output, symbol)
    return quote
  } catch (error) {
    logger.error('Failed to get Bourso quote:', error)
    return null
  }
}

/**
 * Parse accounts from CLI output
 * The output format is like: Account { id: "...", name: "...", balance: ..., kind: Banking }
 */
function parseAccountsOutput(output: string): BoursoAccount[] {
  const normalizeKind = (rawKind: unknown, accountName: string): BoursoAccount['kind'] => {
    const raw = typeof rawKind === 'string' ? rawKind.toLowerCase() : ''
    const name = accountName.toLowerCase()

    // Prefer explicit kind from Bourso when available.
    if (raw.includes('loan')) return 'Loans'
    if (raw.includes('assurance') || raw.includes('life')) return 'LifeInsurance'
    if (raw.includes('trading') || raw.includes('market')) return 'Trading'
    if (raw.includes('saving')) return 'Savings'
    if (raw.includes('banking') || raw.includes('checking')) return 'Banking'

    // Fallback heuristics based on account name.
    if (name.includes('assurance') || name.includes('life')) return 'LifeInsurance'
    if (name.includes('pea') || name.includes('cto')) return 'Trading'
    if (name.includes('livret')) return 'Savings'
    if (name.includes('courant')) return 'Banking'

    return 'Banking'
  }

  const toAccount = (candidate: any): BoursoAccount | null => {
    const acc = candidate?.account && typeof candidate.account === 'object' ? candidate.account : candidate
    if (!acc || typeof acc !== 'object') return null

    const idValue = acc.id ?? acc.account_id ?? acc.uuid
    const nameValue = acc.name ?? acc.account_name ?? acc.label
    if (!idValue || !nameValue) return null

    const balanceRaw =
      acc.balance ??
      acc.amount ??
      (acc.value && typeof acc.value === 'object'
        ? (acc.value.value ?? acc.value.amount)
        : acc.value)

    const bankName = (acc.bank_name ?? acc.bankName ?? 'Boursorama') as string
    const name = String(nameValue)

    return {
      id: String(idValue),
      name,
      balance: normalizeBoursoBalance(balanceRaw),
      bankName,
      kind: normalizeKind(acc.kind ?? acc.type ?? acc.account_type, name),
    }
  }

  // Try to parse JSON first (if CLI outputs JSON)
  try {
    const parsed = JSON.parse(output)
    const rawAccounts = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as any)?.accounts)
        ? (parsed as any).accounts
        : Array.isArray((parsed as any)?.data?.accounts)
          ? (parsed as any).data.accounts
          : []

    if (rawAccounts.length > 0) {
      return rawAccounts
        .map((entry: unknown) => toAccount(entry))
        .filter((entry: BoursoAccount | null): entry is BoursoAccount => entry !== null)
    }
  } catch {
    // Not JSON, parse text format
  }

  // Parse text output: Account { id: "...", name: "...", ... }
  const accounts: BoursoAccount[] = []
  const accountRegex = /Account\s*\{\s*id:\s*"([^"]+)"[^}]*name:\s*"([^"]+)"[^}]*balance:\s*([\d.,-]+)[^}]*kind:\s*([\w-]+)[^}]*\}/g

  let match
  while ((match = accountRegex.exec(output)) !== null) {
    const parsedBalance = Number.parseFloat(match[3].replace(',', '.'))
    const name = match[2]

    accounts.push({
      id: match[1],
      name,
      balance: normalizeBoursoBalance(parsedBalance),
      bankName: 'Boursorama',
      kind: normalizeKind(match[4], name),
    })
  }

  return accounts
}

/**
 * Parse quote from CLI output
 */
function parseQuoteOutput(output: string, symbol: string): Quote | null {
  try {
    // Try to extract numeric values from output
    const openMatch = output.match(/open[:\s=]+([0-9.]+)/i)
    const closeMatch = output.match(/close[:\s=]+([0-9.]+)/i)
    const highMatch = output.match(/high[:\s=]+([0-9.]+)/i)
    const lowMatch = output.match(/low[:\s=]+([0-9.]+)/i)
    const volumeMatch = output.match(/volume[:\s=]+([0-9.]+)/i)

    if (closeMatch) {
      return {
        symbol,
        open: openMatch ? parseFloat(openMatch[1]) : 0,
        close: parseFloat(closeMatch[1]),
        high: highMatch ? parseFloat(highMatch[1]) : 0,
        low: lowMatch ? parseFloat(lowMatch[1]) : 0,
        volume: volumeMatch ? parseFloat(volumeMatch[1]) : 0,
      }
    }
  } catch (error) {
    logger.error('Failed to parse quote:', error)
  }

  return null
}

/**
 * Validate Boursorama credentials
 */
export async function validateBoursoCredentials(customerId: string, password: string): Promise<boolean> {
  try {
    const output = await executeBoutsoCli(['accounts'], password)
    return output.length > 0
  } catch {
    return false
  }
}
