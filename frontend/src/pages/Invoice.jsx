import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, fmtN, fmtRp } from '../lib/api'

const STATUS_LABEL = { to_ship: 'To Ship', shipping: 'Shipping', completed: 'Completed' }
const fmtDate = (s) => s ? new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-'

/** Halaman invoice resmi: siap cetak / simpan PDF lewat tombol Cetak (Ctrl+P). */
export default function Invoice() {
  const { id } = useParams()
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { api(`/api/activities/${id}`).then(setD).catch(e => setErr(e.message)) }, [id])
  if (err) return <div className="p-8 text-brick">{err}</div>
  if (!d) return <div className="p-8 text-ink-3">Memuat invoice…</div>
  const { activity: a, reseller: r, company: c, cms } = d
  const unit = cms.pricePerPack || (a.qty ? Math.round(a.amount / a.qty) : 0)
  const gross = unit * (a.qty || 0)
  const adj = (a.amount || 0) - gross
  return (
    <div className="min-h-screen bg-white text-ink">
      <style>{`@media print { .no-print { display: none !important } body { background: white } @page { size: A4; margin: 14mm } }`}</style>
      <div className="no-print flex gap-2 p-4 border-b border-line bg-cream">
        <Link to="/pesanan" className="btn btn-ghost btn-sm">← Kembali</Link>
        <button className="btn btn-primary btn-sm" onClick={() => window.print()}>Cetak / Simpan PDF</button>
        <span className="text-xs text-ink-3 self-center">Di jendela cetak pilih “Save as PDF” untuk mengirim ke reseller.</span>
      </div>
      <div className="max-w-[800px] mx-auto p-8 md:p-12">
        <div className="flex justify-between items-start gap-6 border-b-2 border-brick pb-5">
          <div>
            <div className="text-2xl font-extrabold text-brick leading-tight">{c.name}</div>
            <div className="text-xs text-ink-2 whitespace-pre-line mt-1">{c.address}{c.phone ? `\nTelp/WA: ${c.phone}` : ''}{c.email ? `\n${c.email}` : ''}</div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-extrabold tracking-wide">INVOICE</div>
            <div className="font-mono text-sm mt-1">{a.invoiceNo || '-'}</div>
            <div className="text-xs text-ink-2 mt-1">Status: <b>{STATUS_LABEL[a.status] || a.status}</b></div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-6 mt-6 text-sm">
          <div><div className="text-xs font-bold text-ink-3 uppercase tracking-wider mb-1">Ditagihkan kepada</div>
            <div className="font-bold">{r?.name || '-'}</div><div>{r?.phone}</div><div className="whitespace-pre-line">{r?.address}</div><div className="text-ink-2">{r?.area}</div></div>
          <div className="text-right"><table className="ml-auto text-sm"><tbody>
            <tr><td className="pr-4 text-ink-3">Tanggal pesanan</td><td className="font-semibold">{fmtDate(a.date)}</td></tr>
            <tr><td className="pr-4 text-ink-3">Tanggal diterima</td><td className="font-semibold">{fmtDate(a.receivedDate)}</td></tr>
            <tr><td className="pr-4 text-ink-3">PIC</td><td className="font-semibold">{r?.pic || '-'}</td></tr>
          </tbody></table></div>
        </div>
        <table className="w-full mt-8 text-sm border-collapse">
          <thead><tr className="bg-brick text-cream"><th className="text-left px-3 py-2 rounded-l-lg">Deskripsi</th><th className="text-right px-3 py-2">Qty (pack)</th><th className="text-right px-3 py-2">Harga / pack</th><th className="text-right px-3 py-2 rounded-r-lg">Subtotal</th></tr></thead>
          <tbody>
            <tr className="border-b border-line"><td className="px-3 py-3">Cimol Bojot AA Frozen{a.note ? <div className="text-xs text-ink-2">{a.note}</div> : null}</td><td className="text-right px-3 py-3 tabular-nums">{fmtN(a.qty)}</td><td className="text-right px-3 py-3 tabular-nums">{fmtRp(unit)}</td><td className="text-right px-3 py-3 tabular-nums">{fmtRp(gross)}</td></tr>
            {adj !== 0 && <tr className="border-b border-line"><td className="px-3 py-2 text-ink-2" colSpan="3">{adj < 0 ? 'Diskon / penyesuaian' : 'Biaya tambahan (ongkir, dll.)'}</td><td className="text-right px-3 py-2 tabular-nums">{adj < 0 ? '−' : ''}{fmtRp(Math.abs(adj))}</td></tr>}
          </tbody>
          <tfoot><tr><td colSpan="3" className="text-right px-3 py-3 font-bold">Total dibayar</td><td className="text-right px-3 py-3 font-extrabold text-brick text-lg tabular-nums">{fmtRp(a.amount)}</td></tr></tfoot>
        </table>
        {c.bank && <div className="mt-6 text-sm"><div className="text-xs font-bold text-ink-3 uppercase tracking-wider mb-1">Pembayaran</div><div className="whitespace-pre-line">{c.bank}</div></div>}
        {c.invoiceNote && <div className="mt-6 text-xs text-ink-2 border-t border-line pt-4 whitespace-pre-line">{c.invoiceNote}</div>}
        <div className="mt-10 grid grid-cols-2 text-xs text-ink-3"><div>Dibuat oleh: {a.by || '-'}</div><div className="text-right">Dicetak: {new Date().toLocaleDateString('id-ID')}</div></div>
      </div>
    </div>
  )
}
