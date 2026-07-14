import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

type Forecast = {
  as_of: string
  current_balance: string
  projected_month_end_balance: string
  expected_income_remaining: string
  fixed_expenses_remaining: string
  installments_remaining: string
}

export default function Dashboard() {
  const { user, logout } = useAuth()
  const [forecast, setForecast] = useState<Forecast | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<Forecast>('/dashboard/forecast')
      .then(({ data }) => setForecast(data))
      .catch(() => setError('Não foi possível carregar a previsão. Cadastre uma conta para começar.'))
  }, [])

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Bem-vindo(a)</p>
          <h1>{user?.name ?? user?.email}</h1>
        </div>
        <button onClick={logout}>Sair</button>
      </header>

      {error && <p className="auth-error">{error}</p>}

      {forecast && (
        <div className="forecast-card">
          <p className="eyebrow">Saldo previsto no fim do mês</p>
          <p className="forecast-amount">
            {Number(forecast.projected_month_end_balance).toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            })}
          </p>
          <p className="forecast-detail">
            Saldo atual: {Number(forecast.current_balance).toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            })}
          </p>
        </div>
      )}
    </div>
  )
}
