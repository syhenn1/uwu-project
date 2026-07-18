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

export const ADMIN_EMAIL_MAP: Record<string, string> = {
  "jakiuuzan19@gmail.com": "Muhammad Dzaky Fauzan",
  "marvinugraha@gmail.com": "Marvin Raditya Nugraha",
  "rifatsyahman@gmail.com": "Mochamad Rifat Syahman Hambali",
  "zamaqsa99@gmail.com": "Aqsa Zamzami",
  "yasmeenalmira9@gmail.com": "Yasmeen Almira",
  "adziimamulkan@gmail.com": "Muhammad Mulkan Adziima",
  "isalrahman23@gmail.com": "Faisal Rahman",
  "kalicabungaaa@gmail.com": "Kalica Bunga Serlinda",
  "maulidinaalyssa@gmail.com": "Alyssa Maulidina",
  "rifka.adzanti@gmail.com": "Rifka Adzanti",
  "mahmudahaliffatonah@gmail.com": "Mahmudah Alif Fatonah",
  "rizkiakbar1133@gmail.com": "Muhammad Rizky Akbar",
  "landewodewo2@gmail.com": "Muhamad Insan Landewo",
};
