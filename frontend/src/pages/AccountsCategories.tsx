import { useEffect, useState, type FormEvent } from 'react'
import { accountsApi, categoriesApi, groupsApi } from '../lib/resources'
import { ACCOUNT_TYPE_LABELS, type Account, type AccountType, type Category, type TransactionGroup } from '../lib/types'

export default function AccountsCategories() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [groups, setGroups] = useState<TransactionGroup[]>([])

  const [accountName, setAccountName] = useState('')
  const [accountType, setAccountType] = useState<AccountType>('checking')
  const [categoryName, setCategoryName] = useState('')
  const [groupName, setGroupName] = useState('')

  function reload() {
    accountsApi.list().then(setAccounts)
    categoriesApi.list().then(setCategories)
    groupsApi.list().then(setGroups)
  }

  useEffect(reload, [])

  async function handleCreateAccount(event: FormEvent) {
    event.preventDefault()
    if (!accountName.trim()) return
    await accountsApi.create({ name: accountName, type: accountType })
    setAccountName('')
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
        <h2>Contas</h2>
        <form className="form-row" onSubmit={handleCreateAccount}>
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
          <button className="btn" type="submit">
            Adicionar
          </button>
        </form>

        {accounts.length === 0 ? (
          <p className="empty-hint">Nenhuma conta cadastrada ainda.</p>
        ) : (
          <table className="data-table">
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td>{account.name}</td>
                  <td>{ACCOUNT_TYPE_LABELS[account.type]}</td>
                  <td>
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
