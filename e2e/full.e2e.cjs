// E2E menyeluruh CRK Reseller Hub.
// 1) Server bersih:  python scripts/dev_inmemory.py   (frontend sudah di-build ke backend/static)
// 2) Jalankan:       node e2e/full.e2e.cjs  [URL]     (default http://localhost:8000)
// Butuh playwright (npm i -g playwright && npx playwright install chromium).
const { chromium } = require('playwright')
const U = process.argv[2] || 'http://localhost:8000'
const results = []
let section = ''
const ok = (cond, msg, detail = '') => { results.push({ section, msg, pass: !!cond, detail }); console.log(`${cond ? '✓' : '✗'} [${section}] ${msg}${!cond && detail ? ' — ' + detail : ''}`) }
const sec = (s) => { section = s; console.log('\n== ' + s) }
const rp = (n) => 'Rp' + n.toLocaleString('id-ID')
const errors = []

async function api(path, { method = 'GET', body, token } = {}) {
  const r = await fetch(U + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined })
  let data = null; try { data = await r.json() } catch {}
  return { status: r.status, data }
}
async function newPage(b, vp = { width: 1400, height: 950 }) {
  const ctx = await b.newContext({ viewport: vp })
  const p = await ctx.newPage()
  p.on('pageerror', e => errors.push(`[${section}] PAGE: ${e.message}`))
  p.on('console', m => { if (m.type() === 'error' && !/401|403|409|422|Failed to load resource/.test(m.text())) errors.push(`[${section}] CONSOLE: ${m.text()}`) })
  return p
}
async function login(p, email, pw) {
  await p.goto(U); await p.fill('input[type=email]', email); await p.fill('input[type=password]', pw); await p.click('button:has-text("Masuk")')
  await p.waitForSelector('text=Reseller Dashboard', { timeout: 8000 })
}
const drawer = (p) => p.locator('div.fixed.top-0.right-0:not(.translate-x-full)')
const nav = async (p, label) => { await p.click(`nav a:has-text("${label}")`); await p.waitForTimeout(400) }
const toast = async (p) => { await p.waitForTimeout(250); return (await p.locator('div.fixed.bottom-5').textContent()) || '' }

;(async () => {
  const b = await chromium.launch()
  const adm = await api('/api/auth/login', { method: 'POST', body: { email: 'admin@crk.local', password: 'admin123' } })
  const T = adm.data?.token
  const meta = (await api('/api/meta', { token: T })).data
  const today = meta.today
  const daysAgo = (n) => { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10) }
  const daysAhead = (n) => daysAgo(-n)

  // ================= 1. AUTH & PENDAFTARAN =================
  sec('Auth & Pendaftaran')
  const p = await newPage(b)
  await p.goto(U)
  await p.fill('input[type=email]', 'admin@crk.local'); await p.fill('input[type=password]', 'salah'); await p.click('button:has-text("Masuk")')
  await p.waitForTimeout(500)
  ok((await p.locator('.note').textContent()).includes('salah'), 'login sandi salah ditolak dengan pesan jelas')
  ok((await api('/api/resellers')).status === 401, 'API tanpa token ditolak 401')
  ok((await api('/api/resellers', { token: 'abc.def.ghi' })).status === 401, 'token palsu ditolak 401')
  await p.click('button:has-text("Daftar member baru")')
  ok(p.url().endsWith('/daftar'), 'tautan daftar membuka /daftar')
  const reg = async (name, email, pw, pw2 = pw) => {
    await p.fill('form input >> nth=0', name); await p.fill('form input[type=email]', email)
    await p.fill('form input[type=password] >> nth=0', pw); await p.fill('form input[type=password] >> nth=1', pw2)
    await p.click('button:has-text("Daftar")'); await p.waitForTimeout(500)
    return (await p.locator('.note').first().textContent().catch(() => '')) || ''
  }
  ok((await reg('Andi CS', 'andi@gmail.com', 'andi12345')).includes('email perusahaan'), 'daftar email gmail ditolak')
  ok((await reg('Andi CS', 'andi@citarasakuliner.com', 'pendek')).includes('minimal 8'), 'sandi < 8 karakter ditolak')
  ok((await reg('Andi CS', 'andi@citarasakuliner.com', 'andi12345', 'beda1234')).includes('tidak sama'), 'konfirmasi sandi berbeda ditolak')
  ok((await reg('Andi CS', 'andi@citarasakuliner.com', 'andi12345')).includes('Pendaftaran terkirim'), 'daftar email perusahaan berhasil')
  ok((await api('/api/auth/register', { method: 'POST', body: { name: 'Andi', email: 'ANDI@citarasakuliner.com', password: 'andi12345' } })).status === 409, 'daftar ulang email sama (beda huruf besar) ditolak 409')
  for (const bad of ['eve@citarasakuliner.com.evil.io', 'eve@citarasakuliner.evil.io', 'eve@citarasakuliner-id.com', 'eve@xcitarasakuliner.com', 'eve@citarasakuliner.c0m'])
    ok((await api('/api/auth/register', { method: 'POST', body: { name: 'Eve', email: bad, password: 'eve123456' } })).status === 422, 'domain tiruan ditolak: ' + bad)
  for (const [n, e, pw] of [['Gina Gudang', 'gina@citarasakuliner.co.id', 'gina12345'], ['Vino Viewer', 'vino@citarasakuliner.id', 'vino12345']])
    await api('/api/auth/register', { method: 'POST', body: { name: n, email: e, password: pw } })
  const pend = await api('/api/auth/login', { method: 'POST', body: { email: 'andi@citarasakuliner.com', password: 'andi12345' } })
  ok(pend.status === 401 && pend.data.detail.includes('persetujuan'), 'akun pending tidak bisa login')
  ok((await api('/api/meta', { token: T })).data.pendingUsers === 3, 'admin melihat 3 pendaftar pending')

  // approve lewat UI
  const a = await newPage(b)
  await login(a, 'admin@crk.local', 'admin123')
  ok((await a.locator('nav a:has-text("Pengaturan") span').textContent()) === '3', 'badge Pengaturan menampilkan 3')
  await nav(a, 'Pengaturan'); await a.waitForSelector('text=Menunggu persetujuan')
  const approve = async (email, role) => {
    const row = a.locator('div.bg-white', { hasText: email })
    await row.locator('select').selectOption(role); await row.locator('button:has-text("Setujui")').click(); await a.waitForTimeout(700)
  }
  await approve('andi@citarasakuliner.com', 'cs'); await approve('gina@citarasakuliner.co.id', 'gudang'); await approve('vino@citarasakuliner.id', 'viewer')
  ok((await a.locator('text=Menunggu persetujuan').count()) === 0, 'semua pendaftar disetujui, panel hilang')
  const tok = async (e, pw) => (await api('/api/auth/login', { method: 'POST', body: { email: e, password: pw } })).data?.token
  const TCS = await tok('andi@citarasakuliner.com', 'andi12345'), TGD = await tok('gina@citarasakuliner.co.id', 'gina12345'), TVW = await tok('vino@citarasakuliner.id', 'vino12345')
  ok(TCS && TGD && TVW, 'ketiga akun bisa login setelah disetujui')
  ok((await api('/api/users', { method: 'POST', token: T, body: { email: 'luar@yahoo.com', name: 'Luar', role: 'cs', password: 'abcdef12' } })).status === 422, 'admin tidak bisa membuat user domain luar')

  // ================= 2. HAK AKSES ROLE =================
  sec('Hak akses role')
  const r403 = async (path, method, token, body) => (await api(path, { method, token, body })).status
  ok(await r403('/api/resellers', 'POST', TVW, { name: 'X' }) === 403, 'Viewer tidak bisa membuat reseller')
  ok(await r403('/api/resellers', 'POST', TGD, { name: 'X' }) === 403, 'Gudang tidak bisa membuat reseller')
  ok(await r403('/api/cms', 'PUT', TCS, meta.cms) === 403, 'CS tidak bisa mengubah CMS')
  ok(await r403('/api/settings', 'PUT', TCS, { pic: [], channel: [], area: [] }) === 403, 'CS tidak bisa mengubah Pengaturan')
  ok(await r403('/api/users', 'GET', TCS) === 403, 'CS tidak bisa melihat daftar user')
  ok(await r403('/api/admin/seed', 'POST', TCS) === 403, 'CS tidak bisa isi data contoh')
  const vw = await newPage(b); await login(vw, 'vino@citarasakuliner.id', 'vino12345')
  ok((await vw.locator('button:has-text("+ Reseller Baru")').count()) === 0, 'Viewer: tombol + Reseller Baru tidak tampil')
  await nav(vw, 'Pesanan'); ok((await vw.locator('button:has-text("+ Pesanan Baru")').count()) === 0 && (await vw.locator('table select').count()) === 0, 'Viewer: tidak ada tombol pesanan / dropdown status')
  await nav(vw, 'CMS'); ok((await vw.locator('button:has-text("Simpan Konten")').count()) === 0, 'Viewer: CMS hanya-baca')
  await nav(vw, 'Pengaturan'); ok((await vw.locator('h3:has-text("Pengguna")').count()) === 0 && (await vw.locator('button:has-text("Simpan")').count()) === 1, 'Viewer: tidak melihat manajemen user (hanya ganti sandi)')

  // ================= 3. RESELLER CRUD =================
  sec('Reseller: buat, edit, duplikat')
  await nav(a, 'Data Reseller')
  const createRes = async (name, phone) => {
    await a.click('button:has-text("+ Reseller Baru")'); const d = drawer(a)
    await d.locator('form input.inp >> nth=0').fill(name); await d.locator('form input.inp >> nth=1').fill(phone)
    await d.locator('form button:has-text("Simpan")').dblclick(); await a.waitForTimeout(900)
  }
  await createRes('Toko Uji Satu', '0812-1111-2222')
  ok((await drawer(a).locator('h2').textContent()) === 'Toko Uji Satu', 'reseller baru tersimpan, detail terbuka')
  ok((await drawer(a).textContent()).includes('081211112222'), 'nomor WA dinormalisasi (tanpa tanda hubung)')
  await a.click('button[aria-label=Tutup]'); await a.waitForTimeout(300)
  ok((await a.locator('td', { hasText: 'Toko Uji Satu' }).count()) === 1, 'klik ganda Simpan tidak membuat data dobel')
  await createRes('toko uji satu', '081211112222')
  ok((await toast(a)).includes('sudah ada'), 'nama + WA sama ditolak (beda huruf besar)')
  await a.click('button[aria-label=Tutup]').catch(() => {})
  const R1 = (await api('/api/resellers', { token: T })).data.find(r => r.name === 'Toko Uji Satu')
  ok(R1 && R1.status === 'Lead' && R1.stage === 'lead' && R1.tier === '', 'reseller baru: status Lead, tahap Leads, tier kosong')

  // ================= 4. ALUR TAHAP OTOMATIS =================
  sec('Alur tahap otomatis')
  const ord = (rid, items, extra = {}, token = T) => api('/api/activities', { method: 'POST', token, body: { resellerId: rid, type: 'order', items, ...extra } })
  const get = async (rid) => (await api('/api/resellers/' + rid, { token: T })).data
  const o1 = await ord(R1.id, [{ product: 'Mozza Balado', qty: 12, price: 23800 }], { date: daysAgo(3) }, TCS)
  let r = await get(R1.id)
  ok(o1.status === 200 && r.stage === 'order1', 'order pertama (oleh CS) → tahap Pembelian Minimal Order')
  ok(r.nextFollowUp === daysAhead(11), `follow-up = tanggal order + 14 hari (${daysAhead(11)})`, r.nextFollowUp)
  ok(r.status === 'Aktif' && r.ordersCount === 1 && r.totalPacks === 12 && r.totalRevenue === 285600, 'status Aktif, 12 pack, Rp285.600')
  ok(r.tier === 'Bronze' && r.packsLast30 === 12, 'tier otomatis Bronze (12 pack/30 hari)')
  await api('/api/activities', { method: 'POST', token: TCS, body: { resellerId: R1.id, type: 'followup', note: 'WA, belum restock', nextFollowUp: daysAhead(5) } })
  r = await get(R1.id)
  ok(r.stage === 'reaktivasi' && r.nextFollowUp === daysAhead(5), 'follow-up tanpa repeat → Reaktivasi, jadwal FU baru tersimpan')
  const o2 = await ord(R1.id, [{ product: 'Mozza BBQ', qty: 25, price: 23800 }], {}, TCS)
  r = await get(R1.id)
  ok(r.stage === 'repeat' && r.nextFollowUp === '' && r.isRepeat, 'order ke-2 dari Reaktivasi → Repeat Order, FU dikosongkan')
  ok(r.tier === 'Silver' && r.packsLast30 === 37, 'tier naik ke Silver (37 pack/30 hari)')
  await api('/api/activities', { method: 'POST', token: TCS, body: { resellerId: R1.id, type: 'education', note: 'Katalog' } })
  ok((await get(R1.id)).stage === 'education', 'edukasi di tahap Repeat → Product Education')
  // hapus order ke-2 → tahap mundur
  const del = await api('/api/activities/' + o2.data.activity.id, { method: 'DELETE', token: TCS })
  ok(del.status === 403, 'CS tidak boleh menghapus pesanan')
  await api('/api/activities/' + o2.data.activity.id, { method: 'DELETE', token: T })
  r = await get(R1.id)
  ok(r.ordersCount === 1 && r.totalRevenue === 285600, 'hapus order (admin): total kembali Rp285.600')
  ok(r.stage === 'education', 'tahap Product Education tidak ikut mundur (sudah lewat edukasi; hanya repeat→order1 yang dikoreksi)', r.stage)
  const stg = r.activities.find(x => x.type === 'stage')
  ok((await api('/api/activities/' + stg.id, { method: 'DELETE', token: T })).status === 403, 'riwayat tahap tidak bisa dihapus')
  ok((await ord(R1.id, [{ product: 'Mozza BBQ', qty: 1, price: 1 }], { date: daysAhead(2) })).status === 422, 'tanggal pesanan masa depan ditolak')
  // reseller historis
  const R2 = (await api('/api/resellers', { method: 'POST', token: T, body: { name: 'Toko Lama', phone: '0899' } })).data
  await ord(R2.id, [{ product: 'Mozza Asin Pedas', qty: 30, price: 23800 }], { date: daysAgo(40) })
  r = await get(R2.id)
  ok(r.status === 'Pasif' && r.nextFollowUp === '' && r.tier === '', 'order historis 40 hari lalu: Pasif, tanpa FU otomatis, tanpa tier')
  ok(r.needsAction, 'reseller Pasif masuk daftar Perlu Tindakan')
  await ord(R2.id, [{ product: 'Mozza Asin Pedas', qty: 5, price: 23800 }], { date: daysAgo(100) })
  r = await get(R2.id)
  ok(r.lastOrderDate === daysAgo(40) && r.status === 'Pasif', 'order lebih lama tidak menggeser tanggal order terakhir')

  // ================= 5. PIPELINE & RIWAYAT =================
  sec('Pipeline & riwayat')
  await nav(a, 'Pipeline')
  const card = a.locator('[draggable=true]', { hasText: 'Toko Lama' })
  const target = a.locator('div.rounded-lg', { hasText: 'Tier List' }).filter({ has: a.locator('h5') }).first()
  await card.dragTo(target); await a.waitForTimeout(900)
  ok((await get(R2.id)).stage === 'tier', 'drag kartu ke kolom Tier List memindahkan tahap')
  await a.click('button:has-text("Riwayat Pipeline")'); await a.waitForTimeout(600)
  const hist = await a.locator('table').textContent()
  ok(hist.includes('Toko Lama') && hist.includes('Tier List') && hist.includes('manual'), 'Riwayat Pipeline mencatat perpindahan manual')
  ok(hist.includes('Toko Uji Satu') && hist.includes('otomatis'), 'Riwayat Pipeline mencatat perpindahan otomatis')
  const h = (await api('/api/stage-history?month=' + today.slice(0, 7), { token: T })).data
  ok(h.rows.every(x => x.toLabel), 'setiap baris riwayat punya tahap tujuan')
  await api(`/api/resellers/${R2.id}/stage`, { method: 'POST', token: T, body: { stage: 'tier' } })
  ok((await api('/api/stage-history', { token: T })).data.rows.filter(x => x.resellerId === R2.id && x.toStage === 'tier').length === 1, 'pindah ke tahap yang sama tidak menambah riwayat')

  // ================= 6. PESANAN =================
  sec('Pesanan per produk')
  await a.click('button:has-text("Papan")')
  await nav(a, 'Pesanan'); await a.click('button:has-text("+ Pesanan Baru")')
  const d = drawer(a)
  await d.locator('select[aria-label="Reseller"]').selectOption(R1.id)
  await d.locator('input[aria-label="Jumlah pack"]').nth(0).fill('15')
  await d.locator('button:has-text("+ Tambah produk")').click()
  await d.locator('select[aria-label="Nama produk"]').nth(1).selectOption('Mozza Jagung Bakar')
  await d.locator('input[aria-label="Jumlah pack"]').nth(1).fill('7')
  await d.locator('input[aria-label="Harga per pack"]').nth(1).fill('21000')
  ok((await d.locator('[data-testid=total-qty]').textContent()) === '22 pack' && (await d.locator('[data-testid=total-amount]').textContent()) === rp(15 * 23800 + 7 * 21000), 'total 22 pack, ' + rp(15 * 23800 + 7 * 21000))
  await d.locator('select').filter({ hasText: 'To Ship' }).selectOption('completed')
  await d.locator('input[type=date]').nth(1).fill(daysAgo(5))
  await d.locator('input[type=date]').nth(0).fill(today)
  await d.locator('button:has-text("Simpan Pesanan")').click(); await a.waitForTimeout(500)
  ok((await d.locator('.note').last().textContent()).includes('sebelum tanggal pesanan'), 'tanggal diterima sebelum tanggal pesanan ditolak')
  await d.locator('input[type=date]').nth(1).fill(today)
  await d.locator('button:has-text("Simpan Pesanan")').click(); await a.waitForTimeout(1000)
  ok((await d.locator('[data-testid=order-saved]').count()) === 1, 'setelah simpan muncul langkah upload bukti transfer')
  await d.locator('button:has-text("Selesai")').click(); await a.waitForTimeout(400)
  const orders = (await api('/api/orders?month=' + today.slice(0, 7), { token: T })).data
  const newest = orders.orders.find(o => o.resellerName === 'Toko Uji Satu' && o.qty === 22)
  ok(newest && newest.amount === 504000 && newest.status === 'completed' && newest.receivedDate === today, 'pesanan tersimpan: Rp504.000, Completed, diterima hari ini')
  ok(/^INV-\d{6}-\d{4}$/.test(newest?.invoiceNo || ''), 'nomor invoice format INV-YYYYMM-NNNN')
  const invNos = orders.orders.map(o => o.invoiceNo)
  ok(new Set(invNos).size === invNos.length, 'nomor invoice unik')
  ok(orders.totals.revenue === orders.orders.reduce((s, o) => s + o.amount, 0), 'total revenue bulan = jumlah semua pesanan')
  ok(orders.products.reduce((s, p) => s + p.packs, 0) === orders.totals.packs, 'ringkasan per produk menjumlah ke total pack')
  // status via gudang (UI)
  const g = await newPage(b); await login(g, 'gina@citarasakuliner.co.id', 'gina12345')
  await nav(g, 'Pesanan')
  ok((await g.locator('button:has-text("+ Pesanan Baru")').count()) === 0, 'Gudang tidak bisa membuat pesanan')
  const gRow = g.locator('tr', { hasText: 'Toko Uji Satu' }).filter({ hasText: rp(285600) })
  await gRow.locator('select').selectOption('shipping'); await g.waitForTimeout(900)
  let oo = (await api('/api/orders', { token: T })).data.orders.find(o => o.id === o1.data.activity.id)
  ok(oo.status === 'shipping', 'Gudang ubah status To Ship → Shipping')
  await g.locator('tr', { hasText: 'Toko Uji Satu' }).filter({ hasText: rp(285600) }).locator('select').selectOption('completed'); await g.waitForTimeout(900)
  oo = (await api('/api/orders', { token: T })).data.orders.find(o => o.id === o1.data.activity.id)
  ok(oo.status === 'completed' && oo.receivedDate === today, 'Completed mengisi tanggal diterima otomatis')
  ok((await g.locator('tr', { hasText: 'Toko Uji Satu' }).filter({ hasText: rp(285600) }).locator('input[type=date]').inputValue()) === today, 'kolom tanggal diterima di tabel ikut terbarui')
  await api('/api/activities/' + o1.data.activity.id, { method: 'PUT', token: TGD, body: { status: 'to_ship' } })
  oo = (await api('/api/orders', { token: T })).data.orders.find(o => o.id === o1.data.activity.id)
  ok(oo.receivedDate === '', 'status mundur dari Completed mengosongkan tanggal diterima')
  const tamper = await api('/api/activities/' + o1.data.activity.id, { method: 'PUT', token: TGD, body: { items: [{ product: 'Mozza Balado', qty: 1, price: 1 }], amount: 1 } })
  ok(tamper.data.amount === 285600, 'Gudang tidak bisa mengubah isi/total pesanan')
  ok((await api('/api/activities/' + o1.data.activity.id, { method: 'PUT', token: T, body: { date: daysAgo(40) } })).status === 422 || daysAgo(40).slice(0, 7) === daysAgo(3).slice(0, 7), 'tanggal pesanan tidak bisa pindah bulan setelah invoice terbit')
  // invoice
  await a.goto(U + '/invoice/' + newest.id); await a.waitForSelector('text=INVOICE')
  const inv = await a.locator('table.w-full').textContent()
  ok(inv.includes('Mozza Balado') && inv.includes(rp(357000)) && inv.includes('Mozza Jagung Bakar') && inv.includes(rp(147000)) && inv.includes('22 pack') && inv.includes(rp(504000)), 'invoice: 2 baris produk, 22 pack, Rp504.000')
  ok((await a.locator('text=Tanggal diterima').locator('..').textContent()).length > 0, 'invoice menampilkan tanggal diterima')
  await a.click('a:has-text("Kembali")'); await a.waitForSelector('text=Pesanan Reseller')

  // ================= 6b. ONGKIR, DISKON, BUKTI TRANSFER =================
  sec('Ongkir, diskon & bukti transfer')
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  const cs = await newPage(b); await login(cs, 'andi@citarasakuliner.com', 'andi12345')
  await nav(cs, 'Pesanan'); await cs.click('button:has-text("+ Pesanan Baru")')
  const dc = drawer(cs)
  await dc.locator('select[aria-label="Reseller"]').selectOption(R1.id)
  await dc.locator('input[aria-label="Jumlah pack"]').nth(0).fill('10')
  await dc.locator('input[aria-label="Diskon"]').fill('300000')
  ok((await dc.locator('[data-testid=money-error]').textContent()).includes('melebihi subtotal'), 'diskon > subtotal langsung diberi peringatan')
  await dc.locator('button:has-text("Simpan Pesanan")').click(); await cs.waitForTimeout(400)
  ok((await dc.locator('[data-testid=order-saved]').count()) === 0, 'pesanan dengan diskon tidak valid tidak tersimpan')
  await dc.locator('input[aria-label="Diskon"]').fill('18000'); await dc.locator('input[aria-label="Ongkir"]').fill('25000')
  ok((await dc.locator('[data-testid=subtotal-products]').textContent()) === rp(238000) && (await dc.locator('[data-testid=discount-line]').textContent()) === '−' + rp(18000) && (await dc.locator('[data-testid=shipping-line]').textContent()) === '+' + rp(25000), 'ringkasan: subtotal Rp238.000, diskon −Rp18.000, ongkir +Rp25.000')
  ok((await dc.locator('[data-testid=total-amount]').textContent()) === rp(245000), 'total dibayar = 238.000 − 18.000 + 25.000 = Rp245.000')
  const revBefore = (await api('/api/orders?month=' + today.slice(0, 7), { token: T })).data.totals.revenue
  await dc.locator('button:has-text("Simpan Pesanan")').click(); await cs.waitForSelector('[data-testid=order-saved]')
  ok((await dc.textContent()).includes(rp(245000)) && (await dc.textContent()).includes('termasuk ongkir ' + rp(25000)), 'konfirmasi simpan menampilkan total & ongkir')
  await dc.locator('input[aria-label="Pilih file bukti transfer"]').setInputFiles({ name: 'transfer-bca.png', mimeType: 'image/png', buffer: PNG })
  await cs.waitForSelector('text=Sudah diupload', { timeout: 8000 })
  ok((await dc.locator('button:has-text("Selesai")').textContent()).trim() === 'Selesai', 'setelah upload, tombol berubah menjadi Selesai')
  await dc.locator('button:has-text("Selesai")').click(); await cs.waitForTimeout(600)
  const ordTF = (await api('/api/orders?month=' + today.slice(0, 7), { token: T })).data
  const tf = ordTF.orders.find(o => o.totalPaid === 245000)
  ok(tf && tf.amount === 220000 && tf.shippingFee === 25000 && tf.discount === 18000, 'tersimpan: revenue Rp220.000, ongkir Rp25.000, diskon Rp18.000')
  ok(ordTF.totals.revenue - revBefore === 220000, 'revenue bulan bertambah Rp220.000 (ongkir tidak dihitung revenue)')
  ok(tf.paymentProof && tf.paymentProof.mime === 'image/jpeg' && tf.paymentProof.uploadedBy === 'Andi CS', 'bukti transfer tersimpan (foto dikonversi ke JPEG) atas nama CS')
  const proofRes = await fetch(U + '/api/activities/' + tf.id + '/proof', { headers: { Authorization: 'Bearer ' + TVW } })
  ok(proofRes.status === 200 && (await proofRes.arrayBuffer()).byteLength > 100, 'file bukti bisa diambil oleh user yang login')
  ok((await fetch(U + '/api/activities/' + tf.id + '/proof')).status === 401, 'file bukti tidak bisa diakses tanpa login')
  const row = cs.locator('tr', { hasText: tf.invoiceNo })
  ok((await row.locator('[data-testid=proof-cell]').textContent()).includes('✓ ada'), 'tabel Pesanan: kolom Bukti TF = ✓ ada')
  ok((await row.textContent()).includes(rp(245000)) && (await row.textContent()).includes('ongkir ' + rp(25000)), 'tabel Pesanan: Dibayar Rp245.000 dengan rincian ongkir')
  await row.locator('button:has-text("Lihat bukti")').click(); await cs.waitForSelector('img[alt="Bukti transfer"]')
  ok(await cs.locator('img[alt="Bukti transfer"]').evaluate(i => i.complete && i.naturalWidth > 0), 'pratinjau bukti transfer tampil')
  await cs.click('button:has-text("Tutup")')
  const noProof = cs.locator('tr').filter({ has: cs.locator('button:has-text("Upload bukti transfer")') }).first()
  await noProof.locator('input[type=file]').setInputFiles({ name: 'catatan.txt', mimeType: 'text/plain', buffer: Buffer.from('bukan gambar') })
  await cs.waitForTimeout(500)
  ok((await noProof.textContent()).includes('Format harus'), 'upload file bukan gambar/PDF ditolak')
  const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(3 * 1024 * 1024, 48)])
  await noProof.locator('input[type=file]').setInputFiles({ name: 'besar.pdf', mimeType: 'application/pdf', buffer: pdf })
  await cs.waitForTimeout(500)
  ok((await noProof.textContent()).includes('maksimal 2 MB'), 'PDF > 2 MB ditolak')
  await cs.goto(U + '/invoice/' + tf.id); await cs.waitForSelector('text=INVOICE')
  const invTxt = await cs.locator('body').textContent()
  ok(invTxt.includes('Subtotal produk') && invTxt.includes('−' + rp(18000)) && invTxt.includes('Ongkir') && invTxt.includes(rp(245000)) && invTxt.includes('Bukti transfer: diterima'), 'invoice: subtotal, diskon, ongkir, total Rp245.000, status bukti diterima')
  await nav(g, 'Dashboard'); await nav(g, 'Pesanan'); await g.waitForTimeout(800)
  ok((await g.locator('button:has-text("Upload bukti transfer")').count()) === 0 && (await g.locator('button:has-text("Lihat bukti")').count()) >= 1, 'Gudang bisa melihat bukti, tidak bisa upload')
  ok((await api('/api/activities/' + tf.id + '/proof', { method: 'DELETE', token: TCS })).status === 403, 'CS tidak bisa menghapus bukti transfer')

  // ================= 6c. EDIT DAFTAR PIC & AREA OLEH CS =================
  sec('Edit daftar PIC & area (CS)')
  await cs.goto(U); await cs.waitForSelector('text=Reseller Dashboard'); await nav(cs, 'Pengaturan')
  const picBox = cs.locator('[data-list=pic]'), areaBox = cs.locator('[data-list=area]')
  ok(!(await picBox.locator('input').first().getAttribute('readonly') !== null) && (await cs.locator('label:has-text("Pasif jika") + input').getAttribute('readonly')) !== null, 'CS bisa mengedit daftar, tapi aturan otomatis tetap terkunci')
  await picBox.locator('button:has-text("+ Tambah")').click(); await picBox.locator('input').last().fill('Rina')
  await areaBox.locator('button:has-text("+ Tambah")').click(); await areaBox.locator('input').last().fill('Bali')
  const cs1 = picBox.locator('input[value="CS 1"]')
  ok((await picBox.textContent()).includes('rs'), 'jumlah reseller pemakai tiap PIC ditampilkan')
  await cs1.locator('xpath=..').locator('button').click()
  await cs.click('button:has-text("Simpan Daftar")'); await cs.waitForTimeout(800)
  const st = (await api('/api/settings', { token: T })).data
  ok(st.pic.includes('Rina') && !st.pic.includes('CS 1') && st.area.includes('Bali'), 'daftar baru tersimpan: PIC Rina ditambah, CS 1 dihapus, area Bali ditambah')
  ok((await cs.locator('button:has-text("Tersimpan")').count()) === 1, 'tombol kembali ke status Tersimpan')
  await nav(cs, 'Data Reseller')
  await cs.locator('tr', { hasText: 'Toko Uji Satu' }).locator('button:has-text("Detail")').click()
  await drawer(cs).locator('button:has-text("Edit Data")').click()
  ok((await drawer(cs).locator('select').nth(2).inputValue()) === 'CS 1', 'reseller lama tetap menampilkan PIC CS 1 walau sudah dihapus dari daftar')
  ok((await drawer(cs).locator('select').nth(2).locator('option').allTextContents()).includes('Rina'), 'PIC baru Rina muncul di pilihan form reseller')
  await drawer(cs).locator('form button:has-text("Simpan")').click(); await cs.waitForTimeout(800)
  ok((await get(R1.id)).pic === 'CS 1', 'simpan tanpa mengubah PIC tidak menimpa nilai lama')
  await cs.click('button[aria-label=Tutup]')
  await nav(vw, 'Pengaturan')
  ok((await vw.locator('[data-list=pic] input').first().getAttribute('readonly')) !== null && (await vw.locator('button:has-text("Simpan Daftar")').count()) === 0, 'Viewer tidak bisa mengedit daftar')
  ok((await api('/api/settings/lists', { method: 'PUT', token: TGD, body: { pic: ['X'], channel: ['X'], area: ['X'] } })).status === 403, 'Gudang tidak bisa mengubah daftar lewat API')

  // ================= 7. FOLLOW-UP & COMPLAINT =================
  sec('Follow-up & complaint')
  const cmp = await api('/api/activities', { method: 'POST', token: TCS, body: { resellerId: R2.id, type: 'complaint', note: 'Pack bocor' } })
  ok(cmp.data.reseller.openComplaints === 1, 'complaint baru tercatat open')
  await nav(a, 'Follow-Up')
  ok((await a.locator('tr', { hasText: 'Pack bocor' }).count()) === 1, 'complaint tampil di halaman Follow-Up')
  await a.locator('tr', { hasText: 'Pack bocor' }).locator('button:has-text("Selesai")').click(); await a.waitForTimeout(800)
  ok((await get(R2.id)).openComplaints === 0, 'tombol Selesai menutup complaint')
  await a.locator('select').filter({ hasText: 'pilih reseller' }).selectOption(R2.id)
  const tpl = await a.locator('.pre').first().textContent()
  ok(tpl.includes('Toko Lama') && !tpl.includes('{nama}'), 'template WA mengisi {nama} otomatis')
  const wa = await a.locator('a:has-text("Buka WA")').first().getAttribute('href')
  ok(wa.startsWith('https://wa.me/62899?text='), 'tautan WA memakai format 62…', wa.slice(0, 40))
  ok((await a.locator('tr', { hasText: 'Toko Lama' }).count()) >= 1, 'reseller Pasif muncul di jadwal reaktivasi')

  // ================= 8. CMS =================
  sec('CMS')
  await nav(a, 'CMS'); await a.waitForSelector('text=Katalog Produk')
  await a.locator('button:has-text("+ Tambah")').first().click()
  const pin = a.locator('input[placeholder="Nama produk"]').last()
  await pin.click(); await pin.type('Mozza Original'); await a.locator('input[placeholder="Harga/pack (Rp)"]').last().fill('22500')
  ok((await pin.inputValue()) === 'Mozza Original', 'mengetik di CMS tidak kehilangan fokus')
  await a.click('button:has-text("Simpan Konten")'); await a.waitForTimeout(800)
  const cms2 = (await api('/api/cms', { token: T })).data
  ok(cms2.products.some(x => x.name === 'Mozza Original' && x.price === 22500), 'produk baru tersimpan di katalog')
  ok((await ord(R1.id, [{ product: 'Mozza Original', qty: 2, price: 22500 }])).status === 200, 'produk baru langsung bisa dipesan')
  ok((await ord(R1.id, [{ product: 'Mozza Hilang', qty: 2, price: 1 }])).status === 422, 'produk di luar katalog ditolak')

  // ================= 9. PENGATURAN =================
  sec('Pengaturan')
  const s0 = (await api('/api/settings', { token: T })).data
  ok((await api('/api/settings', { method: 'PUT', token: T, body: { ...s0, pasifDays: 90, churnDays: 60 } })).status === 422, 'pasif ≥ churn ditolak')
  ok((await api('/api/settings', { method: 'PUT', token: T, body: { ...s0, emailDomains: [] } })).status === 422, 'domain email kosong ditolak')
  await nav(a, 'Pengaturan')
  const compName = a.locator('label:has-text("Nama perusahaan") + input')
  await compName.fill('PT Citarasa Kuliner Indonesia'); await a.click('button:has-text("Simpan") >> nth=0'); await a.waitForTimeout(800)
  ok((await api('/api/settings', { token: T })).data.company.name === 'PT Citarasa Kuliner Indonesia', 'data perusahaan (kop invoice) tersimpan')
  ok((await api('/api/settings', { method: 'PUT', token: T, body: { ...s0, pasifDays: 20, churnDays: 30 } })).status === 200, 'ubah aturan pasif 20 / churn 30')
  ok((await get(R2.id)).status === 'Churn', 'status reseller langsung dihitung ulang (40 hari → Churn)')
  await api('/api/settings', { method: 'PUT', token: T, body: s0 })

  // ================= 10. DASHBOARD KONSISTEN =================
  sec('Dashboard konsisten dengan data')
  await api('/api/admin/seed', { method: 'POST', token: T })
  const all = (await api('/api/resellers', { token: T })).data
  const dash = (await api('/api/dashboard', { token: T })).data
  const ordsAll = (await api('/api/orders', { token: T })).data
  ok(dash.kpi.total === all.length, `total reseller dashboard = ${all.length}`)
  ok(dash.kpi.revenue === all.reduce((s, r) => s + r.totalRevenue, 0), 'revenue dashboard = jumlah revenue semua reseller')
  ok(dash.kpi.revenue === ordsAll.orders.reduce((s, o) => s + o.amount, 0), 'revenue dashboard = jumlah semua pesanan')
  ok(Object.values(dash.kpi.byStatus).reduce((s, n) => s + n, 0) === all.length, 'Lead+Aktif+Pasif+Churn = total reseller')
  ok(dash.stages.reduce((s, x) => s + x.count, 0) === all.length, 'jumlah per tahap = total reseller')
  ok(dash.funnel[0].count === all.length && dash.funnel.every((f, i) => i === 0 || f.count <= dash.funnel[i - 1].count), 'funnel menurun dan diawali total')
  ok(dash.monthly.reduce((s, m) => s + m.revenue, 0) <= dash.kpi.revenue, 'revenue 12 bulan ≤ total revenue')
  ok(dash.kpi.repeat <= dash.kpi.buyers && dash.kpi.buyers <= dash.kpi.total, 'repeat ≤ pembeli ≤ total')
  const ocount = Object.values(dash.orderCounts).reduce((s, n) => s + n, 0)
  ok(ocount === ordsAll.orders.length, 'jumlah status pesanan = jumlah pesanan')
  await nav(a, 'Dashboard'); await a.waitForTimeout(600)
  ok((await a.locator('.kpi-v').first().textContent()) === String(all.length), 'kartu Total Reseller di layar sesuai')
  await a.locator('select').first().selectOption('30'); await a.waitForTimeout(700)
  const d30 = (await api('/api/dashboard?period=30', { token: T })).data
  ok((await a.locator('.kpi-v').nth(3).textContent()) === rp(d30.kpi.revenue), 'filter 30 hari: kartu revenue = data API periode 30 hari (' + rp(d30.kpi.revenue) + ')')

  // ================= 11. EXPORT, MOBILE, KEAMANAN =================
  sec('Export, mobile, keamanan')
  await nav(a, 'Data Reseller')
  const [dl] = await Promise.all([a.waitForEvent('download', { timeout: 5000 }).catch(() => null), a.click('button:has-text("Export CSV")')])
  ok(dl && dl.suggestedFilename() === 'reseller.csv', 'Export CSV mengunduh reseller.csv')
  const m = await newPage(b, { width: 390, height: 844 }); await login(m, 'andi@citarasakuliner.com', 'andi12345')
  const ow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  ok(ow <= 2, 'tampilan HP (390px): tidak ada scroll horizontal di dashboard', 'kelebihan ' + ow + 'px')
  await m.click('nav a:has-text("Data Reseller")'); await m.waitForTimeout(400)
  await m.locator('button:has-text("Detail")').first().click(); await m.waitForTimeout(400)
  ok(await drawer(m).isVisible(), 'detail reseller terbuka di HP')
  ok((await fetch(U + '/..%2fapp%2fconfig.py').then(r => r.text())).includes('JWT_SECRET') === false, 'path traversal tertutup')
  ok((await fetch(U + '/api/tidak-ada')).status === 404, 'endpoint API tak dikenal → 404')
  ok((await api('/api/resellers', { method: 'POST', token: T, body: { name: 'a'.repeat(500) } })).status === 422, 'nama terlalu panjang ditolak')
  const xss = (await api('/api/resellers', { method: 'POST', token: T, body: { name: '<img src=x onerror=alert(1)>', phone: '0' } })).data
  await nav(a, 'Data Reseller'); await a.waitForTimeout(500)
  ok((await a.locator('img[src=x]').count()) === 0, 'nama berisi HTML tidak dieksekusi (aman XSS)')
  await api('/api/resellers/' + xss.id, { method: 'DELETE', token: T })

  // ================= RINGKASAN =================
  await b.close()
  const fail = results.filter(r => !r.pass)
  console.log(`\n==== HASIL: ${results.length - fail.length}/${results.length} lolos, ${fail.length} gagal, ${errors.length} error JS ====`)
  fail.forEach(f => console.log(`GAGAL [${f.section}] ${f.msg} ${f.detail}`))
  errors.forEach(e => console.log('ERROR ' + e))
  process.exit(fail.length || errors.length ? 1 : 0)
})().catch(e => { console.log('CRASH di bagian "' + section + '": ' + e.message); process.exit(2) })
