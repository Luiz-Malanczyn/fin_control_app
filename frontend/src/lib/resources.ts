import { api } from './api'
import type {
  Account,
  Budget,
  Category,
  CalendarItem,
  ForecastOut,
  Household,
  Installment,
  RecurringRule,
  SummaryOut,
  Transaction,
  TransactionGroup,
} from './types'

export const householdApi = {
  me: () => api.get<Household>('/household/me').then((r) => r.data),
  rename: (name: string) => api.patch<Household>('/household/me', { name }).then((r) => r.data),
  regenerateInvite: () =>
    api.post<Household>('/household/me/regenerate-invite').then((r) => r.data),
  join: (inviteCode: string) =>
    api.post<Household>('/household/join', { invite_code: inviteCode }).then((r) => r.data),
}

export const accountsApi = {
  list: () => api.get<Account[]>('/accounts').then((r) => r.data),
  create: (payload: {
    name: string
    type: string
    opening_balance?: number
    opening_balance_date?: string
    due_day?: number | null
  }) => api.post<Account>('/accounts', payload).then((r) => r.data),
  update: (
    id: number,
    payload: Partial<{
      name: string
      type: string
      opening_balance: number
      opening_balance_date: string
      due_day: number | null
    }>,
  ) => api.patch<Account>(`/accounts/${id}`, payload).then((r) => r.data),
  remove: (id: number) => api.delete(`/accounts/${id}`),
}

export const categoriesApi = {
  list: () => api.get<Category[]>('/categories').then((r) => r.data),
  create: (payload: { name: string; parent_id?: number | null; color?: string | null }) =>
    api.post<Category>('/categories', payload).then((r) => r.data),
  remove: (id: number) => api.delete(`/categories/${id}`),
}

export const budgetsApi = {
  list: () => api.get<Budget[]>('/budgets').then((r) => r.data),
  upsert: (categoryId: number, amount: number) =>
    api.post<Budget>('/budgets', { category_id: categoryId, amount }).then((r) => r.data),
  remove: (id: number) => api.delete(`/budgets/${id}`),
}

export const groupsApi = {
  list: () => api.get<TransactionGroup[]>('/groups').then((r) => r.data),
  create: (payload: { name: string }) => api.post<TransactionGroup>('/groups', payload).then((r) => r.data),
  remove: (id: number) => api.delete(`/groups/${id}`),
}

export const transactionsApi = {
  list: (params?: { date_from?: string; date_to?: string; category_id?: number; account_id?: number }) =>
    api.get<Transaction[]>('/transactions', { params }).then((r) => r.data),
  create: (payload: {
    account_id: number
    category_id?: number | null
    group_id?: number | null
    date: string
    description: string
    amount: number
    kind: string
  }) => api.post<Transaction>('/transactions', payload).then((r) => r.data),
  update: (
    id: number,
    payload: Partial<{
      account_id: number
      category_id: number | null
      group_id: number | null
      date: string
      description: string
      amount: number
      kind: string
      paid: boolean
    }>,
  ) => api.patch<Transaction>(`/transactions/${id}`, payload).then((r) => r.data),
  remove: (id: number) => api.delete(`/transactions/${id}`),
}

export type AmountConvention = 'income_positive' | 'expense_positive' | 'all_expense'

export type CsvMapping = {
  date_column: string
  description_column: string
  amount_column: string
  date_format: string
  amount_convention: AmountConvention
}

export type ImportPreviewRow = {
  index: number
  date: string
  description: string
  amount: string
  kind: 'expense' | 'income'
}

export type ImportPreview = {
  file_type: 'csv' | 'pdf'
  columns: string[] | null
  mapping: CsvMapping
  rows: ImportPreviewRow[]
  row_count: number
  errors: string[]
}

export type ImportResult = {
  import_id: number
  row_count: number
  skipped_duplicates: number
  errors: string[]
  status: string
}

export const importApi = {
  detect: (file: File, overrides?: Partial<CsvMapping>) => {
    const form = new FormData()
    form.append('file', file)
    return api
      .post<ImportPreview>('/transactions/import/detect', form, {
        params: overrides,
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },
  commit: (accountId: number, file: File, mapping: CsvMapping, excludedIndices?: number[]) => {
    const form = new FormData()
    form.append('file', file)
    return api
      .post<ImportResult>('/transactions/import', form, {
        params: {
          account_id: accountId,
          ...mapping,
          excluded_indices: excludedIndices && excludedIndices.length > 0 ? excludedIndices.join(',') : undefined,
        },
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },
}

export const recurringApi = {
  list: () => api.get<RecurringRule[]>('/recurring-rules').then((r) => r.data),
  create: (payload: Record<string, unknown>) =>
    api.post<RecurringRule>('/recurring-rules', payload).then((r) => r.data),
  update: (id: number, payload: Record<string, unknown>) =>
    api.patch<RecurringRule>(`/recurring-rules/${id}`, payload).then((r) => r.data),
  remove: (id: number) => api.delete(`/recurring-rules/${id}`),
}

export const installmentsApi = {
  list: () => api.get<Installment[]>('/installments').then((r) => r.data),
  create: (payload: Record<string, unknown>) =>
    api.post<Installment>('/installments', payload).then((r) => r.data),
  update: (id: number, payload: Record<string, unknown>) =>
    api.patch<Installment>(`/installments/${id}`, payload).then((r) => r.data),
  remove: (id: number) => api.delete(`/installments/${id}`),
}

export const dashboardApi = {
  forecast: () => api.get<ForecastOut>('/dashboard/forecast').then((r) => r.data),
  summary: (dateFrom: string, dateTo: string, accountId?: number) =>
    api
      .get<SummaryOut>('/dashboard/summary', {
        params: { date_from: dateFrom, date_to: dateTo, account_id: accountId },
      })
      .then((r) => r.data),
  calendar: (dateFrom: string, dateTo: string) =>
    api
      .get<CalendarItem[]>('/dashboard/calendar', { params: { date_from: dateFrom, date_to: dateTo } })
      .then((r) => r.data),
  markPaid: (payload: {
    paid: boolean
    transaction_id?: number | null
    recurring_rule_id?: number | null
    installment_id?: number | null
    installment_number?: number | null
    occurrence_date?: string | null
  }) => api.post<Transaction>('/dashboard/mark-paid', payload).then((r) => r.data),
}
