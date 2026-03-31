// Bourso API Integration Types

export type BoursoAccount = {
  id: string
  name: string
  balance: number
  bankName: string
  kind: 'Banking' | 'Trading' | 'Savings' | 'LifeInsurance' | 'Loans'
}

export type BoursoAccountKind = 'Banking' | 'Trading' | 'Savings' | 'LifeInsurance' | 'Loans'

export type OrderSide = 'buy' | 'sell'

export type TradeOrder = {
  symbol: string
  side: OrderSide
  quantity: number
  accountId: string
  price?: number // for limit orders
}

export type TradeOrderResult = {
  orderId: string
  symbol: string
  side: OrderSide
  quantity: number
  price: number
  accountId: string
  status: 'pending' | 'executed' | 'failed'
  createdAt: string
}

export type Transfer = {
  fromAccountId: string
  toAccountId: string
  amount: number
  label?: string
}

export type TransferResult = {
  transactionId: string
  fromAccountId: string
  toAccountId: string
  amount: number
  status: 'pending' | 'completed' | 'failed'
  createdAt: string
}

export type Quote = {
  symbol: string
  open: number
  close: number
  high: number
  low: number
  volume: number
}

export type BoursoAction = {
  id: string
  type: 'transfer' | 'trade' | 'sync-accounts'
  status: 'pending' | 'completed' | 'failed'
  source: 'bourso' // from Boursorama
  data: Record<string, unknown>
  createdAt: string
  completedAt?: string
  error?: string
}
