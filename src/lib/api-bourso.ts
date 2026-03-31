import { api } from './api'
import type {
  BoursoAccount,
  TradeOrder,
  TradeOrderResult,
  Transfer,
  TransferResult,
  Quote,
  BoursoAction,
} from '../types-bourso'

/**
 * Boursorama API methods
 */
export const apiBourso = {
  /**
   * Sync accounts from Boursorama
   */
  syncAccounts: (password: string) =>
    api.post<{ accounts: BoursoAccount[]; action: BoursoAction }>('/bourso/accounts/sync', { password }),

  /**
   * Sync accounts and replace local MyMoney account list (Bourso-only mode)
   */
  syncAndReplaceAccounts: (password: string) =>
    api.post<{ accounts: BoursoAccount[]; replaced: number; action: BoursoAction }>('/bourso/accounts/sync-replace', { password }),

  /**
   * Get last synced Boursorama accounts from API cache
   */
  getLastSyncedAccounts: () =>
    api.get<{ accounts: BoursoAccount[] }>('/bourso/accounts/last'),

  /**
   * Place a trade order on Boursorama
   */
  placeOrder: (order: TradeOrder, password: string) =>
    api.post<{ result: TradeOrderResult; action: BoursoAction }>('/bourso/order', { order, password }),

  /**
   * Transfer funds between Boursorama accounts
   */
  transfer: (transfer: Transfer, password: string) =>
    api.post<{ result: TransferResult; action: BoursoAction }>('/bourso/transfer', { transfer, password }),

  /**
   * Get quote for a symbol
   */
  getQuote: (symbol: string, length = 30, interval = '1d') =>
    api.get<Quote>('/bourso/quote/' + symbol, { query: { length: length.toString(), interval } }),

  /**
   * Get all Bourso actions history
   */
  getActions: () =>
    api.get<BoursoAction[]>('/bourso/actions'),

  /**
   * Get specific Bourso action
   */
  getAction: (id: string) =>
    api.get<BoursoAction>(`/bourso/actions/${id}`),

  /**
   * Validate Boursorama credentials
   */
  validateCredentials: (customerId: string, password: string) =>
    api.post<{ isValid: boolean }>('/bourso/validate', { customerId, password }),
}
