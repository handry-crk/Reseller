import { fmtN } from '../lib/api'

export const StatusTag = ({ s }) => (
  <span className={'tag ' + (s === 'Aktif' ? 'tag-good' : s === 'Pasif' ? 'tag-warn' : s === 'Churn' ? '' : 'tag-muted')}>{s}</span>
)

const TIER_BG = { Bronze: 'bg-[#E8CDB4]', Silver: 'bg-[#E3E3E3]', Gold: 'bg-[#F3E2A8]', Platinum: 'bg-[#D9E5EF]' }
export const TierTag = ({ t, auto }) => t ? <span className={'tier ' + (TIER_BG[t] || '')}>{t}{auto ? ' (auto)' : ''}</span> : <span className="text-ink-3">–</span>

export function Bar({ label, value, max, extra }) {
  const pct = max ? Math.round((value / max) * 100) : 0
  return (
    <div className="grid grid-cols-[150px_1fr_56px] items-center gap-2.5 text-[12.5px]" title={`${label}: ${value}`}>
      <div className="truncate text-ink-2">{label}</div>
      <div className="h-3.5 rounded bg-cream-dark overflow-hidden"><div className="h-full bg-brick rounded-r min-w-[2px] transition-all" style={{ width: pct + '%' }} /></div>
      <div className="text-right font-bold tabular-nums">{extra ?? fmtN(value)}</div>
    </div>
  )
}

export function Kpi({ label, value, sub }) {
  return <div className="card"><div className="text-[13px] font-bold">{label}</div><div className="kpi-v">{value}</div><div className="text-xs text-ink-2">{sub}</div></div>
}

export const Empty = ({ children }) => <div className="p-7 text-center text-ink-3 text-[13px]">{children}</div>

export function Drawer({ open, onClose, children }) {
  return (
    <>
      <div className={'fixed inset-0 bg-ink/35 z-40 ' + (open ? '' : 'hidden')} onClick={onClose} />
      <div className={'fixed top-0 right-0 h-screen w-[min(660px,100vw)] bg-cream z-50 overflow-y-auto p-6 shadow-2xl transition-transform ' + (open ? '' : 'translate-x-full')}>
        <button className="absolute top-4 right-5 text-2xl text-ink-2" onClick={onClose} aria-label="Tutup">×</button>
        {open && children}
      </div>
    </>
  )
}

export function Confirm({ title, text, onYes, onNo, yesLabel = 'Ya, lanjutkan' }) {
  return (
    <div className="card border-brick mt-4">
      <h4 className="text-[13px] font-bold">{title}</h4>
      {text && <div className="text-xs text-ink-2 mt-1">{text}</div>}
      <div className="flex gap-2 mt-3"><button className="btn btn-danger btn-sm" onClick={onYes}>{yesLabel}</button><button className="btn btn-ghost btn-sm" onClick={onNo}>Batal</button></div>
    </div>
  )
}

export const Section = ({ title, children }) => (
  <div className="mt-5"><h4 className="text-[13px] font-bold border-b border-brick pb-1 mb-2">{title}</h4>{children}</div>
)

export const Select = ({ options, value, onChange, placeholder, ...rest }) => (
  <select className="inp" value={value ?? ''} onChange={e => onChange(e.target.value)} {...rest}>
    {placeholder !== undefined && <option value="">{placeholder}</option>}
    {options.map(o => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
)
