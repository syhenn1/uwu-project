/**
 * Pemetaan Kode Fasil -> spreadsheet LK Fasil PRIBADI milik masing-masing
 * fasilitator (bukan tab "Level Fasil" gabungan yang dibaca lib/sheet.ts).
 *
 * Setiap fasilitator mengisi LK-nya sendiri di spreadsheet terpisah; link-nya
 * ada sebagai hyperlink di kolom B tab "Fasilitator" pada spreadsheet utama -
 * tapi hyperlink TIDAK ikut terbawa lewat CSV export biasa (satu-satunya cara
 * membacanya adalah bongkar file .xlsx penuh dan baca relationship XML-nya,
 * yang berat untuk dilakukan tiap request). Jadi mapping ini di-generate
 * SEKALI secara manual, lalu disimpan di env var FACILITATOR_LK_LINKS_JSON
 * (lihat .env.local.example) - BUKAN di-hardcode di source ini, supaya
 * spreadsheet ID sungguhan (dan link ke data sekolah asli di baliknya) tidak
 * ikut ke-commit/ke-publish kalau repo ini di-public-kan. Tiap orang yang
 * pakai app ini isi env var-nya sendiri, sama seperti SHEET_CSV_URL.
 *
 * KETERBATASAN (per generasi terakhir):
 * - Cuma 22 dari 30 fasilitator berhasil dipetakan. Sisanya (8 fasilitator)
 *   sheet pribadinya belum di-share "Anyone with the link" jadi tidak bisa
 *   diambil sama sekali - itu masalah izin di sisi fasilitator ybs, bukan bug.
 * - Mapping ini basi (stale) kalau ada fasilitator yang sheet-nya pindah/baru.
 *   Perlu di-generate ulang manual kalau itu terjadi (belum ada script
 *   otomatis untuk ini - proses ekstraksinya melibatkan bongkar .xlsx workbook
 *   utama secara manual).
 */
export interface FacilitatorLkLink {
  spreadsheetId: string;
  gid: string;
}

function loadFacilitatorLkLinks(): Record<string, FacilitatorLkLink> {
  const raw = process.env.FACILITATOR_LK_LINKS_JSON;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    console.warn("[facilitatorLkLinks] FACILITATOR_LK_LINKS_JSON ada tapi bukan JSON valid - diabaikan.");
    return {};
  }
}

export const FACILITATOR_LK_LINKS: Record<string, FacilitatorLkLink> = loadFacilitatorLkLinks();

/** URL "edit" biasa - buat tombol "Buka Spreadsheet" (target=_blank). */
export function getFacilitatorLkEditUrl(kodeFasil: string): string | null {
  const entry = FACILITATOR_LK_LINKS[kodeFasil];
  if (!entry) return null;
  return `https://docs.google.com/spreadsheets/d/${entry.spreadsheetId}/edit?gid=${entry.gid}`;
}

/** URL export CSV - buat dibaca aplikasi (fetch server-side). */
export function getFacilitatorLkCsvUrl(kodeFasil: string): string | null {
  const entry = FACILITATOR_LK_LINKS[kodeFasil];
  if (!entry) return null;
  return `https://docs.google.com/spreadsheets/d/${entry.spreadsheetId}/export?format=csv&gid=${entry.gid}`;
}
