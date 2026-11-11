import { useEffect, useRef, useState } from 'react'
import { api, apiBlob } from '../lib/api'

const MAX = 2 * 1024 * 1024
const fmtSize = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB')

const toBase64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob) })

/** Foto dikecilkan (maks 1600 px, JPEG) supaya hemat kuota database; PDF dikirim apa adanya (maks 2 MB). */
async function prepare(file) {
  if (file.type === 'application/pdf') {
    if (file.size > MAX) throw new Error('PDF maksimal 2 MB')
    return { name: file.name, mime: 'application/pdf', blob: file }
  }
  if (!/^image\//.test(file.type)) throw new Error('Format harus foto (JPG/PNG/WebP) atau PDF')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Foto tidak terbaca')); i.src = url })
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(img.naturalWidth * scale)); c.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height)
    for (const q of [0.82, 0.7, 0.55]) {
      const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', q))
      if (blob && blob.size <= MAX) return { name: file.name.replace(/\.[^.]+$/, '') + '.jpg', mime: 'image/jpeg', blob }
    }
    throw new Error('Foto terlalu besar, coba foto dengan resolusi lebih kecil')
  } finally { URL.revokeObjectURL(url) }
}

/** Kotak upload bukti transfer untuk satu pesanan. */
export function ProofUpload({ order, onUploaded, compact }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [preview, setPreview] = useState(null)
  const input = useRef(null)
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])
  const onFile = async (e) => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setErr(''); setBusy(true)
    try {
      const p = await prepare(file)
      if (p.mime.startsWith('image/')) setPreview(URL.createObjectURL(p.blob))
      const updated = await api(`/api/activities/${order.id}/proof`, { method: 'POST', body: { name: p.name, mime: p.mime, data: await toBase64(p.blob) } })
      onUploaded?.(updated)
    } catch (ex) { setErr(ex.message); setPreview(null) } finally { setBusy(false) }
  }
  const has = !!order.paymentProof
  return (
    <div className={compact ? '' : 'rounded-lg border border-dashed border-brick bg-white p-4'}>
      {!compact && <div className="text-[13px] font-bold mb-1">Bukti transfer</div>}
      {has && !compact && <div className="text-xs text-green-700 mb-2">✓ Sudah diupload: {order.paymentProof.name} ({fmtSize(order.paymentProof.size)}) oleh {order.paymentProof.uploadedBy}</div>}
      {preview && <img src={preview} alt="Pratinjau bukti transfer" className="max-h-40 rounded border border-line mb-2" />}
      <input ref={input} type="file" accept="image/*,application/pdf" capture={undefined} className="hidden" aria-label="Pilih file bukti transfer" onChange={onFile} />
      <button type="button" className={'btn ' + (compact ? 'btn-sm' : '')} disabled={busy} onClick={() => input.current?.click()}>
        {busy ? 'Mengupload…' : has ? 'Ganti bukti' : 'Upload bukti transfer'}
      </button>
      {!compact && <div className="text-[11px] text-ink-3 mt-1">Foto (JPG/PNG) atau PDF, maks 2 MB. Foto dikecilkan otomatis.</div>}
      {err && <div className="note mt-2">{err}</div>}
    </div>
  )
}

/** Tombol "Lihat bukti" yang membuka pratinjau (butuh login, jadi file diambil dengan token). */
export function ProofView({ order, canDelete, onDeleted }) {
  const [url, setUrl] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => () => url && URL.revokeObjectURL(url), [url])
  if (!order.paymentProof) return null
  const open = async () => {
    setErr(''); setBusy(true)
    try { setUrl(URL.createObjectURL(await apiBlob(`/api/activities/${order.id}/proof`))) } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const isPdf = order.paymentProof.mime === 'application/pdf'
  return (
    <>
      <button type="button" className="link text-xs" onClick={open} disabled={busy}>{busy ? 'memuat…' : 'Lihat bukti'}</button>
      {err && <span className="text-xs text-brick ml-1">{err}</span>}
      {url && <div className="fixed inset-0 z-[60] bg-ink/60 grid place-items-center p-4" onClick={() => setUrl(null)} role="dialog" aria-label="Bukti transfer">
        <div className="bg-white rounded-xl p-4 max-w-[min(900px,95vw)] max-h-[92vh] overflow-auto" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-3 mb-3"><b className="text-sm mr-auto">{order.invoiceNo} · bukti transfer</b>
            <a className="btn btn-sm" href={url} download={order.paymentProof.name}>Unduh</a>
            {canDelete && <button className="btn btn-danger btn-sm" onClick={async () => { await api(`/api/activities/${order.id}/proof`, { method: 'DELETE' }); setUrl(null); onDeleted?.() }}>Hapus</button>}
            <button className="btn btn-ghost btn-sm" onClick={() => setUrl(null)}>Tutup</button></div>
          {isPdf ? <iframe title="Bukti transfer PDF" src={url} className="w-[80vw] max-w-[860px] h-[75vh] border border-line rounded" />
            : <img src={url} alt="Bukti transfer" className="max-w-full max-h-[78vh] mx-auto" />}
          <div className="text-[11px] text-ink-3 mt-2">{order.paymentProof.name} · diupload {order.paymentProof.uploadedBy} · {(order.paymentProof.uploadedAt || '').slice(0, 16).replace('T', ' ')}</div>
        </div>
      </div>}
    </>
  )
}
