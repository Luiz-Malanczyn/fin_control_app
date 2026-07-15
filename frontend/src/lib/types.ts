export type AccountType = 'checking' | 'credit_card' | 'cash' | 'savings'
export type TransactionKind = 'expense' | 'income'
export type RecurrenceFrequency = 'monthly' | 'weekly'
export type TransactionSource = 'manual' | 'import' | 'recurring' | 'installment'

export type Account = {
  id: number
  name: string
  type: AccountType
  opening_balance: string
  opening_balance_date: string
  due_day: number | null
}

export type HouseholdMember = {
  id: number
  name: string
  email: string
}

export type Household = {
  id: number
  name: string
  invite_code: string
  members: HouseholdMember[]
}

export type Category = {
  id: number
  name: string
  parent_id: number | null
  color: string | null
}

export type TransactionGroup = {
  id: number
  name: string
  is_credit_card: boolean
  due_day: number | null
  pending_amount: string
}

export type Budget = {
  id: number
  category_id: number
  category_name: string
  amount: string
  spent: string
  remaining: string
  percentage: number
}

export type Transaction = {
  id: number
  account_id: number
  category_id: number | null
  group_id: number | null
  user_id: number
  date: string
  description: string
  amount: string
  kind: TransactionKind
  source: TransactionSource
  installment_number: number | null
  paid: boolean
}

export type RecurringRule = {
  id: number
  account_id: number
  category_id: number | null
  description: string
  amount: string
  kind: TransactionKind
  frequency: RecurrenceFrequency
  day_of_month: number | null
  weekday: number | null
  start_date: string
  end_date: string | null
}

export type Installment = {
  id: number
  account_id: number
  category_id: number | null
  description: string
  total_amount: string
  installment_count: number
  installment_amount: string
  start_date: string
}

export type CalendarItem = {
  date: string
  description: string
  amount: string
  kind: TransactionKind
  source: TransactionSource
  paid: boolean
  transaction_id: number | null
  recurring_rule_id: number | null
  installment_id: number | null
  installment_number: number | null
}

export type CategorySummary = {
  category_id: number | null
  category_name: string
  total: string
}

export type GroupSummary = {
  group_id: number | null
  group_name: string
  total: string
}

export type SummaryItem = {
  date: string
  description: string
  amount: string
  kind: TransactionKind
  paid: boolean
  account_id: number
  account_name: string
  category_id: number | null
  category_name: string
  group_id: number | null
  group_name: string
}

export type SummaryOut = {
  period_start: string
  period_end: string
  total_income: string
  total_expense: string
  by_category: CategorySummary[]
  by_group: GroupSummary[]
  items: SummaryItem[]
}

export type ForecastOut = {
  as_of: string
  month_start: string
  month_end: string
  current_balance: string
  expected_income_remaining: string
  expenses_posted: string
  fixed_expenses_remaining: string
  installments_remaining: string
  projected_month_end_balance: string
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Conta corrente',
  credit_card: 'Cartão de crédito',
  cash: 'Dinheiro',
  savings: 'Poupança',
}

export const WEEKDAY_LABELS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']

export function formatCurrency(value: string | number): string {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

