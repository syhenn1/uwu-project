# Monitoring Fasilitator Revitalisasi Sekolah

Dashboard Next.js untuk memantau kinerja fasilitator lapangan pada program revitalisasi
sekolah (14 hari siklus pendampingan), dengan data ditarik dari Google Sheet publik dan
analisis kualitatif dibantu LLM - dengan fallback otomatis lintas provider (Hugging Face →
Google Gemini → Groq → OpenRouter → OpenAI), lihat bagian
[Provider AI](#provider-ai--fallback-otomatis) di bawah.

## Cara jalan

```bash
npm install
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000). Tanpa konfigurasi apa pun, dashboard
akan langsung memakai data contoh di `fixtures/sample-sheet.csv` (dua fasilitator fiktif,
14 hari, data sintetis murni untuk demo - bukan data program asli).

`npm run dev` sudah menjalankan semua yang dibutuhkan dalam satu proses - tidak ada server
model terpisah yang perlu dinyalakan, karena analisis AI selalu lewat API cloud (`lib/llm.ts`),
bukan model yang dijalankan di mesin lokal. Tiap kali tombol "Buat Analisis AI" diklik, log
muncul di terminal tempat `npm run dev` jalan - format `[AI ...]` untuk tiap percobaan
panggilan ke provider (nama provider, durasi, jumlah karakter, token in/out - termasuk kalau
gagal dan lanjut fallback ke provider berikutnya) dan `[API ...]` untuk request yang masuk ke
route handler-nya.

## Konfigurasi (`.env.local`)

Salin `.env.local.example` menjadi `.env.local` lalu isi:

- `SHEET_CSV_URL` — URL tab **"Level Fasil"** di Google Sheet asli (sheet harus share
  "Anyone with the link" bisa view). Buka tab "Level Fasil"-nya dulu supaya aktif, lalu
  copy URL dari address bar apa adanya (`.../edit?gid=...` juga boleh — otomatis
  dikonversi ke endpoint export CSV oleh `lib/sheet.ts`). Kosongkan untuk tetap memakai
  data contoh.
- Provider AI (`HF_TOKEN`/`GEMINI_API_KEY`/`GROQ_API_KEY`/`OPENROUTER_API_KEY`/`OPENAI_API_KEY`)
  — isi minimal satu, lihat [Provider AI & fallback otomatis](#provider-ai--fallback-otomatis)
  di bawah.
- `SHEET_CHECKPOINT_GID` — opsional, gid tab "Check Point" kalau beda dari default.
- `NOTIFY_WEBHOOK_URL` / (`RESEND_API_KEY`+`NOTIFY_EMAIL_TO`+`NOTIFY_EMAIL_FROM`) — opsional,
  lihat bagian [Notifikasi otomatis](#notifikasi-otomatis) di bawah.
- `WRITE_SHEETS_WEBHOOK_URL` / `WRITE_SHEETS_WEBHOOK_SECRET` — opsional, lihat bagian
  [Tulis balik ke spreadsheet](#tulis-balik-ke-spreadsheet) di bawah.
- `FACILITATOR_LK_LINKS_JSON` — opsional, JSON satu baris berisi pemetaan Kode Fasil →
  spreadsheet LK Fasil pribadi tiap fasilitator, dipakai panel "LK Fasilitator" di halaman
  detail (lihat [Panel LK Fasilitator](#panel-lk-fasilitator) di bawah). Kosongkan untuk
  menonaktifkan panel itu (tombol "Buka Spreadsheet" & tabelnya tidak muncul, tanpa error).

## Provider AI & fallback otomatis

`lib/llm.ts` mencoba provider secara berurutan - **Hugging Face → Google Gemini → Groq →
OpenRouter → OpenAI** - dan otomatis lanjut ke provider berikutnya kalau yang sedang dicoba
gagal (kuota habis, rate limit, error apapun). Cukup isi provider mana saja yang mau dipakai di
`.env.local`; yang tidak diisi otomatis dilewati (bukan dianggap error). Kalau semuanya gagal,
baru muncul error yang merangkum kegagalan tiap provider.

- **Hugging Face** — `HF_TOKEN` (buat di huggingface.co/settings/tokens) + `HF_MODEL`
  (default Llama 4 Scout, model "gated" - perlu terima lisensi Meta dulu di halaman modelnya).
- **Google Gemini** — `GEMINI_API_KEY` (buat gratis, tanpa kartu kredit, di
  aistudio.google.com/apikey) + `GEMINI_MODEL` (default `gemini-2.0-flash`).
- **Groq** — `GROQ_API_KEY` (buat gratis di console.groq.com/keys) + `GROQ_MODEL`
  (default `llama-3.3-70b-versatile`, inferensi Llama super cepat).
- **OpenRouter** — `OPENROUTER_API_KEY` (buat gratis di openrouter.ai/keys) + `OPENROUTER_MODEL`
  (default `meta-llama/llama-3.3-70b-instruct:free` - router ke banyak model, model dengan
  suffix `:free` di namanya tidak dikenai biaya).
- **OpenAI** — `OPENAI_API_KEY` (buat di platform.openai.com/api-keys, **berbayar** - tidak
  ada tingkatan gratis) + `OPENAI_MODEL` (default `gpt-4o-mini`). Ditaruh paling akhir di
  urutan fallback karena berbayar, jadi cuma kepakai kalau empat provider gratis di atas
  semuanya gagal.

Semuanya **selalu lewat API cloud masing-masing** (`lib/llm.ts`), tidak ada model yang
dijalankan di mesin lokal.

## Halaman

- **Dashboard** (`/`) — toggle "Semua Waktu" (kondisi terkini + aktivitas kualitatif per
  hari) vs "Per Hari" (browsing tanggal spesifik). Bisa difilter per kampus/koordinator.
  Termasuk tabel perbandingan Hasil LK vs Aplikasi.
- **Fasilitator** (`/fasilitator/[kode]`) — detail 1 fasilitator: toggle "Semua Waktu"
  (kondisi terkini, semua 14 checkpoint tanpa gating tanggal) vs "Per Hari" (snapshot hari
  tertentu), milestone timeline vertikal per checkpoint, tren 14 hari, kepatuhan checkpoint,
  anomali, panel "LK Fasilitator" (lihat [Panel LK Fasilitator](#panel-lk-fasilitator)),
  catatan kualitatif, analisis AI.
- **Analisis Massal** (`/analisis-massal`) — generate analisis AI untuk semua fasilitator
  sekaligus, sampai hari pilihan (atau semua kombinasi fasilitator×hari kalau perlu),
  dengan progress bar, ekspor JSON/Markdown, dan tombol "Tambahkan ke Spreadsheet" untuk
  menulis hasilnya balik ke kolom "Analisis" (lihat [Tulis balik ke
  spreadsheet](#tulis-balik-ke-spreadsheet)).
- **Anomali** (`/anomali`) — pemindaian lintas 30 fasilitator: belum login LK, data yang
  mendahului hari ini, ketidakcocokan Hasil LK vs Aplikasi, kontradiksi catatan Kendala.
- **Laporan** (`/laporan`) — ringkasan masalah data *sistemik* (kolom yang nilainya seragam
  di semua baris, kolom "Nilai Risiko" kosong, dst.) siap disalin/diunduh untuk dikirim ke
  tim data/Aplikasi Revit. Beda dari halaman Anomali yang fokus per-fasilitator.

## Notifikasi otomatis

`/api/notify-check` memindai anomali & checkpoint yang belum sesuai, membandingkan dengan
temuan terakhir yang tersimpan di `.data/notify-state.json` (state lokal berbasis file —
satu-satunya pengecualian dari keputusan "tanpa database", lingkupnya cuma untuk tahu "apa
yang sudah pernah diberitahukan"), dan mengirim **hanya yang baru** ke channel yang
dikonfigurasi (`NOTIFY_WEBHOOK_URL` untuk Slack/Discord/dst, atau Resend untuk email).
Pengecekan pertama cuma menyimpan baseline, tidak mengirim apa-apa.

Bisa dipicu manual lewat tombol "Cek Sekarang" di halaman `/laporan`, atau dijadwalkan dari
luar aplikasi (aplikasi ini sendiri tidak punya cron internal):

- **Windows Task Scheduler** (server jalan lokal terus): buat task yang menjalankan
  `curl http://localhost:3000/api/notify-check` tiap beberapa jam.
- **Vercel Cron** (kalau di-deploy ke Vercel): tambahkan `vercel.json` dengan `crons` yang
  memanggil endpoint ini — tapi perhatikan filesystem Vercel tidak persisten antar
  invocation, jadi `.data/notify-state.json` tidak akan tersimpan; state notifikasi butuh
  disesuaikan ke penyimpanan eksternal (mis. Vercel KV) kalau dipakai di sana.

## Tulis balik ke spreadsheet

Aplikasi ini secara default **read-only** — satu-satunya cara membaca sheet adalah lewat
endpoint export CSV publik (`lib/sheet.ts`), yang secara teknis memang tidak bisa dipakai
untuk menulis apapun. Tidak ada kredensial Google (service account/OAuth) di proyek ini.

Tombol "Tambahkan ke Spreadsheet" di halaman Analisis Massal adalah pengecualian: dia
menulis hasil analisis AI ke kolom **"Analisis"** pada tab "Level Fasil" (baris yang Kode
Fasil + Hari ke-nya cocok), tapi lewat jalur tidak langsung — Apps Script Web App yang kamu
deploy sendiri dari spreadsheet itu (`google-apps-script/save-analisis.gs`), bukan lewat
kredensial Google di server aplikasi ini. Langkah deploy lengkap ada di komentar file
tersebut. Setelah deploy, isi `WRITE_SHEETS_WEBHOOK_URL` (URL Web App) dan
`WRITE_SHEETS_WEBHOOK_SECRET` (secret buatanmu sendiri, harus sama dengan `SHARED_SECRET`
di dalam script) di `.env.local`.

Kosongkan kedua env var itu untuk menonaktifkan — tombolnya tetap muncul tapi akan
menampilkan pesan error yang jelas, bukan gagal diam-diam.

Karena kolom "Analisis" bisa berisi hasil AI, prompt LLM (`lib/prompts.ts`) sengaja
**tidak** membaca kolom itu sebagai konteks input lagi (beda dari "Catatan Admin" yang
tetap dipakai) — supaya analisis berikutnya tidak menggemakan hasil analisis lamanya
sendiri, dan tetap murni dihitung ulang dari data terkini.

## Panel LK Fasilitator

Tiap fasilitator mengisi LK-nya sendiri di spreadsheet **pribadi** yang terpisah dari tab
"Level Fasil" gabungan (`SHEET_CSV_URL`). Panel "LK Fasilitator" di halaman detail
menampilkan data mentah itu langsung di dalam app (kolom A-AQ, seluruh bagian wawancara
kepatuhan) tanpa perlu pindah tab, plus tombol "Buka Spreadsheet ↗" untuk buka aslinya.

Pemetaan Kode Fasil → spreadsheet LK Fasil pribadi diisi lewat `FACILITATOR_LK_LINKS_JSON`
(lihat [Konfigurasi](#konfigurasi-envlocal) di atas) - **bukan** di-hardcode di source,
karena isinya spreadsheet ID sungguhan yang mengarah ke data sekolah asli. Setiap orang yang
menjalankan app ini (termasuk rekan kerja yang clone repo-nya) mengisi env var-nya sendiri,
sama seperti `SHEET_CSV_URL`. Cara generate mapping-nya manual - lihat komentar panjang di
`lib/facilitatorLkLinks.ts` untuk detail langkahnya (bongkar file `.xlsx` workbook utama
untuk ambil hyperlink kolom B tab "Fasilitator", karena hyperlink tidak ikut ke CSV export
biasa). Belum ada script otomatis untuk regenerasi - kalau ada fasilitator baru/sheet
pindah, mapping perlu di-generate ulang manual.

Kosongkan `FACILITATOR_LK_LINKS_JSON` (atau untuk fasilitator yang belum ada di mapping-nya)
untuk tetap aman - panel akan menampilkan pesan "belum dipetakan" alih-alih error.

## Struktur

- `lib/sheet.ts` — fetch & parse CSV (publik atau fixture), jadwal "Check Point" & hitung
  hari ini itu "Hari ke-" berapa (jangkar tetap 6 Juli 2026 = Hari 1, dengan fallback kalau
  sheet tidak bisa diakses).
- `lib/columns.ts` — mapping header spreadsheet ↔ field terstruktur, parser nilai (persen,
  `#DIV/0!`, "Sudah/Belum", teks bebas).
- `lib/knowledge/checkpoints.ts` — basis pengetahuan checkpoint: definisi tiap kolom, bobot
  risiko, dan hari mulai berlaku (dari tab "Kolom LK"). Dipakai untuk tooltip, prompt LLM,
  estimasi Nilai Risiko, dan cek kepatuhan.
- `lib/metrics.ts` — agregasi (ringkasan harian, level risiko, estimasi Nilai Risiko).
- `lib/compliance.ts` — cek tiap checkpoint terpenuhi atau tidak untuk kondisi terkini,
  dengan pengecekan silang (bukan cuma percaya 0% mentah - lihat komentar di file).
- `lib/anomalies.ts` — 4 jenis deteksi anomali per fasilitator + perbandingan LK vs Aplikasi.
- `lib/systemicReport.ts` — deteksi masalah data level program (kolom bernilai seragam, dst).
- `lib/notes.ts` — pengelompokan catatan kualitatif per rentang hari + aktivitas per hari.
- `lib/prompts.ts` + `lib/llm.ts` — membangun prompt & memanggil model lewat HF router.
- `lib/writeSheet.ts` + `google-apps-script/save-analisis.gs` — satu-satunya jalur tulis ke
  spreadsheet, lihat [Tulis balik ke spreadsheet](#tulis-balik-ke-spreadsheet).
- `lib/facilitatorLkLinks.ts` + `lib/facilitatorLk.ts` + `app/api/lk-fasil/` +
  `components/LkFasilPanel.tsx` — panel "LK Fasilitator", lihat [Panel LK
  Fasilitator](#panel-lk-fasilitator).
- `components/MilestoneTimeline.tsx` — timeline vertikal 14 checkpoint di halaman detail
  fasilitator, termasuk node terpisah LK vs Aplikasi untuk checkpoint yang datanya genuinely
  punya 2 sumber (lihat `LK_APLIKASI_PAIRS` di `lib/anomalies.ts`).

Data & analisis AI diambil **on-demand** (tanpa database) — analisis AI baru dipanggil saat
tombol diklik, hasilnya hanya tersimpan di state browser selama sesi berjalan (kecuali lewat
Analisis Massal, yang punya tombol unduh dan tombol "Tambahkan ke Spreadsheet"). Satu-satunya
state yang disimpan ke disk adalah `.data/notify-state.json` untuk notifikasi (lihat di atas).
