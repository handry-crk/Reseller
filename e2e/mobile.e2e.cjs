// E2E form pesanan di HP. Server bersih: python scripts/dev_inmemory.py, lalu node e2e/mobile.e2e.cjs
const { chromium, devices } = require('playwright')
const U = process.argv[2] || 'http://localhost:8000'
const res = []; const ok = (c, m) => { res.push(!!c); console.log((c ? '✓ ' : '✗ ') + m) }
;(async () => {
  const b = await chromium.launch(); const errs = []
  for (const [label, vp] of [['HP 390×844', { width: 390, height: 844 }], ['HP kecil 360×640', { width: 360, height: 640 }]]) {
    console.log('\n== ' + label)
    const ctx = await b.newContext({ viewport: vp, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message))
    await p.goto(U); await p.fill('input[type=email]', 'admin@crk.local'); await p.fill('input[type=password]', 'admin123'); await p.click('button:has-text("Masuk")')
    await p.waitForSelector('text=Reseller Dashboard')
    if (label.startsWith('HP 390')) { await p.click('nav a:has-text("Pengaturan")'); await p.click('button:has-text("Isi Data Contoh")'); await p.waitForTimeout(1200) }
    await p.click('nav a:has-text("Pesanan")'); await p.click('button:has-text("+ Pesanan Baru")'); await p.waitForTimeout(400)
    const d = p.locator('div.fixed.top-0.right-0:not(.translate-x-full)')
    const inView = async (loc) => { const bb = await loc.boundingBox(); return bb && bb.y >= 0 && bb.y + bb.height <= vp.height + 1 && bb.x >= 0 && bb.x + bb.width <= vp.width + 1 }
    ok(await inView(d.locator('[data-testid=save-bar] button:has-text("Simpan Pesanan")')), 'tombol Simpan Pesanan langsung terlihat tanpa scroll')
    await d.locator('select[aria-label="Reseller"]').selectOption({ index: 1 })
    await d.locator('input[aria-label="Jumlah pack"]:visible').first().fill('20')
    await d.locator('button:has-text("+ Tambah produk")').click()
    await d.locator('input[aria-label="Jumlah pack"]:visible').nth(1).fill('5')
    await d.locator('input[aria-label="Diskon"]').fill('23000'); await d.locator('input[aria-label="Ongkir"]').fill('50000')
    const over = await d.evaluate(el => el.scrollWidth - el.clientWidth)
    ok(over <= 1, 'tidak ada geser ke samping di form (kelebihan ' + over + 'px)')
    for (let i = 0; i < 2; i++) ok(await inView(d.locator('[data-testid=subtotal]').nth(i)), `subtotal baris ${i + 1} terlihat utuh di layar`)
    ok(await inView(d.locator('button[aria-label="Hapus baris"]:visible').first()), 'tombol hapus baris terlihat')
    await d.locator('textarea').last().scrollIntoViewIfNeeded(); await d.locator('textarea').last().fill('Pick up')
    ok(await inView(d.locator('[data-testid=save-bar] button:has-text("Simpan Pesanan")')), 'saat mengisi Catatan (paling bawah), tombol Simpan tetap terlihat')
    await d.locator('select[aria-label="Reseller"]').scrollIntoViewIfNeeded()
    ok(await inView(d.locator('[data-testid=save-bar]')), 'saat scroll ke atas, bilah total & Simpan tetap terlihat')
    const fit = await d.evaluate(el => ({ bottom: Math.round(el.getBoundingClientRect().bottom), vh: window.innerHeight }))
    ok(fit.bottom <= fit.vh, `panel form tidak melebihi tinggi layar (bawah ${fit.bottom}px, layar ${fit.vh}px)`)
    // Simulasi keyboard Android terbuka (layar tersisa ±55%): tombol Simpan harus tetap terlihat di atas keyboard
    await d.locator('textarea').last().focus()
    await p.setViewportSize({ width: vp.width, height: Math.round(vp.height * 0.55) })
    await p.waitForTimeout(300)
    const kb = await d.locator('[data-testid=save-bar] button:has-text("Simpan Pesanan")').boundingBox()
    ok(kb && kb.y + kb.height <= Math.round(vp.height * 0.55) + 1, 'saat keyboard terbuka, tombol Simpan tetap terlihat di atas keyboard')
    await p.setViewportSize(vp); await p.waitForTimeout(200)
    const barTotal = await d.locator('[data-testid=save-bar]').textContent()
    ok(barTotal.includes('25 pack') && barTotal.includes('Rp622.000'), 'bilah bawah menampilkan 25 pack · Rp622.000 (595.000 − 23.000 + 50.000)')
    await d.locator('[data-testid=save-bar] button:has-text("Simpan Pesanan")').click()
    await p.waitForSelector('[data-testid=order-saved]', { timeout: 8000 })
    ok(await inView(d.locator('button:has-text("Upload bukti transfer")')), 'setelah simpan, tombol Upload bukti transfer terlihat')
    await d.locator('button:has-text("Selesai")').click(); await p.waitForTimeout(500)
    ok((await p.locator('td', { hasText: 'Pick up' }).count()) >= 1, 'pesanan muncul di tabel Pesanan')
    await p.screenshot({ path: `/tmp/mobile-${vp.width}.png` })
    await ctx.close()
  }
  await b.close()
  const f = res.filter(x => !x).length
  console.log(`\n==== HASIL: ${res.length - f}/${res.length} lolos, ${errs.length} error JS ====`); errs.forEach(e => console.log('ERROR ' + e))
  process.exit(f || errs.length ? 1 : 0)
})().catch(e => { console.log('CRASH: ' + e.message); process.exit(2) })
