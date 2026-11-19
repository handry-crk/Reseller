import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import DateRange, { PRESETS, rangeLabel } from '../components/DateRange'
import { PageHead } from '../components/Layout'
import OrderForm from '../components/OrderForm'
import { ProofUpload, ProofView } from '../components/Proof'
import { Bar, Drawer, Empty, Kpi, Select } from '../components/ui'
import { api, fmtN, fmtRp } from '../lib/api'
import { useStore } from '../lib/store'
import { Skeleton, useFlashNew } from '../lib/motion'
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
  const [sp, setSp] = useSearchParams()
  // Periode di alamat halaman (?p=…&from=…&to=…); bawaan = Bulan ini.
  const preset = PRESETS.some(x => x.id === sp.get('p')) ? sp.get('p') : 'month'
  const range = preset === 'custom' ? { preset, from: sp.get('from') || '', to: sp.get('to') || '' }
    : (() => { const [from, to] = PRESETS.find(x => x.id === preset).range(meta.today); return { preset, from, to } })()
  const setRange = (v) => setSp({ p: v.preset, ...(v.preset === 'custom' ? { from: v.from, to: v.to } : {}) }, { replace: true })
  const label = rangeLabel(range.from, range.to)
  const isAll = !range.from && !range.to
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [d, setD] = useState(null)
  const [busy, setBusy] = useState('')
  const [creating, setCreating] = useState(false)
  const load = () => api(`/api/orders?${isAll ? '' : `from=${range.from}&to=${range.to}`}${status ? '&status=' + status : ''}`).then(x => setD({ ...x, key: `${range.from}|${range.to}|${status}` })).catch(() => {})
  useEffect(() => { load() }, [range.from, range.to, status, resellers]) // eslint-disable-line
  const rows = useMemo(() => (d?.orders || []).filter(o => !q || [o.resellerName, o.invoiceNo, o.note].join(' ').toLowerCase().includes(q.toLowerCase())), [d, q])
  const flash = useFlashNew(d ? d.orders.map(o => o.id) : [], d ? d.key : 'loading')
  if (!d) return <Skeleton blocks={1} label="Memuat pesanan…" />
  const statuses = d.statuses
  const setSt = async (o, st) => {
    setBusy(o.id)
    try { await run(() => api(`/api/activities/${o.id}`, { method: 'PUT', body: { status: st } }), `${o.invoiceNo || 'Pesanan'} → ${statuses.find(x => x.id === st)?.label}`) } catch {} finally { setBusy('') }
  }
  const setRecv = async (o, v) => { if (v === (o.receivedDate || '')) return; try { await run(() => api(`/api/activities/${o.id}`, { method: 'PUT', body: { receivedDate: v } }), 'Tanggal diterima disimpan') } catch {} }
  const totalMonth = rows.reduce((s, o) => s + (o.amount || 0), 0)
  const maxRev = Math.max(1, ...d.monthly.map(m => m.revenue))
  return (
    <>
      <PageHead title="<b>Pesanan</b> Reseller" sub="Monitoring pesanan masuk untuk Admin & Gudang: ubah status To Ship → Shipping → Completed, isi tanggal diterima, cetak invoice.">
        <DateRange value={range} onChange={setRange} today={meta.today} />
        {can.write && <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Pesanan Baru</button>}
      </PageHead>
      <div className="flex flex-wrap items-center gap-2 mb-3" data-testid="orders-range">
        <span className="tag">Periode: {label}</span>
        {d.backlogOutside > 0 && <span className="note !py-1">{fmtN(d.backlogOutside)} pesanan To Ship/Shipping ada di luar periode ini. <button className="link" onClick={() => setRange({ preset: 'all', from: '', to: '' })}>Lihat semua periode</button></span>}
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi label="To Ship" value={fmtN(d.counts.to_ship)} sub="menunggu dikirim gudang" />
        <Kpi label="Shipping" value={fmtN(d.counts.shipping)} sub="dalam pengiriman" />
        <Kpi label="Completed" value={fmtN(d.counts.completed)} sub="sudah diterima reseller" />
        <Kpi label="Revenue periode" value={fmtRp(totalMonth)} sub={`${fmtN(rows.length)} pesanan · ${fmtN(rows.reduce((s, o) => s + (o.qty || 0), 0))} pack · ongkir ${fmtRp(rows.reduce((s, o) => s + (o.shippingFee || 0), 0))} (di luar revenue) · ${rows.filter(o => !o.paymentProof).length} belum ada bukti TF`} />
      </div>
      <div className="card mt-4">
        <div className="flex flex-wrap gap-2 items-center mb-3 [&>*]:w-auto [&>*]:min-w-[150px]">
          <input className="inp" placeholder="Cari invoice / reseller…" value={q} onChange={e => setQ(e.target.value)} />
          <Select options={statuses.map(s => ({ value: s.id, label: s.label }))} value={status} onChange={setStatus} placeholder="Semua status" />
          <span className="ml-auto text-xs text-ink-3 !min-w-0">{rows.length} pesanan</span>
        </div>
        {rows.length ? <div className="overflow-x-auto"><table className="table"><thead><tr>
          <th>Invoice</th><th>Tgl Pesan</th><th>Reseller</th><th>Produk</th><th className="num">Pack</th><th className="num">Dibayar</th><th>Bukti TF</th><th>Bukti Ongkir</th><th>Status</th><th>Tgl Diterima</th><th>Catatan</th><th></th></tr></thead><tbody>
          {rows.map(o => <tr key={o.id} className={flash(o.id)}>
            <td className="font-mono text-xs whitespace-nowrap">{o.invoiceNo || '-'}</td>
            <td className="whitespace-nowrap">{o.date}</td>
            <td><button className="link" onClick={() => openDetail(o.resellerId)}>{o.resellerName}</button><br /><small className="text-ink-3">{o.pic}</small></td>
            <td className="text-xs min-w-[150px]">{o.items?.length ? o.items.map(i => <div key={i.product + i.price}>{i.product} <b>×{fmtN(i.qty)}</b></div>) : <span className="text-ink-3">(tanpa rincian)</span>}</td>
            <td className="num">{fmtN(o.qty)}</td><td className="num whitespace-nowrap">{fmtRp(o.totalPaid)}{(o.shippingFee > 0 || o.discount > 0) && <div className="text-[10.5px] text-ink-3 font-normal">{o.discount > 0 ? `diskon ${fmtRp(o.discount)}` : ''}{o.discount > 0 && o.shippingFee > 0 ? ' · ' : ''}{o.shippingFee > 0 ? `ongkir ${fmtRp(o.shippingFee)}` : ''}</div>}</td>
            <td className="whitespace-nowrap" data-testid="proof-cell">{o.paymentProof ? <><span className="tag tag-good mr-1">✓ ada</span><ProofView order={o} canDelete={can.deleteReseller} onDeleted={load} /></> : can.write ? <ProofUpload compact order={o} onUploaded={load} /> : <span className="tag tag-warn">belum</span>}</td>
            <td className="whitespace-nowrap" data-testid="ship-proof-cell">{o.shippingProof ? <><span className="tag tag-good mr-1">✓ ada</span><ProofView kind="shipping" order={o} canDelete={can.deleteReseller} onDeleted={load} /></> : can.shipProof ? <ProofUpload kind="shipping" compact order={o} onUploaded={load} /> : <span className="tag tag-muted">belum</span>}</td>
            <td>{can.orderStatus
              ? <select className="inp !w-auto !py-1 text-xs" value={o.status} disabled={busy === o.id} onChange={e => setSt(o, e.target.value)}>{statuses.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
              : <OrderStatusTag s={o.status} statuses={statuses} />}</td>
            <td>{can.orderStatus ? <input key={o.id + (o.receivedDate || '')} className="inp !w-auto !py-1 text-xs" type="date" defaultValue={o.receivedDate || ''} max={meta.today} onChange={e => setRecv(o, e.target.value)} /> : (o.receivedDate || '-')}</td>
            <td className="max-w-[220px] truncate" title={o.note}>{o.note}</td>
            <td><Link className="btn btn-sm" to={`/invoice/${o.id}`}>Invoice</Link></td></tr>)}
        </tbody></table></div> : <Empty>Tidak ada pesanan pada filter ini.</Empty>}
      </div>
      <div className="card mt-4"><h3 className="card-title">Penjualan per Produk · {label}</h3><div className="hint">Pack dan nilai per varian pada filter saat ini</div>
        {d.products?.length ? <div className="flex flex-col gap-2">{d.products.map(p => <Bar key={p.product} label={p.product} value={p.packs} max={Math.max(1, ...d.products.map(x => x.packs))} extra={`${fmtN(p.packs)} pack · ${fmtRp(p.revenue)}`} />)}</div> : <Empty>Belum ada pesanan.</Empty>}</div>
      <div className="card mt-4"><h3 className="card-title">Revenue per Bulan</h3><div className="hint">Total pembayaran reseller 12 bulan terakhir</div>
        <div className="flex flex-col gap-2">{d.monthly.map(m => <Bar key={m.month} label={monthLabel(m.month)} value={m.revenue} max={maxRev} extra={`${fmtRp(m.revenue)} · ${fmtN(m.orders)} order`} />)}</div></div>
      {drawer}
      <Drawer open={creating} onClose={() => setCreating(false)}>
        <h2 className="text-2xl font-extrabold text-brick mb-1">Pesanan Baru</h2>
        <div className="text-[13px] text-ink-2 mb-4">Pilih reseller, isi produk dan jumlah pack. Total dihitung otomatis.</div>
        <OrderForm onDone={() => { setCreating(false); load() }} onCancel={() => setCreating(false)} />
      </Drawer>
    </>
  )
}
