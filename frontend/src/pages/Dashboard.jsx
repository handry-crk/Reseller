import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHead } from '../components/Layout'
import { Bar, Empty, Kpi, TierTag } from '../components/ui'
import { Link } from 'react-router-dom'
import { api, fmtN, fmtRp } from '../lib/api'
import { useStore } from '../lib/store'
import { useDrawer } from '../lib/useDrawer'

export default function Dashboard() {
  const { resellers, can } = useStore()
  const nav = useNavigate()
  const [period, setPeriod] = useState('all')
  const [d, setD] = useState(null)
  const { openDetail, openForm, drawer } = useDrawer()
  useEffect(() => { api('/api/dashboard?period=' + period).then(setD).catch(() => {}) }, [period, resellers])
  if (!d) return <Empty>Memuat dashboard…</Empty>
  const k = d.kpi
  const max = Math.max(1, k.total)
  const tierMax = Math.max(1, ...d.tiers.map(t => t.count))
  const picMax = Math.max(1, ...d.pics.map(p => p.resellers))
  return (
    <>
      <PageHead title="<b>Reseller</b> Dashboard" sub={`${fmtN(k.total)} reseller · ${d.today}`}>
        <select className="inp w-auto" value={period} onChange={e => setPeriod(e.target.value)}>
          <option value="30">30 hari terakhir</option><option value="90">90 hari terakhir</option><option value="365">12 bulan</option><option value="all">Semua periode</option>
        </select>
        {can.write && <button className="btn btn-primary" onClick={() => openForm()}>+ Reseller Baru</button>}
      </PageHead>
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi label="Total Reseller" value={fmtN(k.total)} sub={`${fmtN(k.newInPeriod)} baru pada periode`} />
        <Kpi label="Reseller Aktif" value={fmtN(k.byStatus.Aktif)} sub={`${fmtN(k.byStatus.Pasif)} pasif · ${fmtN(k.byStatus.Churn)} churn`} />
        <Kpi label="Repeat Order Rate" value={k.buyers ? Math.round(k.repeatRate * 100) + '%' : '–'} sub={`${fmtN(k.repeat)} dari ${fmtN(k.buyers)} pembeli`} />
        <Kpi label="Revenue Reseller" value={fmtRp(k.revenue)} sub={`${fmtN(k.orders)} order · AOV ${k.orders ? fmtRp(k.aov) : '–'}`} />
      </div>
      <div className="card mt-4">
        <h3 className="card-title">Alur Reseller (Flow)</h3><div className="hint">Jumlah reseller pada setiap tahap. Klik tahap untuk melihat daftarnya.</div>
        <div className="flex gap-1.5 overflow-x-auto pb-2">
          {d.stages.map((s, i) => (
            <button key={s.stage} onClick={() => nav('/reseller?stage=' + s.stage)} className={'flex-1 min-w-[120px] text-left rounded-lg border p-2.5 hover:border-brick ' + (s.side ? 'bg-brick-soft border-dashed border-line' : s.stage === 'retention' ? 'bg-[#E7EFE3] border-line' : 'bg-white border-line')}>
              <div className="text-[11px] text-ink-3 uppercase tracking-wider font-semibold">{s.side ? '↩' : i + 1}</div>
              <div className="font-bold text-[12.5px] leading-tight my-0.5">{s.label}</div>
              <div className="text-2xl font-extrabold text-brick tabular-nums">{fmtN(s.count)}</div>
              <div className="text-[11px] text-ink-3">{s.owner}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="grid lg:grid-cols-[2fr_1fr] gap-4 mt-4">
        <div className="card"><h3 className="card-title">Funnel per Tahap</h3><div className="hint">Reseller yang sudah melewati tahap tersebut (kumulatif)</div>
          <div className="flex flex-col gap-2">{d.funnel.map(f => <Bar key={f.stage} label={f.label} value={f.count} max={max} extra={k.total ? Math.round(f.count / k.total * 100) + '%' : ''} />)}</div></div>
        <div className="card"><h3 className="card-title">Distribusi Tier</h3><div className="hint">Reseller yang sudah order, per tier</div>
          <div className="flex flex-col gap-2">{d.tiers.length ? d.tiers.map(t => <Bar key={t.tier} label={t.tier} value={t.count} max={tierMax} />) : <Empty>Atur tier di CMS</Empty>}</div></div>
      </div>
      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <div className="card"><h3 className="card-title">Perlu Tindakan</h3><div className="hint">Follow-up jatuh tempo, reseller pasif & complaint open</div>
          {d.todo.length ? <div className="overflow-x-auto"><table className="table"><thead><tr><th>Reseller</th><th>Tindakan</th><th>PIC</th></tr></thead><tbody>
            {d.todo.slice(0, 10).map((t, i) => <tr key={i}><td><button className="link" onClick={() => openDetail(t.id)}>{t.name}</button></td><td><span className={'tag ' + (t.kind === 'complaint' ? '' : 'tag-warn')}>{t.text}</span></td><td>{t.pic || '-'}</td></tr>)}
          </tbody></table></div> : <Empty>Tidak ada tindakan tertunda</Empty>}</div>
        <div className="card"><h3 className="card-title">Performa PIC</h3><div className="hint">Reseller & repeat order per penanggung jawab</div>
          <div className="flex flex-col gap-2">{d.pics.length ? d.pics.map(p => <Bar key={p.pic} label={p.pic} value={p.resellers} max={picMax} extra={`${p.repeat} repeat`} />) : <Empty>Belum ada data</Empty>}</div></div>
      </div>
      <div className="grid lg:grid-cols-[1fr_2fr] gap-4 mt-4">
        <div className="card"><h3 className="card-title">Status Pesanan</h3><div className="hint">Monitoring gudang, semua periode</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[['to_ship', 'To Ship', 'tag-warn'], ['shipping', 'Shipping', ''], ['completed', 'Completed', 'tag-good']].map(([k, l, c]) => <div key={k} className="bg-white rounded-lg border border-line p-3"><div className="text-2xl font-extrabold text-brick tabular-nums">{fmtN(d.orderCounts?.[k])}</div><span className={'tag ' + c}>{l}</span></div>)}
          </div>
          <Link to="/pesanan" className="btn btn-sm mt-3">Buka halaman Pesanan →</Link></div>
        <div className="card"><h3 className="card-title">Revenue per Bulan</h3><div className="hint">Total pembayaran reseller, 12 bulan terakhir</div>
          <div className="flex flex-col gap-2">{(d.monthly || []).map(m => <Bar key={m.month} label={new Date(m.month + '-01T00:00:00').toLocaleDateString('id-ID', { month: 'short', year: '2-digit' })} value={m.revenue} max={Math.max(1, ...d.monthly.map(x => x.revenue))} extra={fmtRp(m.revenue)} />)}</div></div>
      </div>
      <div className="card mt-4"><h3 className="card-title">Top Reseller by Revenue</h3><div className="hint">10 reseller dengan total pembelian tertinggi</div>
        {d.top.length ? <div className="overflow-x-auto"><table className="table"><thead><tr><th>#</th><th>Reseller</th><th>Area</th><th>Tier</th><th className="num">Order</th><th className="num">Pack</th><th className="num">Revenue</th><th>Order Terakhir</th></tr></thead><tbody>
          {d.top.map((r, i) => <tr key={r.id}><td>{i + 1}</td><td><button className="link" onClick={() => openDetail(r.id)}>{r.name}</button></td><td>{r.area || '-'}</td><td><TierTag t={r.tier} /></td><td className="num">{fmtN(r.ordersCount)}</td><td className="num">{fmtN(r.totalPacks)}</td><td className="num">{fmtRp(r.totalRevenue)}</td><td>{r.lastOrderDate || '-'}</td></tr>)}
        </tbody></table></div> : <Empty>Belum ada order tercatat</Empty>}</div>
      {drawer}
    </>
  )
}
