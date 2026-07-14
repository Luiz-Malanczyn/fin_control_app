import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV_ITEMS = [
  { to: '/', label: 'Resumo', end: true },
  { to: '/transactions', label: 'Transações' },
  { to: '/recurring', label: 'Recorrências' },
  { to: '/calendar', label: 'Calendário' },
  { to: '/accounts', label: 'Contas & categorias' },
]

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <span className="app-brand">Finanças</span>
        <nav className="app-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => 'app-nav-link' + (isActive ? ' active' : '')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="app-topbar-user">
          <span>{user?.name}</span>
          <button onClick={logout}>Sair</button>
        </div>
      </header>
      <main className="app-content">{children}</main>
    </div>
  )
}
