import { useEffect, useState } from 'react'
import { PageHead } from '../components/Layout'
import { api } from '../lib/api'
import { useStore } from '../lib/store'

function Rows({ items, cols, ro, onChange, onAdd, onDel }) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((x, i) => <div key={i} className="grid gap-2 items-start" style={{ gridTemplateColumns: cols.map(cl => cl.w).join(' ') + (ro ? '' : ' auto') }}>
        {cols.map(cl => cl.area
          ? <textarea key={cl.f} className="inp min-h-[56px]" placeholder={cl.ph} value={x[cl.f]} onChange={e => onChange(i, cl.f, e.target.value)} readOnly={ro} />
          : <input key={cl.f} className="inp" type={cl.type || 'text'} placeholder={cl.ph} value={x[cl.f]} onChange={e => onChange(i, cl.f, e.target.value)} readOnly={ro} />)}
        {!ro && <button type="button" className="btn btn-danger btn-sm" onClick={() => onDel(i)}>✕</button>}
      </div>)}
      {!ro && <button type="button" className="btn btn-sm self-start" onClick={onAdd}>+ Tambah</button>}
    </div>
  )
}

export default function Cms() {
  const { meta, run, can } = useStore()
  const [c, setC] = useState(null)
  useEffect(() => { if (meta && !c) setC(structuredClone(meta.cms)) }, [meta]) // eslint-disable-line
  if (!c) return null
  const ro = !can.cms
  const set = (k) => (e) => setC({ ...c, [k]: e.target.value })
  const row = (k) => (i, f, v) => setC(prev => ({ ...prev, [k]: prev[k].map((x, j) => j === i ? { ...x, [f]: v } : x) }))
  const add = (k, blank) => () => setC(prev => ({ ...prev, [k]: [...prev[k], blank] }))
  const del = (k) => (i) => setC(prev => ({ ...prev, [k]: prev[k].filter((_, j) => j !== i) }))
  const save = () => {
    const body = { ...c, products: (c.products || []).filter(p => p.name.trim()).map(p => ({ name: p.name.trim(), price: +p.price || 0 })), tiers: c.tiers.filter(t => t.name).map(t => ({ ...t, minPacks: +t.minPacks || 0 })), education: c.education.filter(e => e.title), templates: c.templates.filter(t => t.name),
      minFirstOrder: +c.minFirstOrder || 0, minRepeatOrder: +c.minRepeatOrder || 0, pricePerPack: +c.pricePerPack || 0 }
    run(() => api('/api/cms', { method: 'PUT', body }), 'Konten CMS tersimpan').then(setC).catch(() => {})
  }
  return (
    <>
      <PageHead title="<b>CMS</b> Program Mitra Reseller" sub="Konten yang dipakai CS/CRM: product education, benefit program, ketentuan, tier list, dan template pesan.">
        {!ro && <button className="btn btn-primary" onClick={save}>Simpan Konten</button>}
      </PageHead>
      {ro && <div className="note mb-4">Anda hanya bisa melihat. Perubahan konten dilakukan oleh role CRM/Admin.</div>}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card lg:col-span-2"><h3 className="card-title">Katalog Produk (untuk pesanan)</h3><div className="hint">Nama produk muncul sebagai pilihan di form pesanan; harga per pack terisi otomatis (masih bisa diubah per pesanan).</div>
          <Rows items={c.products || []} ro={ro} cols={[{ f: 'name', w: '2fr', ph: 'Nama produk' }, { f: 'price', w: '1fr', ph: 'Harga/pack (Rp)', type: 'number' }]} onChange={row('products')} onAdd={add('products', { name: '', price: 0 })} onDel={del('products')} /></div>
        <div className="card"><h3 className="card-title">Tier List Mitra</h3><div className="hint">Nama tier, minimum pack per bulan (30 hari), dan benefit. Diurutkan otomatis.</div>
          <Rows items={c.tiers} ro={ro} cols={[{ f: 'name', w: '1fr', ph: 'Nama tier' }, { f: 'minPacks', w: '1fr', ph: 'Min pack/bln', type: 'number' }, { f: 'benefit', w: '2fr', ph: 'Benefit' }]} onChange={row('tiers')} onAdd={add('tiers', { name: '', minPacks: 0, benefit: '' })} onDel={del('tiers')} /></div>
        <div className="card"><h3 className="card-title">Product Education</h3><div className="hint">Materi edukasi untuk reseller baru (link video/PDF/katalog)</div>
          <Rows items={c.education} ro={ro} cols={[{ f: 'title', w: '1fr', ph: 'Judul materi' }, { f: 'link', w: '1fr', ph: 'Link (opsional)' }, { f: 'description', w: '2fr', ph: 'Keterangan' }]} onChange={row('education')} onAdd={add('education', { title: '', link: '', description: '' })} onDel={del('education')} /></div>
        <div className="card"><h3 className="card-title">Benefit Program</h3><div className="hint">Ditampilkan pada tahap Benefit Program & Ketentuan</div><textarea className="inp min-h-[150px]" value={c.benefit} onChange={set('benefit')} readOnly={ro} /></div>
        <div className="card"><h3 className="card-title">Ketentuan Mitra Reseller</h3><div className="hint">Syarat & ketentuan kemitraan</div><textarea className="inp min-h-[150px]" value={c.terms} onChange={set('terms')} readOnly={ro} /></div>
        <div className="card lg:col-span-2"><h3 className="card-title">Template Pesan WhatsApp</h3><div className="hint">Gunakan {'{nama}'} dan {'{tier}'}. Dipakai di halaman Follow-Up & Complaint.</div>
          <Rows items={c.templates} ro={ro} cols={[{ f: 'name', w: '1fr', ph: 'Nama template' }, { f: 'body', w: '3fr', ph: 'Isi pesan', area: true }]} onChange={row('templates')} onAdd={add('templates', { name: '', body: '' })} onDel={del('templates')} /></div>
        <div className="card"><h3 className="card-title">Support Mitra Reseller</h3><div className="hint">Dukungan yang diberikan (POSM, materi promo, training, dsb.)</div><textarea className="inp min-h-[110px]" value={c.support} onChange={set('support')} readOnly={ro} /></div>
        <div className="card"><h3 className="card-title">Ketentuan Minimal Order</h3><div className="hint">Dipakai sebagai nilai awal saat mencatat order</div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="lbl">Minimal order pertama (pack)</label><input className="inp" type="number" value={c.minFirstOrder} onChange={set('minFirstOrder')} readOnly={ro} /></div>
            <div><label className="lbl">Minimal repeat order (pack)</label><input className="inp" type="number" value={c.minRepeatOrder} onChange={set('minRepeatOrder')} readOnly={ro} /></div>
            <div className="col-span-2"><label className="lbl">Harga reseller per pack (Rp)</label><input className="inp" type="number" value={c.pricePerPack} onChange={set('pricePerPack')} readOnly={ro} /></div>
          </div></div>
      </div>
    </>
  )
}
