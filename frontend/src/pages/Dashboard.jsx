import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import DateRange, { PRESETS, rangeLabel } from '../components/DateRange'
import { PageHead } from '../components/Layout'
import { Bar, Empty, Kpi, TierTag } from '../components/ui'
import { Link } from 'react-router-dom'
import { api, fmtN, fmtRp } from '../lib/api'
import { useStore } from '../lib/store'
import { useDrawer } from '../lib/useDrawer'

export default function Dashboard() {
  const { resellers, can, meta, stageOf } = useStore()
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  // Periode disimpan di alamat halaman (?p=…&from=…&to=…) agar bisa dibagikan / tetap saat dimuat ulang.
  const preset = PRESETS.some(x => x.id === sp.get('p')) ? sp.get('p') : 'all'
  const range = preset === 'custom' ? { preset, from: sp.get('from') || '', to: sp.get('to') || '' }
    : (() => { const [from, to] = PRESETS.find(x => x.id === preset).range(meta.today); return { preset, from, to } })()
  const setRange = (v) => { const n = new URLSearchParams(); if (v.preset !== 'all') n.set('p', v.preset); if (v.preset === 'custom') { n.set('from', v.from); n.set('to', v.to) } setSp(n, { replace: true }) }
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const { openDetail, openForm, drawer } = useDrawer()
  useEffect(() => {
    let alive = true
    const q = range.from || range.to ? `?from=${range.from}&to=${range.to}` : ''
    api('/api/dashboard' + q).then(x => { if (alive) { setD(x); setErr('') } }).catch(e => alive && setErr(e.message))
    return () => { alive = false }
  }, [range.from, range.to, resellers]) // eslint-disable-line
  if (!d) return <Empty>{err || 'Memuat dashboard…'}</Empty>
  const label = rangeLabel(d.range.from, d.range.to)
  const cmp = d.compare
  const vs = cmp ? `vs ${rangeLabel(cmp.from, cmp.to)}` : ''
  const isAll = !d.range.from && !d.range.to
  const k = d.kpi
  const max = Math.max(1, k.total)
  const tierMax = Math.max(1, ...d.tiers.map(t => t.count))
  const picMax = Math.max(1, ...d.pics.map(p => p.resellers))
  return (
    <>
      <PageHead title="<b>Reseller</b> Dashboard" sub={`${fmtN(k.total)} reseller · ${d.today}`}>
        <DateRange value={range} onChange={setRange} today={meta.today} />
        {can.write && <button className="btn btn-primary" onClick={() => openForm()}>+ Reseller Baru</button>}
      </PageHead>
      <div className="flex flex-wrap items-center gap-2 mb-3 text-[13px]" data-testid="range-banner">
        <span className="tag">Periode: {label}</span>{cmp && <span className="tag tag-muted">Pembanding: {rangeLabel(cmp.from, cmp.to)}</span>}
        <Link to="/performa" className="link text-xs">Lihat performa mingguan & bulanan →</Link>
        {!isAll && <span className="text-xs text-ink-3">Revenue, order, reseller baru, status pesanan, performa PIC & top reseller mengikuti periode. Status, tahap, tier & Perlu Tindakan = kondisi hari ini.</span>}
        {err && <span className="text-xs text-brick">{err}</span>}
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi label="Total Reseller" value={fmtN(k.total)} sub={isAll ? `${fmtN(k.total)} terdaftar` : `${fmtN(k.newInPeriod)} baru · ${fmtN(k.buyersInPeriod)} reseller order di periode`}
          delta={cmp?.delta.buyers} deltaNote={cmp && `reseller order ${vs} (${fmtN(cmp.kpi.buyers)})`} />
        <Kpi label="Reseller Aktif" value={fmtN(k.byStatus.Aktif)} sub={`${fmtN(k.byStatus.Pasif)} pasif · ${fmtN(k.byStatus.Churn)} churn`} />
        <Kpi label="Repeat Order Rate" value={k.buyers ? Math.round(k.repeatRate * 100) + '%' : '–'} sub={`${fmtN(k.repeat)} dari ${fmtN(k.buyers)} pembeli`} />
        <Kpi label={isAll ? 'Revenue Reseller' : 'Revenue Periode'} value={fmtRp(k.revenue)} sub={`${fmtN(k.orders)} order · ${fmtN(k.packs)} pack · AOV ${k.orders ? fmtRp(k.aov) : '–'}`}
          delta={cmp?.delta.revenue} deltaNote={cmp && `${vs} (${fmtRp(cmp.kpi.revenue)})`} />
      </div>
      <div className="card mt-4">
        <h3 className="card-title">Alur Reseller (Flow)</h3><div className="hint">Kondisi hari ini: jumlah reseller pada setiap tahap. Klik tahap untuk melihat daftarnya.</div>
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
      <div className="card mt-4" data-testid="new-resellers">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><h3 className="card-title">Reseller Baru</h3><div className="hint">{isAll ? `${fmtN(d.newResellers.length)} pendaftar terbaru` : `${fmtN(d.newResellersTotal)} reseller didaftarkan pada periode: ${label}`} · terbaru di atas, otomatis terisi setiap ada reseller baru</div></div>
          <Link to="/reseller?sort=new" className="btn btn-sm">Lihat semua →</Link>
        </div>
        {d.newResellers.length ? <div className="overflow-x-auto"><table className="table"><thead><tr><th>Reseller</th><th>Tgl Daftar</th><th>Area</th><th>Channel</th><th>PIC</th><th>Tahap</th><th>Order</th></tr></thead><tbody>
          {d.newResellers.map(r => <tr key={r.id}>
            <td><button className="link" onClick={() => openDetail(r.id)}>{r.name}</button>{r.joinedDate === d.today && <span className="tag tag-good ml-1.5">Hari ini</span>}</td>
            <td className="whitespace-nowrap">{r.joinedDate}</td><td>{r.area || '-'}</td><td>{r.channel || '-'}</td><td>{r.pic || '-'}</td>
            <td><span className="tag">{stageOf(r.stage).label}</span></td>
            <td>{r.ordersCount ? <span className="tag tag-good">{fmtN(r.ordersCount)}× · {fmtRp(r.totalRevenue)}</span> : <span className="tag tag-warn">Belum order</span>}</td></tr>)}
        </tbody></table></div> : <Empty>Tidak ada reseller baru pada periode ini</Empty>}
        {d.newResellersTotal > d.newResellers.length && <div className="text-xs text-ink-3 mt-2">Menampilkan {d.newResellers.length} terbaru dari {fmtN(d.newResellersTotal)}.</div>}
      </div>
      <div className="grid lg:grid-cols-[2fr_1fr] gap-4 mt-4">
        <div className="card"><h3 className="card-title">Funnel per Tahap</h3><div className="hint">Kondisi hari ini: reseller yang sudah melewati tahap tersebut (kumulatif)</div>
          <div className="flex flex-col gap-2">{d.funnel.map(f => <Bar key={f.stage} label={f.label} value={f.count} max={max} extra={k.total ? Math.round(f.count / k.total * 100) + '%' : ''} />)}</div></div>
        <div className="card"><h3 className="card-title">Distribusi Tier</h3><div className="hint">Kondisi hari ini: reseller yang sudah order, per tier</div>
          <div className="flex flex-col gap-2">{d.tiers.length ? d.tiers.map(t => <Bar key={t.tier} label={t.tier} value={t.count} max={tierMax} />) : <Empty>Atur tier di CMS</Empty>}</div></div>
      </div>
      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <div className="card"><h3 className="card-title">Perlu Tindakan</h3><div className="hint">Follow-up jatuh tempo, reseller pasif & complaint open</div>
          {d.todo.length ? <div className="overflow-x-auto"><table className="table"><thead><tr><th>Reseller</th><th>Tindakan</th><th>PIC</th></tr></thead><tbody>
            {d.todo.slice(0, 10).map((t, i) => <tr key={i}><td><button className="link" onClick={() => openDetail(t.id)}>{t.name}</button></td><td><span className={'tag ' + (t.kind === 'complaint' ? '' : 'tag-warn')}>{t.text}</span></td><td className="whitespace-nowrap">{t.pic || '-'}</td></tr>)}
          </tbody></table></div> : <Empty>Tidak ada tindakan tertunda</Empty>}</div>
        <div className="card"><h3 className="card-title">Performa PIC</h3><div className="hint">Jumlah reseller & revenue per penanggung jawab · revenue {isAll ? "semua periode" : label}</div>
          <div className="flex flex-col gap-2">{d.pics.length ? d.pics.map(p => <Bar key={p.pic} label={p.pic} value={p.resellers} max={picMax} extra={`${fmtRp(p.revenue)} · ${p.repeat} repeat`} />) : <Empty>Belum ada data</Empty>}</div></div>
      </div>
      <div className="grid lg:grid-cols-[1fr_2fr] gap-4 mt-4">
        <div className="card"><h3 className="card-title">Status Pesanan</h3><div className="hint">Pesanan dengan tanggal pesan pada periode: {label}</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[['to_ship', 'To Ship', 'tag-warn'], ['shipping', 'Shipping', ''], ['completed', 'Completed', 'tag-good']].map(([k, l, c]) => <div key={k} className="bg-white rounded-lg border border-line p-3"><div className="text-2xl font-extrabold text-brick tabular-nums">{fmtN(d.orderCounts?.[k])}</div><span className={'tag ' + c}>{l}</span></div>)}
          </div>
          <Link to="/pesanan" className="btn btn-sm mt-3">Buka halaman Pesanan →</Link></div>
        <div className="card"><h3 className="card-title">Revenue per Bulan</h3><div className="hint">Total pembayaran reseller, 12 bulan terakhir</div>
          <div className="flex flex-col gap-2">{(d.monthly || []).map(m => <Bar key={m.month} label={new Date(m.month + '-01T00:00:00').toLocaleDateString('id-ID', { month: 'short', year: '2-digit' })} value={m.revenue} max={Math.max(1, ...d.monthly.map(x => x.revenue))} extra={fmtRp(m.revenue)} />)}</div></div>
      </div>
      <div className="card mt-4"><h3 className="card-title">Top Reseller by Revenue</h3><div className="hint">10 reseller dengan pembelian tertinggi · {label}</div>
        {d.top.length ? <div className="overflow-x-auto"><table className="table"><thead><tr><th>#</th><th>Reseller</th><th>Area</th><th>Tier</th><th className="num">Order</th><th className="num">Pack</th><th className="num">Revenue</th><th>Order Terakhir</th></tr></thead><tbody>
          {d.top.map((r, i) => <tr key={r.id}><td>{i + 1}</td><td><button className="link" onClick={() => openDetail(r.id)}>{r.name}</button></td><td>{r.area || '-'}</td><td><TierTag t={r.tier} /></td><td className="num">{fmtN(r.ordersCount)}</td><td className="num">{fmtN(r.totalPacks)}</td><td className="num">{fmtRp(r.totalRevenue)}</td><td>{r.lastOrderDate || '-'}</td></tr>)}
        </tbody></table></div> : <Empty>Belum ada order pada periode ini</Empty>}</div>
      {drawer}
    </>
  )
}
