import { useEffect, useState, type FormEvent } from 'react'
import { budgetsApi, categoriesApi } from '../lib/resources'
import { formatCurrency, type Budget, type Category } from '../lib/types'

export default function Budgets() {
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  function reload() {
    budgetsApi.list().then(setBudgets)
    categoriesApi.list().then(setCategories)
  }

  useEffect(reload, [])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const parsedAmount = Number(amount.replace(',', '.'))
    if (categoryId === '' || !parsedAmount || parsedAmount <= 0) {
      setError('Escolha uma categoria e um limite maior que zero.')
      return
    }
    await budgetsApi.upsert(categoryId, parsedAmount)
    setAmount('')
    setCategoryId('')
    reload()
  }

  function statusClass(percentage: number) {
    if (percentage >= 100) return 'budget-bar-fill over'
    if (percentage >= 80) return 'budget-bar-fill warn'
    return 'budget-bar-fill'
  }

  const budgetedCategoryIds = new Set(budgets.map((b) => b.category_id))
  const availableCategories = categories.filter((c) => !budgetedCategoryIds.has(c.id))

  return (
    <div>
      <div className="page-header">
        <h1>Orçamentos</h1>
      </div>

      <div className="card">
        <h2>Definir limite mensal por categoria</h2>
        <form className="form-row" onSubmit={handleSubmit}>
          <label className="field">
            Categoria
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Selecione</option>
              {(availableCategories.length > 0 ? availableCategories : categories).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Limite mensal
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="800,00" inputMode="decimal" />
          </label>
          <button className="btn" type="submit">
            Salvar
          </button>
        </form>
        {error && <p className="auth-error" style={{ marginTop: 10 }}>{error}</p>}
      </div>

      <div className="card">
        <h2>Este mês</h2>
        {budgets.length === 0 ? (
          <p className="empty-hint">Nenhum orçamento definido ainda.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {budgets.map((b) => (
              <div key={b.id}>
                <div className="form-row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                  <strong style={{ fontSize: 14 }}>{b.category_name}</strong>
                  <div className="form-row" style={{ gap: 10 }}>
                    <span className="empty-hint" style={{ padding: 0 }}>
                      {formatCurrency(b.spent)} de {formatCurrency(b.amount)}
                    </span>
                    <button className="btn-danger" onClick={() => budgetsApi.remove(b.id).then(reload)}>
                      remover
                    </button>
                  </div>
                </div>
                <div className="budget-bar-track">
                  <div className={statusClass(b.percentage)} style={{ width: `${Math.min(b.percentage, 100)}%` }} />
                </div>
                <p className="empty-hint" style={{ padding: '4px 0 0' }}>
                  {b.percentage >= 100
                    ? `Estourou em ${formatCurrency(Math.abs(Number(b.remaining)))}`
                    : `Sobram ${formatCurrency(b.remaining)} (${b.percentage.toFixed(0)}%)`}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
