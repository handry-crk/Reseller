import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHead } from '../components/Layout'
import { Empty, Select, StatusTag, TierTag } from '../components/ui'
import { fmtN, fmtRp } from '../lib/api'
import { useStore } from '../lib/store'
import { useDrawer } from '../lib/useDrawer'

export default function Resellers() {
  const { meta, resellers, can, stageOf, notify } = useStore()
  const [sp, setSp] = useSearchParams()
  const [q, setQ] = useState('')
  const f = { stage: sp.get('stage') || '', tier: sp.get('tier') || '', pic: sp.get('pic') || '', status: sp.get('status') || '' }
  const SORTS = { new: 'Terbaru didaftar', name: 'Nama A–Z', revenue: 'Revenue tertinggi', last: 'Order terakhir' }
  const sort = SORTS[sp.get('sort')] ? sp.get('sort') : 'new'
  const newSince = (() => { const x = new Date(meta.today + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - 6); return x.toISOString().slice(0, 10) })()
  const isNew = (r) => (r.joinedDate || '') >= newSince
  const setF = (k) => (v) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n) }
  const { openDetail, openForm, drawer } = useDrawer()
  const rows = useMemo(() => resellers.filter(r =>
    (!q || [r.name, r.phone, r.area, r.channel].join(' ').toLowerCase().includes(q.toLowerCase())) &&
    (!f.stage || r.stage === f.stage) && (!f.tier || r.tier === f.tier) && (!f.pic || r.pic === f.pic) && (!f.status || r.status === f.status)
  ).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'id') : sort === 'revenue' ? b.totalRevenue - a.totalRevenue
    : sort === 'last' ? (b.lastOrderDate || '').localeCompare(a.lastOrderDate || '') : ((b.joinedDate || '') + (b.createdAt || '')).localeCompare((a.joinedDate || '') + (a.createdAt || ''))
  ), [resellers, q, f.stage, f.tier, f.pic, f.status, sort])
  const newCount = rows.filter(isNew).length

  const exportCSV = () => {
    const h = ['Nama', 'Tgl Daftar', 'WA', 'Area', 'Channel', 'PIC', 'Tahap', 'Tier', 'Status', 'Order', 'Pack', 'Revenue', 'Order Terakhir', 'Follow-up']
    const lines = [h, ...rows.map(r => [r.name, r.joinedDate, r.phone, r.area, r.channel, r.pic, stageOf(r.stage).label, r.tier, r.status, r.ordersCount, r.totalPacks, r.totalRevenue, r.lastOrderDate, r.nextFollowUp])]
    const csv = lines.map(l => l.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\n')
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,﻿' + encodeURIComponent(csv); a.download = 'reseller.csv'; a.click()
    notify('CSV diunduh')
  }
  return (
    <>
      <PageHead title="<b>Data</b> Reseller" sub="Database CRM reseller: pendaftaran, order, tier, dan status.">
        <button className="btn btn-ghost" onClick={exportCSV}>Export CSV</button>
        {can.write && <button className="btn btn-primary" onClick={() => openForm()}>+ Reseller Baru</button>}
      </PageHead>
      <div className="card">
        <div className="flex flex-wrap gap-2 items-center mb-3 [&>*]:w-auto [&>*]:min-w-[150px]">
          <input className="inp" placeholder="Cari nama / WA / area…" value={q} onChange={e => setQ(e.target.value)} />
          <Select options={meta.stages.map(s => ({ value: s.id, label: s.label }))} value={f.stage} onChange={setF('stage')} placeholder="Semua tahap" />
          <Select options={meta.cms.tiers.map(t => t.name)} value={f.tier} onChange={setF('tier')} placeholder="Semua tier" />
          <Select options={meta.settings.pic} value={f.pic} onChange={setF('pic')} placeholder="Semua PIC" />
          <Select options={['Lead', 'Aktif', 'Pasif', 'Churn']} value={f.status} onChange={setF('status')} placeholder="Semua status" />
          <select className="inp" aria-label="Urutkan" value={sort} onChange={e => setF('sort')(e.target.value === 'new' ? '' : e.target.value)}>{Object.entries(SORTS).map(([k, l]) => <option key={k} value={k}>Urut: {l}</option>)}</select>
          <span className="ml-auto text-xs text-ink-3 !min-w-0">{rows.length} reseller{newCount ? ` · ${newCount} baru (7 hari)` : ''}</span>
        </div>
        {rows.length ? <div className="overflow-x-auto"><table className="table"><thead><tr>
          <th>Nama</th><th>Tgl Daftar</th><th>WA</th><th>Area</th><th>Channel</th><th>PIC</th><th>Tahap</th><th>Tier</th><th>Status</th><th className="num">Order</th><th className="num">Revenue</th><th>Terakhir</th><th></th></tr></thead><tbody>
          {rows.map(r => <tr key={r.id}>
            <td><b>{r.name}</b>{isNew(r) && <span className="tag tag-good ml-1.5">Baru</span>}</td><td className="whitespace-nowrap">{r.joinedDate || '-'}</td><td>{r.phone || '-'}</td><td>{r.area || '-'}</td><td>{r.channel || '-'}</td><td>{r.pic || '-'}</td>
            <td><span className="tag">{stageOf(r.stage).label}</span></td><td><TierTag t={r.tier} /></td><td><StatusTag s={r.status} /></td>
            <td className="num">{fmtN(r.ordersCount)}</td><td className="num">{fmtRp(r.totalRevenue)}</td><td className="whitespace-nowrap">{r.lastOrderDate || '-'}</td>
            <td><button className="btn btn-sm" onClick={() => openDetail(r.id)}>Detail</button></td></tr>)}
        </tbody></table></div> : <Empty>Belum ada reseller yang cocok. {can.write && 'Klik “+ Reseller Baru” atau isi data contoh di Pengaturan.'}</Empty>}
      </div>
      {drawer}
    </>
  )
}
