import { useEffect, useState, type FormEvent } from 'react'
import { accountsApi, categoriesApi, groupsApi, transactionsApi } from '../lib/resources'
import { formatCurrency, type Account, type Category, type Transaction, type TransactionGroup } from '../lib/types'

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

  const [importAccountId, setImportAccountId] = useState<number | ''>('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [dateColumn, setDateColumn] = useState('date')
  const [descriptionColumn, setDescriptionColumn] = useState('description')
  const [amountColumn, setAmountColumn] = useState('amount')
  const [dateFormat, setDateFormat] = useState('%Y-%m-%d')

  function reloadTransactions() {
    transactionsApi.list({ date_from: dateFrom, date_to: dateTo }).then(setTransactions)
  }

  useEffect(() => {
    accountsApi.list().then((list) => {
      setAccounts(list)
      if (list.length > 0) {
        setAccountId((prev) => (prev === '' ? list[0].id : prev))
        setImportAccountId((prev) => (prev === '' ? list[0].id : prev))
      }
    })
    categoriesApi.list().then(setCategories)
    groupsApi.list().then(setGroups)
  }, [])

  useEffect(reloadTransactions, [dateFrom, dateTo])

  async function handleCreate(event: FormEvent) {
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

  async function handleImport(event: FormEvent) {
    event.preventDefault()
    setImportMessage(null)
    if (importAccountId === '' || !importFile) {
      setImportMessage('Escolha a conta e o arquivo CSV.')
      return
    }
    try {
      const { data } = await transactionsApi.importCsv(importAccountId, importFile, {
        date_column: dateColumn,
        description_column: descriptionColumn,
        amount_column: amountColumn,
        date_format: dateFormat,
        signed_amounts: true,
      })
      setImportMessage(`${data.row_count} lançamentos importados.`)
      reloadTransactions()
    } catch {
      setImportMessage('Não foi possível importar. Confira o nome das colunas do CSV.')
    }
  }

  const categoryName = (id: number | null) => categories.find((c) => c.id === id)?.name ?? '—'
  const accountName = (id: number) => accounts.find((a) => a.id === id)?.name ?? '—'

  return (
    <div>
      <div className="page-header">
        <h1>Transações</h1>
      </div>

      <div className="card">
        <h2>Novo lançamento</h2>
        <form onSubmit={handleCreate}>
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
        <h2>Importar extrato (CSV)</h2>
        <form onSubmit={handleImport}>
          <div className="form-row">
            <label className="field">
              Conta
              <select value={importAccountId} onChange={(e) => setImportAccountId(Number(e.target.value))}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Arquivo
              <input type="file" accept=".csv" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />
            </label>
            <button className="btn" type="submit">
              Importar
            </button>
          </div>
          <div className="form-row" style={{ marginTop: 10 }}>
            <label className="field">
              Coluna data
              <input value={dateColumn} onChange={(e) => setDateColumn(e.target.value)} />
            </label>
            <label className="field">
              Coluna descrição
              <input value={descriptionColumn} onChange={(e) => setDescriptionColumn(e.target.value)} />
            </label>
            <label className="field">
              Coluna valor
              <input value={amountColumn} onChange={(e) => setAmountColumn(e.target.value)} />
            </label>
            <label className="field">
              Formato da data
              <input value={dateFormat} onChange={(e) => setDateFormat(e.target.value)} />
            </label>
          </div>
        </form>
        {importMessage && <p className="empty-hint" style={{ marginTop: 10 }}>{importMessage}</p>}
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
                <th>Valor</th>
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
                  <td className={t.kind === 'expense' ? 'amount-expense' : 'amount-income'}>
                    {t.kind === 'expense' ? '-' : '+'} {formatCurrency(t.amount)}
                  </td>
                  <td>
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
