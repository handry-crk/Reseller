import { useEffect, useRef, useState } from 'react'

/** true bila pengguna meminta "kurangi gerakan" di perangkatnya — semua animasi dimatikan. */
export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const NUM = /\d[\d.]*(?:,\d+)?/  // angka format Indonesia: 1.234.567 atau 12,5
const parse = (s) => Number(s.replace(/\./g, '').replace(',', '.'))

/**
 * Angka yang menghitung naik/turun ke nilai baru (±0,45 dtk). Menerima teks yang sudah diformat
 * ("Rp1.250.000", "45%", "12"); awalan & akhiran dipertahankan. Teks tanpa angka tampil apa adanya.
 */
export function CountUp({ value }) {
  const text = String(value ?? '')
  const m = text.match(NUM)
  const target = m ? parse(m[0]) : null
  const [shown, setShown] = useState(reducedMotion() ? target : 0)
  const from = useRef(reducedMotion() ? target : 0)
  useEffect(() => {
    if (target === null || reducedMotion() || from.current === target) { from.current = target; setShown(target); return }
    const start = from.current ?? 0, t0 = performance.now(), dur = 450
    let raf
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3)
      const v = start + (target - start) * e
      from.current = v; setShown(v)
      if (p < 1) raf = requestAnimationFrame(step); else { from.current = target; setShown(target) }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target])
  if (target === null) return text
  const done = shown === target
  const decimals = m[0].includes(',') ? m[0].split(',')[1].length : 0
  const mid = done ? m[0] : (shown ?? 0).toLocaleString('id-ID', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  // aria-label = nilai akhir, supaya pembaca layar tidak membacakan angka yang sedang bergerak.
  return <span aria-label={text} data-final={text}>{text.slice(0, m.index)}{mid}{text.slice(m.index + m[0].length)}</span>
}

/**
 * Menandai baris yang baru muncul (mis. reseller / pesanan yang baru disimpan) agar disorot sebentar.
 * ids = daftar id saat ini; resetKey berubah → daftar dianggap baru dimuat (tanpa sorotan).
 */
export function useFlashNew(ids, resetKey = '') {
  const seen = useRef(null)
  const key = useRef(resetKey)
  const [fresh, setFresh] = useState(() => new Set())
  const sig = ids.join(',')
  useEffect(() => {
    if (seen.current === null || key.current !== resetKey) { seen.current = new Set(ids); key.current = resetKey; return }
    const added = ids.filter(id => !seen.current.has(id))
    ids.forEach(id => seen.current.add(id))
    if (!added.length || added.length > 5) return  // lebih dari 5 sekaligus = impor/muat ulang, bukan input baru
    setFresh(new Set(added))
    const t = setTimeout(() => setFresh(new Set()), 2600)
    return () => clearTimeout(t)
  }, [sig, resetKey]) // eslint-disable-line
  return (id) => (fresh.has(id) ? 'row-new' : '')
}

/** Kerangka abu-abu saat data dimuat (pengganti tulisan "Memuat…"). */
export function Skeleton({ kpis = 4, blocks = 2, label = 'Memuat…' }) {
  return (
    <div role="status" aria-label={label} data-testid="skeleton">
      <div className="skel h-8 w-64 mb-5" />
      {kpis > 0 && <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">{Array.from({ length: kpis }, (_, i) => <div key={i} className="card"><div className="skel h-3 w-24" /><div className="skel h-8 w-32 my-3" /><div className="skel h-3 w-40" /></div>)}</div>}
      {Array.from({ length: blocks }, (_, i) => <div key={i} className="card mt-4"><div className="skel h-4 w-40 mb-4" />{[92, 78, 64, 85].map((w, j) => <div key={j} className="skel h-3.5 mb-2.5" style={{ width: w + '%' }} />)}</div>)}
      <span className="sr-only">{label}</span>
    </div>
  )
}
