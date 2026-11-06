import { useState } from 'react'
import { useStore } from '../lib/store'

export default function Login() {
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
    <div className="min-h-screen grid place-items-center p-6">
      <form onSubmit={submit} className="card w-full max-w-sm">
        <div className="text-brick font-extrabold text-2xl leading-tight">CRK Reseller Hub</div>
        <div className="text-xs text-ink-3 uppercase tracking-[.12em] mb-5">Cimol Bojot AA · CRM</div>
        <label className="lbl">Email</label>
        <input className="inp mb-3" type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus required />
        <label className="lbl">Kata sandi</label>
        <input className="inp mb-4" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        {err && <div className="note mb-3">{err}</div>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Masuk…' : 'Masuk'}</button>
      </form>
    </div>
  )
}
