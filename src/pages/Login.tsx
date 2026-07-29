import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import Card from '../components/Card'

type Mode = 'login' | 'signup'

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<Mode>('login')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const isSignup = mode === 'signup'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    setIsLoading(true)

    const { error: authError } = isSignup
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })

    setIsLoading(false)

    if (authError) {
      setError(authError.message)
      return
    }

    if (isSignup) {
      setMessage('Conta criada. Confirma o teu email para concluir o registo.')
    }
  }

  function toggleMode() {
    setMode(isSignup ? 'login' : 'signup')
    setError(null)
    setMessage(null)
  }

  return (
    <main style={styles.page}>
      <Card className="login-card">
      <form onSubmit={handleSubmit} style={styles.form}>
        <h1 style={styles.title}>{isSignup ? 'Criar conta' : 'Entrar'}</h1>

        <label style={styles.label}>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            style={styles.input}
          />
        </label>

        <label style={styles.label}>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={6}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            style={styles.input}
          />
        </label>

        {error && <p role="alert" style={styles.error}>{error}</p>}
        {message && <p style={styles.message}>{message}</p>}

        <button type="submit" disabled={isLoading} style={styles.button}>
          {isLoading ? 'A processar...' : isSignup ? 'Criar conta' : 'Entrar'}
        </button>

        <button type="button" onClick={toggleMode} style={styles.link}>
          {isSignup ? 'Já tenho conta' : 'Criar conta'}
        </button>
      </form>
      </Card>
    </main>
  )
}

const styles = {
  page: {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'center',
    minHeight: '100svh',
    padding: '24px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    maxWidth: '360px',
    width: '100%',
  },
  title: { fontSize: '32px', margin: '0 0 8px' },
  label: { display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' },
  input: { background: '#121212', border: '1px solid #2a2a2a', borderRadius: '8px', color: '#f5f5f5', fontSize: '16px', padding: '10px 12px' },
  button: { background: '#6366f1', border: 0, borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '16px', padding: '11px 16px' },
  link: { background: 'none', border: 0, color: '#6366f1', cursor: 'pointer', fontSize: '16px', textDecoration: 'underline' },
  error: { color: '#a3a3a3', margin: 0 },
  message: { color: '#a3a3a3', margin: 0 },
} as const

export default Login
