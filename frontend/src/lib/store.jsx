import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api, getToken, setToken } from './api'

const Ctx = createContext(null)

export function StoreProvider({ children }) {
  const [user, setUser] = useState(null)
  const [booting, setBooting] = useState(true)
  const [meta, setMeta] = useState(null)
  const [resellers, setResellers] = useState([])
  const [toast, setToast] = useState('')

  const toastTimer = useRef(null)
  const notify = useCallback((m) => { clearTimeout(toastTimer.current); setToast(m); toastTimer.current = setTimeout(() => setToast(''), m.startsWith('Gagal') ? 4500 : 2600) }, [])

  const refresh = useCallback(async () => {
    const [m, rs] = await Promise.all([api('/api/meta'), api('/api/resellers')])
    setMeta(m); setResellers(rs)
  }, [])

  useEffect(() => {
    const onLogout = () => { setUser(null); setMeta(null); setResellers([]) }
    window.addEventListener('crk-logout', onLogout)
    ;(async () => {
      if (getToken()) {
        try { setUser(await api('/api/auth/me')); await refresh() } catch { setToken(null) }
      }
      setBooting(false)
    })()
    return () => window.removeEventListener('crk-logout', onLogout)
  }, [refresh])

  const login = async (email, password) => {
    const r = await api('/api/auth/login', { method: 'POST', body: { email, password } })
    setToken(r.token); setUser(r.user); await refresh()
  }
  const logout = () => { setToken(null); setUser(null); setMeta(null); setResellers([]) }

  /** Jalankan aksi tulis, lalu muat ulang data; tampilkan toast. */
  const run = useCallback(async (fn, ok) => {
    try { const r = await fn(); await refresh(); if (ok) notify(ok); return r }
    catch (e) { notify('Gagal: ' + e.message); throw e }
  }, [refresh, notify])

  const can = useMemo(() => ({
    write: ['admin', 'crm', 'cs'].includes(user?.role),
    cms: ['admin', 'crm'].includes(user?.role),
    admin: user?.role === 'admin',
    deleteReseller: ['admin', 'crm'].includes(user?.role),
    orderStatus: ['admin', 'crm', 'gudang'].includes(user?.role),
    gudang: user?.role === 'gudang',
  }), [user])

  const stageOf = useCallback((id) => meta?.stages.find(s => s.id === id) || meta?.stages[0] || { id, label: id }, [meta])

  const value = { user, booting, meta, resellers, refresh, login, logout, run, notify, can, stageOf, toast }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useStore = () => useContext(Ctx)
