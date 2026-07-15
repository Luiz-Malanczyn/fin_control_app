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
  const [dueDay, setDueDay] = useState('')
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null)

  const [categoryName, setCategoryName] = useState('')
  const [groupName, setGroupName] = useState('')
  const [groupIsCreditCard, setGroupIsCreditCard] = useState(false)
  const [groupDueDay, setGroupDueDay] = useState('')

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
    setDueDay(account.due_day ? String(account.due_day) : '')
  }

  function cancelEditAccount() {
    setEditingAccountId(null)
    setAccountName('')
    setOpeningBalance('0')
    setOpeningBalanceDate(today())
    setDueDay('')
  }

  async function handleSubmitAccount(event: FormEvent) {
    event.preventDefault()
    if (!accountName.trim()) return
    const payload = {
      name: accountName,
      type: accountType,
      opening_balance: Number(openingBalance.replace(',', '.')) || 0,
      opening_balance_date: openingBalanceDate,
      due_day: accountType === 'credit_card' && dueDay ? Number(dueDay) : null,
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
    setDueDay('')
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
    await groupsApi.create({
      name: groupName,
      is_credit_card: groupIsCreditCard,
      due_day: groupIsCreditCard && groupDueDay ? Number(groupDueDay) : null,
    })
    setGroupName('')
    setGroupIsCreditCard(false)
    setGroupDueDay('')
    reload()
  }

  async function patchGroup(group: TransactionGroup, patch: Partial<{ name: string; is_credit_card: boolean; due_day: number | null }>) {
    await groupsApi.update(group.id, patch)
    reload()
  }

  function handleGroupNameBlur(group: TransactionGroup, value: string) {
    const trimmed = value.trim()
    if (!trimmed || trimmed === group.name) return
    patchGroup(group, { name: trimmed })
  }

  function handleGroupDueDayBlur(group: TransactionGroup, value: string) {
    const parsed = Number(value)
    if (!parsed || parsed < 1 || parsed > 31) return
    patchGroup(group, { due_day: parsed })
  }

  async function handlePayGroup(group: TransactionGroup) {
    await groupsApi.pay(group.id)
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
            {accountType === 'credit_card' && (
              <label className="field">
                Dia de vencimento
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={dueDay}
                  onChange={(e) => setDueDay(e.target.value)}
                  placeholder="10"
                  style={{ width: 70 }}
                />
              </label>
            )}
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
                <th>Vencimento</th>
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
                  <td>{account.due_day ? `dia ${account.due_day}` : '—'}</td>
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
          Agrupe transações relacionadas, como "Viagem SP" ou "Reforma". Marque como fatura de
          cartão de crédito pra ganhar um dia de vencimento e poder pagar todas as compras do
          grupo de uma vez.
        </p>
        <form onSubmit={handleCreateGroup}>
          <div className="form-row">
            <label className="field">
              Nome
              <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Viagem SP" />
            </label>
            <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={groupIsCreditCard}
                onChange={(e) => setGroupIsCreditCard(e.target.checked)}
              />
              É fatura de cartão de crédito?
            </label>
            {groupIsCreditCard && (
              <label className="field">
                Dia de vencimento
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={groupDueDay}
                  onChange={(e) => setGroupDueDay(e.target.value)}
                  placeholder="10"
                  style={{ width: 70 }}
                />
              </label>
            )}
            <button className="btn" type="submit">
              Adicionar
            </button>
          </div>
        </form>

        {groups.length === 0 ? (
          <p className="empty-hint">Nenhum grupo cadastrado ainda.</p>
        ) : (
          <table className="data-table data-table-editable" style={{ marginTop: 14 }}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Fatura de cartão?</th>
                <th>Vencimento</th>
                <th>Em aberto</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.id}>
                  <td>
                    <input
                      key={`group-name-${group.id}-${group.name}`}
                      defaultValue={group.name}
                      onBlur={(e) => handleGroupNameBlur(group, e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={group.is_credit_card}
                      onChange={() => patchGroup(group, { is_credit_card: !group.is_credit_card })}
                    />
                  </td>
                  <td>
                    {group.is_credit_card ? (
                      <input
                        key={`group-day-${group.id}-${group.due_day}`}
                        type="number"
                        min={1}
                        max={31}
                        defaultValue={group.due_day ?? ''}
                        onBlur={(e) => handleGroupDueDayBlur(group, e.target.value)}
                        style={{ width: 56 }}
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={Number(group.pending_amount) > 0 ? 'amount-expense' : undefined}>
                    {group.is_credit_card ? formatCurrency(group.pending_amount) : '—'}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {group.is_credit_card && Number(group.pending_amount) > 0 && (
                      <>
                        <button
                          className="btn-ghost"
                          style={{ padding: '4px 8px', fontSize: 12 }}
                          onClick={() => handlePayGroup(group)}
                        >
                          pagar fatura
                        </button>{' '}
                      </>
                    )}
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
