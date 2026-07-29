import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Card from '../components/Card'
import './CrudPages.css'

type Tipo = 'entrada' | 'despesa'
type Lancamento = { id: string; tipo: Tipo; categoria: string; nota: string | null; valor: number | string; forma_pagamento: string | null; data: string }
type FormState = { tipo: Tipo; categoria: string; nota: string; valor: string; forma_pagamento: string; data: string }

const categories: Record<Tipo, string[]> = {
  entrada: ['Salário', 'Freelance', 'Reembolso', 'Outro'],
  despesa: ['Aluguel', 'Supermercado', 'Transporte', 'Outro'],
}
const today = () => new Date().toISOString().slice(0, 10)
const emptyForm = (): FormState => ({ tipo: 'entrada', categoria: 'Salário', nota: '', valor: '', forma_pagamento: '', data: today() })
const money = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' })
const monthLabel = (value: string) => {
  const date = new Date(`${value}-01T00:00:00`)
  const monthName = new Intl.DateTimeFormat('pt-PT', { month: 'long' }).format(date)
  return `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${date.getFullYear()}`
}

function Lancamentos() {
  const [items, setItems] = useState<Lancamento[]>([])
  const [typeFilter, setTypeFilter] = useState<'todos' | Tipo>('todos')
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadLancamentos() {
    setIsLoading(true); setError(null)
    const { data: userData, error: userError } = await supabase.auth.getUser()
    const userId = userData.user?.id
    if (userError || !userId) { setError(userError?.message ?? 'Não foi possível identificar o utilizador.'); setIsLoading(false); return }
    let query = supabase.from('lancamentos').select('id, tipo, categoria, nota, valor, forma_pagamento, data').eq('user_id', userId).order('data', { ascending: false })
    if (typeFilter !== 'todos') query = query.eq('tipo', typeFilter)
    if (month) {
      const [year, monthNumber] = month.split('-').map(Number)
      const nextMonth = new Date(year, monthNumber, 1).toISOString().slice(0, 10)
      query = query.gte('data', `${month}-01`).lt('data', nextMonth)
    }
    const [result, monthsResult] = await Promise.all([
      query,
      supabase.from('lancamentos').select('data').eq('user_id', userId).order('data', { ascending: false }),
    ])
    const queryError = result.error ?? monthsResult.error
    if (queryError) setError(queryError.message)
    else {
      setItems((result.data ?? []) as Lancamento[])
      const months = [...new Set((monthsResult.data ?? []).map((item) => item.data.slice(0, 7)))]
      const currentMonth = new Date().toISOString().slice(0, 7)
      setAvailableMonths(months.includes(currentMonth) ? months : [currentMonth, ...months])
    }
    setIsLoading(false)
  }

  useEffect(() => { void loadLancamentos() }, [typeFilter, month])

  function updateForm<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => key === 'tipo' ? { ...current, tipo: value as Tipo, categoria: categories[value as Tipo][0] } : { ...current, [key]: value })
  }

  function startEdit(item: Lancamento) {
    setEditingId(item.id); setForm({ tipo: item.tipo, categoria: item.categoria, nota: item.nota ?? '', valor: String(item.valor), forma_pagamento: item.forma_pagamento ?? '', data: item.data.slice(0, 10) }); setShowForm(true); setError(null)
  }

  function closeForm() { setShowForm(false); setEditingId(null); setForm(emptyForm()); setError(null) }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setIsSaving(true); setError(null)
    const { data: userData, error: userError } = await supabase.auth.getUser(); const userId = userData.user?.id
    if (userError || !userId) { setError(userError?.message ?? 'Não foi possível identificar o utilizador.'); setIsSaving(false); return }
    const payload = { user_id: userId, tipo: form.tipo, categoria: form.categoria, nota: form.nota || null, valor: Number(form.valor), forma_pagamento: form.forma_pagamento || null, data: form.data }
    const { error: saveError } = editingId
      ? await supabase.from('lancamentos').update(payload).eq('id', editingId).eq('user_id', userId)
      : await supabase.from('lancamentos').insert(payload)
    if (saveError) setError(saveError.message); else { closeForm(); await loadLancamentos() }
    setIsSaving(false)
  }

  async function remove(id: string) {
    if (!window.confirm('Apagar este lançamento?')) return
    const { data: userData, error: userError } = await supabase.auth.getUser(); const userId = userData.user?.id
    if (userError || !userId) { setError(userError?.message ?? 'Não foi possível identificar o utilizador.'); return }
    const { error: deleteError } = await supabase.from('lancamentos').delete().eq('id', id).eq('user_id', userId)
    if (deleteError) setError(deleteError.message); else await loadLancamentos()
  }

  return <section className="crud-page"><div className="page-heading"><div><h1>Lançamentos</h1><p>Controla as tuas entradas e despesas.</p></div><button className="button button--primary" onClick={() => { closeForm(); setShowForm(true) }} type="button">Adicionar lançamento</button></div>
    {showForm && <form className="crud-form" onSubmit={save}><h2>{editingId ? 'Editar lançamento' : 'Novo lançamento'}</h2><div className="form-grid">
      <label>Tipo<select value={form.tipo} onChange={(e) => updateForm('tipo', e.target.value as Tipo)}><option value="entrada">Entrada</option><option value="despesa">Despesa</option></select></label>
      <label>Categoria<select value={form.categoria} onChange={(e) => updateForm('categoria', e.target.value)}>{categories[form.tipo].map((category) => <option key={category}>{category}</option>)}</select></label>
      <label>Nota<input value={form.nota} onChange={(e) => updateForm('nota', e.target.value)} /></label>
      <label>Valor<input type="number" min="0" step="0.01" required value={form.valor} onChange={(e) => updateForm('valor', e.target.value)} /></label>
      <label>Forma de pagamento<input value={form.forma_pagamento} onChange={(e) => updateForm('forma_pagamento', e.target.value)} /></label>
      <label>Data<input type="date" required value={form.data} onChange={(e) => updateForm('data', e.target.value)} /></label>
    </div>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button className="button button--secondary" onClick={closeForm} type="button">Cancelar</button><button className="button button--primary" disabled={isSaving} type="submit">{isSaving ? 'A guardar...' : 'Guardar'}</button></div></form>}
    <div className="filters"><label>Mês<select value={month} onChange={(e) => setMonth(e.target.value)}>{availableMonths.map((value) => <option value={value} key={value}>{monthLabel(value)}</option>)}</select></label><label>Tipo<select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as 'todos' | Tipo)}><option value="todos">Todos</option><option value="entrada">Entradas</option><option value="despesa">Despesas</option></select></label></div>
    {error && !showForm && <p className="form-error" role="alert">{error}</p>}{isLoading ? <p className="page-status">A carregar...</p> : items.length === 0 ? <Card><p className="empty">Sem lançamentos neste período.</p><div className="empty-action"><button className="button button--primary" onClick={() => { closeForm(); setShowForm(true) }} type="button">Adicionar lançamento</button></div></Card> : <div className="card-stack">{items.map((item) => <Card className="data-row lancamento-card" key={item.id}><div><strong>{item.categoria}</strong><span>{item.nota || 'Sem nota'} · {item.data}</span></div><strong className={item.tipo === 'entrada' ? 'value value--positive' : 'value value--negative'}>{money.format(Number(item.valor))}</strong><div className="row-actions"><button onClick={() => startEdit(item)} type="button">Editar</button><button onClick={() => void remove(item.id)} type="button">Apagar</button></div></Card>)}</div>}
  </section>
}
export default Lancamentos
