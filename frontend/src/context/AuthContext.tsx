import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, clearTokens, getAccessToken, setTokens } from '../lib/api'

type User = {
  id: number
  email: string
  name: string
  household_id: number
}

type AuthContextValue = {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string, inviteCode?: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = getAccessToken()
    if (!token) {
      setIsLoading(false)
      return
    }
    api
      .get<User>('/auth/me')
      .then(({ data }) => setUser(data))
      .catch(() => clearTokens())
      .finally(() => setIsLoading(false))
  }, [])

  async function login(email: string, password: string) {
    const { data } = await api.post('/auth/login', { email, password })
    setTokens(data.access_token, data.refresh_token)
    const { data: loggedUser } = await api.get<User>('/auth/me')
    setUser(loggedUser)
  }

  async function register(email: string, password: string, name: string, inviteCode?: string) {
    await api.post('/auth/register', {
      email,
      password,
      name,
      invite_code: inviteCode || undefined,
    })
    await login(email, password)
  }

  function logout() {
    clearTokens()
    setUser(null)
  }

  async function refreshUser() {
    const { data } = await api.get<User>('/auth/me')
    setUser(data)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth precisa estar dentro de um AuthProvider')
  }
  return ctx
}
