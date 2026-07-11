# Monitoring Fasilitator Revitalisasi Sekolah

Dashboard Next.js untuk memantau kinerja fasilitator lapangan pada program revitalisasi
sekolah (14 hari siklus pendampingan), dengan data ditarik dari Google Sheet publik dan
analisis kualitatif dibantu LLM (Llama, lewat Hugging Face Inference API).

## Cara jalan

```bash
npm install
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000). Tanpa konfigurasi apa pun, dashboard
akan langsung memakai data contoh di `fixtures/sample-sheet.csv` (dua fasilitator, 14 hari,
diambil dari data yang diberikan saat perancangan).

## Konfigurasi (`.env.local`)

Salin `.env.local.example` menjadi `.env.local` lalu isi:

- `SHEET_CSV_URL` — URL export-CSV dari tab **"Level Fasil"** di Google Sheet asli (sheet
  harus share "Anyone with the link" bisa view). Buka tab "Level Fasil"-nya dulu supaya
  aktif, ambil `gid` dari address bar (`#gid=...`), lalu susun:
  `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/export?format=csv&gid=<SHEET_GID>`.
  Kosongkan untuk tetap memakai data contoh.
- `HF_TOKEN` — token API Hugging Face (buat di huggingface.co/settings/tokens). Wajib diisi
  supaya tombol "Buat Analisis AI" / "Buat Ringkasan AI" berfungsi.
- `HF_MODEL` — model Llama yang dipanggil (default `meta-llama/Llama-3.3-70B-Instruct`).

## Struktur

- `lib/sheet.ts` — fetch & parse CSV (publik atau fixture).
- `lib/columns.ts` — mapping header spreadsheet ↔ field terstruktur, parser nilai (persen,
  `#DIV/0!`, "Sudah/Belum", teks bebas).
- `lib/knowledge/checkpoints.ts` — basis pengetahuan checkpoint: definisi tiap kolom, bobot
  risiko, dan hari mulai berlaku. Dipakai untuk tooltip di UI dan konteks prompt LLM.
- `lib/metrics.ts` — agregasi (ringkasan harian, level risiko, deteksi data stagnan).
- `lib/prompts.ts` + `lib/llm.ts` — membangun prompt & memanggil model lewat HF router.
- `app/page.tsx` — dashboard harian (semua fasilitator).
- `app/fasilitator/[kode]/page.tsx` — detail 1 fasilitator (tren 14 hari + analisis AI).

Data & analisis AI diambil **on-demand** (tanpa database) — analisis AI baru dipanggil saat
tombol diklik, hasilnya hanya tersimpan di state browser selama sesi berjalan.
