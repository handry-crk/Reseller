const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const TOKEN_KEY = 'crk_token'

export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } }
export const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY) } catch {} }

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const tok = getToken()
  if (tok) headers.Authorization = 'Bearer ' + tok
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  if (res.status === 401) { setToken(null); window.dispatchEvent(new Event('crk-logout')) }
  let data = null
  try { data = await res.json() } catch {}
  if (!res.ok) {
    const d = data?.detail
    const msg = Array.isArray(d) ? d.map(e => e.msg?.replace('Value error, ', '')).join(', ') : d || res.statusText
    throw new Error(msg)
  }
  return data
}

export const fmtRp = (n) => 'Rp' + Math.round(n || 0).toLocaleString('id-ID')
export const fmtN = (n) => (n || 0).toLocaleString('id-ID')
// Tanggal lokal (bukan UTC) agar tidak mundur sehari antara 00:00–07:00 WIB.
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
export const fill = (tpl, r) => (tpl || '').replace(/\{nama\}/g, r?.name || '').replace(/\{tier\}/g, r?.tier || '')
export const waLink = (phone, text) => {
  let p = (phone || '').replace(/\D/g, '')
  if (p.startsWith('0')) p = '62' + p.slice(1)
  return `https://wa.me/${p}?text=${encodeURIComponent(text || '')}`
}
