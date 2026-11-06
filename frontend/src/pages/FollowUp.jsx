import { useEffect, useState } from 'react'
import { PageHead } from '../components/Layout'
import { Empty, StatusTag } from '../components/ui'
import { api, fill, waLink } from '../lib/api'
import { useStore } from '../lib/store'
import { useDrawer } from '../lib/useDrawer'

export default function FollowUp() {
  const { meta, resellers, run, can, notify } = useStore()
  const { openDetail, drawer } = useDrawer()
  const [complaints, setComplaints] = useState([])
  const [sel, setSel] = useState('')
  const load = () => api('/api/activities?type=complaint').then(setComplaints).catch(() => {})
  useEffect(() => { load() }, [resellers])
  const today = meta.today
  const fu = resellers.filter(r => r.ordersCount > 0 && (!r.isRepeat || r.status !== 'Aktif')).sort((a, b) => (a.nextFollowUp || '9').localeCompare(b.nextFollowUp || '9'))
  const target = resellers.find(r => r.id === sel)
  const copy = (t) => navigator.clipboard?.writeText(t).then(() => notify('Template disalin')).catch(() => notify('Tidak bisa menyalin otomatis'))
  return (
    <>
      <PageHead title="<b>Follow-Up</b> & Complaint" sub="Reaktivasi reseller yang belum repeat order dan penanganan complaint/feedback (CRM)." />
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card"><h3 className="card-title">Jadwal Follow-Up / Reaktivasi</h3><div className="hint">Reseller yang belum repeat order, atau pasif/churn</div>
          {fu.length ? <div className="overflow-x-auto"><table className="table"><thead><tr><th>Reseller</th><th>Status</th><th>Order Terakhir</th><th>Jadwal FU</th><th></th></tr></thead><tbody>
            {fu.map(r => <tr key={r.id}>
              <td><button className="link" onClick={() => openDetail(r.id)}>{r.name}</button><br /><small className="text-ink-3">{r.phone}</small></td>
              <td><StatusTag s={r.status} />{!r.isRepeat && <span className="tag tag-muted ml-1">belum repeat</span>}</td>
              <td>{r.lastOrderDate} <small className="text-ink-3">({r.daysSinceLastOrder} hr)</small></td>
              <td>{r.nextFollowUp ? <span className={'tag ' + (r.nextFollowUp <= today ? 'tag-warn' : 'tag-muted')}>{r.nextFollowUp}</span> : '-'}</td>
              <td><button className="btn btn-sm" onClick={() => setSel(r.id)}>Pesan WA</button></td></tr>)}
          </tbody></table></div> : <Empty>Semua reseller pembeli sudah repeat & aktif.</Empty>}</div>
        <div className="card"><h3 className="card-title">Complaint / Feedback</h3><div className="hint">Complaint open dan riwayat yang sudah selesai</div>
          {complaints.length ? <div className="overflow-x-auto"><table className="table"><thead><tr><th>Tanggal</th><th>Reseller</th><th>Complaint</th><th>Status</th><th></th></tr></thead><tbody>
            {complaints.sort((a, b) => (a.status === 'resolved') - (b.status === 'resolved')).map(a => <tr key={a.id}>
              <td>{a.date}</td><td><button className="link" onClick={() => openDetail(a.resellerId)}>{a.resellerName}</button></td><td>{a.note}</td>
              <td>{a.status === 'resolved' ? <span className="tag tag-good">resolved</span> : <span className="tag">open</span>}</td>
              <td>{a.status !== 'resolved' && can.write && <button className="btn btn-sm" onClick={() => run(() => api(`/api/activities/${a.id}/resolve`, { method: 'POST' }), 'Complaint selesai').then(load)}>Selesai</button>}</td></tr>)}
          </tbody></table></div> : <Empty>Belum ada complaint tercatat.</Empty>}</div>
      </div>
      <div className="card mt-4"><h3 className="card-title">Template Pesan WhatsApp</h3>
        <div className="hint">Pilih reseller agar {'{nama}'} dan {'{tier}'} terisi otomatis. Template dikelola di CMS Program.</div>
        <select className="inp w-auto min-w-[240px] mb-3" value={sel} onChange={e => setSel(e.target.value)}><option value="">— pilih reseller —</option>{resellers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        {meta.cms.templates.map((t, i) => { const txt = fill(t.body, target); return (
          <div key={i} className="mb-3"><b className="text-[13px]">{t.name}</b>
            <button className="btn btn-ghost btn-sm ml-2" onClick={() => copy(txt)}>Copy</button>
            {target?.phone && <a className="btn btn-sm ml-2" href={waLink(target.phone, txt)} target="_blank" rel="noreferrer">Buka WA</a>}
            <div className="pre mt-1">{txt}</div></div>) })}
      </div>
      {drawer}
    </>
  )
}
