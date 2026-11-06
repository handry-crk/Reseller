import { useEffect, useState } from 'react'
import { api, fmtN, fmtRp, today } from '../lib/api'
import { useStore } from '../lib/store'
import { Confirm, Drawer, Section, Select, StatusTag, TierTag } from './ui'

const TYPE_LABEL = { order: 'Order', followup: 'Follow-Up', complaint: 'Complaint', education: 'Edukasi', stage: 'Tahap' }

/** Drawer detail + form reseller. mode: 'detail' | 'form'. id null = reseller baru. */
export default function ResellerDrawer({ id, mode = 'detail', onClose, onModeChange }) {
  const { meta, run, can, stageOf } = useStore()
  const [r, setR] = useState(null)
  const [quick, setQuick] = useState(null) // {type} | 'delete'
  const open = mode !== null

  const load = async () => { if (id) setR(await api(`/api/resellers/${id}`)) ; else setR(null) }
  useEffect(() => { load(); setQuick(null) }, [id, mode]) // eslint-disable-line

  if (!open) return <Drawer open={false} />
  return (
    <Drawer open onClose={onClose}>
      {mode === 'form'
        ? <ResellerForm r={r} onSaved={(saved) => { onModeChange('detail', saved.id) }} onCancel={() => id ? onModeChange('detail', id) : onClose()} />
        : r && <Detail r={r} quick={quick} setQuick={setQuick} reload={load} onEdit={() => onModeChange('form', id)} onClose={onClose} meta={meta} run={run} can={can} stageOf={stageOf} />}
    </Drawer>
  )
}

function Detail({ r, quick, setQuick, reload, onEdit, onClose, meta, run, can, stageOf }) {
  const main = meta.stages.filter(s => !s.side).map(s => s.id)
  const idx = main.indexOf(r.stage); const next = idx >= 0 ? main[idx + 1] : null
  const cms = meta.cms
  const tierInfo = cms.tiers.find(t => t.name === r.tier)
  const move = (stage) => run(() => api(`/api/resellers/${r.id}/stage`, { method: 'POST', body: { stage } }), 'Tahap diperbarui').then(reload)
  const guide = {
    education: cms.education.map(e => `• ${e.title}${e.link ? ` — ${e.link}` : ''}${e.description ? ` (${e.description})` : ''}`).join('\n') || 'Belum ada materi',
    program: cms.benefit + '\n\nKetentuan\n' + cms.terms,
    tier: cms.tiers.map(t => `${t.name === r.tier ? '▶' : '•'} ${t.name} — min ${t.minPacks} pack/bln — ${t.benefit}`).join('\n'),
    support: cms.support,
  }[r.stage]
  return (
    <>
      <h2 className="text-2xl font-extrabold text-brick">{r.name}</h2>
      <div className="text-[13px] text-ink-2">{r.phone} · {r.area} · {r.channel} · PIC {r.pic || '-'}</div>
      <div className="mt-2.5 flex flex-wrap gap-1.5 items-center"><StatusTag s={r.status} /><span className="tag">{stageOf(r.stage).label}</span><TierTag t={r.tier} auto={!r.tierManual} />{r.openComplaints > 0 && <span className="tag">⚠ {r.openComplaints} complaint open</span>}</div>
      <div className="grid grid-cols-3 gap-2.5 mt-4">
        <Mini l="Order" v={fmtN(r.ordersCount)} s={`${fmtN(r.totalPacks)} pack`} />
        <Mini l="Revenue" v={fmtRp(r.totalRevenue)} s={`AOV ${r.ordersCount ? fmtRp(r.totalRevenue / r.ordersCount) : '–'}`} />
        <Mini l="Terakhir order" v={r.lastOrderDate ? r.daysSinceLastOrder + ' hr' : '–'} s={r.lastOrderDate || 'belum order'} />
      </div>
      {can.write && <Section title="Aksi Alur">
        <div className="flex flex-wrap gap-2">
          {next && <button className="btn btn-primary btn-sm" onClick={() => move(next)}>→ {stageOf(next).label}</button>}
          {!['reaktivasi', 'retention'].includes(r.stage) && <button className="btn btn-sm" onClick={() => move('reaktivasi')}>↩ Follow-Up / Reaktivasi</button>}
          {r.stage === 'reaktivasi' && <button className="btn btn-sm" onClick={() => move('order1')}>Kembali ke Order</button>}
          {['order', 'followup', 'complaint', 'education'].map(t => <button key={t} className="btn btn-sm" onClick={() => setQuick({ type: t })}>+ {TYPE_LABEL[t]}</button>)}
          <button className="btn btn-ghost btn-sm" onClick={onEdit}>Edit Data</button>
          {can.deleteReseller && <button className="btn btn-danger btn-sm" onClick={() => setQuick('delete')}>Hapus</button>}
        </div>
      </Section>}
      {quick?.type && <QuickAct r={r} type={quick.type} cms={cms} onDone={() => { setQuick(null); reload() }} onCancel={() => setQuick(null)} run={run} />}
      {quick === 'delete' && <Confirm title="Hapus reseller ini?" text="Semua riwayat aktivitasnya ikut terhapus." yesLabel="Ya, hapus" onNo={() => setQuick(null)}
        onYes={() => run(() => api(`/api/resellers/${r.id}`, { method: 'DELETE' }), 'Reseller dihapus').then(onClose)} />}
      {guide && <Section title={'Panduan Tahap: ' + stageOf(r.stage).label}><div className="pre">{guide}</div></Section>}
      {tierInfo && <div className="note mt-3">Benefit tier <b>{tierInfo.name}</b>: {tierInfo.benefit}. Pack 30 hari terakhir: <b>{fmtN(r.packsLast30)}</b>.</div>}
      {r.nextFollowUp && <div className="note mt-2">Jadwal follow-up: <b>{r.nextFollowUp}</b></div>}
      {r.address && <Section title="Alamat"><div className="pre">{r.address}</div></Section>}
      {r.notes && <Section title="Catatan"><div className="pre">{r.notes}</div></Section>}
      <Section title={`Riwayat Aktivitas (${r.activities.length})`}>
        {r.activities.length === 0 && <div className="text-ink-3 text-xs">Belum ada aktivitas</div>}
        {r.activities.map(a => (
          <div key={a.id} className="grid grid-cols-[86px_1fr] gap-2.5 py-2 border-b border-dashed border-line text-[12.5px]">
            <div className="text-ink-3 tabular-nums">{a.date}</div>
            <div>
              <span className="font-bold">{TYPE_LABEL[a.type] || a.type}</span>
              {a.type === 'order' && ` · ${fmtN(a.qty)} pack · ${fmtRp(a.amount)}`}
              {a.type === 'complaint' && (a.status === 'resolved' ? <span className="tag tag-good ml-1">resolved</span> : <><span className="tag ml-1">open</span>{can.write && <button className="link ml-2 text-xs" onClick={() => run(() => api(`/api/activities/${a.id}/resolve`, { method: 'POST' }), 'Complaint selesai').then(reload)}>tandai selesai</button>}</>)}
              {a.note && <div className="text-ink-2">{a.note}</div>}
              <div className="text-[11px] text-ink-3">{a.by && `oleh ${a.by}`} {can.write && <button className="link font-medium text-[11px] ml-2" onClick={() => run(() => api(`/api/activities/${a.id}`, { method: 'DELETE' }), 'Aktivitas dihapus').then(reload)}>hapus</button>}</div>
            </div>
          </div>
        ))}
      </Section>
    </>
  )
}

const Mini = ({ l, v, s }) => <div className="card p-3"><div className="text-xs font-bold">{l}</div><div className="text-2xl font-extrabold text-brick leading-none my-1.5 tabular-nums">{v}</div><div className="text-[11px] text-ink-2">{s}</div></div>

function QuickAct({ r, type, cms, onDone, onCancel, run }) {
  const [f, setF] = useState({ date: today(), qty: cms.minRepeatOrder || '', amount: cms.pricePerPack && cms.minRepeatOrder ? cms.pricePerPack * cms.minRepeatOrder : '', note: '', nextFollowUp: '' })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = () => {
    const body = { resellerId: r.id, type, date: f.date, note: f.note, qty: +f.qty || 0, amount: +f.amount || 0, nextFollowUp: f.nextFollowUp }
    run(() => api('/api/activities', { method: 'POST', body }), 'Aktivitas tersimpan').then(onDone).catch(() => {})
  }
  const ph = { complaint: 'Isi complaint / feedback dari reseller', order: 'Produk / varian / catatan packing', followup: 'Hasil follow-up', education: 'Materi yang diberikan' }[type]
  return (
    <div className="card border-brick mt-4">
      <h4 className="text-[13px] font-bold mb-2">Catat {TYPE_LABEL[type]}</h4>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="lbl">Tanggal</label><input className="inp" type="date" value={f.date} onChange={set('date')} /></div>
        {type === 'order' && <><div><label className="lbl">Jumlah pack</label><input className="inp" type="number" min="1" value={f.qty} onChange={e => setF({ ...f, qty: e.target.value, amount: cms.pricePerPack ? cms.pricePerPack * (+e.target.value || 0) : f.amount })} /></div>
          <div><label className="lbl">Nilai order (Rp)</label><input className="inp" type="number" min="0" value={f.amount} onChange={set('amount')} /></div></>}
        {type === 'followup' && <div><label className="lbl">Follow-up berikutnya</label><input className="inp" type="date" value={f.nextFollowUp} onChange={set('nextFollowUp')} /></div>}
        <div className="col-span-2"><label className="lbl">Catatan</label><textarea className="inp min-h-[70px]" placeholder={ph} value={f.note} onChange={set('note')} /></div>
      </div>
      <div className="flex gap-2 mt-3"><button className="btn btn-primary btn-sm" onClick={submit}>Simpan</button><button className="btn btn-ghost btn-sm" onClick={onCancel}>Batal</button></div>
    </div>
  )
}

export function ResellerForm({ r, onSaved, onCancel }) {
  const { meta, run } = useStore()
  const s = meta.settings
  const [f, setF] = useState({ name: '', phone: '', area: s.area[0] || '', channel: s.channel[0] || '', pic: s.pic[0] || '', stage: 'lead', tierManual: '', address: '', nextFollowUp: '', notes: '', ...(r || {}) })
  const set = (k) => (v) => setF({ ...f, [k]: typeof v === 'string' ? v : v.target.value })
  const submit = async (e) => {
    e.preventDefault()
    const body = Object.fromEntries(['name', 'phone', 'area', 'channel', 'pic', 'stage', 'tierManual', 'address', 'nextFollowUp', 'notes'].map(k => [k, f[k] || '']))
    const saved = await run(() => r?.id ? api(`/api/resellers/${r.id}`, { method: 'PUT', body }) : api('/api/resellers', { method: 'POST', body }), 'Reseller tersimpan').catch(() => null)
    if (saved) onSaved(saved)
  }
  return (
    <form onSubmit={submit}>
      <h2 className="text-2xl font-extrabold text-brick">{r?.id ? 'Edit Reseller' : 'Reseller Baru'}</h2>
      {!r?.id && <div className="text-[13px] text-ink-2">Tahap 1–2: data calon reseller & form pendaftaran (data CRM)</div>}
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="col-span-2"><label className="lbl">Nama reseller / toko *</label><input className="inp" value={f.name} onChange={set('name')} required autoFocus /></div>
        <div><label className="lbl">No. WhatsApp</label><input className="inp" value={f.phone} onChange={set('phone')} /></div>
        <div><label className="lbl">Area</label><Select options={s.area} value={f.area} onChange={set('area')} /></div>
        <div><label className="lbl">Channel masuk</label><Select options={s.channel} value={f.channel} onChange={set('channel')} /></div>
        <div><label className="lbl">PIC</label><Select options={s.pic} value={f.pic} onChange={set('pic')} /></div>
        <div><label className="lbl">Tahap alur</label><Select options={meta.stages.map((st, i) => ({ value: st.id, label: `${st.side ? '↩' : i + 1}. ${st.label}` }))} value={f.stage} onChange={set('stage')} /></div>
        <div><label className="lbl">Tier (kosong = otomatis)</label><Select options={meta.cms.tiers.map(t => t.name)} value={f.tierManual} onChange={set('tierManual')} placeholder="Otomatis" /></div>
        <div><label className="lbl">Alamat kirim</label><input className="inp" value={f.address} onChange={set('address')} /></div>
        <div><label className="lbl">Jadwal follow-up</label><input className="inp" type="date" value={f.nextFollowUp} onChange={set('nextFollowUp')} /></div>
        <div className="col-span-2"><label className="lbl">Catatan</label><textarea className="inp min-h-[70px]" value={f.notes} onChange={set('notes')} /></div>
      </div>
      <div className="flex gap-2 mt-4"><button className="btn btn-primary">Simpan</button><button type="button" className="btn btn-ghost" onClick={onCancel}>Batal</button></div>
    </form>
  )
}
