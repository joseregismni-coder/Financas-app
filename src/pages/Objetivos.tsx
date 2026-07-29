import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Card from '../components/Card'
import './Objetivos.css'
import './CrudPages.css'

type Objetivo = {
  id: string
  nome: string
  valor_meta: number | string | null
  data_alvo: string | null
  valor_atual: number | string | null
  poupanca_mensal_necessaria: number | string | null
}

type FormState = { nome: string; valor_meta: string; data_alvo: string }

const emptyForm = (): FormState => ({ nome: '', valor_meta: '', data_alvo: '' })
const money = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' })
const dateFormatter = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium' })

function Objetivos() {
  const [goals, setGoals] = useState<Objetivo[]>([])
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadGoals() {
    setIsLoading(true)
    setError(null)
    const { data: userData, error: userError } = await supabase.auth.getUser()
    const userId = userData.user?.id
    if (userError || !userId) {
      setError(userError?.message ?? 'Não foi possível identificar o utilizador.')
      setIsLoading(false)
      return
    }

    const { data, error: queryError } = await supabase
      .from('objetivos_progresso')
      .select('id, nome, valor_meta, data_alvo, valor_atual, poupanca_mensal_necessaria')
      .eq('user_id', userId)
      .order('data_alvo', { ascending: true })

    if (queryError) setError(queryError.message)
    else setGoals((data ?? []) as Objetivo[])
    setIsLoading(false)
  }

  useEffect(() => { void loadGoals() }, [])

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm())
    setError(null)
  }

  function startEdit(goal: Objetivo) {
    setEditingId(goal.id)
    setForm({ nome: goal.nome, valor_meta: String(goal.valor_meta ?? ''), data_alvo: goal.data_alvo?.slice(0, 10) ?? '' })
    setShowForm(true)
    setError(null)
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setError(null)
    const { data: userData, error: userError } = await supabase.auth.getUser()
    const userId = userData.user?.id
    if (userError || !userId) {
      setError(userError?.message ?? 'Não foi possível identificar o utilizador.')
      setIsSaving(false)
      return
    }

    const payload = { user_id: userId, nome: form.nome, valor_meta: Number(form.valor_meta), data_alvo: form.data_alvo || null }
    const { error: saveError } = editingId
      ? await supabase.from('objetivos').update(payload).eq('id', editingId).eq('user_id', userId)
      : await supabase.from('objetivos').insert(payload)

    if (saveError) setError(saveError.message)
    else { closeForm(); await loadGoals() }
    setIsSaving(false)
  }

  async function remove(goalId: string) {
    if (!window.confirm('Apagar este objetivo? Os investimentos associados ficarão sem objetivo.')) return
    setError(null)
    const { data: userData, error: userError } = await supabase.auth.getUser()
    const userId = userData.user?.id
    if (userError || !userId) { setError(userError?.message ?? 'Não foi possível identificar o utilizador.'); return }

    const { error: unlinkError } = await supabase
      .from('investimentos')
      .update({ user_id: userId, objetivo_id: null })
      .eq('objetivo_id', goalId)
      .eq('user_id', userId)

    if (unlinkError) { setError(unlinkError.message); return }

    const { error: deleteError } = await supabase
      .from('objetivos')
      .delete()
      .eq('id', goalId)
      .eq('user_id', userId)

    if (deleteError) setError(deleteError.message)
    else await loadGoals()
  }

  return (
    <section className="crud-page">
      <div className="page-heading">
        <div><h1>Objetivos</h1><p>Define metas e acompanha o teu progresso.</p></div>
        <button className="button button--primary" onClick={() => { closeForm(); setShowForm(true) }} type="button">Adicionar objetivo</button>
      </div>

      {showForm && <form className="crud-form" onSubmit={save}>
        <h2>{editingId ? 'Editar objetivo' : 'Novo objetivo'}</h2>
        <div className="form-grid objetivos-form">
          <label>Nome<input required value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} /></label>
          <label>Valor meta<input type="number" min="0" step="0.01" required value={form.valor_meta} onChange={(event) => setForm({ ...form, valor_meta: event.target.value })} /></label>
          <label>Data alvo (opcional)<input type="date" value={form.data_alvo} onChange={(event) => setForm({ ...form, data_alvo: event.target.value })} /></label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions"><button className="button button--secondary" onClick={closeForm} type="button">Cancelar</button><button className="button button--primary" disabled={isSaving} type="submit">{isSaving ? 'A guardar...' : 'Guardar'}</button></div>
      </form>}

      {error && !showForm && <p className="form-error" role="alert">{error}</p>}
      {isLoading ? <p className="page-status">A carregar...</p> : (
        <div className="goals-page__grid">
          {goals.length === 0 ? <Card><p className="empty">Ainda não existem objetivos.</p><div className="empty-action"><button className="button button--primary" onClick={() => { closeForm(); setShowForm(true) }} type="button">Criar objetivo</button></div></Card> : goals.map((goal) => {
            const current = Number(goal.valor_atual ?? 0)
            const target = Number(goal.valor_meta ?? 0)
            const progress = target > 0 ? Math.min((current / target) * 100, 100) : 0
            const monthlySaving = goal.poupanca_mensal_necessaria === null ? null : Number(goal.poupanca_mensal_necessaria)
            return <Card className="goal-card" key={goal.id}>
              <div className="goal-card__title"><h2>{goal.nome}</h2><div className="row-actions"><button onClick={() => startEdit(goal)} type="button">Editar</button><button onClick={() => void remove(goal.id)} type="button">Apagar</button></div></div>
              <strong className="goal-card__amount">{money.format(current)} <span>/ {money.format(target)}</span></strong>
              <div className="goal__track" aria-label={`${progress.toFixed(0)}% do objetivo concluído`}><div className="goal__progress" style={{ width: `${progress}%` }} /></div>
              <span className="goal-card__percentage">{progress.toFixed(0)}% concluído</span>
              {goal.data_alvo && <p>Data alvo: {dateFormatter.format(new Date(`${goal.data_alvo.slice(0, 10)}T00:00:00`))}</p>}
              {monthlySaving !== null && <p className="goal-card__saving">Precisas poupar {money.format(monthlySaving)}/mês para atingir a meta</p>}
            </Card>
          })}
        </div>
      )}
    </section>
  )
}

export default Objetivos
