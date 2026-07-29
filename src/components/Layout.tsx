import { NavLink, Outlet } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import './Layout.css'

const navigationItems = [
  { label: 'Dashboard', to: '/' },
  { label: 'Lançamentos', to: '/lancamentos' },
  { label: 'Investimentos', to: '/investimentos' },
  { label: 'Objetivos', to: '/objetivos' },
  { label: 'Relatórios', to: '/relatorios' },
]

function Navigation() {
  return (
    <>
      {navigationItems.map(({ label, to }) => (
        <NavLink className={({ isActive }) => `navigation__item${isActive ? ' navigation__item--active' : ''}`} end={to === '/'} to={to} key={to}>
          {label}
        </NavLink>
      ))}
    </>
  )
}

function Layout() {
  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <strong className="sidebar__brand">Financeiro</strong>
        <nav className="navigation" aria-label="Navegação principal"><Navigation /></nav>
        <button className="sign-out" onClick={() => void handleSignOut()} type="button">Sair</button>
      </aside>
      <main className="app-layout__content"><Outlet /></main>
      <nav className="bottom-bar" aria-label="Navegação móvel">
        <Navigation />
        <button className="bottom-bar__sign-out" onClick={() => void handleSignOut()} type="button">Sair</button>
      </nav>
    </div>
  )
}

export default Layout
