"""Nilai awal untuk Settings dan CMS (mengikuti flowchart alur reseller CRK)."""

STAGES = [
    {"id": "lead", "label": "Calon Reseller (Leads)", "owner": "CS / Admin"},
    {"id": "form", "label": "Form Pendaftaran", "owner": "Data CRM"},
    {"id": "order1", "label": "Pembelian Minimal Order", "owner": "CS / Admin / Packing"},
    {"id": "repeat", "label": "Repeat Order", "owner": "CRM"},
    {"id": "education", "label": "Product Education", "owner": "CRM & Channel Dev"},
    {"id": "program", "label": "Benefit Program & Ketentuan", "owner": "CRM & Channel Dev"},
    {"id": "tier", "label": "Tier List", "owner": "CRM & Channel Dev"},
    {"id": "support", "label": "Support Mitra Reseller", "owner": "CRM & Channel Dev"},
    {"id": "retention", "label": "Retention / Achieve", "owner": "Monitoring"},
    {"id": "reaktivasi", "label": "Follow-Up / Reaktivasi", "owner": "CRM", "side": True},
]
STAGE_IDS = [s["id"] for s in STAGES]
MAIN_STAGE_IDS = [s["id"] for s in STAGES if not s.get("side")]

DEFAULT_SETTINGS = {
    "pic": ["CS 1", "CS 2", "Admin", "CRM"],
    "channel": ["WhatsApp", "Instagram", "TikTok", "Shopee", "Tokopedia", "Walk-in", "Referral"],
    "area": ["Bandung", "Jabodetabek", "Cimahi", "Lainnya"],
    "pasifDays": 30,
    "churnDays": 90,
    "followUpDays": 14,
    # Domain email yang boleh mendaftar. Entri tanpa titik ("citarasakuliner") cocok dengan semua akhiran:
    # citarasakuliner.com, citarasakuliner.co.id, dst.
    "emailDomains": ["citarasakuliner"],
    "company": {
        "name": "PT Citarasa Kuliner Indonesia (Cimol Bojot AA)",
        "address": "Bandung, Jawa Barat",
        "phone": "",
        "email": "",
        "bank": "",
        "invoiceNote": "Terima kasih telah menjadi mitra reseller Cimol Bojot AA.",
    },
}

ORDER_STATUSES = [
    {"id": "to_ship", "label": "To Ship"},
    {"id": "shipping", "label": "Shipping"},
    {"id": "completed", "label": "Completed"},
]
ORDER_STATUS_IDS = [s["id"] for s in ORDER_STATUSES]

DEFAULT_CMS = {
    "tiers": [
        {"name": "Bronze", "minPacks": 10, "benefit": "Harga reseller dasar"},
        {"name": "Silver", "minPacks": 30, "benefit": "Diskon tambahan 3% + POSM"},
        {"name": "Gold", "minPacks": 60, "benefit": "Diskon 5% + free ongkir area Bandung"},
        {"name": "Platinum", "minPacks": 120, "benefit": "Diskon 8% + support promo & konten"},
    ],
    "education": [
        {"title": "Katalog Produk Frozen", "link": "", "description": "Varian, ukuran, HPP & harga reseller"},
        {"title": "Video Cara Simpan & Goreng", "link": "", "description": "Standar penyajian agar kualitas terjaga"},
    ],
    "templates": [
        {"name": "Follow-up order pertama", "body": "Halo Kak {nama}, ini Aa dari Cimol Bojot AA. Gimana respons customer untuk stok pertamanya? Kalau mau restock, Aa bantu proses hari ini ya."},
        {"name": "Reaktivasi", "body": "Halo Kak {nama}, udah lama nih nggak restock Cimol Bojot AA. Ada promo khusus reseller bulan ini, mau Aa kirim detailnya?"},
        {"name": "Respons complaint", "body": "Halo Kak {nama}, terima kasih feedback-nya. Kami cek dan tindak lanjuti maksimal 1x24 jam ya. Mohon kirim foto/detail kendalanya."},
    ],
    "benefit": "• Harga khusus reseller di bawah harga retail\n• Naik tier otomatis sesuai volume order bulanan\n• Dukungan materi promo & konten media sosial\n• Prioritas stok saat high season",
    "terms": "1. Minimal order pertama sesuai ketentuan.\n2. Harga jual ke customer mengikuti rekomendasi harga.\n3. Tier dievaluasi setiap bulan berdasarkan total order.\n4. Reseller wajib menjaga standar penyimpanan produk frozen.",
    "support": "• POSM (banner, stiker, price tag)\n• Materi konten IG/TikTok siap pakai\n• Training penyajian produk\n• Grup WA mitra reseller",
    "minFirstOrder": 10,
    "minRepeatOrder": 5,
    "pricePerPack": 23800,
    # Katalog produk untuk input pesanan. Harga awal = harga reseller Rp23.800/pack
    # (dokumen CRK Agen & Reseller Insight 2026); ubah di menu CMS Program.
    "products": [
        {"name": "Mozza Balado", "price": 23800},
        {"name": "Mozza Ayam Bawang", "price": 23800},
        {"name": "Mozza Asin Pedas", "price": 23800},
        {"name": "Mozza BBQ", "price": 23800},
        {"name": "Mozza Jagung Bakar", "price": 23800},
    ],
}
