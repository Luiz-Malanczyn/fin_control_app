import { useEffect, useState, type FormEvent } from 'react'
import { accountsApi, categoriesApi, installmentsApi, recurringApi } from '../lib/resources'
import {
  WEEKDAY_LABELS,
  formatCurrency,
  type Account,
  type Category,
  type Installment,
  type RecurringRule,
} from '../lib/types'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function Recurring() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [rules, setRules] = useState<RecurringRule[]>([])
  const [installments, setInstallments] = useState<Installment[]>([])

  const [ruleAccountId, setRuleAccountId] = useState<number | ''>('')
  const [ruleCategoryId, setRuleCategoryId] = useState<number | ''>('')
  const [ruleDescription, setRuleDescription] = useState('')
  const [ruleAmount, setRuleAmount] = useState('')
  const [ruleKind, setRuleKind] = useState<'expense' | 'income'>('expense')
  const [ruleFrequency, setRuleFrequency] = useState<'monthly' | 'weekly'>('monthly')
  const [ruleDayOfMonth, setRuleDayOfMonth] = useState('5')
  const [ruleWeekday, setRuleWeekday] = useState('0')
  const [ruleStartDate, setRuleStartDate] = useState(today())
  const [ruleError, setRuleError] = useState<string | null>(null)

  const [instAccountId, setInstAccountId] = useState<number | ''>('')
  const [instCategoryId, setInstCategoryId] = useState<number | ''>('')
  const [instDescription, setInstDescription] = useState('')
  const [instTotal, setInstTotal] = useState('')
  const [instCount, setInstCount] = useState('12')
  const [instStartDate, setInstStartDate] = useState(today())
  const [instError, setInstError] = useState<string | null>(null)

  function reload() {
    recurringApi.list().then(setRules)
    installmentsApi.list().then(setInstallments)
  }

  useEffect(() => {
    accountsApi.list().then((list) => {
      setAccounts(list)
      if (list.length > 0) {
        setRuleAccountId((prev) => (prev === '' ? list[0].id : prev))
        setInstAccountId((prev) => (prev === '' ? list[0].id : prev))
      }
    })
    categoriesApi.list().then(setCategories)
    reload()
  }, [])

  async function handleCreateRule(event: FormEvent) {
    event.preventDefault()
    setRuleError(null)
    const parsedAmount = Number(ruleAmount.replace(',', '.'))
    if (ruleAccountId === '' || !ruleDescription.trim() || !parsedAmount || parsedAmount <= 0) {
      setRuleError('Preencha conta, descrição e um valor maior que zero.')
      return
    }
    await recurringApi.create({
      account_id: ruleAccountId,
      category_id: ruleCategoryId === '' ? null : ruleCategoryId,
      description: ruleDescription,
      amount: parsedAmount,
      kind: ruleKind,
      frequency: ruleFrequency,
      day_of_month: ruleFrequency === 'monthly' ? Number(ruleDayOfMonth) : null,
      weekday: ruleFrequency === 'weekly' ? Number(ruleWeekday) : null,
      start_date: ruleStartDate,
    })
    setRuleDescription('')
    setRuleAmount('')
    reload()
  }

  async function patchRule(rule: RecurringRule, patch: Record<string, unknown>) {
    await recurringApi.update(rule.id, patch)
    reload()
  }

  function handleRuleDescriptionBlur(rule: RecurringRule, value: string) {
    const trimmed = value.trim()
    if (!trimmed || trimmed === rule.description) return
    patchRule(rule, { description: trimmed })
  }

  function handleRuleAmountBlur(rule: RecurringRule, value: string) {
    const parsed = Number(value.replace(',', '.'))
    if (!parsed || parsed <= 0) return
    patchRule(rule, { amount: parsed })
  }

  function handleRuleDayBlur(rule: RecurringRule, value: string) {
    const parsed = Number(value)
    if (!parsed || parsed < 1 || parsed > 31) return
    patchRule(rule, { day_of_month: parsed })
  }

  async function handleCreateInstallment(event: FormEvent) {
    event.preventDefault()
    setInstError(null)
    const parsedTotal = Number(instTotal.replace(',', '.'))
    const parsedCount = Number(instCount)
    if (instAccountId === '' || !instDescription.trim() || !parsedTotal || parsedTotal <= 0 || parsedCount <= 0) {
      setInstError('Preencha conta, descrição, valor total e número de parcelas.')
      return
    }
    await installmentsApi.create({
      account_id: instAccountId,
      category_id: instCategoryId === '' ? null : instCategoryId,
      description: instDescription,
      total_amount: parsedTotal,
      installment_count: parsedCount,
      start_date: instStartDate,
    })
    setInstDescription('')
    setInstTotal('')
    reload()
  }

  async function patchInstallment(inst: Installment, patch: Record<string, unknown>) {
    await installmentsApi.update(inst.id, patch)
    reload()
  }

  function handleInstallmentDescriptionBlur(inst: Installment, value: string) {
    const trimmed = value.trim()
    if (!trimmed || trimmed === inst.description) return
    patchInstallment(inst, { description: trimmed })
  }

  return (
    <div>
      <div className="page-header">
        <h1>Recorrências & parcelas</h1>
      </div>

      <div className="card">
        <h2>Conta fixa mensal ou semanal</h2>
        <form onSubmit={handleCreateRule}>
          <div className="form-row">
            <label className="field">
              Conta
              <select value={ruleAccountId} onChange={(e) => setRuleAccountId(Number(e.target.value))}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Categoria
              <select
                value={ruleCategoryId}
                onChange={(e) => setRuleCategoryId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">Sem categoria</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Tipo
              <select value={ruleKind} onChange={(e) => setRuleKind(e.target.value as 'expense' | 'income')}>
                <option value="expense">Gasto</option>
                <option value="income">Receita</option>
              </select>
            </label>
          </div>
          <div className="form-row" style={{ marginTop: 10 }}>
            <label className="field" style={{ flex: 1 }}>
              Descrição
              <input value={ruleDescription} onChange={(e) => setRuleDescription(e.target.value)} placeholder="Aluguel" />
            </label>
            <label className="field">
              Valor
              <input value={ruleAmount} onChange={(e) => setRuleAmount(e.target.value)} placeholder="1200,00" inputMode="decimal" />
            </label>
            <label className="field">
              Frequência
              <select value={ruleFrequency} onChange={(e) => setRuleFrequency(e.target.value as 'monthly' | 'weekly')}>
                <option value="monthly">Mensal</option>
                <option value="weekly">Semanal</option>
              </select>
            </label>
            {ruleFrequency === 'monthly' ? (
              <label className="field">
                Dia do mês
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={ruleDayOfMonth}
                  onChange={(e) => setRuleDayOfMonth(e.target.value)}
                />
              </label>
            ) : (
              <label className="field">
                Dia da semana
                <select value={ruleWeekday} onChange={(e) => setRuleWeekday(e.target.value)}>
                  {WEEKDAY_LABELS.map((label, index) => (
                    <option key={label} value={index}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              A partir de
              <input type="date" value={ruleStartDate} onChange={(e) => setRuleStartDate(e.target.value)} />
            </label>
            <button className="btn" type="submit">
              Salvar
            </button>
          </div>
        </form>
        {ruleError && <p className="auth-error" style={{ marginTop: 10 }}>{ruleError}</p>}

        {rules.length === 0 ? (
          <p className="empty-hint" style={{ marginTop: 14 }}>Nenhuma conta fixa cadastrada ainda.</p>
        ) : (
          <div className="tablewrap">
            <table className="data-table data-table-editable" style={{ marginTop: 14 }}>
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Conta</th>
                  <th>Categoria</th>
                  <th>Valor</th>
                  <th>Frequência</th>
                  <th>Dia</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td>
                      <input
                        key={`rule-desc-${rule.id}-${rule.description}`}
                        defaultValue={rule.description}
                        onBlur={(e) => handleRuleDescriptionBlur(rule, e.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        value={rule.account_id}
                        onChange={(e) => patchRule(rule, { account_id: Number(e.target.value) })}
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
                        value={rule.category_id ?? ''}
                        onChange={(e) =>
                          patchRule(rule, { category_id: e.target.value ? Number(e.target.value) : null })
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
                    <td className={rule.kind === 'expense' ? 'amount-expense' : 'amount-income'}>
                      <input
                        key={`rule-amount-${rule.id}-${rule.amount}`}
                        defaultValue={rule.amount}
                        onBlur={(e) => handleRuleAmountBlur(rule, e.target.value)}
                        inputMode="decimal"
                        style={{ width: 80 }}
                      />
                    </td>
                    <td>
                      <select
                        value={rule.frequency}
                        onChange={(e) => patchRule(rule, { frequency: e.target.value })}
                      >
                        <option value="monthly">Mensal</option>
                        <option value="weekly">Semanal</option>
                      </select>
                    </td>
                    <td>
                      {rule.frequency === 'monthly' ? (
                        <input
                          key={`rule-day-${rule.id}-${rule.day_of_month}`}
                          type="number"
                          min={1}
                          max={31}
                          defaultValue={rule.day_of_month ?? 5}
                          onBlur={(e) => handleRuleDayBlur(rule, e.target.value)}
                          style={{ width: 56 }}
                        />
                      ) : (
                        <select
                          value={rule.weekday ?? 0}
                          onChange={(e) => patchRule(rule, { weekday: Number(e.target.value) })}
                        >
                          {WEEKDAY_LABELS.map((label, index) => (
                            <option key={label} value={index}>
                              {label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn-danger" onClick={() => recurringApi.remove(rule.id).then(reload)}>
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

      <div className="card">
        <h2>Compra parcelada</h2>
        <form onSubmit={handleCreateInstallment}>
          <div className="form-row">
            <label className="field">
              Conta
              <select value={instAccountId} onChange={(e) => setInstAccountId(Number(e.target.value))}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Categoria
              <select
                value={instCategoryId}
                onChange={(e) => setInstCategoryId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">Sem categoria</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" style={{ flex: 1 }}>
              Descrição
              <input value={instDescription} onChange={(e) => setInstDescription(e.target.value)} placeholder="Notebook" />
            </label>
          </div>
          <div className="form-row" style={{ marginTop: 10 }}>
            <label className="field">
              Valor total
              <input
                value={instTotal}
                onChange={(e) => setInstTotal(e.target.value)}
                placeholder="3000,00"
                inputMode="decimal"
              />
            </label>
            <label className="field">
              Parcelas
              <input
                type="number"
                min={1}
                max={120}
                value={instCount}
                onChange={(e) => setInstCount(e.target.value)}
              />
            </label>
            <label className="field">
              1ª parcela em
              <input type="date" value={instStartDate} onChange={(e) => setInstStartDate(e.target.value)} />
            </label>
            <button className="btn" type="submit">
              Salvar
            </button>
          </div>
        </form>
        {instError && <p className="auth-error" style={{ marginTop: 10 }}>{instError}</p>}

        {installments.length === 0 ? (
          <p className="empty-hint" style={{ marginTop: 14 }}>Nenhum parcelamento cadastrado ainda.</p>
        ) : (
          <div className="tablewrap">
            <table className="data-table data-table-editable" style={{ marginTop: 14 }}>
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Conta</th>
                  <th>Categoria</th>
                  <th>Parcela</th>
                  <th>Total</th>
                  <th>1ª parcela</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {installments.map((inst) => (
                  <tr key={inst.id}>
                    <td>
                      <input
                        key={`inst-desc-${inst.id}-${inst.description}`}
                        defaultValue={inst.description}
                        onBlur={(e) => handleInstallmentDescriptionBlur(inst, e.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        value={inst.account_id}
                        onChange={(e) => patchInstallment(inst, { account_id: Number(e.target.value) })}
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
                        value={inst.category_id ?? ''}
                        onChange={(e) =>
                          patchInstallment(inst, { category_id: e.target.value ? Number(e.target.value) : null })
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
                    <td className="amount-expense">
                      {formatCurrency(inst.installment_amount)} × {inst.installment_count}
                    </td>
                    <td>{formatCurrency(inst.total_amount)}</td>
                    <td>
                      <input
                        type="date"
                        value={inst.start_date}
                        onChange={(e) => patchInstallment(inst, { start_date: e.target.value })}
                      />
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn-danger" onClick={() => installmentsApi.remove(inst.id).then(reload)}>
                        remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="empty-hint" style={{ marginTop: 10 }}>
          Valor total e número de parcelas não podem ser alterados depois de criado — remova e cadastre de novo se precisar mudar isso.
        </p>
      </div>
    </div>
  )
}
