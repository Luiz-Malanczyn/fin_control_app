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
}

export type CategorySummary = {
  category_id: number | null
  category_name: string
  total: string
}

export type SummaryOut = {
  period_start: string
  period_end: string
  total_income: string
  total_expense: string
  by_category: CategorySummary[]
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

export type AmountConvention = 'income_positive' | 'expense_positive' | 'all_expense'

export type ImportPreset = {
  label: string
  date_column: string
  description_column: string
  amount_column: string
  date_format: string
  amount_convention: AmountConvention
}

// Cobrem os formatos que o Nubank realmente exporta: o extrato de conta
// (Data,Valor,Identificador,Descrição) e a fatura do cartão (date,title,amount),
// cada um com variações de formato de data dependendo de onde foi baixado.
export const IMPORT_PRESETS: Record<string, ImportPreset> = {
  nubank_conta: {
    label: 'Nubank — extrato de conta (Data, Valor, Descrição)',
    date_column: 'Data',
    description_column: 'Descrição',
    amount_column: 'Valor',
    date_format: '%d/%m/%Y',
    amount_convention: 'income_positive',
  },
  nubank_fatura_iso: {
    label: 'Nubank — fatura do cartão, data AAAA-MM-DD (date, title, amount)',
    date_column: 'date',
    description_column: 'title',
    amount_column: 'amount',
    date_format: '%Y-%m-%d',
    amount_convention: 'expense_positive',
  },
  nubank_fatura_us: {
    label: 'Nubank — fatura do cartão, data MM/DD/AAAA (date, title, amount)',
    date_column: 'date',
    description_column: 'title',
    amount_column: 'amount',
    date_format: '%m/%d/%Y',
    amount_convention: 'expense_positive',
  },
  custom: {
    label: 'Personalizado',
    date_column: 'date',
    description_column: 'description',
    amount_column: 'amount',
    date_format: '%Y-%m-%d',
    amount_convention: 'income_positive',
  },
}
