import { NavLink, Outlet } from 'react-router-dom'
import { useStore } from '../lib/store'

const NAV = [
  ['/', 'Dashboard'], ['/pesanan', 'Pesanan'], ['/pipeline', 'Pipeline Alur'], ['/reseller', 'Data Reseller'],
  ['/followup', 'Follow-Up & Complaint'], ['/cms', 'CMS Program'], ['/pengaturan', 'Pengaturan'],
]

export default function Layout() {
  const { user, logout, toast, meta } = useStore()
  return (
    <div className="grid md:grid-cols-[232px_1fr] min-h-screen">
      <aside className="bg-brick text-cream p-4 md:p-5 md:sticky md:top-0 md:h-screen flex md:flex-col flex-wrap gap-2 items-center md:items-stretch">
        <div className="font-extrabold text-lg leading-tight mr-auto md:mr-0 md:mb-3">CRK Reseller Hub<small className="block font-medium text-[11px] opacity-85 tracking-[.12em] uppercase mt-1">Cimol Bojot AA · CRM</small></div>
        <nav className="flex md:flex-col flex-wrap gap-0.5">
          {NAV.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => 'px-3 py-2 rounded-lg text-[13.5px] font-semibold ' + (isActive ? 'bg-cream text-brick' : 'opacity-85 hover:bg-white/10 hover:opacity-100')}>{label}{to === '/pengaturan' && meta?.pendingUsers > 0 && <span className="ml-2 inline-block min-w-[18px] rounded-full bg-[#FFD166] px-1.5 text-center text-[11px] font-bold text-ink" title="Pendaftar menunggu persetujuan">{meta.pendingUsers}</span>}</NavLink>
          ))}
        </nav>
        <div className="md:mt-auto text-[11px] opacity-90 md:pt-4">
          <div className="font-semibold">{user?.name}</div>
          <div className="opacity-80">{user?.email} · {user?.role}</div>
          <button className="underline mt-1" onClick={logout}>Keluar</button>
        </div>
      </aside>
      <main className="p-4 md:p-7 pb-16 min-w-0"><Outlet /></main>
      <div className={'fixed bottom-5 left-1/2 -translate-x-1/2 bg-ink text-cream px-4 py-2.5 rounded-full text-[13px] z-[99] transition-opacity pointer-events-none ' + (toast ? 'opacity-100' : 'opacity-0')}>{toast}</div>
    </div>
  )
}

export const PageHead = ({ title, sub, children }) => (
  <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
    <div><h1 dangerouslySetInnerHTML={{ __html: title }} />{sub && <div className="text-[13px] text-ink-2 mt-1">{sub}</div>}</div>
    <div className="flex gap-2 flex-wrap">{children}</div>
  </div>
)
