import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Chart as ReactChart } from 'react-chartjs-2'
import { BarElement, CategoryScale, Chart as ChartJS, Filler, Legend, LineElement, LinearScale, PointElement, Title, Tooltip } from 'chart.js'
import { supabase } from '../lib/supabase'
import Card from '../components/Card'
import './Dashboard.css'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, Filler)

type ResumoMensal = { mes: string; total_entradas: number | string | null; total_despesas: number | string | null }
type Investimento = { data: string; valor_investido: number | string | null; rendimento_percent: number | string | null; objetivo_id: string | null }
type Objetivo = { id: string; nome: string; valor_meta: number | string | null; valor_atual: number | string | null; poupanca_mensal_necessaria: number | string | null }
type Lancamento = { id: string; data: string; tipo: 'entrada' | 'despesa'; categoria: string | null; nota: string | null; valor: number | string | null }
type DashboardData = { entradas: number; despesas: number; investido: number; objetivos: Objetivo[]; lancamentos: Lancamento[]; investimentos: Investimento[]; resumosMensais: ResumoMensal[] }
type Period = 'current' | '3' | '6' | '12'
type ChartType = 'line' | 'bar'

const currencyFormatter = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' })
const monthFormatter = new Intl.DateTimeFormat('pt-PT', { month: 'short', year: '2-digit' })
const asNumber = (value: number | string | null | undefined) => Number(value ?? 0)
const monthKey = (date: string | null | undefined) => {
  if (!date) return ''
  const normalized = String(date).trim()
  const parsedDate = new Date(normalized)
  if (!Number.isNaN(parsedDate.getTime())) {
    const year = parsedDate.getFullYear()
    const month = String(parsedDate.getMonth() + 1).padStart(2, '0')
    return `${year}-${month}`
  }
  const match = normalized.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?/)
  if (match) {
    const year = match[1]
    const month = String(Number(match[2])).padStart(2, '0')
    return `${year}-${month}`
  }
  return ''
}
const monthKeyFromDate = (date: string | null | undefined) => monthKey(date)
const monthDate = (key: string) => {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1, 1)
}
const getPeriodMonthKeys = (period: Period, referenceDate = new Date()) => {
  const monthCount = period === 'current' ? 1 : Number(period)
  const currentMonth = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}`
  const keys: string[] = []
  const [currentYear, currentMonthNumber] = currentMonth.split('-').map(Number)
  for (let index = monthCount - 1; index >= 0; index -= 1) {
    const date = new Date(currentYear, currentMonthNumber - 1 - index, 1)
    keys.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}
function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>('current')
  const [chartType, setChartType] = useState<ChartType>('line')
  const [isolatedSeries, setIsolatedSeries] = useState<string | null>(null)

  useEffect(() => {
    async function loadDashboard() {
      setError(null)
      const { data: userData, error: userError } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (userError || !userId) { setError(userError?.message ?? 'Não foi possível identificar o utilizador.'); return }

      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
      const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10)
      const [resumoResult, resumosHistoricoResult, investimentosResult, objetivosResult, lancamentosResult] = await Promise.all([
        supabase.from('resumo_mensal').select('total_entradas, total_despesas').eq('user_id', userId).gte('mes', monthStart).lt('mes', nextMonthStart),
        supabase.from('resumo_mensal').select('mes, total_entradas, total_despesas').eq('user_id', userId).order('mes', { ascending: true }),
        supabase.from('investimentos').select('data, valor_investido, rendimento_percent, objetivo_id').eq('user_id', userId).order('data', { ascending: false }),
        supabase.from('objetivos_progresso').select('id, nome, valor_meta, valor_atual, poupanca_mensal_necessaria').eq('user_id', userId),
        supabase.from('lancamentos').select('id, data, tipo, categoria, nota, valor').eq('user_id', userId).order('data', { ascending: false }),
      ])
      const requestError = resumoResult.error ?? resumosHistoricoResult.error ?? investimentosResult.error ?? objetivosResult.error ?? lancamentosResult.error
      if (requestError) { setError(requestError.message); return }

      const resumo = (resumoResult.data ?? []) as ResumoMensal[]
      const investimentos = (investimentosResult.data ?? []) as Investimento[]
      const entradas = resumo.reduce((total, row) => total + asNumber(row.total_entradas), 0)
      const despesas = resumo.reduce((total, row) => total + asNumber(row.total_despesas), 0)
      const investido = investimentos.reduce((total, item) => total + asNumber(item.valor_investido) * (1 + asNumber(item.rendimento_percent) / 100), 0)
      setData({ entradas, despesas, investido, investimentos, objetivos: (objetivosResult.data ?? []) as Objetivo[], lancamentos: (lancamentosResult.data ?? []) as Lancamento[], resumosMensais: (resumosHistoricoResult.data ?? []) as ResumoMensal[] })
    }
    void loadDashboard()
  }, [])

  const chart = useMemo(() => {
    if (!data) return null

    const now = new Date()
    const reserveGoalIds = new Set(data.objetivos.filter((goal) => goal.nome.toLocaleLowerCase('pt-PT').includes('reserva')).map((goal) => goal.id))

    const periodMonthKeys = getPeriodMonthKeys(period, now)
    const monthTotals = new Map<string, { entradas: number; despesas: number; investido: number; reserva: number }>()

    periodMonthKeys.forEach((key) => monthTotals.set(key, { entradas: 0, despesas: 0, investido: 0, reserva: 0 }))

    data.resumosMensais.forEach((summary) => {
      const key = monthKey(summary.mes)
      const totals = monthTotals.get(key)
      if (!totals) return
      totals.entradas += asNumber(summary.total_entradas)
      totals.despesas += asNumber(summary.total_despesas)
    })

    data.investimentos.forEach((item) => {
      const key = monthKeyFromDate(item.data)
      const totals = monthTotals.get(key)
      if (!totals) return
      const value = asNumber(item.valor_investido) * (1 + asNumber(item.rendimento_percent) / 100)
      totals.investido += value
      if (item.objetivo_id && reserveGoalIds.has(item.objetivo_id)) totals.reserva += asNumber(item.valor_investido)
    })

    let entradasAcumuladas = 0
    let despesasAcumuladas = 0
    let investimentosAcumulados = 0
    let reservaAcumulada = 0

    const calculated = periodMonthKeys.map((key) => {
      const totals = monthTotals.get(key)!
      entradasAcumuladas += totals.entradas
      despesasAcumuladas += totals.despesas
      investimentosAcumulados += totals.investido
      reservaAcumulada += totals.reserva
      return {
        key,
        entradas: totals.entradas,
        despesas: totals.despesas,
        investimentos: investimentosAcumulados,
        capital: entradasAcumuladas - despesasAcumuladas + investimentosAcumulados,
        reserva: reservaAcumulada,
      }
    })

    const visible = calculated
    const series = [
      { label: 'Entradas do mês', color: '#22c55e', values: visible.map((item) => item.entradas) },
      { label: 'Despesas do mês', color: '#ef4444', values: visible.map((item) => item.despesas) },
      { label: 'Investimentos acumulados', color: '#6366f1', values: visible.map((item) => item.investimentos) },
      { label: 'Capital total', color: '#94a3b8', values: visible.map((item) => item.capital) },
    ]

    if (reserveGoalIds.size > 0) series.push({ label: 'Reserva de emergência', color: '#f59e0b', values: visible.map((item) => item.reserva) })

    return {
      labels: visible.map((item) => monthFormatter.format(monthDate(item.key))),
      datasets: series.map((seriesItem) => ({ label: seriesItem.label, data: seriesItem.values.map((value) => Number(value)), borderColor: seriesItem.color, backgroundColor: seriesItem.color, borderWidth: 2, pointRadius: chartType === 'line' ? 3 : 0, tension: 0.3, type: chartType, hidden: isolatedSeries !== null && isolatedSeries !== seriesItem.label })),
    }
  }, [chartType, data, isolatedSeries, period])

  useEffect(() => {
    console.log('Dashboard chart recalculado', {
      periodo: period,
      meses: chart?.labels ?? [],
      series: chart?.datasets.map((dataset) => ({ nome: dataset.label, valores: dataset.data })) ?? [],
      resumoNumerico: chart?.datasets.reduce<Record<string, number[]>>((accumulator, dataset) => {
        accumulator[dataset.label] = dataset.data
        return accumulator
      }, {}) ?? {},
      comparacaoCartoes: period === 'current' ? {
        entradas: data?.entradas ?? 0,
        despesas: data?.despesas ?? 0,
        investido: data?.investido ?? 0,
      } : undefined,
    })
  }, [chart, data?.entradas, data?.despesas, data?.investido, period])

  if (error) return <p className="dashboard__status" role="alert">{error}</p>
  if (!data) return <p className="dashboard__status">A carregar...</p>

  const cards = [['Saldo do mês', data.entradas - data.despesas], ['Entradas', data.entradas], ['Despesas', data.despesas], ['Total investido', data.investido]] as const
  const linkedGoalIds = new Set(data.investimentos.map((investment) => investment.objetivo_id).filter((goalId): goalId is string => Boolean(goalId)))

  return <section className="dashboard" id="dashboard"><h1>Dashboard</h1>
    <div className="dashboard__cards">{cards.map(([label, value]) => <Card className="dashboard__card" key={label}><span>{label}</span><strong>{currencyFormatter.format(value)}</strong></Card>)}</div>
    <section className="dashboard__section"><div className="chart-heading"><h2>Evolução financeira</h2><div className="chart-controls"><div className="period-selector" aria-label="Período do gráfico">{([{ value: 'current', label: 'Este mês' }, { value: '3', label: 'Últimos 3 meses' }, { value: '6', label: '6 meses' }, { value: '12', label: '12 meses' }] as const).map(({ value, label }) => <button className={period === value ? 'period-selector__button period-selector__button--active' : 'period-selector__button'} onClick={() => setPeriod(value)} type="button" key={value}>{label}</button>)}</div><button className="button button--secondary" onClick={() => setChartType((type) => type === 'line' ? 'bar' : 'line')} type="button">{chartType === 'line' ? 'Barras' : 'Linhas'}</button></div></div>
      {chart ? <Card className="dashboard__chart"><ReactChart type={chartType} data={chart} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#f5f5f5' }, onClick: (_event, legendItem) => setIsolatedSeries((current) => current === legendItem.text ? null : legendItem.text ?? null) }, tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${currencyFormatter.format(Number(context.parsed.y))}` } } }, scales: { x: { ticks: { color: '#a3a3a3' }, grid: { color: '#2a2a2a' } }, y: { ticks: { color: '#a3a3a3', callback: (value) => `${value} €` }, grid: { color: '#2a2a2a' } } } }} /></Card> : <Card className="dashboard__empty"><p>Ainda não há dados para desenhar a evolução financeira.</p><Link className="button button--primary" to="/lancamentos">Adicionar lançamento</Link></Card>}
    </section>
    <section className="dashboard__section"><h2>Objetivos</h2>{data.objetivos.length === 0 ? <Card className="dashboard__empty"><p>Ainda não existem objetivos.</p><Link className="button button--primary" to="/objetivos">Criar objetivo</Link></Card> : <div className="goals">{data.objetivos.slice(0, 2).map((objetivo) => { const atual = asNumber(objetivo.valor_atual); const meta = asNumber(objetivo.valor_meta); const progress = meta > 0 ? Math.min((atual / meta) * 100, 100) : 0; const isCompleted = meta > 0 && atual >= meta; const hasLinkedInvestment = linkedGoalIds.has(objetivo.id); const monthlySaving = asNumber(objetivo.poupanca_mensal_necessaria); return <Card className="goal" key={objetivo.id}><div className="goal__header"><div className="goal__name"><strong>{objetivo.nome}</strong><span className={hasLinkedInvestment ? 'goal__badge goal__badge--investment' : 'goal__badge'}>{hasLinkedInvestment ? 'Investimento ligado' : 'Poupança manual'}</span></div><span>{currencyFormatter.format(atual)} de {currencyFormatter.format(meta)}</span></div>{isCompleted ? <p className="goal__completed"><span aria-hidden="true">✓</span> Cumprida!</p> : <><div className="goal__track" aria-label={`${progress.toFixed(0)}% do objetivo concluído`}><div className="goal__progress" style={{ width: `${progress}%` }} /></div>{objetivo.poupanca_mensal_necessaria !== null && monthlySaving >= 0 && <p className="goal__saving">Precisas poupar {currencyFormatter.format(monthlySaving)}/mês para atingir a meta.</p>}</>}</Card>})}</div>}{data.objetivos.length > 0 && <Link className="dashboard__goals-link" to="/objetivos">Ver todos</Link>}</section>
    <section className="dashboard__section"><h2>Últimos lançamentos</h2>{data.lancamentos.length === 0 ? <Card className="dashboard__empty"><p>Ainda não existem lançamentos.</p><Link className="button button--primary" to="/lancamentos">Adicionar lançamento</Link></Card> : <Card className="transactions">{data.lancamentos.slice(0, 5).map((lancamento) => <article className="transaction" key={lancamento.id}><div><strong>{lancamento.categoria ?? 'Sem categoria'}</strong>{lancamento.nota && <span>{lancamento.nota}</span>}</div><strong className={lancamento.tipo === 'entrada' ? 'transaction__value transaction__value--income' : 'transaction__value transaction__value--expense'}>{currencyFormatter.format(asNumber(lancamento.valor))}</strong></article>)}</Card>}</section>
  </section>
}

export default Dashboard
