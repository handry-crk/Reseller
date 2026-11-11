# CRK Reseller Hub

Dashboard + CRM + CMS untuk alur reseller **Cimol Bojot AA** (PT Citarasa Kuliner Indonesia).
Mengikuti flowchart: Leads → Form → Pembelian Minimal Order → Repeat Order → Product Education → Benefit Program → Tier List → Support Mitra → Retention, dengan jalur samping Follow-Up/Reaktivasi dan log Complaint.

**Stack:** React 18 + Vite + Tailwind (frontend) · FastAPI + MongoDB (backend) · JWT auth dengan role Admin / CRM / CS / Gudang / Viewer.

```
reseller/
├── backend/            FastAPI (app/), tes (tests/)
│   └── app/
│       ├── rules.py    aturan status, tier, otomatisasi tahap  ← ubah logika bisnis di sini
│       ├── defaults.py tahap alur, nilai awal Settings & CMS
│       ├── routes.py   semua endpoint /api
│       ├── schemas.py  validasi input
│       └── main.py     app, CORS, serve frontend (static/)
├── frontend/           React (src/pages = 6 halaman, src/components, src/lib)
├── scripts/dev_inmemory.py   jalankan tanpa MongoDB (uji coba)
├── Dockerfile          build frontend + backend jadi 1 layanan
├── railway.json / render.yaml / frontend/vercel.json
└── .env.example
```

## Fitur
- **Dashboard**: KPI (total/aktif/pasif/churn, repeat order rate, revenue, AOV, complaint open), kotak alur per tahap, funnel, distribusi tier, performa PIC, "Perlu Tindakan", top 10 reseller; filter periode.
- **Pesanan**: kolom **Diskon** dan **Ongkir** (revenue = subtotal produk − diskon; total dibayar = revenue + ongkir), langkah **upload bukti transfer** setelah pesanan disimpan (foto dikecilkan otomatis / PDF, maks 2 MB, disimpan di MongoDB koleksi `proofs`), kolom Bukti TF di tabel. Tombol **+ Pesanan Baru** (pilih reseller, lalu baris produk: nama produk dari katalog, jumlah pack, harga/pack; subtotal & total pack/total bayar dihitung otomatis dan dihitung ulang di server). Monitoring pesanan masuk (Admin/Gudang): nomor invoice otomatis `INV-YYYYMM-NNNN`, status To Ship → Shipping → Completed, tanggal pesan & diterima, invoice resmi siap cetak/PDF (`/invoice/:id`), revenue per bulan.
- **Pipeline**: kanban per tahap, drag-and-drop untuk memindahkan tahap.
- **Data Reseller**: cari/filter, form, export CSV, drawer detail (KPI, aksi alur, panduan tahap dari CMS, riwayat aktivitas).
- **Follow-Up & Complaint**: daftar reaktivasi, complaint open → resolved, template WA dengan tombol Copy dan "Buka WA".
- **CMS Program**: tier list, product education, template pesan, benefit, ketentuan, support, minimal order & harga.
- **Daftar member** (`/daftar`): karyawan mendaftar sendiri dengan email perusahaan (domain diatur di Pengaturan, bawaan `citarasakuliner` = semua akhiran .com/.co.id/.id). Akun berstatus *pending* sampai Admin menyetujui dan memilih role.
- **Pengaturan**: daftar PIC/channel/area (bisa diedit CS, CRM, Admin), aturan hari pasif/churn/follow-up, domain email member, persetujuan pendaftar, manajemen pengguna, seed/wipe data.

### Aturan otomatis (backend/app/rules.py)
| Kejadian | Hasil |
|---|---|
| Order pertama | tahap → Pembelian Minimal Order, jadwal follow-up = hari ini + `followUpDays` |
| Order ke-2 (tahap ≤ 3 atau Reaktivasi) | tahap → Repeat Order, jadwal follow-up dikosongkan |
| Follow-up dicatat, belum repeat | tahap → Follow-Up / Reaktivasi |
| Edukasi dicatat di tahap Repeat Order | tahap → Product Education |
| Hari sejak order terakhir ≥ `pasifDays` / `churnDays` | status Pasif / Churn |
| Pack 30 hari terakhir vs tabel tier | tier otomatis (bisa di-override per reseller) |

## Menjalankan lokal
```bash
# Backend (tanpa MongoDB, data in-memory)
pip install -r backend/requirements-dev.txt
python scripts/dev_inmemory.py            # http://localhost:8000

# Frontend (hot reload, proxy /api ke :8000)
cd frontend && npm install && npm run dev  # http://localhost:5173
```
Login awal: `admin@crk.local` / `admin123` (ubah lewat env `ADMIN_EMAIL`/`ADMIN_PASSWORD` sebelum deploy, lalu ganti sandi di Pengaturan).

Dengan MongoDB sungguhan: salin `.env.example` → `.env`, isi `MONGO_URL`, lalu `cd backend && uvicorn app.main:app --reload`.

Tes backend: `cd backend && pytest`. Tes E2E: jalankan server in-memory (data bersih), lalu `node e2e/full.e2e.cjs` (seluruh fitur, ±134 pemeriksaan), `node e2e/orders.e2e.cjs` (form pesanan), `node e2e/mobile.e2e.cjs` (form pesanan di HP 390 px & 360 px).

## Deploy (paling sederhana: satu layanan)
1. **MongoDB Atlas** (gratis): buat cluster M0, buat database user, Network Access → `0.0.0.0/0`, salin connection string → `MONGO_URL`.
2. **Railway** (atau Render): New Project → Deploy from GitHub repo `handry-crk/reseller`. Railway membaca `Dockerfile` otomatis. Isi Variables: `MONGO_URL`, `JWT_SECRET` (string acak), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `TZ=Asia/Jakarta`. Generate domain → aplikasi (frontend + API) tersedia di URL itu.
3. Login sebagai admin → Pengaturan → tambah pengguna CS/CRM → (opsional) "Isi Data Contoh" untuk uji coba, "Hapus Semua Reseller" sebelum data riil.

### Alternatif: frontend di Vercel, backend di Railway
- Railway: sama seperti di atas; set `FRONTEND_URL=https://<domain-vercel>`.
- Vercel: Import repo, **Root Directory = `frontend`**, framework Vite, env `VITE_API_URL=https://<domain-railway>`.

## Mengubah aplikasi tanpa platform berbayar
Kode ini milik Anda. Buka repo di Claude Code (atau editor apa pun) dan minta perubahan, misalnya:
- "ubah aturan Pasif jadi 45 hari" → cukup ubah di Pengaturan (tanpa kode).
- "tambah kolom varian produk di order" → `backend/app/schemas.py` (ActivityIn), `routes.py` (create_activity), `frontend/src/components/ResellerDrawer.jsx` (QuickAct).
- "tambah tahap baru di alur" → `backend/app/defaults.py` (STAGES), lalu aturan di `rules.py` bila perlu.
Setiap push ke `main` akan otomatis di-deploy ulang oleh Railway/Vercel.

## API ringkas
`POST /api/auth/login` · `POST /api/auth/register` · `GET /api/auth/register-info` · `POST /api/users/{id}/approve` · `POST|GET|DELETE /api/activities/{id}/proof` · `PUT /api/settings/lists` · `GET /api/meta` · `GET|POST /api/resellers` · `GET|PUT|DELETE /api/resellers/{id}` · `POST /api/resellers/{id}/stage` · `GET|POST /api/activities` · `GET|PUT /api/activities/{id}` (detail invoice / ubah status pesanan) · `GET /api/orders?month=YYYY-MM&status=` · `POST /api/activities/{id}/resolve` · `DELETE /api/activities/{id}` · `GET|PUT /api/cms` · `GET|PUT /api/settings` · `GET /api/dashboard?period=30|90|365|all` · `GET|POST|PUT|DELETE /api/users` · `POST /api/admin/seed` · `POST /api/admin/wipe`
