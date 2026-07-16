import Papa from "papaparse";
import { getFacilitatorLkCsvUrl } from "./facilitatorLkLinks";

const HEADER_ANCHOR = "Nama Fasilitator,";

/** Kolom A s.d. AQ dari 112 kolom LK Fasil mentah - seluruh bagian wawancara
 * kepatuhan (A. Komunikasi s.d. K. Negosiasi RAB). Sengaja berhenti di AQ:
 * kolom AR ke atas (L. Tindak Lanjut, lalu M./N. kondisi fisik bangunan &
 * kebutuhan rehab) beda domain sama sekali dari checkpoint kepatuhan. Buka
 * spreadsheet langsung kalau butuh lihat kolom fisik bangunan itu. Urutan &
 * string di sini HARUS sama persis dengan header sheet (termasuk newline di
 * "A.4 Catatan Keperluan...") karena dipakai sebagai key row hasil parse CSV
 * (header:true) - sudah dicek sama di 2 spreadsheet fasilitator berbeda. */
export const LK_SUMMARY_COLUMNS = [
  "Nama Fasilitator",
  "Hari ke",
  "NPSN",
  "Nama Sekolah",
  "Provinsi",
  "Kab/Kota",
  "A.1 Status Komunikasi",
  "A.2 Alasan Belum Terhubungi",
  "A.3 Keperluan",
  "A.4 Catatan Keperluan\n(Jika keperluan lainnya)",
  "A.5 Media Komunikasi",
  "A.6 Apakah sekolah mengundurkan diri?",
  "A.7 Alasan pengunduran diri sekolah",
  "B.1 Panduan Pelaksanaan (Panlak)",
  "B.2 Format/Template Dokumen",
  "B.3 Alasan Tidak Memiliki Panlak/Format/Template Dokumen",
  "C.1 Perencana",
  "C.2 Alasan Belum Punya Perencana",
  "C.3 Catatan Upaya Sekolah Mendapatkan Perencana",
  "D.1 Akses Aplikasi Revit SD",
  "D.2 Kendala Akses Aplikasi Revit SD",
  "D.3 Kendala Lainnya",
  "E.1 Pengisian Biodata Kepala Sekolah",
  "E.2 Alasan Belum Mengisi Biodata Kepala Sekolah",
  "F.1 Kesesuaian Dapodik dengan Lapangan",
  "F.2 Alasan Belum Sesuai antara Dapodik dengan Lapangan",
  "F.3 Status Update Dapodik (hanya ketika Belum Sesuai Kebutuhan)",
  "F.4 Alasan Belum Update Dapodik",
  "G.1 Penyusunan Dokumen Admin",
  "G.2 Kendala Penyusunan Dokumen Admin",
  "G.3 Penyusunan Dokumen Teknis",
  "G.4 Kendala Penyusunan Dokumen Teknis",
  "H.1 Proses Negosiasi RAB",
  "H.2 Kesesuaian IKK dengan Kebutulan",
  "H.3 Jika belum sesuai, apa alasannya?",
  "H.4 Catatan Kesesuaian IKK",
  "H.5 Kendala penyusunan RAB usulan dalam aplikasi",
  "I.1 Reviu Dokumen Admin",
  "I.2 Kendala Reviu Dokumen Admin",
  "J.1 Reviu Dokumen Teknis",
  "J.2 Kendala Reviu Dokumen Teknis",
  "K.1 Proses Negosiasi RAB",
  "K.2 Kendala Negosiasi RAB",
];

export interface LkFasilResult {
  available: boolean;
  error?: string;
  rows: Record<string, string>[];
}

/** Fetch LK Fasil mentah (per sekolah) milik satu fasilitator dari
 * spreadsheet pribadinya sendiri, difilter ke satu "Hari ke-" kalau diisi. */
export async function getFacilitatorLkRows(kodeFasil: string, hari?: number): Promise<LkFasilResult> {
  const csvUrl = getFacilitatorLkCsvUrl(kodeFasil);
  if (!csvUrl) {
    return {
      available: false,
      error: "Sheet LK pribadi fasilitator ini belum dipetakan (lihat lib/facilitatorLkLinks.ts).",
      rows: [],
    };
  }

  let res: Response;
  try {
    res = await fetch(csvUrl, { next: { revalidate: 300 } });
  } catch (err) {
    return { available: false, error: `Gagal terhubung ke sheet LK: ${err instanceof Error ? err.message : "unknown"}`, rows: [] };
  }
  if (!res.ok) {
    return {
      available: false,
      error: `Sheet LK tidak bisa diakses (HTTP ${res.status}) - kemungkinan besar belum di-share "Anyone with the link" oleh fasilitator ybs.`,
      rows: [],
    };
  }

  const text = await res.text();
  const lines = text.split(/\r\n|\n/);
  const headerIdx = lines.findIndex((l) => l.startsWith(HEADER_ANCHOR));
  if (headerIdx === -1) {
    return { available: false, error: 'Baris header ("Nama Fasilitator, Hari ke, ...") tidak ditemukan di sheet ini.', rows: [] };
  }

  const csv = lines.slice(headerIdx).join("\n");
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  let rows = parsed.data.filter((r) => (r["Nama Sekolah"] ?? "").trim() !== "");
  if (typeof hari === "number") {
    rows = rows.filter((r) => (r["Hari ke"] ?? "").trim() === `Hari ${hari}`);
  }

  return { available: true, rows };
}
