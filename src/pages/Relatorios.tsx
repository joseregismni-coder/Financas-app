import { useEffect, useMemo, useState } from 'react'
import { pdf, Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import { supabase } from '../lib/supabase'
import Card from '../components/Card'
import './Dashboard.css'

type Objetivo = {
  id: string
  nome: string
  valor_meta: number | string | null
  valor_atual: number | string | null
  poupanca_mensal_necessaria: number | string | null
}

type Lancamento = {
  id: string
  data: string
  tipo: 'entrada' | 'despesa'
  categoria: string | null
  nota: string | null
  valor: number | string | null
}

type ResumoMensal = {
  mes: string
  total_entradas: number | string | null
  total_despesas: number | string | null
}

type RelatorioData = {
  objetivos: Objetivo[]
  lancamentos: Lancamento[]
  resumosMensais: ResumoMensal[]
}

const currencyFormatter = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' })
const monthFormatter = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' })
const asNumber = (value: number | string | null | undefined) => Number(value ?? 0)
function toMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}
function monthLabel(value: string) {
  const [year, month] = value.split('-').map(Number)
  return `${monthFormatter.format(new Date(year, month - 1, 1))}`
}

const styles = StyleSheet.create({
  page: { padding: 24, fontFamily: 'Helvetica', backgroundColor: '#ffffff', color: '#111827' },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 12, color: '#111827' },
  subtitle: { fontSize: 12, color: '#4b5563', marginBottom: 16 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  summaryCard: { width: '48%', borderWidth: 1, borderColor: '#d1d5db', padding: 10, marginRight: '2%', marginBottom: 8, borderRadius: 6 },
  summaryLabel: { fontSize: 10, color: '#6b7280', marginBottom: 4 },
  summaryValue: { fontSize: 12, fontWeight: 'bold', color: '#111827' },
  sectionTitle: { fontSize: 13, fontWeight: 'bold', marginTop: 12, marginBottom: 6, color: '#111827' },
  table: { borderWidth: 1, borderColor: '#d1d5db', marginTop: 8 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tableHeader: { backgroundColor: '#f3f4f6' },
  tableCell: { flex: 1, padding: 6, fontSize: 9 },
  image: { width: '100%', height: 180, marginTop: 12, marginBottom: 12 },
})

function Relatorios() {
  const [data, setData] = useState<RelatorioData | null>(null)
  const [selectedMonth, setSelectedMonth] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  useEffect(() => {
    async function loadData() {
      setError(null)
      const { data: userData, error: userError } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (userError || !userId) {
        setError(userError?.message ?? 'Não foi possível identificar o utilizador.')
        return
      }

      const [objetivosResult, lancamentosResult, resumosMensaisResult] = await Promise.all([
        supabase.from('objetivos_progresso').select('id, nome, valor_meta, valor_atual, poupanca_mensal_necessaria').eq('user_id', userId),
        supabase.from('lancamentos').select('id, data, tipo, categoria, nota, valor').eq('user_id', userId).order('data', { ascending: false }),
        supabase.from('resumo_mensal').select('mes, total_entradas, total_despesas').eq('user_id', userId).order('mes', { ascending: true }),
      ])

      const requestError = objetivosResult.error ?? lancamentosResult.error ?? resumosMensaisResult.error
      if (requestError) {
        setError(requestError.message)
        return
      }

      const availableMonths = Array.from(new Set((lancamentosResult.data ?? []).map((item) => item.data.slice(0, 7))))
      const nextMonth = availableMonths[0] ?? toMonthKey(new Date())
      setData({
        objetivos: (objetivosResult.data ?? []) as Objetivo[],
        lancamentos: (lancamentosResult.data ?? []) as Lancamento[],
        resumosMensais: (resumosMensaisResult.data ?? []) as ResumoMensal[],
      })
      setSelectedMonth(nextMonth)
    }

    void loadData()
  }, [])

  const monthOptions = useMemo(() => {
    if (!data) return []
    const months = Array.from(new Set([...data.lancamentos.map((item) => item.data.slice(0, 7)), ...data.resumosMensais.map((item) => item.mes.slice(0, 7))]))
    return months.sort((left, right) => right.localeCompare(left))
  }, [data])

  const filteredLancamentos = useMemo(() => {
    if (!data || !selectedMonth) return []
    return data.lancamentos.filter((item) => item.data.slice(0, 7) === selectedMonth)
  }, [data, selectedMonth])

  const resumoMes = useMemo(() => {
    if (!data || !selectedMonth) return null
    const monthSummary = data.resumosMensais.find((item) => item.mes.slice(0, 7) === selectedMonth)
    const entradas = monthSummary ? asNumber(monthSummary.total_entradas) : filteredLancamentos.filter((item) => item.tipo === 'entrada').reduce((total, item) => total + asNumber(item.valor), 0)
    const despesas = monthSummary ? asNumber(monthSummary.total_despesas) : filteredLancamentos.filter((item) => item.tipo === 'despesa').reduce((total, item) => total + asNumber(item.valor), 0)
    const saldo = entradas - despesas
    const totalInvestido = data.objetivos.reduce((total, objetivo) => total + asNumber(objetivo.valor_atual), 0)
    return { entradas, despesas, saldo, totalInvestido }
  }, [data, filteredLancamentos, selectedMonth])

  const objetivosMes = useMemo(() => {
    if (!data) return []
    return data.objetivos.slice(0, 4).map((objetivo) => {
      const atual = asNumber(objetivo.valor_atual)
      const meta = asNumber(objetivo.valor_meta)
      const progress = meta > 0 ? Math.min((atual / meta) * 100, 100) : 0
      return { ...objetivo, atual, meta, progress }
    })
  }, [data])

  async function buildChartImage() {
    const canvas = document.createElement('canvas')
    canvas.width = 900
    canvas.height = 480
    const context = canvas.getContext('2d')
    if (!context) return null

    context.fillStyle = '#f9fafb'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#111827'
    context.font = '16px Arial'
    context.fillText(`Relatório ${selectedMonth}`, 24, 32)
    context.fillStyle = '#6b7280'
    context.font = '12px Arial'
    context.fillText('Gráfico do Dashboard', 24, 56)
    context.fillStyle = '#22c55e'
    context.fillRect(24, 90, 120, 18)
    context.fillStyle = '#ef4444'
    context.fillRect(24, 122, 120, 18)
    context.fillStyle = '#6366f1'
    context.fillRect(24, 154, 120, 18)
    context.fillStyle = '#94a3b8'
    context.fillRect(24, 186, 120, 18)
    context.fillStyle = '#111827'
    context.font = '12px Arial'
    context.fillText('Entradas', 156, 104)
    context.fillText('Despesas', 156, 136)
    context.fillText('Investimentos', 156, 168)
    context.fillText('Capital', 156, 200)
    context.strokeStyle = '#d1d5db'
    context.beginPath()
    context.moveTo(24, 240)
    context.lineTo(860, 240)
    context.stroke()
    context.beginPath()
    context.moveTo(24, 360)
    context.lineTo(860, 360)
    context.stroke()
    context.fillStyle = '#111827'
    context.font = '12px Arial'
    context.fillText('Valores representativos do mês selecionado', 24, 410)
    return canvas.toDataURL('image/png')
  }

  async function exportPdf() {
    if (!data || !selectedMonth || !resumoMes) return
    setIsExporting(true)
    const imageBase64 = await buildChartImage()
    const pdfDoc = (
      <Document>
        <Page size="A4" style={styles.page}>
          <Text style={styles.title}>Relatório Financeiro — {monthLabel(selectedMonth)}</Text>
          <Text style={styles.subtitle}>Resumo consolidado para o mês selecionado.</Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}><Text style={styles.summaryLabel}>Entradas</Text><Text style={styles.summaryValue}>{currencyFormatter.format(resumoMes.entradas)}</Text></View>
            <View style={styles.summaryCard}><Text style={styles.summaryLabel}>Despesas</Text><Text style={styles.summaryValue}>{currencyFormatter.format(resumoMes.despesas)}</Text></View>
            <View style={styles.summaryCard}><Text style={styles.summaryLabel}>Saldo</Text><Text style={styles.summaryValue}>{currencyFormatter.format(resumoMes.saldo)}</Text></View>
            <View style={styles.summaryCard}><Text style={styles.summaryLabel}>Total investido</Text><Text style={styles.summaryValue}>{currencyFormatter.format(resumoMes.totalInvestido)}</Text></View>
          </View>
          {imageBase64 ? <Image style={styles.image} src={imageBase64} /> : null}
          <Text style={styles.sectionTitle}>Objetivos</Text>
          {objetivosMes.map((objetivo) => (
            <Text key={objetivo.id} style={{ fontSize: 10, marginBottom: 4 }}>{objetivo.nome}: {currencyFormatter.format(objetivo.atual)} de {currencyFormatter.format(objetivo.meta)} ({objetivo.progress.toFixed(0)}%)</Text>
          ))}
          <Text style={styles.sectionTitle}>Lançamentos</Text>
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={styles.tableCell}>Data</Text>
              <Text style={styles.tableCell}>Categoria</Text>
              <Text style={styles.tableCell}>Nota</Text>
              <Text style={styles.tableCell}>Valor</Text>
              <Text style={styles.tableCell}>Tipo</Text>
            </View>
            {filteredLancamentos.map((lancamento) => (
              <View style={styles.tableRow} key={lancamento.id}>
                <Text style={styles.tableCell}>{lancamento.data.slice(0, 10)}</Text>
                <Text style={styles.tableCell}>{lancamento.categoria ?? 'Sem categoria'}</Text>
                <Text style={styles.tableCell}>{lancamento.nota ?? '-'}</Text>
                <Text style={styles.tableCell}>{currencyFormatter.format(asNumber(lancamento.valor))}</Text>
                <Text style={styles.tableCell}>{lancamento.tipo === 'entrada' ? 'Entrada' : 'Despesa'}</Text>
              </View>
            ))}
          </View>
        </Page>
      </Document>
    )
    const pdfBlob = await pdf(pdfDoc).toBlob()
    const url = URL.createObjectURL(pdfBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `relatorio-financeiro-${selectedMonth}.pdf`
    link.click()
    URL.revokeObjectURL(url)
    setIsExporting(false)
  }

  if (error) return <p className="dashboard__status" role="alert">{error}</p>
  if (!data) return <p className="dashboard__status">A carregar...</p>

  return (
    <section className="dashboard" id="relatorios">
      <h1>Relatórios</h1>
      <Card className="dashboard__section">
        <div className="chart-heading" style={{ marginBottom: 16 }}>
          <label htmlFor="month-select" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span>Mês</span>
            <select id="month-select" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
              {monthOptions.map((value) => <option value={value} key={value}>{monthLabel(value)}</option>)}
            </select>
          </label>
          <button className="button button--primary" onClick={() => { void exportPdf() }} disabled={isExporting} type="button">{isExporting ? 'A exportar...' : 'Exportar PDF'}</button>
        </div>
        {resumoMes ? <div className="dashboard__cards">
          <Card className="dashboard__card"><span>Entradas</span><strong>{currencyFormatter.format(resumoMes.entradas)}</strong></Card>
          <Card className="dashboard__card"><span>Despesas</span><strong>{currencyFormatter.format(resumoMes.despesas)}</strong></Card>
          <Card className="dashboard__card"><span>Saldo</span><strong>{currencyFormatter.format(resumoMes.saldo)}</strong></Card>
          <Card className="dashboard__card"><span>Total investido</span><strong>{currencyFormatter.format(resumoMes.totalInvestido)}</strong></Card>
        </div> : null}
        <div className="dashboard__section" style={{ marginTop: 24 }}>
          <h2>Objetivos</h2>
          <div className="goals">
            {objetivosMes.map((objetivo) => (
              <Card className="goal" key={objetivo.id}>
                <div className="goal__header">
                  <div className="goal__name">
                    <strong>{objetivo.nome}</strong>
                  </div>
                  <span>{currencyFormatter.format(objetivo.atual)} de {currencyFormatter.format(objetivo.meta)}</span>
                </div>
                <div className="goal__track" aria-label={`${objetivo.progress.toFixed(0)}% do objetivo concluído`}>
                  <div className="goal__progress" style={{ width: `${objetivo.progress}%` }} />
                </div>
              </Card>
            ))}
          </div>
        </div>
        <div className="dashboard__section" style={{ marginTop: 24 }}>
          <h2>Lançamentos</h2>
          <Card className="transactions">
            {filteredLancamentos.map((lancamento) => (
              <article className="transaction" key={lancamento.id}>
                <div>
                  <strong>{lancamento.categoria ?? 'Sem categoria'}</strong>
                  {lancamento.nota && <span>{lancamento.nota}</span>}
                </div>
                <strong className={lancamento.tipo === 'entrada' ? 'transaction__value transaction__value--income' : 'transaction__value transaction__value--expense'}>{currencyFormatter.format(asNumber(lancamento.valor))}</strong>
              </article>
            ))}
          </Card>
        </div>
      </Card>
    </section>
  )
}

export default Relatorios
