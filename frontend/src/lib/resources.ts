import { api } from './api'
import type {
  Account,
  Category,
  CalendarItem,
  ForecastOut,
  Installment,
  RecurringRule,
  SummaryOut,
  Transaction,
  TransactionGroup,
} from './types'

export const accountsApi = {
  list: () => api.get<Account[]>('/accounts').then((r) => r.data),
  create: (payload: { name: string; type: string }) =>
    api.post<Account>('/accounts', payload).then((r) => r.data),
  remove: (id: number) => api.delete(`/accounts/${id}`),
}

export const categoriesApi = {
  list: () => api.get<Category[]>('/categories').then((r) => r.data),
  create: (payload: { name: string; parent_id?: number | null; color?: string | null }) =>
    api.post<Category>('/categories', payload).then((r) => r.data),
  remove: (id: number) => api.delete(`/categories/${id}`),
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
    }>,
  ) => api.patch<Transaction>(`/transactions/${id}`, payload).then((r) => r.data),
  remove: (id: number) => api.delete(`/transactions/${id}`),
  importCsv: (
    accountId: number,
    file: File,
    mapping: {
      date_column: string
      description_column: string
      amount_column: string
      date_format: string
      amount_convention: 'income_positive' | 'expense_positive' | 'all_expense'
    },
  ) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<{ import_id: number; row_count: number; skipped_duplicates: number; errors: string[] }>(
      `/transactions/import`,
      form,
      {
        params: { account_id: accountId, ...mapping },
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    )
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
  summary: (dateFrom: string, dateTo: string) =>
    api
      .get<SummaryOut>('/dashboard/summary', { params: { date_from: dateFrom, date_to: dateTo } })
      .then((r) => r.data),
  calendar: (dateFrom: string, dateTo: string) =>
    api
      .get<CalendarItem[]>('/dashboard/calendar', { params: { date_from: dateFrom, date_to: dateTo } })
      .then((r) => r.data),
}
