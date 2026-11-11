// E2E test pesanan per produk. Jalankan: python scripts/dev_inmemory.py (server bersih), lalu: node e2e/orders.e2e.cjs
// Butuh: npm i -g playwright && npx playwright install chromium
const {chromium}=require('playwright');
const assert=(c,m)=>{if(!c){throw new Error('GAGAL: '+m)} console.log('✓ '+m)};
(async()=>{
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1400,height:950}});const errs=[];
p.on('pageerror',e=>errs.push('PAGE: '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE: '+m.text())});
const U='http://localhost:8000';
await p.goto(U);await p.fill('input[type=email]','admin@crk.local');await p.fill('input[type=password]','admin123');await p.click('button:has-text("Masuk")');
await p.waitForSelector('text=Reseller Dashboard');
await p.click('a:has-text("Pengaturan")');await p.click('button:has-text("Isi Data Contoh")');await p.waitForTimeout(1500);
// --- Pesanan Baru dari menu Pesanan
await p.click('nav a:has-text("Pesanan")');await p.waitForSelector('text=Pesanan Reseller');
await p.click('button:has-text("+ Pesanan Baru")');await p.waitForSelector('text=Pesanan Baru');
const dr=p.locator('div.fixed.top-0.right-0:not(.translate-x-full)');
const opts=await dr.locator('select[aria-label="Nama produk"] option').allTextContents();
assert(JSON.stringify(opts)===JSON.stringify(["Mozza Balado","Mozza Ayam Bawang","Mozza Asin Pedas","Mozza BBQ","Mozza Jagung Bakar"]),'dropdown produk berisi 5 varian Mozza: '+opts.join(', '));
// simpan tanpa reseller -> error
await dr.locator('button:has-text("Simpan Pesanan")').click();
assert((await dr.locator('.note').textContent()).includes('Pilih reseller'),'validasi: reseller wajib dipilih');
await dr.locator('input[placeholder^="Cari nama"]').fill('Bekasi');
await dr.locator('select[aria-label="Reseller"]').selectOption({label:'Reseller Bekasi Asep · Jabodetabek'});
// baris 1: Balado qty 20
const qty=dr.locator('input[aria-label="Jumlah pack"]');const price=dr.locator('input[aria-label="Harga per pack"]');
assert(await price.nth(0).inputValue()==='23800','harga terisi otomatis Rp23.800 dari katalog');
await qty.nth(0).fill('20');
assert((await dr.locator('[data-testid=subtotal]').nth(0).textContent())==='Rp476.000','subtotal baris 1 = 20 × 23.800 = Rp476.000');
// tambah baris 2 -> default produk yang belum dipakai
await dr.locator('button:has-text("+ Tambah produk")').click();
assert(await dr.locator('select[aria-label="Nama produk"]').nth(1).inputValue()==='Mozza Ayam Bawang','baris baru otomatis memilih produk yang belum dipakai');
await dr.locator('select[aria-label="Nama produk"]').nth(1).selectOption('Mozza BBQ');
await qty.nth(1).fill('10');await price.nth(1).fill('22000');
assert((await dr.locator('[data-testid=subtotal]').nth(1).textContent())==='Rp220.000','subtotal baris 2 dengan harga khusus = 10 × 22.000 = Rp220.000');
assert((await dr.locator('[data-testid=total-qty]').textContent())==='30 pack','total pesanan = 30 pack');
assert((await dr.locator('[data-testid=total-amount]').textContent())==='Rp696.000','total dibayar = Rp696.000');
// baris 3 qty 0 -> ditolak
await dr.locator('button:has-text("+ Tambah produk")').click();await qty.nth(2).fill('0');
await dr.locator('button:has-text("Simpan Pesanan")').click();
assert((await dr.locator('.note').last().textContent()).includes('bilangan bulat'),'validasi: jumlah pack 0 ditolak');
await qty.nth(2).fill('2.5');await dr.locator('button:has-text("Simpan Pesanan")').click();
assert((await dr.locator('.note').last().textContent()).includes('bilangan bulat'),'validasi: jumlah pack desimal ditolak');
await dr.locator('button[aria-label="Hapus baris"]').nth(2).click();
assert((await dr.locator('[data-testid=total-amount]').textContent())==='Rp696.000','hapus baris memperbarui total kembali Rp696.000');
assert(await dr.locator('input[type=date]').nth(1).isDisabled(),'tanggal diterima terkunci saat status bukan Completed');
await dr.locator('button:has-text("Simpan Pesanan")').click();await p.waitForTimeout(1200);await dr.locator('button:has-text("Selesai")').click();await p.waitForTimeout(400);
await p.screenshot({path:'/tmp/e6-orders.png'});
const row=p.locator('tr',{hasText:'Reseller Bekasi Asep'}).filter({hasText:'Rp696.000'});
assert(await row.count()===1,'pesanan tampil di tabel dengan total Rp696.000');
const rowText=await row.textContent();
assert(rowText.includes('Mozza Balado ×20') && rowText.includes('Mozza BBQ ×10') && rowText.includes('30'),'kolom produk & pack benar: '+rowText.replace(/\s+/g,' ').slice(0,120));
assert((await p.locator('text=Penjualan per Produk').count())===1,'ringkasan penjualan per produk tampil');
// invoice
await row.locator('a:has-text("Invoice")').click();await p.waitForSelector('text=INVOICE');
const inv=await p.locator('table.w-full').textContent();
assert(inv.includes('Mozza Balado') && inv.includes('Rp476.000') && inv.includes('Mozza BBQ') && inv.includes('Rp220.000') && inv.includes('30 pack') && inv.includes('Rp696.000') && !inv.includes('Diskon'),'invoice berisi 2 baris produk, total 30 pack, Rp696.000, tanpa baris penyesuaian');
await p.screenshot({path:'/tmp/e6-invoice.png'});
await p.click('a:has-text("Kembali")');await p.waitForSelector('text=Pesanan Reseller');
// --- dari detail reseller (order pertama, cek peringatan minimal order)
await p.click('nav a:has-text("Data Reseller")');
await p.locator('tr',{hasText:'Toko Frozen Bu Rina'}).locator('button:has-text("Detail")').click();await p.waitForSelector('h2:has-text("Toko Frozen Bu Rina")');
await p.click('button:has-text("+ Order")');
const dr2=p.locator('div.fixed.top-0.right-0:not(.translate-x-full)');
await dr2.locator('input[aria-label="Jumlah pack"]').fill('4');
assert((await dr2.locator('.note').last().textContent()).includes('di bawah minimal order (10 pack)'),'peringatan minimal order pertama 10 pack muncul');
await dr2.locator('input[aria-label="Jumlah pack"]').fill('12');
await dr2.locator('button:has-text("Simpan Pesanan")').click();await p.waitForTimeout(1200);await dr2.locator('button:has-text("Selesai")').click();await p.waitForTimeout(800);
const hist=await dr2.textContent();
assert(hist.includes('12 pack') && hist.includes('Rp285.600') && hist.includes('Mozza Balado ×12'),'riwayat reseller: 12 pack × 23.800 = Rp285.600');
assert(hist.includes('Pembelian Minimal Order'),'order pertama memindahkan tahap ke Pembelian Minimal Order');
await p.screenshot({path:'/tmp/e6-detail.png'});
// --- CMS katalog
await p.click('button[aria-label=Tutup]');await p.click('nav a:has-text("CMS")');await p.waitForSelector('text=Katalog Produk');
assert((await p.locator('input[value="Mozza Jagung Bakar"]').count())===1,'katalog produk tampil di CMS');
console.log('errors:',errs.length?errs:'tidak ada');await b.close()})().catch(e=>{console.log(e.message);process.exit(1)});
