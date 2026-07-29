import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Lancamentos from './pages/Lancamentos'
import Investimentos from './pages/Investimentos'
import Objetivos from './pages/Objetivos'
import Login from './pages/Login'
import Relatorios from './pages/Relatorios'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadSession() {
      const { data } = await supabase.auth.getSession()
      setSession(data.session)
      setIsLoading(false)
    }

    void loadSession()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setIsLoading(false)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  if (isLoading) {
    return <p style={{ textAlign: 'center' }}>A carregar...</p>
  }

  return session ? <BrowserRouter><Routes><Route element={<Layout />}><Route index element={<Dashboard />} /><Route path="lancamentos" element={<Lancamentos />} /><Route path="investimentos" element={<Investimentos />} /><Route path="objetivos" element={<Objetivos />} /><Route path="relatorios" element={<Relatorios />} /></Route></Routes></BrowserRouter> : <Login />
}

export default App
