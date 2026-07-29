import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import Card from '../components/Card'
import './CrudPages.css'
import './Investimentos.css'

type Investimento = { id: string; tipo_investimento: string; data: string; valor_investido: number | string; rendimento_percent: number | string; objetivo_id: string | null }
type Objetivo = { id: string; nome: string }
type FormState = { tipo_investimento: string; data: string; valor_investido: string; rendimento_percent: string; objetivo_id: string }
type NewGoalForm = { nome: string; valor_meta: string; data_alvo: string }
type InvestmentGroup = { key: string; tipo: string; objetivoId: string | null; items: Investimento[] }

const NEW_GOAL = '__new_goal__'
const today = () => new Date().toISOString().slice(0, 10)
const emptyForm = (): FormState => ({ tipo_investimento: '', data: today(), valor_investido: '', rendimento_percent: '', objetivo_id: '' })
const emptyNewGoal = (): NewGoalForm => ({ nome: '', valor_meta: '', data_alvo: '' })
const money = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' })

function Investimentos() {
  const [items, setItems] = useState<Investimento[]>([])
  const [goals, setGoals] = useState<Objetivo[]>([])
  const [form, setForm] = useState<FormState>(emptyForm)
  const [newGoal, setNewGoal] = useState<NewGoalForm>(emptyNewGoal)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [quickGroup, setQuickGroup] = useState<InvestmentGroup | null>(null)
  const [quickValue, setQuickValue] = useState('')
  const [quickDate, setQuickDate] = useState(today())
  const [quickYield, setQuickYield] = useState('0')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isQuickSaving, setIsQuickSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadInvestimentos() {
    setIsLoading(true); setError(null)
    const { data: userData, error: userError } = await supabase.auth.getUser(); const userId = userData.user?.id
    if (userError || !userId) { setError(userError?.message ?? 'Não foi possível identificar o utilizador.'); setIsLoading(false); return }
    const [investimentosResult, objetivosResult] = await Promise.all([
      supabase.from('investimentos').select('id, tipo_investimento, data, valor_investido, rendimento_percent, objetivo_id').eq('user_id', userId).order('data', { ascending: false }),
      supabase.from('objetivos').select('id, nome').eq('user_id', userId).order('nome'),
    ])
    const requestError = investimentosResult.error ?? objetivosResult.error
    if (requestError) setError(requestError.message)
    else { setItems((investimentosResult.data ?? []) as Investimento[]); setGoals((objetivosResult.data ?? []) as Objetivo[]) }
    setIsLoading(false)
  }

  useEffect(() => { void loadInvestimentos() }, [])

  const groups = useMemo(() => {
    const grouped = new Map<string, InvestmentGroup>()
    items.forEach((item) => {
      const key = `${item.tipo_investimento}::${item.objetivo_id ?? 'none'}`
      const group = grouped.get(key) ?? { key, tipo: item.tipo_investimento, objetivoId: item.objetivo_id, items: [] }
      group.items.push(item); grouped.set(key, group)
    })
    return [...grouped.values()]
  }, [items])

  function updateForm<Key extends keyof FormState>(key: Key, value: FormState[Key]) { setForm((current) => ({ ...current, [key]: value })) }
  function closeForm() { setShowForm(false); setEditingId(null); setForm(emptyForm()); setNewGoal(emptyNewGoal()); setError(null) }
  function startEdit(item: Investimento) { setEditingId(item.id); setForm({ tipo_investimento: item.tipo_investimento, data: item.data.slice(0, 10), valor_investido: String(item.valor_investido), rendimento_percent: String(item.rendimento_percent), objetivo_id: item.objetivo_id ?? '' }); setNewGoal(emptyNewGoal()); setShowForm(true); setError(null) }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setIsSaving(true); setError(null)
    const { data: userData, error: userError } = await supabase.auth.getUser(); const userId = userData.user?.id
    if (userError || !userId) { setError(userError?.message ?? 'Não foi possível identificar o utilizador.'); setIsSaving(false); return }
    let objetivoId = form.objetivo_id || null
    if (objetivoId === NEW_GOAL) {
      if (!newGoal.nome.trim()) { setError('Indica o nome do novo objetivo.'); setIsSaving(false); return }
      const { data: createdGoal, error: goalError } = await supabase.from('objetivos').insert({ user_id: userId, nome: newGoal.nome.trim(), valor_meta: newGoal.valor_meta ? Number(newGoal.valor_meta) : null, data_alvo: newGoal.data_alvo || null }).select('id').single()
      if (goalError || !createdGoal) { setError(goalError?.message ?? 'Não foi possível criar o objetivo.'); setIsSaving(false); return }
      objetivoId = createdGoal.id
    }
    const payload = { user_id: userId, tipo_investimento: form.tipo_investimento, data: form.data, valor_investido: Number(form.valor_investido), rendimento_percent: Number(form.rendimento_percent || 0), objetivo_id: objetivoId }
    const { error: saveError } = editingId ? await supabase.from('investimentos').update(payload).eq('id', editingId).eq('user_id', userId) : await supabase.from('investimentos').insert(payload)
    if (saveError) setError(saveError.message); else { closeForm(); await loadInvestimentos() }
    setIsSaving(false)
  }

  async function addValue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!quickGroup) return
    setIsQuickSaving(true); setError(null)
    const { data: userData, error: userError } = await supabase.auth.getUser(); const userId = userData.user?.id
    if (userError || !userId) { setError(userError?.message ?? 'Não foi possível identificar o utilizador.'); setIsQuickSaving(false); return }
    const { error: insertError } = await supabase.from('investimentos').insert({ user_id: userId, tipo_investimento: quickGroup.tipo, objetivo_id: quickGroup.objetivoId, valor_investido: Number(quickValue), data: quickDate, rendimento_percent: Number(quickYield || 0) })
    if (insertError) setError(insertError.message)
    else { setQuickGroup(null); setQuickValue(''); setQuickDate(today()); setQuickYield('0'); await loadInvestimentos() }
    setIsQuickSaving(false)
  }

  async function remove(id: string) {
    if (!window.confirm('Apagar este investimento?')) return
    const { data: userData, error: userError } = await supabase.auth.getUser(); const userId = userData.user?.id
    if (userError || !userId) { setError(userError?.message ?? 'Não foi possível identificar o utilizador.'); return }
    const { error: deleteError } = await supabase.from('investimentos').delete().eq('id', id).eq('user_id', userId)
    if (deleteError) setError(deleteError.message); else await loadInvestimentos()
  }

  return <section className="crud-page"><div className="page-heading"><div><h1>Investimentos</h1><p>Acompanha o valor atual dos teus investimentos.</p></div><button className="button button--primary" onClick={() => { closeForm(); setShowForm(true) }} type="button">Adicionar investimento</button></div>
    {showForm && <form className="crud-form" onSubmit={save}><Card><h2>{editingId ? 'Editar investimento' : 'Novo investimento'}</h2><div className="form-grid"><label>Tipo de investimento<input required value={form.tipo_investimento} onChange={(e) => updateForm('tipo_investimento', e.target.value)} /></label><label>Data<input type="date" required value={form.data} onChange={(e) => updateForm('data', e.target.value)} /></label><label>Valor investido<input type="number" min="0" step="0.01" required value={form.valor_investido} onChange={(e) => updateForm('valor_investido', e.target.value)} /></label><label>Rendimento (%)<input type="number" step="0.01" value={form.rendimento_percent} onChange={(e) => updateForm('rendimento_percent', e.target.value)} /></label><label>Objetivo (opcional)<select value={form.objetivo_id} onChange={(e) => updateForm('objetivo_id', e.target.value)}><option value="">Sem objetivo</option>{goals.map((goal) => <option value={goal.id} key={goal.id}>{goal.nome}</option>)}<option value={NEW_GOAL}>+ Criar novo objetivo</option></select></label></div>
      {form.objetivo_id === NEW_GOAL && <div className="form-grid inline-goal"><label>Nome do objetivo<input required value={newGoal.nome} onChange={(e) => setNewGoal({ ...newGoal, nome: e.target.value })} /></label><label>Valor meta (opcional)<input type="number" min="0" step="0.01" value={newGoal.valor_meta} onChange={(e) => setNewGoal({ ...newGoal, valor_meta: e.target.value })} /></label><label>Data alvo (opcional)<input type="date" value={newGoal.data_alvo} onChange={(e) => setNewGoal({ ...newGoal, data_alvo: e.target.value })} /></label></div>}
      {error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button className="button button--secondary" onClick={closeForm} type="button">Cancelar</button><button className="button button--primary" disabled={isSaving} type="submit">{isSaving ? 'A guardar...' : 'Guardar'}</button></div></Card></form>}
    {quickGroup && <form className="crud-form" onSubmit={addValue}><Card><h2>Adicionar valor a {quickGroup.tipo}</h2><div className="quick-form"><label>Valor<input type="number" min="0" step="0.01" required value={quickValue} onChange={(e) => setQuickValue(e.target.value)} /></label><label>Data<input type="date" required value={quickDate} onChange={(e) => setQuickDate(e.target.value)} /></label><label>Rendimento (%)<input type="number" step="0.01" value={quickYield} onChange={(e) => setQuickYield(e.target.value)} /></label></div>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button className="button button--secondary" onClick={() => setQuickGroup(null)} type="button">Cancelar</button><button className="button button--primary" disabled={isQuickSaving} type="submit">{isQuickSaving ? 'A guardar...' : 'Adicionar valor'}</button></div></Card></form>}
    {error && !showForm && !quickGroup && <p className="form-error" role="alert">{error}</p>}{isLoading ? <p className="page-status">A carregar...</p> : <div className="investment-groups">{groups.length === 0 ? <Card><p className="empty">Ainda não existem investimentos.</p><div className="empty-action"><button className="button button--primary" onClick={() => { closeForm(); setShowForm(true) }} type="button">Adicionar investimento</button></div></Card> : groups.map((group) => { const goalName = goals.find((goal) => goal.id === group.objetivoId)?.nome; const total = group.items.reduce((sum, item) => sum + Number(item.valor_investido) * (1 + Number(item.rendimento_percent) / 100), 0); return <Card className="investment-group" key={group.key}><div className="investment-group__header"><div><h2>{group.tipo}</h2><span>{goalName ?? 'Sem objetivo'} · {group.items.length} registo(s)</span></div><button className="button button--secondary" onClick={() => { setQuickGroup(group); setError(null) }} type="button">+ Adicionar valor</button></div><strong className="investment-group__total">Saldo atual: {money.format(total)}</strong><div className="investment-group__items">{group.items.map((item) => <article className="data-row investment-row" key={item.id}><div><strong>{money.format(Number(item.valor_investido))}</strong><span>{item.data} · rendimento {item.rendimento_percent}%</span></div><div className="row-actions"><button onClick={() => startEdit(item)} type="button">Editar</button><button onClick={() => void remove(item.id)} type="button">Apagar</button></div></article>)}</div></Card> })}</div>}
  </section>
}

export default Investimentos
