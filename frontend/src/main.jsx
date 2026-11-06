import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import Layout from './components/Layout'
import { StoreProvider, useStore } from './lib/store'
import Cms from './pages/Cms'
import Dashboard from './pages/Dashboard'
import FollowUp from './pages/FollowUp'
import Login from './pages/Login'
import Pipeline from './pages/Pipeline'
import Resellers from './pages/Resellers'
import Settings from './pages/Settings'

function App() {
  const { user, booting, meta } = useStore()
  if (booting) return <div className="min-h-screen grid place-items-center text-ink-3">Memuat…</div>
  if (!user) return <Login />
  if (!meta) return <div className="min-h-screen grid place-items-center text-ink-3">Memuat data…</div>
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/reseller" element={<Resellers />} />
        <Route path="/followup" element={<FollowUp />} />
        <Route path="/cms" element={<Cms />} />
        <Route path="/pengaturan" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <StoreProvider><App /></StoreProvider>
    </BrowserRouter>
  </React.StrictMode>
)
