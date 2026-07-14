import { useEffect, useState, type FormEvent } from 'react'
import { accountsApi, categoriesApi, groupsApi } from '../lib/resources'
import {
  ACCOUNT_TYPE_LABELS,
  formatCurrency,
  type Account,
  type AccountType,
  type Category,
  type TransactionGroup,
} from '../lib/types'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function AccountsCategories() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [groups, setGroups] = useState<TransactionGroup[]>([])

  const [accountName, setAccountName] = useState('')
  const [accountType, setAccountType] = useState<AccountType>('checking')
  const [openingBalance, setOpeningBalance] = useState('0')
  const [openingBalanceDate, setOpeningBalanceDate] = useState(today())
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null)

  const [categoryName, setCategoryName] = useState('')
  const [groupName, setGroupName] = useState('')

  function reload() {
    accountsApi.list().then(setAccounts)
    categoriesApi.list().then(setCategories)
    groupsApi.list().then(setGroups)
  }

  useEffect(reload, [])

  function startEditAccount(account: Account) {
    setEditingAccountId(account.id)
    setAccountName(account.name)
    setAccountType(account.type)
    setOpeningBalance(account.opening_balance)
    setOpeningBalanceDate(account.opening_balance_date)
  }

  function cancelEditAccount() {
    setEditingAccountId(null)
    setAccountName('')
    setOpeningBalance('0')
    setOpeningBalanceDate(today())
  }

  async function handleSubmitAccount(event: FormEvent) {
    event.preventDefault()
    if (!accountName.trim()) return
    const payload = {
      name: accountName,
      type: accountType,
      opening_balance: Number(openingBalance.replace(',', '.')) || 0,
      opening_balance_date: openingBalanceDate,
    }
    if (editingAccountId !== null) {
      await accountsApi.update(editingAccountId, payload)
      setEditingAccountId(null)
    } else {
      await accountsApi.create(payload)
    }
    setAccountName('')
    setOpeningBalance('0')
    setOpeningBalanceDate(today())
    reload()
  }

  async function handleCreateCategory(event: FormEvent) {
    event.preventDefault()
    if (!categoryName.trim()) return
    await categoriesApi.create({ name: categoryName })
    setCategoryName('')
    reload()
  }

  async function handleCreateGroup(event: FormEvent) {
    event.preventDefault()
    if (!groupName.trim()) return
    await groupsApi.create({ name: groupName })
    setGroupName('')
    reload()
  }

  return (
    <div>
      <div className="page-header">
        <h1>Contas & categorias</h1>
      </div>

      <div className="card">
        <h2>{editingAccountId !== null ? 'Editar conta' : 'Contas'}</h2>
        <form onSubmit={handleSubmitAccount}>
          <div className="form-row">
            <label className="field">
              Nome
              <input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Nubank" />
            </label>
            <label className="field">
              Tipo
              <select value={accountType} onChange={(e) => setAccountType(e.target.value as AccountType)}>
                {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-row" style={{ marginTop: 10 }}>
            <label className="field">
              Saldo inicial
              <input
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
              />
            </label>
            <label className="field">
              A partir de
              <input
                type="date"
                value={openingBalanceDate}
                onChange={(e) => setOpeningBalanceDate(e.target.value)}
              />
            </label>
            <button className="btn" type="submit">
              {editingAccountId !== null ? 'Salvar edição' : 'Adicionar'}
            </button>
            {editingAccountId !== null && (
              <button className="btn-ghost" type="button" onClick={cancelEditAccount}>
                Cancelar
              </button>
            )}
          </div>
        </form>
        <p className="empty-hint" style={{ marginTop: 10 }}>
          Lançamentos antes dessa data só entram no histórico e nos gráficos — não mexem no saldo atual.
        </p>

        {accounts.length === 0 ? (
          <p className="empty-hint">Nenhuma conta cadastrada ainda.</p>
        ) : (
          <table className="data-table" style={{ marginTop: 14 }}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Saldo inicial</th>
                <th>A partir de</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td>{account.name}</td>
                  <td>{ACCOUNT_TYPE_LABELS[account.type]}</td>
                  <td>{formatCurrency(account.opening_balance)}</td>
                  <td>{account.opening_balance_date.split('-').reverse().join('/')}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      className="btn-ghost"
                      style={{ padding: '4px 8px', fontSize: 12 }}
                      onClick={() => startEditAccount(account)}
                    >
                      editar
                    </button>{' '}
                    <button
                      className="btn-danger"
                      onClick={() => accountsApi.remove(account.id).then(reload)}
                    >
                      remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Categorias</h2>
        <form className="form-row" onSubmit={handleCreateCategory}>
          <label className="field">
            Nome
            <input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="Mercado" />
          </label>
          <button className="btn" type="submit">
            Adicionar
          </button>
        </form>

        {categories.length === 0 ? (
          <p className="empty-hint">Nenhuma categoria cadastrada ainda.</p>
        ) : (
          <table className="data-table">
            <tbody>
              {categories.map((category) => (
                <tr key={category.id}>
                  <td>{category.name}</td>
                  <td>
                    <button
                      className="btn-danger"
                      onClick={() => categoriesApi.remove(category.id).then(reload)}
                    >
                      remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Grupos de gastos</h2>
        <p className="empty-hint" style={{ marginTop: -8, marginBottom: 12 }}>
          Agrupe transações relacionadas, como "Viagem SP" ou "Reforma".
        </p>
        <form className="form-row" onSubmit={handleCreateGroup}>
          <label className="field">
            Nome
            <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Viagem SP" />
          </label>
          <button className="btn" type="submit">
            Adicionar
          </button>
        </form>

        {groups.length === 0 ? (
          <p className="empty-hint">Nenhum grupo cadastrado ainda.</p>
        ) : (
          <table className="data-table">
            <tbody>
              {groups.map((group) => (
                <tr key={group.id}>
                  <td>{group.name}</td>
                  <td>
                    <button className="btn-danger" onClick={() => groupsApi.remove(group.id).then(reload)}>
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
