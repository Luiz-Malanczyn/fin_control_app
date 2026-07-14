import { useEffect, useState } from 'react'
import { accountsApi, importApi, type AmountConvention, type ImportPreview, type ImportResult } from '../lib/resources'
import { formatCurrency, type Account } from '../lib/types'

export default function Import() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useState<number | ''>('')
  const [file, setFile] = useState<File | null>(null)

  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [excludedIndices, setExcludedIndices] = useState<Set<number>>(new Set())

  const [dateColumn, setDateColumn] = useState('')
  const [descriptionColumn, setDescriptionColumn] = useState('')
  const [amountColumn, setAmountColumn] = useState('')
  const [dateFormat, setDateFormat] = useState('')
  const [amountConvention, setAmountConvention] = useState<AmountConvention>('income_positive')

  const [result, setResult] = useState<ImportResult | null>(null)
  const [committing, setCommitting] = useState(false)

  useEffect(() => {
    accountsApi.list().then((list) => {
      setAccounts(list)
      if (list.length > 0) setAccountId((prev) => (prev === '' ? list[0].id : prev))
    })
  }, [])

  async function runDetect(targetFile: File, overrides?: Partial<Record<string, string>>) {
    setLoading(true)
    setError(null)
    try {
      const data = await importApi.detect(targetFile, overrides)
      setPreview(data)
      setExcludedIndices(new Set())
      setDateColumn(data.mapping.date_column)
      setDescriptionColumn(data.mapping.description_column)
      setAmountColumn(data.mapping.amount_column)
      setDateFormat(data.mapping.date_format)
      setAmountConvention(data.mapping.amount_convention)
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Não consegui ler esse arquivo.')
      setPreview(null)
    } finally {
      setLoading(false)
    }
  }

  function handleFileChange(newFile: File | null) {
    setFile(newFile)
    setPreview(null)
    setResult(null)
    setExcludedIndices(new Set())
    if (newFile) runDetect(newFile)
  }

  function toggleRow(index: number) {
    setExcludedIndices((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function toggleAll() {
    if (!preview) return
    setExcludedIndices((prev) =>
      prev.size === 0 ? new Set(preview.rows.map((r) => r.index)) : new Set(),
    )
  }

  function refreshWithOverrides(next: Partial<{ date_column: string; description_column: string; amount_column: string; date_format: string; amount_convention: string }>) {
    if (!file) return
    runDetect(file, {
      date_column: dateColumn,
      description_column: descriptionColumn,
      amount_column: amountColumn,
      date_format: dateFormat,
      amount_convention: amountConvention,
      ...next,
    })
  }

  async function handleCommit() {
    if (!file || accountId === '') return
    setCommitting(true)
    setError(null)
    try {
      const data = await importApi.commit(
        accountId,
        file,
        {
          date_column: dateColumn,
          description_column: descriptionColumn,
          amount_column: amountColumn,
          date_format: dateFormat,
          amount_convention: amountConvention,
        },
        Array.from(excludedIndices),
      )
      setResult(data)
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Não foi possível importar.')
    } finally {
      setCommitting(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Importar extrato</h1>
      </div>

      <div className="card">
        <h2>Arquivo</h2>
        <p className="empty-hint" style={{ marginTop: -8, marginBottom: 12 }}>
          CSV ou PDF de extrato de conta ou fatura de cartão. As colunas e o formato são detectados
          automaticamente — confira o preview antes de confirmar.
        </p>
        <div className="form-row">
          <label className="field">
            Conta de destino
            <select value={accountId} onChange={(e) => setAccountId(Number(e.target.value))}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Arquivo
            <input
              type="file"
              accept=".csv,.pdf"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        {loading && <p className="empty-hint" style={{ marginTop: 10 }}>Lendo arquivo…</p>}
        {error && <p className="auth-error" style={{ marginTop: 10 }}>{error}</p>}
      </div>

      {preview && (
        <div className="card">
          <h2>{preview.file_type === 'pdf' ? 'PDF reconhecido' : 'Colunas detectadas'}</h2>

          {preview.file_type === 'csv' && preview.columns && (
            <div className="form-row" style={{ marginBottom: 10 }}>
              <label className="field">
                Coluna da data
                <select value={dateColumn} onChange={(e) => { setDateColumn(e.target.value); refreshWithOverrides({ date_column: e.target.value }) }}>
                  {preview.columns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Coluna da descrição
                <select value={descriptionColumn} onChange={(e) => { setDescriptionColumn(e.target.value); refreshWithOverrides({ description_column: e.target.value }) }}>
                  {preview.columns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Coluna do valor
                <select value={amountColumn} onChange={(e) => { setAmountColumn(e.target.value); refreshWithOverrides({ amount_column: e.target.value }) }}>
                  {preview.columns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Formato da data
                <input
                  value={dateFormat}
                  onChange={(e) => setDateFormat(e.target.value)}
                  onBlur={() => refreshWithOverrides({ date_format: dateFormat })}
                  style={{ width: 90 }}
                />
              </label>
            </div>
          )}

          <div className="form-row" style={{ marginBottom: 14 }}>
            <label className="field">
              Convenção de sinal
              <select
                value={amountConvention}
                onChange={(e) => {
                  const value = e.target.value as AmountConvention
                  setAmountConvention(value)
                  refreshWithOverrides({ amount_convention: value })
                }}
              >
                <option value="income_positive">Positivo = receita</option>
                <option value="expense_positive">Positivo = despesa</option>
                <option value="all_expense">Tudo é despesa</option>
              </select>
            </label>
            <p className="empty-hint" style={{ alignSelf: 'end', paddingBottom: 8 }}>
              {preview.row_count - excludedIndices.size} de {preview.row_count} lançamento(s) serão importados
              {preview.errors.length > 0 ? `, ${preview.errors.length} linha(s) com erro` : ''}.
            </p>
          </div>

          <div className="tablewrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={excludedIndices.size === 0}
                      onChange={toggleAll}
                      title="Selecionar/desmarcar todos"
                    />
                  </th>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.index} className={excludedIndices.has(row.index) ? 'row-excluded' : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        checked={!excludedIndices.has(row.index)}
                        onChange={() => toggleRow(row.index)}
                      />
                    </td>
                    <td>{row.date.split('-').reverse().join('/')}</td>
                    <td>{row.description}</td>
                    <td className={row.kind === 'expense' ? 'amount-expense' : 'amount-income'}>
                      {row.kind === 'expense' ? '-' : '+'} {formatCurrency(row.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.row_count > preview.rows.length && (
            <p className="empty-hint" style={{ marginTop: 6 }}>
              Mostrando {preview.rows.length} de {preview.row_count}.
            </p>
          )}
          {preview.errors.length > 0 && (
            <ul className="empty-hint" style={{ marginTop: 6 }}>
              {preview.errors.slice(0, 10).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}

          <button className="btn" style={{ marginTop: 14 }} onClick={handleCommit} disabled={committing || accountId === ''}>
            {committing ? 'Importando…' : `Confirmar e importar pra ${accounts.find((a) => a.id === accountId)?.name ?? 'conta'}`}
          </button>
        </div>
      )}

      {result && (
        <div className="card">
          <h2>Resultado</h2>
          <p style={{ fontSize: 14 }}>
            <strong>{result.row_count}</strong> lançamento(s) importado(s).
            {result.skipped_duplicates > 0 && ` ${result.skipped_duplicates} duplicado(s) ignorado(s).`}
            {result.errors.length > 0 && ` ${result.errors.length} linha(s) com erro.`}
          </p>
        </div>
      )}
    </div>
  )
}
