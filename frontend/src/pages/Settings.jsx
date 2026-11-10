import { useEffect, useState } from 'react'
import { PageHead } from '../components/Layout'
import { Confirm, Select } from '../components/ui'
import { api } from '../lib/api'
import { useStore } from '../lib/store'

const ROLES = [{ value: 'admin', label: 'Admin (semua akses)' }, { value: 'crm', label: 'CRM (data + CMS)' }, { value: 'cs', label: 'CS (data reseller & aktivitas)' }, { value: 'gudang', label: 'Gudang (monitoring & status pesanan)' }, { value: 'viewer', label: 'Viewer (hanya lihat)' }]

export default function Settings() {
  const { meta, run, can, user, notify } = useStore()
  const [s, setS] = useState(null)
  const [users, setUsers] = useState([])
  const [approveRole, setApproveRole] = useState({})
  const [uf, setUf] = useState(null) // form user
  const [confirm, setConfirm] = useState(null)
  const [pw, setPw] = useState('')
  useEffect(() => { if (meta && !s) { const x = meta.settings; setS({ ...x, pic: x.pic.join(', '), channel: x.channel.join(', '), area: x.area.join(', '), company: { ...x.company }, emailDomains: (x.emailDomains || []).join(', ') }) } }, [meta]) // eslint-disable-line
  const loadUsers = () => can.admin && api('/api/users').then(setUsers).catch(() => {})
  useEffect(() => { loadUsers() }, [can.admin]) // eslint-disable-line
  if (!s) return null
  const ro = !can.admin
  const set = (k) => (e) => setS({ ...s, [k]: e.target.value })
  const split = (v) => v.split(',').map(x => x.trim()).filter(Boolean)
  const save = () => run(() => api('/api/settings', { method: 'PUT', body: { pic: split(s.pic), channel: split(s.channel), area: split(s.area), pasifDays: +s.pasifDays || 30, churnDays: +s.churnDays || 90, followUpDays: +s.followUpDays || 14, company: s.company, emailDomains: split(s.emailDomains) } }), 'Pengaturan tersimpan').then(() => {}, () => {})
  const saveUser = async (e) => {
    e.preventDefault()
    const body = { email: uf.email, name: uf.name, role: uf.role, active: uf.active, password: uf.password || null }
    try { await (uf.id ? api(`/api/users/${uf.id}`, { method: 'PUT', body }) : api('/api/users', { method: 'POST', body })); notify('User tersimpan'); setUf(null); loadUsers() } catch (ex) { notify('Gagal: ' + ex.message) }
  }
  return (
    <>
      <PageHead title="<b>Pengaturan</b>" sub={can.admin ? "Daftar PIC, channel, area, aturan status otomatis, domain email, dan pengguna." : "Lihat pengaturan dan ganti kata sandi akun Anda."}>
        {!ro && <button className="btn btn-primary" onClick={save}>Simpan</button>}
      </PageHead>
      {can.admin && users.some(u => u.status === 'pending') && <div className="note mb-4 flex flex-wrap items-center gap-3"><span><b>{users.filter(u => u.status === 'pending').length} pendaftar baru</b> menunggu persetujuan Anda.</span><button className="btn btn-sm" onClick={() => document.getElementById('pengguna')?.scrollIntoView({ behavior: 'smooth' })}>Tinjau sekarang ↓</button></div>}
      <div className="grid lg:grid-cols-2 gap-4">
        {can.admin && <div className="card lg:col-span-2"><h3 className="card-title">Domain Email Member</h3>
          <div className="hint">Hanya email dengan domain ini yang bisa mendaftar atau dibuat sebagai user. Tulis <b>citarasakuliner</b> untuk semua akhiran (.com, .co.id, .id), atau domain lengkap seperti <b>citarasakuliner.co.id</b>. Pisahkan dengan koma.</div>
          <input className="inp" value={s.emailDomains} onChange={set('emailDomains')} /></div>}
        <div className="card"><h3 className="card-title">Daftar PIC</h3><div className="hint">Pisahkan dengan koma</div><input className="inp" value={s.pic} onChange={set('pic')} readOnly={ro} /></div>
        <div className="card"><h3 className="card-title">Channel Masuk</h3><div className="hint">Pisahkan dengan koma</div><input className="inp" value={s.channel} onChange={set('channel')} readOnly={ro} /></div>
        <div className="card"><h3 className="card-title">Area Operasional</h3><div className="hint">Pisahkan dengan koma</div><input className="inp" value={s.area} onChange={set('area')} readOnly={ro} /></div>
        <div className="card"><h3 className="card-title">Aturan Otomatis</h3><div className="hint">Status dihitung dari hari sejak order terakhir</div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="lbl">Pasif jika tidak order (hari)</label><input className="inp" type="number" value={s.pasifDays} onChange={set('pasifDays')} readOnly={ro} /></div>
            <div><label className="lbl">Churn jika tidak order (hari)</label><input className="inp" type="number" value={s.churnDays} onChange={set('churnDays')} readOnly={ro} /></div>
            <div className="col-span-2"><label className="lbl">Follow-up setelah order pertama (hari)</label><input className="inp" type="number" value={s.followUpDays} onChange={set('followUpDays')} readOnly={ro} /></div>
          </div></div>
        <div className="card lg:col-span-2"><h3 className="card-title">Data Perusahaan (untuk invoice)</h3><div className="hint">Tampil di kop invoice resmi yang dicetak dari halaman Pesanan</div>
          <div className="grid md:grid-cols-2 gap-3">
            <div><label className="lbl">Nama perusahaan / brand</label><input className="inp" value={s.company.name} onChange={e => setS({ ...s, company: { ...s.company, name: e.target.value } })} readOnly={ro} /></div>
            <div><label className="lbl">Telepon / WhatsApp</label><input className="inp" value={s.company.phone} onChange={e => setS({ ...s, company: { ...s.company, phone: e.target.value } })} readOnly={ro} /></div>
            <div><label className="lbl">Alamat</label><textarea className="inp min-h-[60px]" value={s.company.address} onChange={e => setS({ ...s, company: { ...s.company, address: e.target.value } })} readOnly={ro} /></div>
            <div><label className="lbl">Rekening pembayaran</label><textarea className="inp min-h-[60px]" placeholder="BCA 1234567890 a.n. PT Citarasa Kuliner Indonesia" value={s.company.bank} onChange={e => setS({ ...s, company: { ...s.company, bank: e.target.value } })} readOnly={ro} /></div>
            <div><label className="lbl">Email</label><input className="inp" value={s.company.email} onChange={e => setS({ ...s, company: { ...s.company, email: e.target.value } })} readOnly={ro} /></div>
            <div><label className="lbl">Catatan kaki invoice</label><input className="inp" value={s.company.invoiceNote} onChange={e => setS({ ...s, company: { ...s.company, invoiceNote: e.target.value } })} readOnly={ro} /></div>
          </div></div>
        <div className="card"><h3 className="card-title">Akun Saya</h3><div className="hint">{user.name} · {user.email} · {user.role}</div>
          <label className="lbl">Ganti kata sandi</label>
          <div className="flex gap-2"><input className="inp" type="password" placeholder="min. 6 karakter" value={pw} onChange={e => setPw(e.target.value)} />
            <button className="btn btn-sm whitespace-nowrap" onClick={() => api('/api/auth/password', { method: 'POST', body: { password: pw } }).then(() => { notify('Kata sandi diganti'); setPw('') }).catch(e => notify('Gagal: ' + e.message))}>Simpan</button></div></div>
        {can.admin && <div className="card"><h3 className="card-title">Data</h3><div className="hint">Isi contoh data untuk uji coba, atau hapus semua data reseller.</div>
          <div className="flex gap-2 flex-wrap"><button className="btn" onClick={() => run(() => api('/api/admin/seed', { method: 'POST' }), 'Data contoh dimuat').catch(() => {})}>Isi Data Contoh</button><button className="btn btn-danger" onClick={() => setConfirm('wipe')}>Hapus Semua Reseller</button></div>
          {confirm === 'wipe' && <Confirm title="Hapus semua reseller & aktivitas?" text="Tidak bisa dibatalkan." yesLabel="Ya, hapus semua" onNo={() => setConfirm(null)} onYes={() => run(() => api('/api/admin/wipe', { method: 'POST' }), 'Semua data dihapus').then(() => setConfirm(null), () => {})} />}</div>}
        {can.admin && <div id="pengguna" className="card lg:col-span-2 scroll-mt-4"><h3 className="card-title">Pengguna</h3><div className="hint">Admin: semua akses · CRM: data + CMS · CS: data reseller & aktivitas · Gudang: monitoring & status pesanan · Viewer: hanya lihat</div>
          {users.some(u => u.status === 'pending') && <div className="rounded-lg border border-brick bg-brick-soft p-3 mb-4">
            <div className="text-[13px] font-bold mb-2">Menunggu persetujuan ({users.filter(u => u.status === 'pending').length})</div>
            <div className="flex flex-col gap-2">{users.filter(u => u.status === 'pending').map(u => (
              <div key={u.id} className="flex flex-wrap items-center gap-2 bg-white border border-line rounded-lg px-3 py-2 text-[13px]">
                <div className="mr-auto"><b>{u.name}</b> · {u.email}<div className="text-[11px] text-ink-3">daftar {(u.createdAt || '').slice(0, 10)}</div></div>
                <span className="text-xs text-ink-2">Akses:</span>
                <div className="w-48"><Select options={ROLES.filter(r => r.value !== 'admin')} value={approveRole[u.id] || 'cs'} onChange={v => setApproveRole({ ...approveRole, [u.id]: v })} /></div>
                <button className="btn btn-primary btn-sm" onClick={() => run(() => api(`/api/users/${u.id}/approve`, { method: 'POST', body: { role: approveRole[u.id] || 'cs' } }), `${u.name} disetujui`).then(loadUsers, () => {})}>Setujui</button>
                <button className="btn btn-danger btn-sm" onClick={() => setConfirm(u.id)}>Tolak</button>
              </div>))}</div>
          </div>}
          <div className="overflow-x-auto"><table className="table"><thead><tr><th>Nama</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>
            {users.filter(u => u.status !== 'pending').map(u => <tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td><span className="tag">{u.role}</span></td><td>{u.active ? <span className="tag tag-good">aktif</span> : <span className="tag tag-muted">nonaktif</span>}</td>
              <td className="whitespace-nowrap"><button className="btn btn-sm" onClick={() => setUf({ ...u, password: '' })}>Edit</button>{u.id !== user.id && <button className="btn btn-danger btn-sm ml-1" onClick={() => setConfirm(u.id)}>Hapus</button>}</td></tr>)}
          </tbody></table></div>
          <button className="btn btn-sm mt-3" onClick={() => setUf({ email: '', name: '', role: 'cs', active: true, password: '' })}>+ Tambah pengguna</button>
          {confirm && confirm !== 'wipe' && <Confirm title={users.find(u => u.id === confirm)?.status === 'pending' ? 'Tolak pendaftaran ini?' : 'Hapus pengguna ini?'} text={users.find(u => u.id === confirm)?.email} yesLabel="Ya, hapus" onNo={() => setConfirm(null)} onYes={() => run(() => api(`/api/users/${confirm}`, { method: 'DELETE' }), 'User dihapus').then(() => { setConfirm(null); loadUsers() }, () => {})} />}
          {uf && <form onSubmit={saveUser} className="card border-brick mt-4"><h4 className="text-[13px] font-bold mb-2">{uf.id ? 'Edit pengguna' : 'Pengguna baru'}</h4>
            <div className="grid md:grid-cols-2 gap-3">
              <div><label className="lbl">Nama</label><input className="inp" value={uf.name} onChange={e => setUf({ ...uf, name: e.target.value })} required /></div>
              <div><label className="lbl">Email</label><input className="inp" type="email" value={uf.email} onChange={e => setUf({ ...uf, email: e.target.value })} required /></div>
              <div><label className="lbl">Role</label><Select options={ROLES} value={uf.role} onChange={v => setUf({ ...uf, role: v })} /></div>
              <div><label className="lbl">Kata sandi {uf.id && '(kosongkan bila tidak diganti)'}</label><input className="inp" type="password" value={uf.password} onChange={e => setUf({ ...uf, password: e.target.value })} required={!uf.id} minLength={6} /></div>
              <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={uf.active} onChange={e => setUf({ ...uf, active: e.target.checked })} /> Akun aktif</label>
            </div>
            <div className="flex gap-2 mt-3"><button className="btn btn-primary btn-sm">Simpan</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setUf(null)}>Batal</button></div></form>}
        </div>}
      </div>
    </>
  )
}
