import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useStore } from '../lib/store'

export default function Login() {
  const [mode, setMode] = useState(() => (window.location.pathname === '/daftar' ? 'register' : 'login'))
  const go = (m) => { setMode(m); try { window.history.replaceState(null, '', m === 'register' ? '/daftar' : '/') } catch {} }
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="card w-full max-w-sm">
        <div className="text-brick font-extrabold text-2xl leading-tight">CRK Reseller Hub</div>
        <div className="text-xs text-ink-3 uppercase tracking-[.12em] mb-5">Cimol Bojot AA · CRM</div>
        {mode === 'login' ? <LoginForm onRegister={() => go('register')} /> : <RegisterForm onLogin={() => go('login')} />}
      </div>
    </div>
  )
}

function LoginForm({ onRegister }) {
  const { login } = useStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true)
    try { await login(email.trim(), password) } catch (ex) { setErr(ex.message) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit}>
      <label className="lbl">Email</label>
      <input className="inp mb-3" type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus required />
      <label className="lbl">Kata sandi</label>
      <input className="inp mb-4" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
      {err && <div className="note mb-3">{err}</div>}
      <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Masuk…' : 'Masuk'}</button>
      <div className="text-center text-[13px] text-ink-2 mt-4">Belum punya akun? <button type="button" className="link" onClick={onRegister}>Daftar member baru</button></div>
    </form>
  )
}

function RegisterForm({ onLogin }) {
  const [f, setF] = useState({ name: '', email: '', password: '', confirm: '' })
  const [domains, setDomains] = useState([])
  const [err, setErr] = useState('')
  const [done, setDone] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { api('/api/auth/register-info').then(r => setDomains(r.emailDomains || [])).catch(() => {}) }, [])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const hint = domains.map(d => '@' + d + (d.includes('.') ? '' : '…')).join(', ')
  const domainOk = (email) => {
    const dom = (email.split('@')[1] || '').toLowerCase()
    return !domains.length || domains.some(d => dom === d || (!d.includes('.') && dom.startsWith(d + '.')))
  }
  const submit = async (e) => {
    e.preventDefault(); setErr('')
    if (f.name.trim().length < 2) return setErr('Nama minimal 2 huruf')
    if (!domainOk(f.email.trim())) return setErr(`Pendaftaran hanya untuk email perusahaan (${hint})`)
    if (f.password.length < 8) return setErr('Kata sandi minimal 8 karakter')
    if (f.password !== f.confirm) return setErr('Konfirmasi kata sandi tidak sama')
    setBusy(true)
    try {
      const r = await api('/api/auth/register', { method: 'POST', body: { name: f.name.trim(), email: f.email.trim(), password: f.password } })
      setDone(r.message)
    } catch (ex) { setErr(ex.message) } finally { setBusy(false) }
  }
  if (done) return (
    <div>
      <div className="note mb-4"><b>Pendaftaran terkirim.</b> {done} Admin akan menentukan akses Anda (CS, CRM, Gudang, atau Viewer).</div>
      <button className="btn w-full" onClick={onLogin}>Kembali ke halaman masuk</button>
    </div>
  )
  return (
    <form onSubmit={submit}>
      <div className="text-sm font-bold mb-1">Daftar member baru</div>
      <div className="text-xs text-ink-2 mb-4">Khusus karyawan dengan email perusahaan{hint ? ` (${hint})` : ''}. Akun aktif setelah disetujui Admin.</div>
      <label className="lbl">Nama lengkap</label>
      <input className="inp mb-3" value={f.name} onChange={set('name')} autoFocus required />
      <label className="lbl">Email perusahaan</label>
      <input className="inp mb-3" type="email" placeholder="nama@citarasakuliner…" value={f.email} onChange={set('email')} required />
      <label className="lbl">Kata sandi (min. 8 karakter)</label>
      <input className="inp mb-3" type="password" value={f.password} onChange={set('password')} required />
      <label className="lbl">Ulangi kata sandi</label>
      <input className="inp mb-4" type="password" value={f.confirm} onChange={set('confirm')} required />
      {err && <div className="note mb-3">{err}</div>}
      <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Mengirim…' : 'Daftar'}</button>
      <div className="text-center text-[13px] text-ink-2 mt-4">Sudah punya akun? <button type="button" className="link" onClick={onLogin}>Masuk</button></div>
    </form>
  )
}
