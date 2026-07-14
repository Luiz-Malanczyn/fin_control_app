import { useEffect, useState, type FormEvent } from 'react'
import { accountsApi, categoriesApi, groupsApi, transactionsApi } from '../lib/resources'
import {
  IMPORT_PRESETS,
  formatCurrency,
  type Account,
  type AmountConvention,
  type Category,
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

  const [importAccountId, setImportAccountId] = useState<number | ''>('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [importErrors, setImportErrors] = useState<string[]>([])
  const [presetKey, setPresetKey] = useState<keyof typeof IMPORT_PRESETS>('nubank_conta')
  const [dateColumn, setDateColumn] = useState(IMPORT_PRESETS.nubank_conta.date_column)
  const [descriptionColumn, setDescriptionColumn] = useState(IMPORT_PRESETS.nubank_conta.description_column)
  const [amountColumn, setAmountColumn] = useState(IMPORT_PRESETS.nubank_conta.amount_column)
  const [dateFormat, setDateFormat] = useState(IMPORT_PRESETS.nubank_conta.date_format)
  const [amountConvention, setAmountConvention] = useState<AmountConvention>(
    IMPORT_PRESETS.nubank_conta.amount_convention,
  )

  function applyPreset(key: keyof typeof IMPORT_PRESETS) {
    const preset = IMPORT_PRESETS[key]
    setPresetKey(key)
    setDateColumn(preset.date_column)
    setDescriptionColumn(preset.description_column)
    setAmountColumn(preset.amount_column)
    setDateFormat(preset.date_format)
    setAmountConvention(preset.amount_convention)
  }

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

  async function handleImport(event: FormEvent) {
    event.preventDefault()
    setImportMessage(null)
    setImportErrors([])
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
        amount_convention: amountConvention,
      })
      const parts = [`${data.row_count} lançamentos importados.`]
      if (data.skipped_duplicates > 0) parts.push(`${data.skipped_duplicates} duplicados ignorados.`)
      if (data.errors.length > 0) parts.push(`${data.errors.length} linhas com erro.`)
      setImportMessage(parts.join(' '))
      setImportErrors(data.errors)
      reloadTransactions()
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Confira o nome das colunas e o formato da data.'
      setImportMessage(`Não foi possível importar. ${detail}`)
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
            <label className="field" style={{ flex: 1, minWidth: 260 }}>
              Formato do arquivo
              <select
                value={presetKey}
                onChange={(e) => applyPreset(e.target.value as keyof typeof IMPORT_PRESETS)}
              >
                {Object.entries(IMPORT_PRESETS).map(([key, preset]) => (
                  <option key={key} value={key}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
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
            <label className="field">
              Convenção de sinal
              <select
                value={amountConvention}
                onChange={(e) => setAmountConvention(e.target.value as AmountConvention)}
              >
                <option value="income_positive">Positivo = receita</option>
                <option value="expense_positive">Positivo = despesa</option>
                <option value="all_expense">Tudo é despesa</option>
              </select>
            </label>
          </div>
        </form>
        {importMessage && <p className="empty-hint" style={{ marginTop: 10 }}>{importMessage}</p>}
        {importErrors.length > 0 && (
          <ul className="empty-hint" style={{ marginTop: 6 }}>
            {importErrors.slice(0, 10).map((err, i) => (
              <li key={i}>{err}</li>
            ))}
            {importErrors.length > 10 && <li>… e mais {importErrors.length - 10}.</li>}
          </ul>
        )}
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
