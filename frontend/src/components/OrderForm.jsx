import { useMemo, useState } from 'react'
import { api, fmtN, fmtRp, today } from '../lib/api'
import { useStore } from '../lib/store'

let seq = 0
const newRow = (products, name) => {
  const p = products.find(x => x.name === name) || products[0]
  return { key: ++seq, product: p ? p.name : '', qty: '', price: p ? p.price : 0 }
}

/** Hitung baris & total di sisi tampilan. Server menghitung ulang saat menyimpan (sumber kebenaran). */
export function computeItems(rows) {
  const lines = rows.map(r => {
    const qty = Number(r.qty)
    const price = Number(r.price)
    const qtyOk = Number.isInteger(qty) && qty >= 1
    const priceOk = Number.isInteger(price) && price >= 0
    return { ...r, qtyN: qtyOk ? qty : 0, priceN: priceOk ? price : 0, subtotal: qtyOk && priceOk ? qty * price : 0, valid: !!r.product && qtyOk && priceOk }
  })
  return { lines, totalQty: lines.reduce((s, l) => s + l.qtyN, 0), totalAmount: lines.reduce((s, l) => s + l.subtotal, 0), valid: lines.length > 0 && lines.every(l => l.valid) }
}

export function OrderItemsEditor({ rows, setRows, products, minPacks }) {
  const { lines, totalQty, totalAmount } = computeItems(rows)
  const upd = (key, patch) => setRows(rs => rs.map(r => r.key === key ? { ...r, ...patch } : r))
  const used = new Set(rows.map(r => r.product))
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="table">
          <thead><tr><th>Nama produk</th><th className="num">Jumlah pack</th><th className="num">Harga / pack (Rp)</th><th className="num">Subtotal</th><th></th></tr></thead>
          <tbody>
            {lines.map(l => (
              <tr key={l.key}>
                <td className="min-w-[180px]"><select className="inp" aria-label="Nama produk" value={l.product}
                  onChange={e => { const p = products.find(x => x.name === e.target.value); upd(l.key, { product: e.target.value, price: p ? p.price : l.price }) }}>
                  {products.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                </select></td>
                <td className="w-[120px]"><input className={'inp text-right ' + (l.qty !== '' && !l.valid && l.qtyN === 0 ? '!border-brick' : '')} aria-label="Jumlah pack" type="number" min="1" step="1" inputMode="numeric" placeholder="0"
                  value={l.qty} onChange={e => upd(l.key, { qty: e.target.value })} /></td>
                <td className="w-[150px]"><input className="inp text-right" aria-label="Harga per pack" type="number" min="0" step="100" inputMode="numeric"
                  value={l.price} onChange={e => upd(l.key, { price: e.target.value })} /></td>
                <td className="num whitespace-nowrap font-semibold" data-testid="subtotal">{fmtRp(l.subtotal)}</td>
                <td>{rows.length > 1 && <button type="button" className="btn btn-danger btn-sm" aria-label="Hapus baris" onClick={() => setRows(rs => rs.filter(r => r.key !== l.key))}>✕</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn btn-sm mt-2" disabled={!products.length}
        onClick={() => setRows(rs => [...rs, newRow(products, (products.find(p => !used.has(p.name)) || products[0]).name)])}>+ Tambah produk</button>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-white border border-line p-3"><div className="text-xs text-ink-2 font-semibold">Total pesanan</div><div className="text-2xl font-extrabold tabular-nums" data-testid="total-qty">{fmtN(totalQty)} pack</div></div>
        <div className="rounded-lg bg-brick-soft border border-brick p-3"><div className="text-xs text-ink-2 font-semibold">Total yang harus dibayar</div><div className="text-2xl font-extrabold text-brick tabular-nums" data-testid="total-amount">{fmtRp(totalAmount)}</div></div>
      </div>
      {minPacks > 0 && totalQty > 0 && totalQty < minPacks && <div className="note mt-2">Total {fmtN(totalQty)} pack di bawah minimal order ({fmtN(minPacks)} pack). Pesanan tetap bisa disimpan.</div>}
    </div>
  )
}

/** Form pesanan lengkap. resellerId kosong = tampilkan pilihan reseller (dipakai di menu Pesanan). */
export default function OrderForm({ resellerId, onDone, onCancel }) {
  const { meta, resellers, run } = useStore()
  const products = meta.cms.products || []
  const [rid, setRid] = useState(resellerId || '')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState(() => [newRow(products)])
  const [f, setF] = useState({ date: today(), status: 'to_ship', receivedDate: '', note: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const reseller = resellers.find(r => r.id === rid)
  const minPacks = reseller ? (reseller.ordersCount > 0 ? meta.cms.minRepeatOrder : meta.cms.minFirstOrder) : 0
  const options = useMemo(() => resellers.filter(r => !search || [r.name, r.phone, r.area].join(' ').toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name)), [resellers, search])
  const { lines, valid } = computeItems(rows)

  const submit = async () => {
    setErr('')
    if (!rid) return setErr('Pilih reseller terlebih dahulu')
    if (!valid) return setErr('Lengkapi setiap baris: produk, jumlah pack (bilangan bulat ≥ 1), dan harga')
    if (f.receivedDate && f.receivedDate < f.date) return setErr('Tanggal diterima tidak boleh sebelum tanggal pesanan')
    if (busy) return
    setBusy(true)
    const body = { resellerId: rid, type: 'order', date: f.date, status: f.status, receivedDate: f.status === 'completed' ? f.receivedDate : '', note: f.note,
      items: lines.map(l => ({ product: l.product, qty: l.qtyN, price: l.priceN })) }
    try { const r = await run(() => api('/api/activities', { method: 'POST', body }), 'Pesanan tersimpan, invoice dibuat'); onDone(r) } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  if (!products.length) return <div className="note">Katalog produk masih kosong. Isi daftar produk di menu CMS Program terlebih dahulu.</div>
  return (
    <div>
      {!resellerId && <div className="mb-4">
        <label className="lbl">Reseller *</label>
        <div className="grid md:grid-cols-2 gap-2">
          <input className="inp" placeholder="Cari nama / WA / area…" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="inp" aria-label="Reseller" value={rid} onChange={e => setRid(e.target.value)}>
            <option value="">— pilih reseller ({options.length}) —</option>
            {options.map(r => <option key={r.id} value={r.id}>{r.name}{r.area ? ` · ${r.area}` : ''}</option>)}
          </select>
        </div>
        {reseller && <div className="text-[11px] text-ink-3 mt-1">{reseller.phone} · PIC {reseller.pic || '-'} · {reseller.ordersCount ? `${reseller.ordersCount} order sebelumnya` : 'order pertama'}</div>}
      </div>}
      <OrderItemsEditor rows={rows} setRows={setRows} products={products} minPacks={minPacks} />
      <div className="grid md:grid-cols-3 gap-3 mt-4">
        <div><label className="lbl">Tanggal pesanan</label><input className="inp" type="date" value={f.date} max={today()} onChange={set('date')} /></div>
        <div><label className="lbl">Status</label><select className="inp" value={f.status} onChange={set('status')}><option value="to_ship">To Ship</option><option value="shipping">Shipping</option><option value="completed">Completed</option></select></div>
        <div><label className="lbl">Tanggal diterima</label><input className="inp" type="date" value={f.receivedDate} min={f.date} max={today()} disabled={f.status !== 'completed'} onChange={set('receivedDate')} />
          {f.status !== 'completed' && <div className="text-[11px] text-ink-3 mt-0.5">diisi saat status Completed</div>}</div>
        <div className="md:col-span-3"><label className="lbl">Catatan (pengiriman, packing, dll.)</label><textarea className="inp min-h-[56px]" value={f.note} onChange={set('note')} /></div>
      </div>
      {err && <div className="note mt-3">{err}</div>}
      <div className="text-[11px] text-ink-3 mt-2">Total dihitung otomatis dari jumlah pack × harga. Nomor invoice dibuat otomatis saat disimpan.</div>
      <div className="flex gap-2 mt-3"><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan Pesanan'}</button>{onCancel && <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>Batal</button>}</div>
    </div>
  )
}
