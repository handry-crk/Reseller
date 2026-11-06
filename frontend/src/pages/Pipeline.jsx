import { useState } from 'react'
import { PageHead } from '../components/Layout'
import { api } from '../lib/api'
import { useStore } from '../lib/store'
import { useDrawer } from '../lib/useDrawer'

export default function Pipeline() {
  const { meta, resellers, run, can } = useStore()
  const { openDetail, openForm, drawer } = useDrawer()
  const [dragId, setDragId] = useState(null)
  const [over, setOver] = useState(null)
  const drop = (stage) => {
    const r = resellers.find(x => x.id === dragId)
    setOver(null); setDragId(null)
    if (!r || r.stage === stage || !can.write) return
    run(() => api(`/api/resellers/${r.id}/stage`, { method: 'POST', body: { stage } }), `${r.name} → ${meta.stages.find(s => s.id === stage).label}`)
  }
  return (
    <>
      <PageHead title="<b>Pipeline</b> Alur Reseller" sub={can.write ? 'Seret kartu ke kolom lain untuk memindahkan tahap, atau klik untuk detail.' : 'Klik kartu untuk melihat detail.'}>
        {can.write && <button className="btn btn-primary" onClick={() => openForm()}>+ Reseller Baru</button>}
      </PageHead>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
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
