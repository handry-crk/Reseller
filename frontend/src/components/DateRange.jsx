import { useEffect, useState } from 'react'

// Hitung tanggal relatif terhadap "hari ini" server (WIB), format YYYY-MM-DD.
const shift = (iso, days) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) }
const monthStart = (iso, back = 0) => { const d = new Date(iso.slice(0, 7) + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - back); return d.toISOString().slice(0, 10) }

export const PRESETS = [
  { id: 'all', label: 'Semua periode', range: () => ['', ''] },
  { id: 'today', label: 'Hari ini', range: (t) => [t, t] },
  { id: '7d', label: '7 hari terakhir', range: (t) => [shift(t, -6), t] },
  { id: '30d', label: '30 hari terakhir', range: (t) => [shift(t, -29), t] },
  { id: 'month', label: 'Bulan ini', range: (t) => [monthStart(t), t] },
  { id: 'lastmonth', label: 'Bulan lalu', range: (t) => [monthStart(t, 1), shift(monthStart(t), -1)] },
  { id: '90d', label: '90 hari terakhir', range: (t) => [shift(t, -89), t] },
  { id: 'year', label: 'Tahun ini', range: (t) => [t.slice(0, 4) + '-01-01', t] },
  { id: 'custom', label: 'Rentang tanggal…', range: null },
]

const fmt = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
export const rangeLabel = (from, to) => (!from && !to ? 'Semua periode' : from === to ? fmt(from) : `${from ? fmt(from) : 'awal'} – ${to ? fmt(to) : 'hari ini'}`)

/**
 * Pemilih periode: preset cepat + rentang kustom.
 * value = { preset, from, to }; onChange dipanggil dengan nilai baru yang sudah valid.
 */
export default function DateRange({ value, onChange, today }) {
  const [draft, setDraft] = useState({ from: value.from, to: value.to })
  const [err, setErr] = useState('')
  useEffect(() => { setDraft({ from: value.from, to: value.to }) }, [value.from, value.to])
  const pick = (id) => {
    setErr('')
    const p = PRESETS.find(x => x.id === id)
    if (p.range) { const [from, to] = p.range(today); onChange({ preset: id, from, to }) }
    else onChange({ preset: 'custom', from: value.from || shift(today, -29), to: value.to || today })
  }
  const apply = () => {
    if (!draft.from || !draft.to) return setErr('Isi tanggal mulai dan tanggal akhir')
    if (draft.from > draft.to) return setErr('Tanggal mulai harus sebelum tanggal akhir')
    setErr(''); onChange({ preset: 'custom', from: draft.from, to: draft.to })
  }
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="date-range">
      <select className="inp !w-auto" aria-label="Periode" value={value.preset} onChange={e => pick(e.target.value)}>
        {PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      {value.preset === 'custom' && <>
        <input className="inp !w-auto" type="date" aria-label="Dari tanggal" value={draft.from} max={draft.to || undefined} onChange={e => setDraft({ ...draft, from: e.target.value })} />
        <span className="text-xs text-ink-3">s/d</span>
        <input className="inp !w-auto" type="date" aria-label="Sampai tanggal" value={draft.to} min={draft.from || undefined} onChange={e => setDraft({ ...draft, to: e.target.value })} />
        <button className="btn btn-sm" onClick={apply} disabled={draft.from === value.from && draft.to === value.to}>Terapkan</button>
      </>}
      {err && <span className="text-xs text-brick w-full" role="alert">{err}</span>}
    </div>
  )
}
