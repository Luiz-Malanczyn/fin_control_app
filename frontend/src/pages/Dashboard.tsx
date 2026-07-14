import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAuth } from '../context/AuthContext'
import { accountsApi, budgetsApi, dashboardApi } from '../lib/resources'
import { formatCurrency, type Account, type Budget, type ForecastOut, type SummaryOut } from '../lib/types'

type Period = 'day' | 'week' | 'month' | 'year'

const PERIOD_LABELS: Record<Period, string> = { day: 'Hoje', week: 'Esta semana', month: 'Este mês', year: 'Este ano' }

function rangeFor(period: Period): [Date, Date] {
  const now = new Date()
  if (period === 'day') return [startOfDay(now), endOfDay(now)]
  if (period === 'week') return [startOfWeek(now, { weekStartsOn: 1 }), endOfWeek(now, { weekStartsOn: 1 })]
  if (period === 'year') return [startOfYear(now), endOfYear(now)]
  return [startOfMonth(now), endOfMonth(now)]
}

export default function Dashboard() {
  const { user } = useAuth()
  const [forecast, setForecast] = useState<ForecastOut | null>(null)
  const [summary, setSummary] = useState<SummaryOut | null>(null)
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [period, setPeriod] = useState<Period>('month')
  const [accountId, setAccountId] = useState<number | ''>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    dashboardApi
      .forecast()
      .then(setForecast)
      .catch(() => setError('Não foi possível carregar a previsão. Cadastre uma conta para começar.'))
    budgetsApi.list().then(setBudgets)
    accountsApi.list().then(setAccounts)
  }, [])

  const overBudget = budgets.filter((b) => b.percentage >= 100)

  useEffect(() => {
    const [from, to] = rangeFor(period)
    dashboardApi
      .summary(format(from, 'yyyy-MM-dd'), format(to, 'yyyy-MM-dd'), accountId === '' ? undefined : accountId)
      .then(setSummary)
  }, [period, accountId])

  const categoryData = (summary?.by_category ?? []).map((c) => ({
    name: c.category_name,
    total: Number(c.total),
  }))

  const groupData = (summary?.by_group ?? []).map((g) => ({
    name: g.group_name,
    total: Number(g.total),
  }))

  return (
    <div>
      <div className="page-header">
        <h1>Olá, {user?.name ?? user?.email}</h1>
      </div>

      {error && <p className="auth-error">{error}</p>}

      {forecast && (
        <div className="forecast-card">
          <p className="eyebrow">Saldo previsto no fim do mês</p>
          <p className="forecast-amount">{formatCurrency(forecast.projected_month_end_balance)}</p>
          <p className="forecast-detail">Saldo atual: {formatCurrency(forecast.current_balance)}</p>
        </div>
      )}

      {overBudget.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--expense)' }}>
          <p className="eyebrow" style={{ color: 'var(--expense)' }}>
            Orçamento estourado
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 14 }}>
            {overBudget.map((b) => b.category_name).join(', ')} —{' '}
            <Link to="/budgets" style={{ color: 'var(--expense)' }}>
              ver detalhes
            </Link>
          </p>
        </div>
      )}

      <div className="card">
        <div className="page-header" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <h2 style={{ margin: 0 }}>Resumo do período</h2>
          <div className="form-row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <button
                key={p}
                className={p === period ? 'btn' : 'btn-ghost'}
                style={{ padding: '6px 12px', fontSize: 12.5 }}
                onClick={() => setPeriod(p)}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : '')}
              style={{ marginLeft: 6 }}
            >
              <option value="">Todas as contas</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {summary && (
          <div className="form-row" style={{ marginBottom: 16, gap: 24 }}>
            <div>
              <p className="eyebrow">Receitas</p>
              <p className="amount-income" style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(summary.total_income)}
              </p>
            </div>
            <div>
              <p className="eyebrow">Gastos</p>
              <p className="amount-expense" style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(summary.total_expense)}
              </p>
            </div>
          </div>
        )}

        <h3 style={{ fontSize: 14, margin: '4px 0 10px' }}>Gastos por categoria</h3>
        {categoryData.length === 0 ? (
          <p className="empty-hint">Sem gastos categorizados neste período.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(160, categoryData.length * 40)}>
            <BarChart data={categoryData} layout="vertical" margin={{ left: 12, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} stroke="var(--ink-muted)" fontSize={11} />
              <YAxis type="category" dataKey="name" width={110} stroke="var(--ink-muted)" fontSize={12} />
              <Tooltip
                formatter={(value) => formatCurrency(Number(value))}
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}
              />
              <Bar dataKey="total" fill="var(--expense)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}

        <h3 style={{ fontSize: 14, margin: '24px 0 10px' }}>Gastos por grupo</h3>
        {groupData.length === 0 ? (
          <p className="empty-hint">Sem gastos agrupados neste período.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(160, groupData.length * 40)}>
            <BarChart data={groupData} layout="vertical" margin={{ left: 12, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} stroke="var(--ink-muted)" fontSize={11} />
              <YAxis type="category" dataKey="name" width={110} stroke="var(--ink-muted)" fontSize={12} />
              <Tooltip
                formatter={(value) => formatCurrency(Number(value))}
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}
              />
              <Bar dataKey="total" fill="var(--accent)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {summary && summary.periods.length > 0 && (
        <div className="card">
          <h2 style={{ margin: '0 0 12px' }}>Totais por período</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th></th>
                <th>Receitas</th>
                <th>Gastos</th>
                <th>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {summary.periods.map((p) => {
                const net = Number(p.total_income) - Number(p.total_expense)
                return (
                  <tr key={p.label}>
                    <td>{p.label}</td>
                    <td className="amount-income">{formatCurrency(p.total_income)}</td>
                    <td className="amount-expense">{formatCurrency(p.total_expense)}</td>
                    <td className={net >= 0 ? 'amount-income' : 'amount-expense'}>{formatCurrency(net)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
