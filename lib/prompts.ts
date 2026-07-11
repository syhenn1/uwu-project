import { activeCheckpoints, buildKnowledgeSummary } from "./knowledge/checkpoints";
import type { FacilRow } from "./types";
import type { ChatMessage } from "./llm";

const QUALITATIVE_FIELDS: Array<{ key: keyof FacilRow; label: string }> = [
  { key: "kendalaKomunikasi", label: "Kendala Komunikasi" },
  { key: "kendalaPanlakFormatTemplate", label: "Kendala Panlak/Format/Template" },
  { key: "kendalaMendapatkanPerencana", label: "Kendala Mendapatkan Perencana" },
  { key: "kendalaVerifikasiBiodata", label: "Kendala Verifikasi Biodata" },
  { key: "kendalaUpdateDapodik", label: "Kendala Update Dapodik" },
  { key: "kendalaPenyusunanDokAdmin", label: "Kendala Penyusunan Dok. Admin" },
  { key: "kendalaVerifikasiDokAdmin", label: "Kendala Verifikasi Dok. Admin" },
  { key: "kendalaPenyusunanDokTeknis", label: "Kendala Penyusunan Dok. Teknis" },
  { key: "kendalaVerifikasiDokTeknis", label: "Kendala Verifikasi Dok. Teknis" },
  { key: "kendalaPenyepakatanRAB", label: "Kendala Penyepakatan RAB" },
  { key: "analisis", label: "Analisis (admin)" },
  { key: "catatanAdmin", label: "Catatan Admin" },
];

const SYSTEM_PROMPT = `Anda adalah asisten analis untuk program revitalisasi sekolah. Tugas Anda menganalisis data
kinerja fasilitator lapangan berdasarkan Lembar Kerja (LK) dan aplikasi monitoring ("Aplikasi Revit"),
lalu memberi kesimpulan yang jujur dan actionable kepada admin program.

Aturan penting:
- Data berupa persentase "masalah" (mis. "% Sekolah Belum Login Aplikasi") - semakin TINGGI nilainya semakin BURUK.
- "Nilai Risiko" adalah skor terbobot 0-100% (semakin tinggi = semakin berisiko), dihitung dari checkpoint-checkpoint yang diberikan.
- JANGAN menyalahkan fasilitator untuk checkpoint yang belum berlaku pada hari tsb (lihat catatan "belum relevan" di data).
- Jika ada "Analisis" atau "Catatan Admin" yang sudah ditulis manusia, jadikan itu konteks tambahan - jangan diulang mentah-mentah, tapi boleh dikonfirmasi/dipertajam.
- Perhatikan pola anomali: data yang sama sekali tidak berubah selama beberapa hari berturut-turut sering menandakan fasilitator berhenti mengisi laporan, bukan kondisi yang benar-benar stabil.
- Jawab dalam Bahasa Indonesia, ringkas, terstruktur, dan langsung actionable. Gunakan format markdown dengan heading pendek.`;

function formatCell(v: FacilRow[keyof FacilRow]): string {
  if (v == null) return "-";
  if (typeof v === "number") return `${v}%`;
  return String(v);
}

function buildHistoryTable(history: FacilRow[], maxDay: number): string {
  const groups = activeCheckpoints(maxDay);
  const cols = groups.flatMap((g) => g.indicators.map((i) => i.kolom));
  const uniqueCols = Array.from(new Set(cols));

  const header = ["Hari", "Nilai Risiko", ...uniqueCols].join(" | ");
  const sep = uniqueCols.map(() => "---").join(" | ");
  const rows = history.map((row) => {
    const cells = uniqueCols.map((c) => (row.hari >= (groups.find((g) => g.indicators.some((i) => i.kolom === c))?.activeFromDay ?? 0) ? formatCell(row[c]) : "(belum berlaku)"));
    return [`Hari ${row.hari}`, formatCell(row.nilaiRisiko), ...cells].join(" | ");
  });

  return [header, `--- | --- | ${sep}`, ...rows].join("\n");
}

function buildQualitativeNotes(history: FacilRow[]): string {
  const lines: string[] = [];
  for (const row of history) {
    for (const field of QUALITATIVE_FIELDS) {
      const value = row[field.key];
      if (typeof value === "string" && value.trim() !== "" && value !== "Belum Diisi") {
        lines.push(`- Hari ${row.hari} - ${field.label}: ${value}`);
      }
    }
  }
  return lines.length ? lines.join("\n") : "(tidak ada catatan kualitatif tambahan)";
}

export function buildFacilitatorAnalysisMessages(history: FacilRow[]): ChatMessage[] {
  if (history.length === 0) throw new Error("Tidak ada data histori untuk fasilitator ini.");
  const maxDay = history[history.length - 1].hari;
  const latest = history[history.length - 1];

  const userPrompt = `Fasilitator: ${latest.namaFasil} (${latest.kodeFasil})
Koordinator: ${latest.namaKoor} (${latest.kodeKoor})
Data tersedia sampai Hari ke-${maxDay} dari siklus 14 hari.

## Basis Pengetahuan Checkpoint (kolom, bobot, definisi)
${buildKnowledgeSummary(maxDay)}

## Tabel Tren Harian
${buildHistoryTable(history, maxDay)}

## Catatan Kualitatif (Kendala / Analisis / Catatan Admin yang sudah ada)
${buildQualitativeNotes(history)}

Tolong berikan analisis dengan struktur berikut:
1. **Ringkasan Kinerja** - apakah fasilitator ini bagus, cukup, atau butuh perhatian, dan kenapa.
2. **Red Flags** - masalah paling mendesak (jika ada), urutkan dari paling kritis.
3. **Indikasi Anomali** - pola mencurigakan seperti data yang tidak berubah, atau ketidaksesuaian antar kolom (mis. LK vs Aplikasi).
4. **Rekomendasi Tindak Lanjut** - langkah konkret untuk admin/koordinator.`;

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];
}

export function buildDailySummaryMessages(dayRows: FacilRow[], hari: number): ChatMessage[] {
  if (dayRows.length === 0) throw new Error("Tidak ada data untuk hari ini.");
  const sorted = [...dayRows].sort((a, b) => {
    const av = typeof a.nilaiRisiko === "number" ? a.nilaiRisiko : -1;
    const bv = typeof b.nilaiRisiko === "number" ? b.nilaiRisiko : -1;
    return bv - av;
  });

  const table = sorted
    .map((r) => `- ${r.namaFasil} (${r.kodeFasil}, koor: ${r.namaKoor}) - Nilai Risiko: ${formatCell(r.nilaiRisiko)}, Belum Login LK: ${formatCell(r.fasilBelumLoginLK)}, Belum Login Aplikasi: ${formatCell(r.pctSekolahBelumLoginAplikasi)}`)
    .join("\n");

  const notes = dayRows
    .flatMap((r) =>
      QUALITATIVE_FIELDS.filter((f) => {
        const v = r[f.key];
        return typeof v === "string" && v.trim() !== "" && v !== "Belum Diisi";
      }).map((f) => `- ${r.namaFasil}: [${f.label}] ${r[f.key]}`)
    )
    .join("\n");

  const userPrompt = `Ringkasan seluruh fasilitator (${dayRows.length} orang) pada Hari ke-${hari} dari siklus 14 hari.

## Basis Pengetahuan Checkpoint yang Relevan Hari Ini
${buildKnowledgeSummary(hari)}

## Data per Fasilitator (diurutkan dari risiko tertinggi)
${table}

## Catatan Kualitatif dari Lapangan
${notes || "(tidak ada catatan kualitatif tambahan)"}

Tolong berikan ringkasan eksekutif dengan struktur berikut:
1. **Kondisi Umum** - gambaran keseluruhan kinerja hari ini.
2. **Fasilitator Prioritas** - siapa saja yang paling butuh perhatian/intervensi segera, dan kenapa.
3. **Pola Kendala Umum** - kendala yang berulang di banyak fasilitator (jika ada).
4. **Rekomendasi Prioritas Admin** - 3-5 tindakan konkret untuk hari ini/besok.`;

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];
}
