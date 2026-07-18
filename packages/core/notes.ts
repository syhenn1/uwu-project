import type { FacilRow } from "./types";

/** Kolom kualitatif (Kendala/Analisis/Catatan Admin) - dipakai bareng oleh
 * halaman detail fasilitator, prompt LLM, dan pemindai anomali supaya
 * daftarnya tidak duplikat di banyak tempat. */
export const QUALITATIVE_FIELDS: ReadonlyArray<{ key: keyof FacilRow; label: string }> = [
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
  { key: "jumlahSekolahMengundurkanDiri", label: "Jumlah Sekolah Mengundurkan Diri" },
  { key: "analisis", label: "Analisis (admin)" },
  { key: "catatanAdmin", label: "Catatan Admin" },
];

export interface NoteRange {
  key: string;
  label: string;
  text: string;
  hariStart: number;
  hariEnd: number;
}

/**
 * Mengelompokkan isi kolom kualitatif (Kendala/Analisis/Catatan Admin) per
 * hari menjadi rentang hari yang berurutan dengan teks identik, supaya "Belum
 * Diisi" 5 hari berturut-turut tampil sebagai satu baris "Hari 2-6", bukan
 * diulang 5x. `include` memfilter teks mana yang mau diikutsertakan (dipakai
 * untuk memisahkan catatan asli vs penanda "belum diisi").
 */
export function buildNoteRanges(
  history: FacilRow[],
  fields: ReadonlyArray<{ key: keyof FacilRow; label: string }>,
  include: (text: string) => boolean
): NoteRange[] {
  const ranges: NoteRange[] = [];
  for (const field of fields) {
    let current: { text: string; start: number; end: number } | null = null;
    const flush = () => {
      if (current) {
        ranges.push({ key: String(field.key), label: field.label, text: current.text, hariStart: current.start, hariEnd: current.end });
      }
      current = null;
    };
    for (const row of history) {
      const raw = row[field.key];
      const text = typeof raw === "string" ? raw.trim() : "";
      const matches = text !== "" && include(text);
      if (matches) {
        if (current && current.text === text && row.hari === current.end + 1) {
          current.end = row.hari;
        } else {
          flush();
          current = { text, start: row.hari, end: row.hari };
        }
      } else {
        flush();
      }
    }
    flush();
  }
  return ranges;
}

export function formatHariRange(r: NoteRange): string {
  return r.hariStart === r.hariEnd ? `Hari ${r.hariStart}` : `Hari ${r.hariStart}-${r.hariEnd}`;
}

export interface DayActivity {
  hari: number;
  catatanAsli: number;
  belumDiisi: number;
}

/**
 * Menghitung jumlah entri kualitatif (bukan blank) yang ditulis tiap hari,
 * digabung lintas SEMUA fasilitator - dipakai sebagai proxy "aktivitas" pada
 * tampilan Semua Waktu, karena metrik angka sendiri statis antar hari (lihat
 * catatan di lib/sheet.ts) sehingga tidak ada tren berarti untuk dihitung
 * dari situ. Dibatasi 1..uptoHari (hari yang sudah benar-benar terjadi).
 */
export function countQualitativeActivityByDay(rows: FacilRow[], uptoHari: number): DayActivity[] {
  const byDay = new Map<number, DayActivity>();
  for (let h = 1; h <= uptoHari; h++) byDay.set(h, { hari: h, catatanAsli: 0, belumDiisi: 0 });

  for (const row of rows) {
    if (row.hari < 1 || row.hari > uptoHari) continue;
    const bucket = byDay.get(row.hari);
    if (!bucket) continue;
    for (const field of QUALITATIVE_FIELDS) {
      const v = row[field.key];
      const text = typeof v === "string" ? v.trim() : "";
      if (text === "") continue;
      if (text === "Belum Diisi") bucket.belumDiisi += 1;
      else bucket.catatanAsli += 1;
    }
  }

  return Array.from(byDay.values());
}
