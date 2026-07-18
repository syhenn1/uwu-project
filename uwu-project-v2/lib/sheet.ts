import { promises as fs } from "fs";
import path from "path";
import Papa from "papaparse";
import { COLUMN_MAP, toFacilRow } from "@uwu/core/columns";
import type { FacilRow } from "@uwu/core/types";
import { isControllerConfigured } from "./controller";
import { getRosterEntries, getMasterLogRows, buildFacilRowFromMasterLog } from "./masterSheet";
import type { RosterEntry, ParsedMasterLogRow } from "./masterSheet";

const HEADER_ANCHOR = `${COLUMN_MAP[0].header},`; // "Atmin,"

/** Data contoh (2 fasilitator fiktif, 14 hari, sintetis) - dipakai persis
 * seperti v1 tanpa SHEET_CSV_URL, supaya `npm install && npm run dev` di v2
 * langsung jalan tanpa konfigurasi apa pun. Sengaja pakai fixture CSV yang
 * SAMA formatnya dengan v1 (bukan format LK Fasil mentah) - ini cuma demo
 * shape data, bukan simulasi sumber data v2 yang sesungguhnya. */
async function loadSampleRows(): Promise<FacilRow[]> {
  const fixturePath = path.join(process.cwd(), "fixtures", "sample-sheet.csv");
  const raw = await fs.readFile(fixturePath, "utf8");
  const lines = raw.split(/\r\n|\n/);
  const headerIdx = lines.findIndex((l) => l.startsWith(HEADER_ANCHOR));
  const csv = headerIdx === -1 ? raw : lines.slice(headerIdx).join("\n");
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  return parsed.data.filter((r) => (r["Kode Fasil"] ?? "").trim() !== "").map(toFacilRow);
}

export function isUsingSampleData(): boolean {
  return !isControllerConfigured();
}

/**
 * Sumber data ASLI v2: satu FacilRow (kondisi TERKINI, bukan histori) per
 * fasilitator, dibaca LANGSUNG dari master spreadsheet (tab "Fasilitator"
 * untuk roster/Kendala + tab "masterLog" untuk skor - lihat lib/masterSheet.ts),
 * BUKAN lagi dengan scrape 30 spreadsheet LK individual terpisah (arsitektur
 * lama, dipensiunkan 2026-07-18). Kalau "masterLog" suatu saat punya lebih
 * dari satu baris per fasilitator (Hari/Log berbeda-beda seiring waktu),
 * dipilih baris TERBARU (Hari lalu Log tertinggi).
 *
 * SELALU fallback ke data contoh kalau: CONTROLLER_SHEET_URL belum diset,
 * ATAU fetch tab "masterLog"-nya gagal total (0 baris) - supaya dashboard
 * tidak pernah kosong total.
 */
let facilRowsCache: { at: number; rows: FacilRow[] } | null = null;
const FACIL_CACHE_TTL_MS = 5 * 60 * 1000;

export async function getFacilRows(): Promise<FacilRow[]> {
  if (facilRowsCache && Date.now() - facilRowsCache.at < FACIL_CACHE_TTL_MS) {
    return facilRowsCache.rows;
  }

  if (!isControllerConfigured()) return loadSampleRows();

  const [rosterEntries, logRows] = await Promise.all([getRosterEntries(), getMasterLogRows()]);
  if (logRows.length === 0) {
    console.warn('[sheet] Tab "masterLog" tidak mengembalikan baris apa pun - masih memakai data contoh.');
    return loadSampleRows();
  }

  const rosterByName = new Map<string, RosterEntry>(rosterEntries.map((r) => [r.namaFasil, r]));

  // Ambil baris TERBARU per fasilitator (Hari lalu Log tertinggi) - masterLog
  // bisa punya >1 baris per fasilitator seiring waktu (satu per Hari/Log).
  const latestByName = new Map<string, ParsedMasterLogRow>();
  for (const row of logRows) {
    const prev = latestByName.get(row.namaFasil);
    if (!prev || row.hari > prev.hari || (row.hari === prev.hari && row.logNumber > prev.logNumber)) {
      latestByName.set(row.namaFasil, row);
    }
  }

  const rows = [...latestByName.values()].map((row) => buildFacilRowFromMasterLog(row, rosterByName.get(row.namaFasil)));

  facilRowsCache = { at: Date.now(), rows };
  return rows;
}

// --- Histori multi-hari per fasilitator (halaman /fasilitator/[kode]) -----

export interface DayLogSnapshot {
  log1: FacilRow | null;
  log2: FacilRow | null;
}

export interface FacilitatorLogData {
  /** Satu FacilRow per hari yang SUDAH ada datanya (Log 2 kalau sudah diisi,
   * fallback ke Log 1 kalau Log 2 belum) - dipakai sebagai histori multi-hari
   * di halaman /fasilitator/[kode] (DaySelector dkk.), diurutkan naik. */
  history: FacilRow[];
  /** Snapshot Log 1 & Log 2 MENTAH per hari (tanpa digabung) - dipakai untuk
   * menampilkan keduanya berdampingan, terutama untuk hari ini. */
  logsByHari: Map<number, DayLogSnapshot>;
}

/**
 * Histori multi-hari + snapshot Log 1/Log 2 SATU fasilitator, dari tab
 * "masterLog" di master spreadsheet (di-filter ke Nama Fasil fasilitator
 * ini, lewat roster tab "Fasilitator" untuk resolve Kode Fasil -> Nama
 * Fasil). null kalau kodeFasil tidak ditemukan di roster ATAU tidak ada
 * baris masterLog untuk fasilitator itu.
 */
export async function getFacilitatorLogData(kodeFasil: string): Promise<FacilitatorLogData | null> {
  const rosterEntries = await getRosterEntries();
  const roster = rosterEntries.find((e) => e.kodeFasil === kodeFasil);
  if (!roster) return null;

  const logRows = await getMasterLogRows();
  const mine = logRows.filter((r) => r.namaFasil === roster.namaFasil);
  if (mine.length === 0) return null;

  const logsByHari = new Map<number, DayLogSnapshot>();
  for (const parsed of mine) {
    const facilRow = buildFacilRowFromMasterLog(parsed, roster);
    const slot = logsByHari.get(parsed.hari) ?? { log1: null, log2: null };
    if (parsed.logNumber === 1) slot.log1 = facilRow;
    else if (parsed.logNumber === 2) slot.log2 = facilRow;
    logsByHari.set(parsed.hari, slot);
  }

  const history: FacilRow[] = [];
  const haris = Array.from(logsByHari.keys()).sort((a, b) => a - b);
  for (const hari of haris) {
    const slot = logsByHari.get(hari)!;
    const chosen = slot.log2 ?? slot.log1;
    if (chosen) history.push(chosen);
  }

  return { history, logsByHari };
}

// --- "Hari ke-" hari ini (tab "Check Point" di master spreadsheet) --------

/**
 * DIKONFIRMASI 2026-07-16: tab "Check Point" ada di spreadsheet MASTER
 * (bukan spreadsheet terpisah), kolom persis sama dengan v1 - "No",
 * "Tanggal", "Hari ke-", "Checkpoints" - dan 14 baris checkpoint-nya (nama +
 * "Hari ke-") cocok PERSIS dengan yang dipakai di
 * packages/core/knowledge/checkpoints.ts.
 *
 * Dipakai lewat Google Visualization API (`/gviz/tq?sheet=NAMA`) yang bisa
 * fetch tab BERDASARKAN NAMA, bukan gid - lebih tahan banting daripada pola
 * gid v1 (SHEET_CHECKPOINT_GID) karena tidak perlu tahu angka gid sama
 * sekali, cukup nama tab-nya (yang sudah dikonfirmasi persis "Check Point"). */
function checkpointSheetUrl(): string | null {
  const base = process.env.CONTROLLER_SHEET_URL;
  if (!base) return null;
  const idMatch = base.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) return null;
  const params = new URLSearchParams({ tqx: "out:csv", sheet: "Check Point" });
  return `https://docs.google.com/spreadsheets/d/${idMatch[1]}/gviz/tq?${params.toString()}`;
}

const INDO_MONTHS: Record<string, number> = {
  januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5,
  juli: 6, agustus: 7, september: 8, oktober: 9, november: 10, desember: 11,
};

function parseIndoDate(text: string): Date | null {
  const match = text.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!match) return null;
  const month = INDO_MONTHS[match[2].toLowerCase()];
  if (month == null) return null;
  return new Date(parseInt(match[3], 10), month, parseInt(match[1], 10));
}

export interface CheckpointScheduleEntry {
  no: number;
  hari: number;
  checkpoint: string;
  tanggal: Date | null;
}

/** Fetches tab "Check Point" dari spreadsheet master. Mengembalikan []
 * kalau CONTROLLER_SHEET_URL belum diset, ATAU fetch-nya gagal (mis. sheet
 * belum di-share publik) - getTodayHari() di bawah otomatis fallback ke
 * jangkar tetap di kedua kasus itu, sama seperti v1. */
export async function getCheckpointSchedule(): Promise<CheckpointScheduleEntry[]> {
  const url = checkpointSheetUrl();
  if (!url) return [];
  let res: Response;
  try {
    res = await fetch(url, { next: { revalidate: 300 } });
  } catch {
    return [];
  }
  if (!res.ok) return [];
  const csv = await res.text();
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  return parsed.data
    .filter((r) => (r["Checkpoints"] ?? "").trim() !== "")
    .map((r) => ({
      no: parseInt(r["No"], 10),
      hari: parseInt(r["Hari ke-"], 10),
      checkpoint: (r["Checkpoints"] ?? "").trim(),
      tanggal: parseIndoDate(r["Tanggal"] ?? ""),
    }));
}

/** Jangkar tetap - dipakai selama tab "Check Point" belum bisa diambil
 * (CONTROLLER_CHECKPOINT_GID belum diisi, atau sheet belum publik). Bisa
 * digeser lewat CYCLE_ANCHOR_HARI/CYCLE_ANCHOR_DATE di .env.local. */
const FALLBACK_ANCHOR_HARI = parseInt(process.env.CYCLE_ANCHOR_HARI || "1", 10);
const FALLBACK_ANCHOR_DATE = process.env.CYCLE_ANCHOR_DATE ? new Date(process.env.CYCLE_ANCHOR_DATE) : new Date(2026, 6, 6);
const FALLBACK_ANCHOR = { hari: FALLBACK_ANCHOR_HARI, tanggal: FALLBACK_ANCHOR_DATE };

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Menentukan "Hari ke-" untuk tanggal tertentu (default hari ini), berdasar
 * jadwal di tab "Check Point" kalau tersedia, dengan fallback ke
 * FALLBACK_ANCHOR kalau tidak. Hasil di-clamp ke rentang siklus 1-14 - pola
 * identik v1 (lib/sheet.ts), cuma sumbernya sekarang master spreadsheet. */
export async function getTodayHari(referenceDate: Date = new Date()): Promise<number> {
  const schedule = await getCheckpointSchedule();
  const anchorEntry = schedule.find((e) => e.tanggal != null);
  const anchor = anchorEntry?.tanggal ? { hari: anchorEntry.hari, tanggal: anchorEntry.tanggal } : FALLBACK_ANCHOR;

  const base = new Date(anchor.tanggal);
  base.setDate(base.getDate() - (anchor.hari - 1));
  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((stripTime(referenceDate).getTime() - stripTime(base).getTime()) / msPerDay);
  return Math.min(14, Math.max(1, diffDays + 1));
}
