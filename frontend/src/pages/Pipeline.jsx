import { useEffect, useState } from 'react'
import { PageHead } from '../components/Layout'
import { api, fmtN } from '../lib/api'
import { Empty, Select } from '../components/ui'
import { useStore } from '../lib/store'
import { useDrawer } from '../lib/useDrawer'

export default function Pipeline() {
  const { meta, resellers, run, can } = useStore()
  const { openDetail, openForm, drawer } = useDrawer()
  const [dragId, setDragId] = useState(null)
  const [over, setOver] = useState(null)
  const [view, setView] = useState('board')
  const drop = (stage) => {
    const r = resellers.find(x => x.id === dragId)
    setOver(null); setDragId(null)
    if (!r || r.stage === stage || !can.write) return
    run(() => api(`/api/resellers/${r.id}/stage`, { method: 'POST', body: { stage } }), `${r.name} → ${meta.stages.find(s => s.id === stage).label}`)
  }
  return (
    <>
      <PageHead title="<b>Pipeline</b> Alur Reseller" sub={can.write ? 'Seret kartu ke kolom lain untuk memindahkan tahap, atau klik untuk detail.' : 'Klik kartu untuk melihat detail.'}>
        <div className="inline-flex rounded-full border border-brick overflow-hidden text-[13px] font-semibold">
          <button className={'px-4 py-2 ' + (view === 'board' ? 'bg-brick text-cream' : 'text-brick')} onClick={() => setView('board')}>Papan</button>
          <button className={'px-4 py-2 ' + (view === 'history' ? 'bg-brick text-cream' : 'text-brick')} onClick={() => setView('history')}>Riwayat Pipeline</button>
        </div>
        {can.write && <button className="btn btn-primary" onClick={() => openForm()}>+ Reseller Baru</button>}
      </PageHead>
      {view === 'history' && <History openDetail={openDetail} today={meta.today} stages={meta.stages} resellers={resellers} />}
      <div className={'grid gap-3 ' + (view === 'board' ? '' : 'hidden')} style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
        {meta.stages.map((s, i) => {
          const items = resellers.filter(r => (r.stage || 'lead') === s.id)
          return (
            <div key={s.id} onDragOver={e => { e.preventDefault(); setOver(s.id) }} onDragLeave={() => setOver(null)} onDrop={() => drop(s.id)}
              className={'rounded-lg p-2.5 min-h-[140px] transition ' + (over === s.id ? 'bg-brick-tint' : 'bg-cream-dark')}>
              <h5 className="flex justify-between text-[11px] uppercase tracking-wider text-ink-2 font-semibold mb-2"><span>{s.side ? '↩ ' : i + 1 + '. '}{s.label}</span><span>{items.length}</span></h5>
              {items.map(r => (
                <div key={r.id} draggable={can.write} onDragStart={() => setDragId(r.id)} onClick={() => openDetail(r.id)}
                  className="bg-white border border-line rounded-lg px-2.5 py-2 mb-1.5 cursor-pointer hover:border-brick text-[12.5px]">
                  <b className="block">{r.name}</b>
                  <small className="text-ink-3">{r.area} · {r.pic || '-'}{r.openComplaints ? ' · ⚠ complaint' : ''}{r.status === 'Pasif' ? ' · pasif' : ''}</small>
                </div>
              ))}
              {items.length === 0 && <div className="text-center text-ink-3 text-xs py-3">—</div>}
            </div>
          )
        })}
      </div>
      {drawer}
    </>
  )
}


const monthLabel = (k) => new Date(k + '-01T00:00:00').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
const lastMonths = (today, n = 12) => { const out = []; let [y, m] = today.slice(0, 7).split('-').map(Number); for (let i = 0; i < n; i++) { out.push(`${y}-${String(m).padStart(2, '0')}`); m--; if (m === 0) { m = 12; y-- } } return out }

function History({ openDetail, today, stages, resellers }) {
  const [month, setMonth] = useState(today.slice(0, 7))
  const [d, setD] = useState(null)
  useEffect(() => { api('/api/stage-history' + (month ? '?month=' + month : '')).then(setD).catch(() => {}) }, [month, resellers])
  if (!d) return <Empty>Memuat riwayat…</Empty>
  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <h3 className="card-title">Riwayat Perpindahan Tahap</h3>
        <Select options={[{ value: '', label: 'Semua periode' }, ...lastMonths(today).map(m => ({ value: m, label: monthLabel(m) }))]} value={month} onChange={setMonth} className="inp !w-auto" />
        <span className="text-xs text-ink-3 ml-auto">{fmtN(d.total)} perpindahan · {fmtN(d.resellers)} reseller</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4">{d.perStage.filter(s => s.count).map(s => <span key={s.stage} className="tag">{s.label}: <b>{s.count}</b></span>)}</div>
      {d.rows.length ? <div className="overflow-x-auto"><table className="table"><thead><tr><th>Tanggal</th><th>Reseller</th><th>Dari</th><th>Ke</th><th>Oleh</th><th>Jenis</th></tr></thead><tbody>
        {d.rows.map(a => <tr key={a.id}><td className="whitespace-nowrap">{a.date}</td><td><button className="link" onClick={() => openDetail(a.resellerId)}>{a.resellerName}</button><br /><small className="text-ink-3">{a.pic}</small></td>
          <td>{a.fromLabel ? <span className="tag tag-muted">{a.fromLabel}</span> : '-'}</td><td><span className="tag">{a.toLabel}</span></td><td>{a.by || '-'}</td>
          <td>{a.auto ? <span className="tag tag-good">otomatis</span> : <span className="tag tag-muted">manual</span>}</td></tr>)}
      </tbody></table></div> : <Empty>Belum ada perpindahan tahap pada periode ini.</Empty>}
    </div>
  )
}
