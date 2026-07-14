import { useEffect, useState, type FormEvent } from 'react'
import { householdApi } from '../lib/resources'
import type { Household } from '../lib/types'
import { useAuth } from '../context/AuthContext'

export default function HouseholdPage() {
  const { refreshUser } = useAuth()
  const [household, setHousehold] = useState<Household | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [copied, setCopied] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)
  const [joinLoading, setJoinLoading] = useState(false)

  function reload() {
    householdApi.me().then((h) => {
      setHousehold(h)
      setNameDraft(h.name)
    })
  }

  useEffect(reload, [])

  async function handleRename(event: FormEvent) {
    event.preventDefault()
    if (!nameDraft.trim()) return
    const updated = await householdApi.rename(nameDraft)
    setHousehold(updated)
  }

  async function handleRegenerate() {
    if (!confirm('O código de convite atual deixa de funcionar. Continuar?')) return
    const updated = await householdApi.regenerateInvite()
    setHousehold(updated)
    setCopied(false)
  }

  function copyInvite() {
    if (!household) return
    const url = `${window.location.origin}/register?invite=${household.invite_code}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleJoin(event: FormEvent) {
    event.preventDefault()
    setJoinError(null)
    if (!joinCode.trim()) return
    setJoinLoading(true)
    try {
      await householdApi.join(joinCode.trim().toUpperCase())
      await refreshUser()
      setJoinCode('')
      reload()
    } catch {
      setJoinError('Código de convite inválido.')
    } finally {
      setJoinLoading(false)
    }
  }

  if (!household) return null

  return (
    <div>
      <div className="page-header">
        <h1>Lar</h1>
      </div>

      <div className="card">
        <h2>Nome</h2>
        <form className="form-row" onSubmit={handleRename}>
          <label className="field" style={{ flex: 1 }}>
            <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
          </label>
          <button className="btn" type="submit" disabled={nameDraft === household.name}>
            Salvar
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Convidar</h2>
        <p className="empty-hint" style={{ marginTop: -8, marginBottom: 12 }}>
          Quem entrar com esse link passa a ver e lançar no mesmo lar que você — mesmas contas,
          categorias e transações.
        </p>
        <div className="form-row">
          <span className="tag" style={{ fontSize: 14, padding: '6px 12px' }}>
            {household.invite_code}
          </span>
          <button className="btn" type="button" onClick={copyInvite}>
            {copied ? 'Link copiado!' : 'Copiar link de convite'}
          </button>
          <button className="btn-ghost" type="button" onClick={handleRegenerate}>
            Gerar novo código
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Quem mora aqui</h2>
        <table className="data-table">
          <tbody>
            {household.members.map((member) => (
              <tr key={member.id}>
                <td>{member.name}</td>
                <td className="empty-hint">{member.email}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Entrar em outro lar</h2>
        <p className="empty-hint" style={{ marginTop: -8, marginBottom: 12 }}>
          Se você já tinha uma conta e ganhou um convite depois, colar o código aqui move você para
          o lar de quem convidou. O que você já tinha lançado no seu lar antigo não aparece mais.
        </p>
        <form className="form-row" onSubmit={handleJoin}>
          <label className="field">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Código de convite"
            />
          </label>
          <button className="btn" type="submit" disabled={joinLoading}>
            {joinLoading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        {joinError && <p className="auth-error" style={{ marginTop: 10 }}>{joinError}</p>}
      </div>
    </div>
  )
}
