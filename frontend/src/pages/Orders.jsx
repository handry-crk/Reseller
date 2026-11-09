import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHead } from '../components/Layout'
import { Bar, Empty, Kpi, Select } from '../components/ui'
import { api, fmtN, fmtRp } from '../lib/api'
import { useStore } from '../lib/store'
import { useDrawer } from '../lib/useDrawer'

const STATUS_CLS = { to_ship: 'tag-warn', shipping: '', completed: 'tag-good' }
export const OrderStatusTag = ({ s, statuses }) => {
  const st = (statuses || []).find(x => x.id === s)
  return <span className={'tag ' + (STATUS_CLS[s] || 'tag-muted')}>{st ? st.label : s || '-'}</span>
}

const monthLabel = (k) => { const [y, m] = k.split('-'); return new Date(+y, +m - 1, 1).toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }) }

export default function Orders() {
  const { meta, resellers, run, can } = useStore()
  const { openDetail, drawer } = useDrawer()
  const [month, setMonth] = useState(meta.today.slice(0, 7))
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [d, setD] = useState(null)
  const [busy, setBusy] = useState('')
  const load = () => api(`/api/orders?month=${month}${status ? '&status=' + status : ''}`).then(setD).catch(() => {})
  useEffect(() => { load() }, [month, status, resellers]) // eslint-disable-line
  const rows = useMemo(() => (d?.orders || []).filter(o => !q || [o.resellerName, o.invoiceNo, o.note].join(' ').toLowerCase().includes(q.toLowerCase())), [d, q])
  if (!d) return <Empty>Memuat pesanan…</Empty>
  const statuses = d.statuses
  const setSt = async (o, st) => {
    setBusy(o.id)
    try { await run(() => api(`/api/activities/${o.id}`, { method: 'PUT', body: { status: st } }), `${o.invoiceNo || 'Pesanan'} → ${statuses.find(x => x.id === st)?.label}`) } catch {} finally { setBusy('') }
  }
  const setRecv = async (o, v) => { if (v === (o.receivedDate || '')) return; try { await run(() => api(`/api/activities/${o.id}`, { method: 'PUT', body: { receivedDate: v } }), 'Tanggal diterima disimpan') } catch {} }
  const months = d.monthly.map(m => m.month)
  const totalMonth = rows.reduce((s, o) => s + (o.amount || 0), 0)
  const maxRev = Math.max(1, ...d.monthly.map(m => m.revenue))
  return (
    <>
      <PageHead title="<b>Pesanan</b> Reseller" sub="Monitoring pesanan masuk untuk Admin & Gudang: ubah status To Ship → Shipping → Completed, isi tanggal diterima, cetak invoice.">
        <Select options={months.slice().reverse().map(m => ({ value: m, label: monthLabel(m) }))} value={month} onChange={setMonth} />
      </PageHead>
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi label="To Ship" value={fmtN(d.counts.to_ship)} sub="menunggu dikirim gudang (semua bulan)" />
        <Kpi label="Shipping" value={fmtN(d.counts.shipping)} sub="dalam pengiriman (semua bulan)" />
        <Kpi label="Completed" value={fmtN(d.counts.completed)} sub="sudah diterima reseller (semua bulan)" />
        <Kpi label={`Revenue ${monthLabel(month)}`} value={fmtRp(totalMonth)} sub={`${fmtN(rows.length)} pesanan pada filter saat ini`} />
      </div>
      <div className="card mt-4">
        <div className="flex flex-wrap gap-2 items-center mb-3 [&>*]:w-auto [&>*]:min-w-[150px]">
          <input className="inp" placeholder="Cari invoice / reseller…" value={q} onChange={e => setQ(e.target.value)} />
          <Select options={statuses.map(s => ({ value: s.id, label: s.label }))} value={status} onChange={setStatus} placeholder="Semua status" />
          <span className="ml-auto text-xs text-ink-3 !min-w-0">{rows.length} pesanan</span>
        </div>
        {rows.length ? <div className="overflow-x-auto"><table className="table"><thead><tr>
          <th>Invoice</th><th>Tgl Pesan</th><th>Reseller</th><th>Area</th><th className="num">Pack</th><th className="num">Dibayar</th><th>Status</th><th>Tgl Diterima</th><th>Catatan</th><th></th></tr></thead><tbody>
          {rows.map(o => <tr key={o.id}>
            <td className="font-mono text-xs whitespace-nowrap">{o.invoiceNo || '-'}</td>
            <td className="whitespace-nowrap">{o.date}</td>
            <td><button className="link" onClick={() => openDetail(o.resellerId)}>{o.resellerName}</button><br /><small className="text-ink-3">{o.pic}</small></td>
            <td>{o.resellerArea || '-'}</td>
            <td className="num">{fmtN(o.qty)}</td><td className="num whitespace-nowrap">{fmtRp(o.amount)}</td>
            <td>{can.orderStatus
              ? <select className="inp !w-auto !py-1 text-xs" value={o.status} disabled={busy === o.id} onChange={e => setSt(o, e.target.value)}>{statuses.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
              : <OrderStatusTag s={o.status} statuses={statuses} />}</td>
            <td>{can.orderStatus ? <input key={o.id + (o.receivedDate || '')} className="inp !w-auto !py-1 text-xs" type="date" defaultValue={o.receivedDate || ''} max={meta.today} onChange={e => setRecv(o, e.target.value)} /> : (o.receivedDate || '-')}</td>
            <td className="max-w-[220px] truncate" title={o.note}>{o.note}</td>
            <td><Link className="btn btn-sm" to={`/invoice/${o.id}`}>Invoice</Link></td></tr>)}
        </tbody></table></div> : <Empty>Tidak ada pesanan pada filter ini.</Empty>}
      </div>
      <div className="card mt-4"><h3 className="card-title">Revenue per Bulan</h3><div className="hint">Total pembayaran reseller 12 bulan terakhir</div>
        <div className="flex flex-col gap-2">{d.monthly.map(m => <Bar key={m.month} label={monthLabel(m.month)} value={m.revenue} max={maxRev} extra={`${fmtRp(m.revenue)} · ${fmtN(m.orders)} order`} />)}</div></div>
      {drawer}
    </>
  )
}
