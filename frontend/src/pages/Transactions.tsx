import { useEffect, useState, type FormEvent } from 'react'
import { accountsApi, categoriesApi, groupsApi, householdApi, transactionsApi } from '../lib/resources'
import {
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

type TransactionPatch = Partial<{
  account_id: number
  category_id: number | null
  group_id: number | null
  date: string
  description: string
  amount: number
  kind: string
  paid: boolean
}>

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
    await transactionsApi.create({
      account_id: accountId,
      category_id: categoryId === '' ? null : categoryId,
      group_id: groupId === '' ? null : groupId,
      date,
      description,
      amount: parsedAmount,
      kind,
    })
    setDescription('')
    setAmount('')
    reloadTransactions()
  }

  async function patchTransaction(t: Transaction, patch: TransactionPatch) {
    await transactionsApi.update(t.id, patch)
    reloadTransactions()
  }

  function handleDescriptionBlur(t: Transaction, value: string) {
    const trimmed = value.trim()
    if (!trimmed || trimmed === t.description) return
    patchTransaction(t, { description: trimmed })
  }

  function handleAmountBlur(t: Transaction, value: string) {
    const parsed = Number(value.replace(',', '.'))
    if (!parsed || parsed <= 0) return
    patchTransaction(t, { amount: parsed })
  }

  return (
    <div>
      <div className="page-header">
        <h1>Transações</h1>
      </div>

      <div className="card">
        <h2>Novo lançamento</h2>
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
              Lançar
            </button>
          </div>
        </form>
        {formError && <p className="auth-error" style={{ marginTop: 10 }}>{formError}</p>}
      </div>

      <div className="card">
        <h2>Lançamentos</h2>
        <p className="empty-hint" style={{ marginTop: -8, marginBottom: 12 }}>
          Clique em qualquer campo da linha pra editar direto.
        </p>
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
          <div className="tablewrap">
            <table className="data-table data-table-editable">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Conta</th>
                  <th>Categoria</th>
                  <th>Tipo</th>
                  {members.length > 1 && <th>Lançado por</th>}
                  <th>Valor</th>
                  <th>Pago</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <input
                        type="date"
                        value={t.date}
                        onChange={(e) => patchTransaction(t, { date: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        key={`desc-${t.id}-${t.description}`}
                        defaultValue={t.description}
                        onBlur={(e) => handleDescriptionBlur(t, e.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        value={t.account_id}
                        onChange={(e) => patchTransaction(t, { account_id: Number(e.target.value) })}
                      >
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={t.category_id ?? ''}
                        onChange={(e) =>
                          patchTransaction(t, { category_id: e.target.value ? Number(e.target.value) : null })
                        }
                      >
                        <option value="">Sem categoria</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select value={t.kind} onChange={(e) => patchTransaction(t, { kind: e.target.value })}>
                        <option value="expense">Gasto</option>
                        <option value="income">Receita</option>
                      </select>
                    </td>
                    {members.length > 1 && (
                      <td>{members.find((m) => m.id === t.user_id)?.name ?? '—'}</td>
                    )}
                    <td className={t.kind === 'expense' ? 'amount-expense' : 'amount-income'}>
                      <input
                        key={`amount-${t.id}-${t.amount}`}
                        defaultValue={t.amount}
                        onBlur={(e) => handleAmountBlur(t, e.target.value)}
                        inputMode="decimal"
                        style={{ width: 90 }}
                      />
                    </td>
                    <td>
                      {t.kind === 'expense' ? (
                        <input
                          type="checkbox"
                          checked={t.paid}
                          onChange={() => patchTransaction(t, { paid: !t.paid })}
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn-danger" onClick={() => transactionsApi.remove(t.id).then(reloadTransactions)}>
                        remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
