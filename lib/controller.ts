import Papa from "papaparse";

/**
 * Spreadsheet "controller" - satu-satunya sumber daftar 30 fasilitator dan
 * link spreadsheet LK Fasil PRIBADI masing-masing (beda dari v1: di sana
 * mapping ini statis lewat env var FACILITATOR_LK_LINKS_JSON yang di-generate
 * manual sekali; di v2 ini live-fetch dari spreadsheet controller yang
 * dikelola pemilik program, jadi otomatis ikut ter-update kalau ada
 * fasilitator baru/sheet pindah).
 *
 * DIKONFIRMASI 2026-07-16 - tab "Daftar Fasilitator" (gid=0) berisi 30 baris, kolom
 * persis: "Atmin", "Kode Fasil", "Nama Fasil", "LK Log" (URL "edit" biasa ke
 * spreadsheet LK pribadi masing-masing, TANPA fragment #gid= - berarti
 * selalu mengarah ke tab PERTAMA/default spreadsheet itu, gid diasumsikan
 * "0" - tab data sebenarnya, "Isian", ada di gid lain, lihat lib/sheet.ts).
 */
const FASILITATOR_HEADER_ANCHOR = '"Atmin","Kode Fasil","Nama Fasil"';

export interface ControllerFacilitatorEntry {
  atmin: string;
  kodeFasil: string;
  namaFasil: string;
  spreadsheetId: string;
  gid: string;
}

export function isControllerConfigured(): boolean {
  return !!process.env.CONTROLLER_SHEET_URL;
}

/** Terima URL "edit" biasa (dengan/tanpa #gid=) dan ubah jadi endpoint
 * export CSV - sama seperti normalizeSheetUrl() di v1 lib/sheet.ts. */
function normalizeSheetUrl(url: string): string {
  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) return url;
  const gidMatch = url.match(/[?&#]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : "0";
  return `https://docs.google.com/spreadsheets/d/${idMatch[1]}/export?format=csv&gid=${gid}`;
}

/** Ekstrak spreadsheetId + gid dari URL "LK Log" milik satu fasilitator
 * (kolom tab "Daftar Fasilitator") - beda dari normalizeSheetUrl di atas (yang
 * mengubah URL controller SENDIRI jadi endpoint CSV), ini cuma perlu
 * id+gid mentah untuk disimpan di ControllerFacilitatorEntry. */
function parseSheetIdAndGid(url: string): { spreadsheetId: string; gid: string } | null {
  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) return null;
  const gidMatch = url.match(/[?&#]gid=(\d+)/);
  return { spreadsheetId: idMatch[1], gid: gidMatch ? gidMatch[1] : "0" };
}

let cache: { at: number; entries: ControllerFacilitatorEntry[] } | null = null;
let fetchPromise: Promise<ControllerFacilitatorEntry[]> | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Daftar semua fasilitator dari tab "Fasilitator" spreadsheet controller.
 * [] kalau CONTROLLER_SHEET_URL belum diset ATAU fetch-nya gagal (mis. belum
 * di-share publik) - SENGAJA tidak throw, supaya halaman yang memanggilnya
 * tetap render (kosong) alih-alih 500 total. Di-cache 5 menit in-memory
 * (proses server) supaya halaman yang butuh banyak lookup (mis. Analisis
 * Massal, loop 30 fasilitator) tidak fetch controller berkali-kali. */
export async function getControllerEntries(): Promise<ControllerFacilitatorEntry[]> {
  const url = process.env.CONTROLLER_SHEET_URL;
  if (!url) return [];

  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.entries;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      let res: Response;
      try {
        res = await fetch(normalizeSheetUrl(url), { next: { revalidate: 300 } });
      } catch (err) {
        console.warn(`[controller] Gagal terhubung ke spreadsheet controller: ${err instanceof Error ? err.message : "unknown"}`);
        return cache?.entries ?? [];
      }
      if (!res.ok) {
        console.warn(`[controller] Spreadsheet controller tidak bisa diakses (HTTP ${res.status}) - pastikan sudah di-share "Anyone with the link".`);
        return cache?.entries ?? [];
      }

      const rawCsv = await res.text();
      const lines = rawCsv.split(/\r\n|\n/);
      const headerIdx = lines.findIndex((l) => l.includes(FASILITATOR_HEADER_ANCHOR) || l.includes('Atmin,Kode Fasil,Nama Fasil'));
      if (headerIdx === -1) {
        console.warn('[controller] Baris header ("Atmin, Kode Fasil, Nama Fasil, ... LK Log") tidak ditemukan di tab "Daftar Fasilitator".');
        return cache?.entries ?? [];
      }
      const csv = lines.slice(headerIdx).join("\n");
      const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });

      const entries: ControllerFacilitatorEntry[] = [];
      for (const row of parsed.data) {
        const kodeFasil = (row["Kode Fasil"] ?? "").trim();
        const tautan = (row["LK Log"] ?? row["Tautan"] ?? "").trim();
        if (!kodeFasil || !tautan) continue;
        const parsedUrl = parseSheetIdAndGid(tautan);
        if (!parsedUrl) {
          console.warn(`[controller] "LK Log" untuk ${kodeFasil} bukan URL spreadsheet Google yang valid: "${tautan}".`);
          continue;
        }
        entries.push({
          atmin: (row["Atmin"] ?? "").trim(),
          kodeFasil,
          namaFasil: (row["Nama Fasil"] ?? "").trim(),
          spreadsheetId: parsedUrl.spreadsheetId,
          gid: parsedUrl.gid,
        });
      }

      cache = { at: Date.now(), entries };
      return entries;
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

export async function getControllerEntry(kodeFasil: string): Promise<ControllerFacilitatorEntry | null> {
  const entries = await getControllerEntries();
  return entries.find((e) => e.kodeFasil === kodeFasil) ?? null;
}
