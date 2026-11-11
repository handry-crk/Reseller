import { useMemo, useState } from 'react'
import { api, fmtN, fmtRp, today } from '../lib/api'
import { ProofUpload } from './Proof'
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

const toInt = (v) => { const n = Number(v); return v === '' || v === undefined ? 0 : Number.isInteger(n) && n >= 0 ? n : NaN }

/** Uang pesanan: revenue = subtotal − diskon; dibayar = revenue + ongkir (sama dengan perhitungan server). */
export function computeMoney(subtotal, discount, shipping) {
  const d = toInt(discount), sh = toInt(shipping)
  const error = Number.isNaN(d) ? 'Diskon harus angka bulat ≥ 0' : Number.isNaN(sh) ? 'Ongkir harus angka bulat ≥ 0' : d > subtotal ? 'Diskon tidak boleh melebihi subtotal produk' : ''
  const disc = Number.isNaN(d) ? 0 : d, ship = Number.isNaN(sh) ? 0 : sh
  return { subtotal, discount: disc, shipping: ship, net: Math.max(0, subtotal - disc), total: Math.max(0, subtotal - disc) + ship, error }
}

export function OrderItemsEditor({ rows, setRows, products, minPacks, discount = '', shipping = '', setDiscount, setShipping }) {
  const { lines, totalQty, totalAmount } = computeItems(rows)
  const money = computeMoney(totalAmount, discount, shipping)
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
      {setDiscount && <div className="grid grid-cols-2 gap-3 mt-4">
        <div><label className="lbl">Diskon (Rp)</label><input className="inp text-right" aria-label="Diskon" type="number" min="0" step="500" inputMode="numeric" placeholder="0" value={discount} onChange={e => setDiscount(e.target.value)} /></div>
        <div><label className="lbl">Ongkir (Rp)</label><input className="inp text-right" aria-label="Ongkir" type="number" min="0" step="500" inputMode="numeric" placeholder="0" value={shipping} onChange={e => setShipping(e.target.value)} /></div>
      </div>}
      <div className="mt-3 grid md:grid-cols-[1fr_1.4fr] gap-3">
        <div className="rounded-lg bg-white border border-line p-3"><div className="text-xs text-ink-2 font-semibold">Total pesanan</div><div className="text-2xl font-extrabold tabular-nums" data-testid="total-qty">{fmtN(totalQty)} pack</div></div>
        <div className="rounded-lg bg-brick-soft border border-brick p-3">
          {setDiscount && <table className="w-full text-[12.5px] mb-1"><tbody>
            <tr><td className="text-ink-2">Subtotal produk</td><td className="text-right tabular-nums" data-testid="subtotal-products">{fmtRp(money.subtotal)}</td></tr>
            <tr><td className="text-ink-2">Diskon</td><td className="text-right tabular-nums" data-testid="discount-line">{money.discount ? '−' + fmtRp(money.discount) : fmtRp(0)}</td></tr>
            <tr><td className="text-ink-2">Ongkir</td><td className="text-right tabular-nums" data-testid="shipping-line">{money.shipping ? '+' + fmtRp(money.shipping) : fmtRp(0)}</td></tr>
          </tbody></table>}
          <div className="text-xs text-ink-2 font-semibold">Total yang harus dibayar</div><div className="text-2xl font-extrabold text-brick tabular-nums" data-testid="total-amount">{fmtRp(money.total)}</div></div>
      </div>
      {money.error && <div className="note mt-2" data-testid="money-error">{money.error}</div>}
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
  const [discount, setDiscount] = useState('')
  const [shipping, setShipping] = useState('')
  const [saved, setSaved] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const reseller = resellers.find(r => r.id === rid)
  const minPacks = reseller ? (reseller.ordersCount > 0 ? meta.cms.minRepeatOrder : meta.cms.minFirstOrder) : 0
  const options = useMemo(() => resellers.filter(r => !search || [r.name, r.phone, r.area].join(' ').toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name)), [resellers, search])
  const { lines, valid, totalAmount } = computeItems(rows)
  const money = computeMoney(totalAmount, discount, shipping)

  const submit = async () => {
    setErr('')
    if (!rid) return setErr('Pilih reseller terlebih dahulu')
    if (!valid) return setErr('Lengkapi setiap baris: produk, jumlah pack (bilangan bulat ≥ 1), dan harga')
    if (money.error) return setErr(money.error)
    if (f.receivedDate && f.receivedDate < f.date) return setErr('Tanggal diterima tidak boleh sebelum tanggal pesanan')
    if (busy) return
    setBusy(true)
    const body = { resellerId: rid, type: 'order', date: f.date, status: f.status, receivedDate: f.status === 'completed' ? f.receivedDate : '', note: f.note,
      items: lines.map(l => ({ product: l.product, qty: l.qtyN, price: l.priceN })), discount: money.discount, shippingFee: money.shipping }
    try { const r = await run(() => api('/api/activities', { method: 'POST', body }), 'Pesanan tersimpan, invoice dibuat'); setSaved(r.activity) } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  if (!products.length) return <div className="note">Katalog produk masih kosong. Isi daftar produk di menu CMS Program terlebih dahulu.</div>
  if (saved) return (
    <div data-testid="order-saved">
      <div className="rounded-lg border border-green-700 bg-[#E7EFE3] p-4 mb-4">
        <div className="font-bold text-green-800">✓ Pesanan tersimpan · {saved.invoiceNo}</div>
        <div className="text-[13px] mt-1">{fmtN(saved.qty)} pack · Total dibayar <b>{fmtRp(saved.totalPaid)}</b>{saved.shippingFee ? ` (termasuk ongkir ${fmtRp(saved.shippingFee)})` : ''}</div>
      </div>
      <ProofUpload order={saved} onUploaded={setSaved} />
      <div className="flex flex-wrap gap-2 mt-4">
        <button className="btn btn-primary" onClick={() => onDone(saved)}>{saved.paymentProof ? 'Selesai' : 'Selesai, upload nanti'}</button>
        <a className="btn" href={`/invoice/${saved.id}`} target="_blank" rel="noreferrer">Lihat invoice</a>
      </div>
    </div>
  )
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
      <OrderItemsEditor rows={rows} setRows={setRows} products={products} minPacks={minPacks} discount={discount} shipping={shipping} setDiscount={setDiscount} setShipping={setShipping} />
      <div className="grid md:grid-cols-3 gap-3 mt-4">
        <div><label className="lbl">Tanggal pesanan</label><input className="inp" type="date" value={f.date} max={today()} onChange={set('date')} /></div>
        <div><label className="lbl">Status</label><select className="inp" value={f.status} onChange={set('status')}><option value="to_ship">To Ship</option><option value="shipping">Shipping</option><option value="completed">Completed</option></select></div>
        <div><label className="lbl">Tanggal diterima</label><input className="inp" type="date" value={f.receivedDate} min={f.date} max={today()} disabled={f.status !== 'completed'} onChange={set('receivedDate')} />
          {f.status !== 'completed' && <div className="text-[11px] text-ink-3 mt-0.5">diisi saat status Completed</div>}</div>
        <div className="md:col-span-3"><label className="lbl">Catatan (pengiriman, packing, dll.)</label><textarea className="inp min-h-[56px]" value={f.note} onChange={set('note')} /></div>
      </div>
      {err && <div className="note mt-3">{err}</div>}
      <div className="text-[11px] text-ink-3 mt-2">Total = (jumlah pack × harga) − diskon + ongkir, dihitung otomatis. Nomor invoice dibuat saat disimpan; bukti transfer diupload di langkah berikutnya.</div>
      <div className="flex gap-2 mt-3"><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan Pesanan'}</button>{onCancel && <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>Batal</button>}</div>
    </div>
  )
}
