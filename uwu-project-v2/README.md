# Monitoring Fasilitator Revitalisasi Sekolah (v2)

Dashboard Next.js untuk memantau kinerja fasilitator lapangan pada program revitalisasi
sekolah - versi 2, dengan sumber data yang berbeda dari [v1](../uwu-project-v1): bukan satu
tab "Level Fasil" gabungan, melainkan **30 spreadsheet LK Fasil pribadi** (satu per
fasilitator), ditemukan lewat satu spreadsheet **"controller"**.

Analisis kualitatif tetap dibantu LLM lewat kode yang **sama persis** dengan v1 (lihat
[Monorepo & LLM yang sama persis](#monorepo--llm-yang-sama-persis) di bawah) - fallback
otomatis lintas provider Hugging Face → Google Gemini → Groq → OpenRouter → OpenAI.

## 🔐 Login Google (baru, per 2026-07-18)

Seluruh app sekarang di balik gerbang login (`middleware.ts`) - langkah awal
menuju arsitektur baru (satu spreadsheet "master" + tab `masterLog`,
menggantikan controller di atas, dan tulis lewat token OAuth admin alih-alih
webhook Apps Script terpisah). Alur:

1. Belum login → redirect ke `/login` ("Masuk dengan Google").
2. Login ditolak kalau email TIDAK ada di `ADMIN_EMAILS` (whitelist, pisah
   koma di `.env.local`) - fail-closed, kosong berarti semua ditolak.
3. Sudah login tapi belum pernah pilih admin → redirect ke `/pilih-admin`
   (daftar nama Atmin unik dari `lib/admins.ts`, sumbernya `getFacilRows()`
   yang sama dipakai dashboard - otomatis ikut pindah ke `masterLog` nanti
   begitu sumber datanya dialihkan). Pilihan disimpan di cookie
   `selected_admin`, dipakai belakangan untuk memfilter log per admin.
4. Header nampilin email yang login, admin yang dipilih (bisa diklik untuk
   ganti), dan tombol "Keluar".

Setup: lihat blok "Login Google" di `.env.local.example` untuk cara bikin
OAuth Client ID (Google Cloud Console) + generate `AUTH_SECRET`.

## ⚠️ Status implementasi (per 2026-07-16)

**Sudah jalan dengan data asli**, diverifikasi live terhadap 30 spreadsheet LK sungguhan:

- `lib/controller.ts` - fetch tab "Fasilitator" di spreadsheet controller (30 baris: Atmin,
  Kode Fasil, Nama Fasil, Tautan), di-cache 5 menit.
- `lib/sheet.ts::getTodayHari`/`getCheckpointSchedule` - fetch tab "Check Point" di
  spreadsheet controller (lewat nama tab).
- `lib/sheet.ts::getFacilRows` - fetch tab **"Isian"** (label "Matriks" di salah satu selnya)
  di SETIAP spreadsheet LK fasilitator (30 fetch paralel, dicari lewat nama tab dulu,
  fallback ke `MATRIKS_GID`), parse via `lib/skorAkhirColumns.ts`. 20-21 dari 30 berhasil per
  percobaan saat testing - daftar yang gagal berubah-ubah antar percobaan, indikasi
  rate-limiting sementara dari Google (efek testing berulang), bukan sheet yang permanen
  belum di-share. **Keterbatasan yang perlu diketahui**: tab ini cuma punya SATU baris
  (kondisi Skor Akhir TERKINI), bukan histori 14 hari seperti "Level Fasil" v1 - lihat
  [Arsitektur data v2](#arsitektur-data-v2-terkonfirmasi) di bawah.
- Skema skor "Skor Akhir" (26 indikator/154 bobot, semua framing positif) sudah dituangkan
  ke `packages/core/knowledge/checkpoints.ts` + `lib/skorAkhirColumns.ts`. Kekhawatiran awal
  soal checkpoint ber-sumber Aplikasi Revit tidak punya data di v2 **sudah terjawab** -
  ternyata tetap ada di skema Skor Akhir ini.
- Warna severity per indikator (`packages/core/severity.ts`) - hijau **HANYA** untuk yang
  persis capai target (0% masalah/100% lengkap), sisanya kuning/oranye/merah (diubah dari
  v1 yang masih toleransi 0-10% dianggap hijau).
- `lib/writeSheet.ts` + `google-apps-script/save-analisis.gs` - push balik hasil analisis,
  lewat **SATU** Apps Script Web App **terpusat** (dideploy sekali oleh admin, BUKAN 30x oleh
  tiap fasilitator - admin sudah Editor di ke-30 spreadsheet LK, dikonfirmasi 2026-07-16).
  Kodenya sudah siap, tinggal di-deploy - lihat [Push balik analisis](#push-balik-analisis)
  di bawah.

**Belum diimplementasikan**:

1. **`lib/facilitatorLk.ts`** (panel "LK Fasilitator" - baris wawancara mentah per sekolah) -
   belum ketemu tab wawancara mentahnya di spreadsheet contoh (baru ketemu tab "Isian").
2. **`MATRIKS_GID` (default `447897018`)** - fallback kalau fetch by-name ("Isian") gagal,
   baru dikonfirmasi persis di SATU dari 30 spreadsheet LK.

`getFacilRows()` otomatis fallback ke data contoh (`fixtures/sample-sheet.csv`) kalau
`CONTROLLER_SHEET_URL` belum diisi ATAU semua 30 fetch gagal - tapi begitu MINIMAL SATU
fasilitator berhasil di-fetch, hasilnya dipakai apa adanya (bukan all-or-nothing ke sample).

## Cara jalan

Dari root monorepo (lihat [Monorepo](#monorepo--llm-yang-sama-persis) di bawah):

```bash
npm install
npm run dev:v2
```

Atau dari dalam folder ini langsung: `npm install` (di root) lalu `npm run dev`. Buka
[http://localhost:3000](http://localhost:3000) (pakai port lain kalau v1 sudah jalan
bersamaan di 3000, mis. `npm run dev -- -p 3001`).

## Konfigurasi (`.env.local`)

Salin `.env.local.example` menjadi `.env.local`. Lihat komentar di file itu untuk tiap
variabel - ringkasannya:

- `CONTROLLER_SHEET_URL` - **fungsional**. Sheet harus di-share "Anyone with the link"
  (viewer) - controller-nya sendiri SUDAH di-share; 30 spreadsheet LK individual di
  baliknya masing-masing HARUS di-share terpisah juga (sharing tidak menular dari
  controller ke sheet yang di-link-nya) supaya `getFacilRows()` bisa membacanya.
- Provider AI (`HF_TOKEN`/`GEMINI_API_KEY`/`GROQ_API_KEY`/`OPENROUTER_API_KEY`/`OPENAI_API_KEY`) -
  **sudah fungsional penuh**, identik dengan v1.
- `CYCLE_ANCHOR_HARI` / `CYCLE_ANCHOR_DATE` - fallback kalau tab "Check Point" gagal diambil.
- `MATRIKS_GID` - fallback gid tab "Isian" kalau fetch by-name gagal.
- `NOTIFY_WEBHOOK_URL` / `RESEND_*` - **sudah fungsional penuh**, identik dengan v1.
- `WRITE_SHEETS_WEBHOOK_URL` / `WRITE_SHEETS_WEBHOOK_SECRET` - **fungsional**, pola SAMA
  PERSIS dengan v1 (satu URL + satu secret) - lihat [Push balik analisis](#push-balik-analisis).

## Push balik analisis

Beda dari v1 (satu tab gabungan), di v2 hasil analisis ditulis ke **spreadsheet LK
masing-masing fasilitator** (tabel log harian "Hari Ke -"/"Tanggal"/"Analisis" di tab yang
sama dengan "Isian"). TAPI cukup **SATU deployment Apps Script** (bukan 30), karena admin
program sudah jadi Editor di ke-30 spreadsheet LK - satu script yang di-deploy "Execute as:
Me" bisa buka & tulis ke spreadsheet manapun lewat `SpreadsheetApp.openById()`.

Cara deploy (sekali saja):

1. Buka [script.new](https://script.new) - standalone, TIDAK perlu dibuka dari salah satu
   spreadsheet LK atau controller.
2. Hapus isi default, tempel seluruh isi `google-apps-script/save-analisis.gs`.
3. Ganti `SAVE_ANALISIS_SECRET` di dalamnya dengan secret bikinanmu sendiri.
4. Deploy > New deployment > Type: Web app, Execute as: **Me**, Who has access: **Anyone**.
5. Salin Web app URL yang muncul → `WRITE_SHEETS_WEBHOOK_URL`, secret tadi →
   `WRITE_SHEETS_WEBHOOK_SECRET`, isi keduanya di `.env.local`.

Kalau kode `.gs`-nya diubah lagi nanti, perlu "New deployment" lagi (atau edit versi lewat
"Manage deployments") supaya perubahan ke-apply ke URL yang sama - lihat komentar lengkap di
file `.gs` itu (termasuk cara debug lewat GET + `?secret=...&spreadsheetId=...`).

## Arsitektur data v2 (terkonfirmasi)

Beda dari v1, tiga hal berubah:

1. **Skema skor**: "Nilai Risiko" (v1, 14 checkpoint/100 bobot, semua kolom framing "%
   masalah" - makin tinggi makin buruk) diganti **"Skor Akhir"** (26 indikator/154 bobot,
   semua kolom framing positif - "% Sekolah Sudah Dihubungi", "% Sekolah Memiliki
   Perencana", dst - makin tinggi makin baik). Supaya output LLM tetap **SAMA PERSIS**
   dengan v1 tanpa menyentuh `packages/core/prompts.ts` sama sekali, kolom yang framing
   sheet-nya positif tapi field `FacilRow` tujuannya "% masalah" (warisan v1) DIBALIK
   (`100 - nilai`) saat parsing - lihat `lib/skorAkhirColumns.ts` (tabel lengkap 26 kolom +
   bobot + flag `invert`). Kolom "Skor Akhir" total (kolom ke-27, tanpa nama header di
   sheet) dibaca LANGSUNG (dibalik jadi `nilaiRisiko`), BUKAN dihitung ulang dari 26
   sub-indikator - sama seperti v1 baca kolom "Nilai Risiko" apa adanya.
   `packages/core/metrics.ts::computeEstimatedRisk` (tidak diubah) tetap jadi fallback yang
   otomatis jalan kalau sel "Skor Akhir" kosong.

2. **Baca**: setiap spreadsheet LK pribadi fasilitator punya tab **"Isian"** (label "Matriks"
   di salah satu selnya) berisi:
   - Beberapa baris label/dropdown ("Pilih Nama Fasilitator", "Hari ke", baris bobot).
   - Baris header diawali "Atmin" (kolom: Atmin, Hari Ke -, Kode Fasil, Nama Fasil, Kode
     Koor, Nama Koor, lalu 26 kolom Skor Akhir).
   - **TEPAT SATU baris data** - kondisi Skor Akhir TERKINI (per "Hari ke" yang lagi aktif),
     BUKAN satu baris per hari seperti "Level Fasil" v1.

   **Implikasi penting**: `getFacilRows()` v2 mengembalikan HANYA 1 baris per fasilitator
   (bukan 1 baris × 14 hari). Fitur yang butuh tren multi-hari (Tabel Tren Harian di prompt
   LLM, grafik tren, deteksi "checkpoint stagnan sejak Hari X") jadi kurang kaya
   dibanding v1 - bukan bug, itu batasan tab "Isian" yang cuma snapshot hari ini. Kalau
   ternyata ADA sumber histori terpisah (mis. tab lain yang belum ditemukan), beri tahu.

3. **Tulis**: satu tab "Isian" yang sama juga punya tabel log harian terpisah ("Hari Ke -"/
   "Tanggal"/"Analisis", kolom Analisis merge G:S) - dicocokkan cuma lewat "Hari Ke -" (bukan
   Kode Fasil + Hari ke seperti v1, karena satu spreadsheet sudah pasti cuma satu
   fasilitator). Ditulis lewat SATU Apps Script Web App terpusat (bukan 30 deployment
   terpisah) - lihat [Push balik analisis](#push-balik-analisis) di atas untuk detail & cara
   deploy.

## Monorepo & LLM yang sama persis

v1 dan v2 sekarang satu monorepo npm workspaces (lihat `../package.json` di root):

```
uwu-project/
├── package.json          # root workspaces: v1, v2, packages/*
├── packages/core/         # SATU sumber kode analisis + prompt + panggilan LLM
│   ├── llm.ts             #   dipakai v1 & v2 - TIDAK di-copy, benar-benar diimpor
│   ├── prompts.ts          #   dari package yang sama, jadi output LLM v2 dijamin
│   ├── metrics.ts          #   sama persis dengan v1 (bukan cuma "kebetulan sama
│   ├── compliance.ts       #   saat ditulis" - kalau salah satu diedit, yang lain
│   ├── severity.ts         #   ikut berubah otomatis, tidak bisa diam-diam menyimpang).
│   ├── ...                #   Lihat packages/core/*.ts untuk daftar lengkap.
│   └── knowledge/          #   checkpoints.ts/riskWeights.ts DIADAPTASI ke skema v2
│                           #   (Skor Akhir) - lihat catatan di knowledge/checkpoints.ts.
├── uwu-project-v1/        # tidak diubah - masih pakai lib/ sendiri (belum dimigrasi
│   └── lib/                 ke packages/core, lihat catatan di bawah)
└── uwu-project-v2/        # app ini
    └── lib/                # HANYA lapisan data-access yang genuinely beda dari v1:
                             # controller.ts, sheet.ts, skorAkhirColumns.ts,
                             # facilitatorLk.ts, facilitatorLkLinks.ts, writeSheet.ts
                             # (+ notify.ts/notifyState.ts, copy infra biasa, sama v1)
```

**Catatan**: `uwu-project-v1` masih memakai salinan lokalnya sendiri untuk modul yang kini
ada di `packages/core` (belum dimigrasi ke package bersama, supaya app v1 yang sudah
berjalan tidak ikut tersentuh oleh pekerjaan v2 ini) - termasuk perubahan severity.ts (hijau
cuma 100%) di atas, yang SENGAJA cuma berlaku di v2 untuk sekarang. Efeknya: perbaikan/
perubahan ke `packages/core` **tidak otomatis** ikut ke v1 sampai v1 dimigrasi juga. Kalau
nanti mau v1 ikut pakai `packages/core` juga (supaya benar-benar satu sumber kode, tidak ada
versi lama yang bisa menyimpang), itu pekerjaan mekanis terpisah - tinggal minta.

## Halaman & fitur UI

Sama persis dengan v1 (semua halaman, komponen, dan alur di-copy apa adanya) - lihat
[README v1](../uwu-project-v1/README.md#halaman) untuk penjelasan tiap halaman. Panel "LK
Fasilitator" yang di v1 sifatnya tambahan sekarang justru merepresentasikan sumber data
utama v2 (begitu `lib/facilitatorLk.ts` diimplementasikan).

## Struktur `lib/` (v2)

- `lib/controller.ts` - fetch tab "Fasilitator" di spreadsheet controller, di-cache 5 menit.
- `lib/facilitatorLkLinks.ts` - turunan tipis dari `controller.ts` (URL edit/CSV per
  fasilitator).
- `lib/facilitatorLk.ts` - **[belum diimplementasikan]** fetch baris wawancara mentah per
  sekolah - belum ketemu tab-nya di spreadsheet contoh.
- `lib/skorAkhirColumns.ts` - tabel 26 kolom Skor Akhir -> field `FacilRow` + bobot + flag
  `invert`, plus `applySkorAkhirColumns()`.
- `lib/sheet.ts` - `getFacilRows()` (fetch tab "Isian" tiap fasilitator, lihat keterbatasan
  single-snapshot di atas), `getTodayHari()`/`getCheckpointSchedule()` (fetch tab "Check
  Point" di controller).
- `lib/writeSheet.ts` - push balik ke tabel log harian di tab "Isian" tiap fasilitator, lewat
  SATU `google-apps-script/save-analisis.gs` terpusat - lihat [Push balik analisis](#push-balik-analisis).
- `lib/notify.ts`, `lib/notifyState.ts` - identik v1, tidak berubah.
