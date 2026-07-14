import { Navigate, Outlet, Route, BrowserRouter, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import AccountsCategories from './pages/AccountsCategories'
import Recurring from './pages/Recurring'
import CalendarPage from './pages/Calendar'
import HouseholdPage from './pages/Household'
import './App.css'

function ProtectedLayout() {
  const { user, isLoading } = useAuth()
  if (isLoading) return null
  if (!user) return <Navigate to="/login" replace />
  return (
    <Layout>
      <Outlet />
    </Layout>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/recurring" element={<Recurring />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/accounts" element={<AccountsCategories />} />
        <Route path="/household" element={<HouseholdPage />} />
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
