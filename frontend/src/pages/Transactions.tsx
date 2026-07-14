import { useEffect, useState, type FormEvent } from 'react'
import { accountsApi, categoriesApi, groupsApi, householdApi, transactionsApi } from '../lib/resources'
import {
  formatCurrency,
  type Account,
  type Category,
  type HouseholdMember,
  type Transaction,
  type TransactionGroup,
} from '../lib/types'

function firstDayOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function Transactions() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [groups, setGroups] = useState<TransactionGroup[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [members, setMembers] = useState<HouseholdMember[]>([])

  const [dateFrom, setDateFrom] = useState(firstDayOfMonth())
  const [dateTo, setDateTo] = useState(today())

  const [accountId, setAccountId] = useState<number | ''>('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [groupId, setGroupId] = useState<number | ''>('')
  const [date, setDate] = useState(today())
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const [formError, setFormError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)

  function reloadTransactions() {
    transactionsApi.list({ date_from: dateFrom, date_to: dateTo }).then(setTransactions)
  }

  useEffect(() => {
    accountsApi.list().then((list) => {
      setAccounts(list)
      if (list.length > 0) {
        setAccountId((prev) => (prev === '' ? list[0].id : prev))
      }
    })
    categoriesApi.list().then(setCategories)
    groupsApi.list().then(setGroups)
    householdApi.me().then((h) => setMembers(h.members))
  }, [])

  useEffect(reloadTransactions, [dateFrom, dateTo])

  function startEdit(t: Transaction) {
    setEditingId(t.id)
    setAccountId(t.account_id)
    setCategoryId(t.category_id ?? '')
    setGroupId(t.group_id ?? '')
    setDate(t.date)
    setDescription(t.description)
    setAmount(t.amount)
    setKind(t.kind)
    setFormError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setDescription('')
    setAmount('')
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    if (accountId === '') {
      setFormError('Cadastre uma conta antes de lançar uma transação.')
      return
    }
    const parsedAmount = Number(amount.replace(',', '.'))
    if (!description.trim() || !parsedAmount || parsedAmount <= 0) {
      setFormError('Preencha descrição e um valor maior que zero.')
      return
    }
    const payload = {
      account_id: accountId,
      category_id: categoryId === '' ? null : categoryId,
      group_id: groupId === '' ? null : groupId,
      date,
      description,
      amount: parsedAmount,
      kind,
    }
    if (editingId !== null) {
      await transactionsApi.update(editingId, payload)
      setEditingId(null)
    } else {
      await transactionsApi.create(payload)
    }
    setDescription('')
    setAmount('')
    reloadTransactions()
  }

  const categoryName = (id: number | null) => categories.find((c) => c.id === id)?.name ?? '—'
  const accountName = (id: number) => accounts.find((a) => a.id === id)?.name ?? '—'

  async function togglePaid(t: Transaction) {
    await transactionsApi.update(t.id, { paid: !t.paid })
    reloadTransactions()
  }

  return (
    <div>
      <div className="page-header">
        <h1>Transações</h1>
      </div>

      <div className="card">
        <h2>{editingId !== null ? 'Editar lançamento' : 'Novo lançamento'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label className="field">
              Conta
              <select value={accountId} onChange={(e) => setAccountId(Number(e.target.value))}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Categoria
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Sem categoria</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Grupo
              <select value={groupId} onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Sem grupo</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Tipo
              <select value={kind} onChange={(e) => setKind(e.target.value as 'expense' | 'income')}>
                <option value="expense">Gasto</option>
                <option value="income">Receita</option>
              </select>
            </label>
          </div>
          <div className="form-row" style={{ marginTop: 10 }}>
            <label className="field">
              Data
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field" style={{ flex: 1 }}>
              Descrição
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Supermercado" />
            </label>
            <label className="field">
              Valor
              <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="150,00" inputMode="decimal" />
            </label>
            <button className="btn" type="submit">
              {editingId !== null ? 'Salvar edição' : 'Lançar'}
            </button>
            {editingId !== null && (
              <button className="btn-ghost" type="button" onClick={cancelEdit}>
                Cancelar
              </button>
            )}
          </div>
        </form>
        {formError && <p className="auth-error" style={{ marginTop: 10 }}>{formError}</p>}
      </div>

      <div className="card">
        <h2>Lançamentos</h2>
        <div className="form-row" style={{ marginBottom: 14 }}>
          <label className="field">
            De
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="field">
            Até
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
        </div>

        {transactions.length === 0 ? (
          <p className="empty-hint">Nenhuma transação no período selecionado.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th>Conta</th>
                <th>Categoria</th>
                {members.length > 1 && <th>Lançado por</th>}
                <th>Valor</th>
                <th>Pago</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td>{t.date.split('-').reverse().join('/')}</td>
                  <td>{t.description}</td>
                  <td>{accountName(t.account_id)}</td>
                  <td>{categoryName(t.category_id)}</td>
                  {members.length > 1 && (
                    <td>{members.find((m) => m.id === t.user_id)?.name ?? '—'}</td>
                  )}
                  <td className={t.kind === 'expense' ? 'amount-expense' : 'amount-income'}>
                    {t.kind === 'expense' ? '-' : '+'} {formatCurrency(t.amount)}
                  </td>
                  <td>
                    <input type="checkbox" checked={t.paid} onChange={() => togglePaid(t)} />
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => startEdit(t)}>
                      editar
                    </button>{' '}
                    <button className="btn-danger" onClick={() => transactionsApi.remove(t.id).then(reloadTransactions)}>
                      remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
