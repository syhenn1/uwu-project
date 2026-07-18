import { getRosterEntries } from "./masterSheet";

/** Daftar nama Atmin unik untuk /pilih-admin - dari roster tab "Fasilitator"
 * di master spreadsheet (lib/masterSheet.ts::getRosterEntries, sumber yang
 * sama dipakai getFacilRows()/lib/sheet.ts) - [] kalau CONTROLLER_SHEET_URL
 * belum diset atau fetch-nya gagal (lihat pesan warning di masterSheet.ts). */
export async function getAdminList(): Promise<string[]> {
  const entries = await getRosterEntries();
  const set = new Set(entries.map((e) => e.atmin).filter(Boolean));
  return [...set].sort((a, b) => a.localeCompare(b, "id"));
}
