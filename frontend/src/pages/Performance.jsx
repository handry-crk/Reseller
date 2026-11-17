import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import DateRange, { PRESETS, rangeLabel } from '../components/DateRange'
import { PageHead } from '../components/Layout'
import { Delta, Empty, Kpi } from '../components/ui'
import { api, fmtN, fmtRp } from '../lib/api'
import { useStore } from '../lib/store'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const dd = (iso) => { const [y, m, d] = iso.split('-').map(Number); return { y, m, d } }
export const bucketLabel = (b, g) => {
  if (g === 'day') { const { d, m, y } = dd(b.from); return `${['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${d} ${MON[m - 1]}` }
  if (g === 'month' && !b.clipped) { const { y, m } = dd(b.from); return `${MON[m - 1]} ${y}` }
  const a = dd(b.from), z = dd(b.to)
  return a.m === z.m ? `${a.d}–${z.d} ${MON[a.m - 1]}` : `${a.d} ${MON[a.m - 1]} – ${z.d} ${MON[z.m - 1]}`
}
const short = (iso) => { const { d, m } = dd(iso); return `${d} ${MON[m - 1]}` }
const rpShort = (n) => n >= 1e9 ? 'Rp' + (n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' M' : n >= 1e6 ? 'Rp' + (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt' : n >= 1e3 ? 'Rp' + Math.round(n / 1e3) + ' rb' : 'Rp' + n

const METRICS = [
  { k: 'revenue', label: 'Revenue', f: fmtRp },
  { k: 'orders', label: 'Order', f: fmtN },
  { k: 'packs', label: 'Pack', f: fmtN },
  { k: 'buyers', label: 'Reseller order', f: fmtN },
  { k: 'aov', label: 'AOV', f: fmtRp },
  { k: 'newResellers', label: 'Reseller baru', f: fmtN },
]

/** Grafik kolom revenue per periode; periode berjalan diberi arsiran + label "berjalan" (bukan warna saja). */
function RevenueChart({ series, g }) {
  const [hover, setHover] = useState(null)
  const W = 720, H = 220, L = 56, B = 34, T = 14, R = 8
  const max = Math.max(1, ...series.map(s => s.revenue))
  const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); return Math.ceil(max / p) * p })()
  const bw = (W - L - R) / series.length
  const y = (v) => T + (H - T - B) * (1 - v / nice)
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Grafik revenue per periode">
        <defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#E0BFB1" /><line x1="0" y1="0" x2="0" y2="6" stroke="#B42F27" strokeWidth="2" /></pattern></defs>
        {[0, 0.5, 1].map(f => <g key={f}><line x1={L} x2={W - R} y1={y(nice * f)} y2={y(nice * f)} stroke="#D8CDB8" strokeWidth="1" strokeDasharray={f ? '3 3' : ''} />
          <text x={L - 6} y={y(nice * f) + 4} textAnchor="end" fontSize="11" fill="#8A837A">{rpShort(nice * f)}</text></g>)}
        {series.map((s, i) => {
          const x = L + i * bw + bw * 0.2, w = bw * 0.6, top = y(s.revenue), h = Math.max(0, H - B - top)
          return <g key={s.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(i)} style={{ cursor: 'pointer' }}>
            <rect x={L + i * bw} y={T} width={bw} height={H - T - B} fill={hover === i ? 'rgba(180,47,39,.06)' : 'transparent'} />
            {h > 0 && <path d={`M${x},${H - B} V${top + 4} q0,-4 4,-4 h${w - 8} q4,0 4,4 V${H - B} Z`} fill={s.partial ? 'url(#hatch)' : '#B42F27'} />}
            {(series.length <= 16 || i % Math.ceil(series.length / 14) === 0 || i === series.length - 1) &&
              <text x={L + i * bw + bw / 2} y={H - B + 14} textAnchor="middle" fontSize="10.5" fill="#5A5550">{g === 'month' ? (s.clipped ? short(s.from) : bucketLabel(s, g).replace(/ \d{2}(\d{2})$/, " '$1")) : short(s.from)}</text>}
            {s.partial && series.length <= 16 && <text x={L + i * bw + bw / 2} y={H - B + 27} textAnchor="middle" fontSize="9.5" fill="#B42F27">{s.to > s.toDate ? 'berjalan' : 'sebagian'}</text>}
          </g>
        })}
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="#8A837A" strokeWidth="1" />
      </svg>
      {hover !== null && (() => { const s = series[hover]; return (
        <div className="absolute top-1 right-1 bg-white border border-line rounded-lg shadow px-3 py-2 text-xs pointer-events-none" data-testid="chart-tip">
          <div className="font-bold">{bucketLabel(s, g)}{s.partial ? ` (s/d ${short(s.toDate)})` : ''}</div>
          <div>Revenue <b className="tabular-nums">{fmtRp(s.revenue)}</b> <Delta d={s.delta.revenue} small /></div>
          <div className="text-ink-3">{fmtN(s.orders)} order · {fmtN(s.packs)} pack</div>
        </div>) })()}
    </div>
  )
}

function CompareTable({ title, hint, rows, f }) {
  return (
    <div className="card"><h3 className="card-title">{title}</h3><div className="hint">{hint}</div>
      {rows.length ? <div className="overflow-x-auto"><table className="table"><thead><tr><th>Nama</th><th className="num">Periode ini</th><th className="num">Pembanding</th><th className="num">Δ</th></tr></thead><tbody>
        {rows.map(r => <tr key={r.name}><td>{r.name}</td><td className="num">{f(r.cur)}</td><td className="num text-ink-2">{f(r.prev)}</td><td className="num"><Delta d={{ pct: r.pct, abs: r.cur - r.prev }} /></td></tr>)}
      </tbody></table></div> : <Empty>Belum ada data.</Empty>}
    </div>
  )
}

const autoBy = (from, to) => { const days = (new Date(to) - new Date(from)) / 864e5 + 1; return days <= 31 ? 'day' : days <= 182 ? 'week' : 'month' }

export default function Performance() {
  const { meta } = useStore()
  const [sp, setSp] = useSearchParams()
  const mode = ['month', 'custom'].includes(sp.get('g')) ? sp.get('g') : 'week'
  const custom = mode === 'custom'
  // Mode rentang: preset (rp) atau tanggal kustom; rincian per hari/minggu/bulan (by).
  const rp = PRESETS.some(x => x.id === sp.get('rp') && x.id !== 'all') ? sp.get('rp') : '30d'
  const range = rp === 'custom' ? { preset: 'custom', from: sp.get('from') || '', to: sp.get('to') || '' }
    : (() => { const [from, to] = PRESETS.find(x => x.id === rp).range(meta.today); return { preset: rp, from, to } })()
  const g = custom ? (['day', 'week', 'month'].includes(sp.get('by')) ? sp.get('by') : autoBy(range.from, range.to)) : mode
  const n = Number(sp.get('n')) || (g === 'week' ? 8 : 6)
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let alive = true
    setD(null); setErr('')
    const q = custom ? `from=${range.from}&to=${range.to}&granularity=${g}` : `granularity=${g}&n=${n}`
    api('/api/performance?' + q).then(x => alive && setD(x)).catch(e => alive && setErr(e.message))
    return () => { alive = false }
  }, [mode, g, n, range.from, range.to]) // eslint-disable-line
  const setMode = (v) => setSp(v === 'week' ? {} : { g: v }, { replace: true })
  const setN = (v) => setSp({ ...(mode === 'month' ? { g: mode } : {}), n: String(v) }, { replace: true })
  const setRange = (v) => setSp({ g: 'custom', rp: v.preset, ...(v.preset === 'custom' ? { from: v.from, to: v.to } : {}), ...(sp.get('by') ? { by: sp.get('by') } : {}) }, { replace: true })
  const setBy = (v) => { const o = Object.fromEntries(sp.entries()); setSp({ ...o, by: v }, { replace: true }) }
  const rows = useMemo(() => (d ? [...d.series].reverse() : []), [d])
  const tabs = (
    <div className="inline-flex rounded-full border border-brick overflow-hidden text-[13px] font-semibold" role="tablist">
      {[['week', 'Mingguan'], ['month', 'Bulanan'], ['custom', 'Rentang']].map(([k, l]) =>
        <button key={k} role="tab" aria-selected={mode === k} className={'px-4 py-2 ' + (mode === k ? 'bg-brick text-cream' : 'text-brick')} onClick={() => setMode(k)}>{l}</button>)}
    </div>
  )
  const unit = { day: 'hari', week: 'minggu', month: 'bulan' }[g]
  const controls = <>
    {tabs}
    {custom ? <>
      <DateRange value={range} onChange={setRange} today={meta.today} exclude={['all']} />
      <select className="inp !w-auto" aria-label="Rincian per" value={g} onChange={e => setBy(e.target.value)}>
        <option value="day">Rincian harian</option><option value="week">Rincian mingguan</option><option value="month">Rincian bulanan</option>
      </select>
    </> : <select className="inp !w-auto" aria-label="Jumlah periode" value={n} onChange={e => setN(e.target.value)}>
      {(g === 'week' ? [4, 8, 12, 26] : [3, 6, 12, 24]).map(x => <option key={x} value={x}>{x} {unit} terakhir</option>)}
    </select>}
  </>
  // Data harus cocok dengan mode yang aktif (saat ganti tab, data lama belum terganti).
  const ready = d && (custom ? !!d.summary : !d.summary) && d.granularity === g
  if (!ready) return (<>
    <PageHead title="<b>Performa</b> Reseller">{controls}</PageHead>
    {err ? <div className="note" role="alert">{err}</div> : <Empty>Memuat performa…</Empty>}</>)
  const cur = custom ? { ...d.summary, toDate: d.summary.to, partial: false } : d.series[d.series.length - 1]
  const cmpNote = custom ? `${rangeLabel(cur.from, cur.to)} vs ${rangeLabel(cur.compareFrom, cur.compareTo)}`
    : cur.partial ? `${unit} ini s/d ${short(cur.toDate)} vs ${short(cur.compareFrom)}–${short(cur.compareTo)}`
    : `vs ${bucketLabel({ from: cur.compareFrom, to: cur.compareTo }, g)}`
  const curLabel = custom ? 'periode ini' : unit + ' ini'
  return (
    <>
      <PageHead title="<b>Performa</b> Reseller" sub={custom ? 'Rentang pilihan Anda dibandingkan dengan periode sebelumnya (bulan berjalan vs tanggal sama bulan lalu; rentang lain vs rentang sama panjang tepat sebelumnya).' : g === 'week' ? 'Week-to-week: Senin–Minggu. Minggu berjalan dibandingkan dengan hari yang sama minggu lalu.' : 'Month-to-month: bulan kalender. Bulan berjalan dibandingkan dengan tanggal yang sama bulan lalu.'}>
        {controls}
      </PageHead>
      {err && <div className="note mb-3">{err}</div>}
      <div className="flex flex-wrap gap-2 mb-3" data-testid="perf-range">{custom
        ? <><span className="tag">Periode: {rangeLabel(cur.from, cur.to)}</span><span className="tag tag-muted">Pembanding: {rangeLabel(cur.compareFrom, cur.compareTo)}</span></>
        : <><span className="tag">{bucketLabel(cur, g)}{cur.partial ? ` · berjalan s/d ${short(cur.toDate)}` : ''}</span><span className="tag tag-muted">Pembanding: {short(cur.compareFrom)} – {short(cur.compareTo)}</span></>}</div>
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-2.5 md:gap-4" data-testid="perf-kpis">
        {METRICS.map(m => <Kpi key={m.k} label={`${m.label} ${curLabel}`} value={m.f(cur[m.k])} sub={`Pembanding: ${m.f(cur.prev[m.k])}`} delta={cur.delta[m.k]} />)}
      </div>
      <div className="card mt-4"><h3 className="card-title">Revenue per {unit}{custom ? ` · ${rangeLabel(cur.from, cur.to)}` : ''}</h3><div className="hint">Ketuk/arahkan ke kolom untuk detail. Kolom berarsir = {unit} yang masih berjalan atau terpotong batas rentang.</div>
        <RevenueChart series={d.series} g={g} /></div>
      <div className="card mt-4"><h3 className="card-title">Perbandingan {{ day: 'day-to-day', week: 'week-to-week', month: 'month-to-month' }[g]}</h3>
        <div className="hint">Setiap baris dibandingkan dengan {unit} sebelumnya{g === 'day' ? '' : ' (bagian yang terpotong dibandingkan dengan tanggal yang sama)'}. "–" = sama-sama nol; "baru" = sebelumnya nol.</div>
        <div className="overflow-x-auto"><table className="table" data-testid="perf-table"><thead><tr><th>{{ day: 'Hari', week: 'Minggu', month: 'Bulan' }[g]}</th>
          {METRICS.map(m => <th key={m.k} className="num">{m.label}</th>)}</tr></thead><tbody>
          {rows.map(s => <tr key={s.key}>
            <td className="whitespace-nowrap"><b>{bucketLabel(s, g)}</b>{s.partial && <div className="text-[11px] text-brick">{s.to > s.toDate ? `berjalan s/d ${short(s.toDate)}` : 'sebagian (batas rentang)'}</div>}</td>
            {METRICS.map(m => <td key={m.k} className="num whitespace-nowrap">{m.f(s[m.k])}<div><Delta d={s.delta[m.k]} small title={`Pembanding ${short(s.compareFrom)}–${short(s.compareTo)}: ${m.f(s.prev[m.k])}`} /></div></td>)}
          </tr>)}
        </tbody></table></div></div>
      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <CompareTable title={`Revenue per PIC · ${curLabel}`} hint={cmpNote} rows={d.byPic} f={fmtRp} />
        <CompareTable title={`Pack per produk · ${curLabel}`} hint={cmpNote} rows={d.byProduct} f={(x) => fmtN(x) + ' pack'} />
      </div>
    </>
  )
}
