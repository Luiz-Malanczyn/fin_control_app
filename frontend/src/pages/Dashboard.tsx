import { useEffect, useState } from 'react'
import { endOfDay, endOfMonth, endOfWeek, format, startOfDay, startOfMonth, startOfWeek } from 'date-fns'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAuth } from '../context/AuthContext'
import { dashboardApi } from '../lib/resources'
import { formatCurrency, type ForecastOut, type SummaryOut } from '../lib/types'

type Period = 'day' | 'week' | 'month'

const PERIOD_LABELS: Record<Period, string> = { day: 'Hoje', week: 'Esta semana', month: 'Este mês' }

function rangeFor(period: Period): [Date, Date] {
  const now = new Date()
  if (period === 'day') return [startOfDay(now), endOfDay(now)]
  if (period === 'week') return [startOfWeek(now, { weekStartsOn: 1 }), endOfWeek(now, { weekStartsOn: 1 })]
  return [startOfMonth(now), endOfMonth(now)]
}

export default function Dashboard() {
  const { user } = useAuth()
  const [forecast, setForecast] = useState<ForecastOut | null>(null)
  const [summary, setSummary] = useState<SummaryOut | null>(null)
  const [period, setPeriod] = useState<Period>('month')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    dashboardApi
      .forecast()
      .then(setForecast)
      .catch(() => setError('Não foi possível carregar a previsão. Cadastre uma conta para começar.'))
  }, [])

  useEffect(() => {
    const [from, to] = rangeFor(period)
    dashboardApi.summary(format(from, 'yyyy-MM-dd'), format(to, 'yyyy-MM-dd')).then(setSummary)
  }, [period])

  const chartData = (summary?.by_category ?? []).map((c) => ({
    name: c.category_name,
    total: Number(c.total),
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

      <div className="card">
        <div className="page-header" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Gastos por categoria</h2>
          <div className="form-row" style={{ gap: 6 }}>
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

        {chartData.length === 0 ? (
          <p className="empty-hint">Sem gastos categorizados neste período.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(160, chartData.length * 40)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 12, right: 16 }}>
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
      </div>
    </div>
  )
}
