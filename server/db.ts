import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import type { StoredState } from './index'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DB_PATH = path.join(__dirname, '../app.db')

export const db = new Database(DB_PATH)

export const initDB = () => {
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_snapshots (
      date TEXT PRIMARY KEY,
      net_worth REAL NOT NULL,
      cash REAL NOT NULL,
      investments REAL NOT NULL,
      debts REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS asset_prices (
      symbol TEXT NOT NULL,
      date TEXT NOT NULL,
      price REAL NOT NULL,
      PRIMARY KEY (symbol, date)
    );

    CREATE TABLE IF NOT EXISTS debts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'other',
      original_amount REAL NOT NULL,
      balance REAL NOT NULL,
      interest_rate REAL NOT NULL,
      monthly_payment REAL NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      linked_asset_id TEXT
    );

    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT '🎯',
      color TEXT NOT NULL DEFAULT '#3b82f6',
      target_amount REAL NOT NULL,
      target_date TEXT NOT NULL,
      current_amount REAL NOT NULL DEFAULT 0,
      monthly_contribution REAL NOT NULL DEFAULT 0,
      linked_account_id TEXT,
      is_completed INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS real_estate (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      purchase_price REAL NOT NULL,
      current_value REAL NOT NULL,
      purchase_date TEXT NOT NULL,
      is_rental INTEGER NOT NULL DEFAULT 0,
      monthly_rent REAL,
      monthly_charges REAL,
      tax_regime TEXT,
      linked_debt_id TEXT
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      purchase_price REAL NOT NULL,
      purchase_date TEXT NOT NULL,
      current_value REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transaction_overrides (
      transaction_id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      category_parent TEXT NOT NULL,
      supplier TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS tax_events (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      gross_amount REAL NOT NULL,
      account_id TEXT,
      description TEXT
    );
  `)

  try { db.exec("ALTER TABLE debts ADD COLUMN insurance_rate REAL DEFAULT 0") } catch (e) {}
  try { db.exec("ALTER TABLE debts ADD COLUMN deferred_months INTEGER DEFAULT 0") } catch (e) {}
  try { db.exec("ALTER TABLE debts ADD COLUMN deferred_type TEXT DEFAULT 'none'") } catch (e) {}
}

// ─── Debts ─────────────────────────────────────────────────────────────────
export const getAllDebts = () => {
  const rows = db.prepare('SELECT * FROM debts ORDER BY start_date ASC').all() as any[]
  return rows.map(r => ({
    id: r.id, name: r.name, type: r.type, originalAmount: r.original_amount,
    balance: r.balance, interestRate: r.interest_rate, monthlyPayment: r.monthly_payment,
    startDate: r.start_date, endDate: r.end_date, linkedAssetId: r.linked_asset_id ?? undefined,
    insuranceRate: r.insurance_rate ?? 0, deferredMonths: r.deferred_months ?? 0, deferredType: r.deferred_type ?? 'none'
  }))
}

export const insertDebt = (d: any) => {
  db.prepare(`INSERT INTO debts (id,name,type,original_amount,balance,interest_rate,monthly_payment,start_date,end_date,linked_asset_id,insurance_rate,deferred_months,deferred_type)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(d.id,d.name,d.type,d.originalAmount,d.balance,d.interestRate,d.monthlyPayment,d.startDate,d.endDate,d.linkedAssetId??null,d.insuranceRate??0,d.deferredMonths??0,d.deferredType??'none')
}

export const updateDebt = (d: any) => {
  db.prepare(`UPDATE debts SET name=?,type=?,original_amount=?,balance=?,interest_rate=?,monthly_payment=?,start_date=?,end_date=?,linked_asset_id=?,insurance_rate=?,deferred_months=?,deferred_type=? WHERE id=?`)
    .run(d.name,d.type,d.originalAmount,d.balance,d.interestRate,d.monthlyPayment,d.startDate,d.endDate,d.linkedAssetId??null,d.insuranceRate??0,d.deferredMonths??0,d.deferredType??'none',d.id)
}

export const deleteDebt = (id: string) => db.prepare('DELETE FROM debts WHERE id=?').run(id)

// ─── Goals ─────────────────────────────────────────────────────────────────
export const getAllGoals = () => {
  const rows = db.prepare('SELECT * FROM goals ORDER BY target_date ASC').all() as any[]
  return rows.map(r => ({
    id: r.id, name: r.name, icon: r.icon, color: r.color,
    targetAmount: r.target_amount, targetDate: r.target_date, currentAmount: r.current_amount,
    monthlyContribution: r.monthly_contribution, linkedAccountId: r.linked_account_id ?? undefined,
    isCompleted: r.is_completed === 1
  }))
}

export const insertGoal = (g: any) => {
  db.prepare(`INSERT INTO goals (id,name,icon,color,target_amount,target_date,current_amount,monthly_contribution,linked_account_id,is_completed)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(g.id,g.name,g.icon,g.color,g.targetAmount,g.targetDate,g.currentAmount??0,g.monthlyContribution??0,g.linkedAccountId??null,g.isCompleted?1:0)
}

export const updateGoal = (g: any) => {
  db.prepare(`UPDATE goals SET name=?,icon=?,color=?,target_amount=?,target_date=?,current_amount=?,monthly_contribution=?,linked_account_id=?,is_completed=? WHERE id=?`)
    .run(g.name,g.icon,g.color,g.targetAmount,g.targetDate,g.currentAmount??0,g.monthlyContribution??0,g.linkedAccountId??null,g.isCompleted?1:0,g.id)
}

export const deleteGoal = (id: string) => db.prepare('DELETE FROM goals WHERE id=?').run(id)

// ─── Real Estate ────────────────────────────────────────────────────────────
export const getAllRealEstate = () => {
  const rows = db.prepare('SELECT * FROM real_estate ORDER BY purchase_date ASC').all() as any[]
  return rows.map(r => ({
    id: r.id, name: r.name, address: r.address ?? undefined,
    purchasePrice: r.purchase_price, currentValue: r.current_value, purchaseDate: r.purchase_date,
    isRental: r.is_rental === 1, monthlyRent: r.monthly_rent ?? undefined,
    monthlyCharges: r.monthly_charges ?? undefined, taxRegime: r.tax_regime ?? undefined,
    linkedDebtId: r.linked_debt_id ?? undefined
  }))
}

export const insertRealEstate = (p: any) => {
  db.prepare(`INSERT INTO real_estate (id,name,address,purchase_price,current_value,purchase_date,is_rental,monthly_rent,monthly_charges,tax_regime,linked_debt_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(p.id,p.name,p.address??null,p.purchasePrice,p.currentValue,p.purchaseDate,p.isRental?1:0,p.monthlyRent??null,p.monthlyCharges??null,p.taxRegime??null,p.linkedDebtId??null)
}

export const updateRealEstate = (p: any) => {
  db.prepare(`UPDATE real_estate SET name=?,address=?,purchase_price=?,current_value=?,purchase_date=?,is_rental=?,monthly_rent=?,monthly_charges=?,tax_regime=?,linked_debt_id=? WHERE id=?`)
    .run(p.name,p.address??null,p.purchasePrice,p.currentValue,p.purchaseDate,p.isRental?1:0,p.monthlyRent??null,p.monthlyCharges??null,p.taxRegime??null,p.linkedDebtId??null,p.id)
}

export const deleteRealEstate = (id: string) => db.prepare('DELETE FROM real_estate WHERE id=?').run(id)

// ─── Vehicles ───────────────────────────────────────────────────────────────
export const getAllVehicles = () => {
  const rows = db.prepare('SELECT * FROM vehicles ORDER BY purchase_date ASC').all() as any[]
  return rows.map(r => ({
    id: r.id, name: r.name, purchasePrice: r.purchase_price,
    purchaseDate: r.purchase_date, currentValue: r.current_value
  }))
}

export const insertVehicle = (v: any) => {
  db.prepare(`INSERT INTO vehicles (id,name,purchase_price,purchase_date,current_value) VALUES (?,?,?,?,?)`)
    .run(v.id,v.name,v.purchasePrice,v.purchaseDate,v.currentValue)
}

export const updateVehicle = (v: any) => {
  db.prepare(`UPDATE vehicles SET name=?,purchase_price=?,purchase_date=?,current_value=? WHERE id=?`)
    .run(v.name,v.purchasePrice,v.purchaseDate,v.currentValue,v.id)
}

export const deleteVehicle = (id: string) => db.prepare('DELETE FROM vehicles WHERE id=?').run(id)

// ─── Transaction Overrides ──────────────────────────────────────────────────
export const getAllTransactionOverrides = () => {
  const rows = db.prepare('SELECT * FROM transaction_overrides').all() as any[]
  return rows.map(r => ({
    transactionId: r.transaction_id, category: r.category,
    categoryParent: r.category_parent, supplier: r.supplier, note: r.note
  }))
}

export const upsertTransactionOverride = (o: any) => {
  db.prepare(`INSERT OR REPLACE INTO transaction_overrides (transaction_id,category,category_parent,supplier,note) VALUES (?,?,?,?,?)`)
    .run(o.transactionId, o.category, o.categoryParent, o.supplier, o.note ?? '')
}

export const deleteTransactionOverride = (id: string) => db.prepare('DELETE FROM transaction_overrides WHERE transaction_id=?').run(id)

// ─── Tax Events ─────────────────────────────────────────────────────────────
export const getAllTaxEvents = (year?: number) => {
  const rows = year
    ? db.prepare(`SELECT * FROM tax_events WHERE date LIKE '${year}%' ORDER BY date ASC`).all() as any[]
    : db.prepare('SELECT * FROM tax_events ORDER BY date ASC').all() as any[]
  return rows.map(r => ({ id: r.id, date: r.date, type: r.type, grossAmount: r.gross_amount, accountId: r.account_id, description: r.description }))
}

export const insertTaxEvent = (e: any) => {
  db.prepare(`INSERT INTO tax_events (id,date,type,gross_amount,account_id,description) VALUES (?,?,?,?,?,?)`)
    .run(e.id, e.date, e.type, e.grossAmount, e.accountId??null, e.description??null)
}

export const deleteTaxEvent = (id: string) => db.prepare('DELETE FROM tax_events WHERE id=?').run(id)

export const readStoreFromDB = (): StoredState | null => {
  const row = db.prepare('SELECT value FROM kv_store WHERE key = ?').get('app_state') as { value: string } | undefined
  if (!row) return null
  return JSON.parse(row.value)
}

export const writeStoreToDB = (state: StoredState) => {
  const stmt = db.prepare('INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)')
  stmt.run('app_state', JSON.stringify(state))
}

export const saveDailySnapshot = (date: string, patrimony: any) => {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO daily_snapshots (date, net_worth, cash, investments, debts)
    VALUES (?, ?, ?, ?, ?)
  `)
  
  const totalAssets = patrimony.bankCash + Object.values(patrimony.assetsByProductType).reduce((a: any, b: any) => a + b, 0)
  const investments = totalAssets - patrimony.bankCash
  
  stmt.run(date, patrimony.netWorth, patrimony.bankCash, investments, patrimony.debts)
}

export const getDailySnapshots = () => {
  return db.prepare('SELECT * FROM daily_snapshots ORDER BY date ASC').all()
}
