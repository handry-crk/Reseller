import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHead } from '../components/Layout'
import { Delta, Empty, Kpi } from '../components/ui'
import { api, fmtN, fmtRp } from '../lib/api'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const dd = (iso) => { const [y, m, d] = iso.split('-').map(Number); return { y, m, d } }
export const bucketLabel = (b, g) => {
  if (g === 'month') { const { y, m } = dd(b.from); return `${MON[m - 1]} ${y}` }
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
            <text x={L + i * bw + bw / 2} y={H - B + 14} textAnchor="middle" fontSize="10.5" fill="#5A5550">{g === 'month' ? bucketLabel(s, g).replace(/ \d{2}(\d{2})$/, " '$1") : short(s.from)}</text>
            {s.partial && <text x={L + i * bw + bw / 2} y={H - B + 27} textAnchor="middle" fontSize="9.5" fill="#B42F27">berjalan</text>}
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

export default function Performance() {
  const [sp, setSp] = useSearchParams()
  const g = sp.get('g') === 'month' ? 'month' : 'week'
  const n = Number(sp.get('n')) || (g === 'week' ? 8 : 6)
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let alive = true
    setD(null)
    api(`/api/performance?granularity=${g}&n=${n}`).then(x => alive && setD(x)).catch(e => alive && setErr(e.message))
    return () => { alive = false }
  }, [g, n])
  const setG = (v) => setSp(v === 'week' ? {} : { g: v }, { replace: true })
  const setN = (v) => setSp({ ...(g === 'month' ? { g } : {}), n: String(v) }, { replace: true })
  const rows = useMemo(() => (d ? [...d.series].reverse() : []), [d])
  if (!d) return <Empty>{err || 'Memuat performa…'}</Empty>
  const cur = d.series[d.series.length - 1]
  const unit = g === 'week' ? 'minggu' : 'bulan'
  const cmpNote = cur.partial
    ? `${unit} ini s/d ${short(cur.toDate)} vs ${short(cur.compareFrom)}–${short(cur.compareTo)}`
    : `vs ${bucketLabel({ from: cur.compareFrom, to: cur.compareTo }, g)}`
  return (
    <>
      <PageHead title="<b>Performa</b> Reseller" sub={g === 'week' ? 'Week-to-week: Senin–Minggu. Minggu berjalan dibandingkan dengan hari yang sama minggu lalu.' : 'Month-to-month: bulan kalender. Bulan berjalan dibandingkan dengan tanggal yang sama bulan lalu.'}>
        <div className="inline-flex rounded-full border border-brick overflow-hidden text-[13px] font-semibold" role="tablist">
          <button role="tab" aria-selected={g === 'week'} className={'px-4 py-2 ' + (g === 'week' ? 'bg-brick text-cream' : 'text-brick')} onClick={() => setG('week')}>Mingguan</button>
          <button role="tab" aria-selected={g === 'month'} className={'px-4 py-2 ' + (g === 'month' ? 'bg-brick text-cream' : 'text-brick')} onClick={() => setG('month')}>Bulanan</button>
        </div>
        <select className="inp !w-auto" aria-label="Jumlah periode" value={n} onChange={e => setN(e.target.value)}>
          {(g === 'week' ? [4, 8, 12, 26] : [3, 6, 12, 24]).map(x => <option key={x} value={x}>{x} {unit} terakhir</option>)}
        </select>
      </PageHead>
      <div className="flex flex-wrap gap-2 mb-3"><span className="tag">{bucketLabel(cur, g)}{cur.partial ? ` · berjalan s/d ${short(cur.toDate)}` : ''}</span><span className="tag tag-muted">Pembanding: {short(cur.compareFrom)} – {short(cur.compareTo)}</span></div>
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-2.5 md:gap-4" data-testid="perf-kpis">
        {METRICS.map(m => <Kpi key={m.k} label={`${m.label} ${unit} ini`} value={m.f(cur[m.k])} sub={`Pembanding: ${m.f(cur.prev[m.k])}`} delta={cur.delta[m.k]} />)}
      </div>
      <div className="card mt-4"><h3 className="card-title">Revenue per {unit}</h3><div className="hint">Ketuk/arahkan ke kolom untuk detail. Kolom berarsir = {unit} yang masih berjalan.</div>
        <RevenueChart series={d.series} g={g} /></div>
      <div className="card mt-4"><h3 className="card-title">Perbandingan {g === 'week' ? 'week-to-week' : 'month-to-month'}</h3>
        <div className="hint">Setiap baris dibandingkan dengan {unit} sebelumnya. "–" = sama-sama nol; "baru" = sebelumnya nol.</div>
        <div className="overflow-x-auto"><table className="table" data-testid="perf-table"><thead><tr><th>{g === 'week' ? 'Minggu' : 'Bulan'}</th>
          {METRICS.map(m => <th key={m.k} className="num">{m.label}</th>)}</tr></thead><tbody>
          {rows.map(s => <tr key={s.key}>
            <td className="whitespace-nowrap"><b>{bucketLabel(s, g)}</b>{s.partial && <div className="text-[11px] text-brick">berjalan s/d {short(s.toDate)}</div>}</td>
            {METRICS.map(m => <td key={m.k} className="num whitespace-nowrap">{m.f(s[m.k])}<div><Delta d={s.delta[m.k]} small title={`Pembanding ${short(s.compareFrom)}–${short(s.compareTo)}: ${m.f(s.prev[m.k])}`} /></div></td>)}
          </tr>)}
        </tbody></table></div></div>
      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <CompareTable title={`Revenue per PIC · ${unit} ini`} hint={cmpNote} rows={d.byPic} f={fmtRp} />
        <CompareTable title={`Pack per produk · ${unit} ini`} hint={cmpNote} rows={d.byProduct} f={(x) => fmtN(x) + ' pack'} />
      </div>
    </>
  )
}
