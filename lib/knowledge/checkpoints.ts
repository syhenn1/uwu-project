import type { CheckpointSourceData, FacilRow } from "../types";

export interface CheckpointIndicator {
  kolom: keyof FacilRow;
  definisi: string;
  sumberData: CheckpointSourceData;
  bobot: number;
  /** "higherIsWorse" (default) untuk kolom "% masalah" - semakin tinggi semakin
   * berisiko. "higherIsBetter" untuk kolom seperti "% Sekolah dengan Dok. ...
   * Terunggah 100% (Lengkap)" yang mengukur kelengkapan - semakin tinggi semakin
   * baik, jadi kontribusi risikonya dibalik (100 - nilai) saat dihitung. */
  polarity?: "higherIsWorse" | "higherIsBetter";
}

export interface CheckpointGroup {
  no: number;
  name: string;
  /** "Hari ke-" mulai checkpoint ini relevan/berlaku (gating progresif siklus 14 hari). */
  activeFromDay: number;
  bobotTotal: number;
  tujuan: string;
  indicators: CheckpointIndicator[];
}

/** Panjang siklus pendampingan penuh - dipakai sebagai `hari` "tak terbatas"
 * supaya activeCheckpoints() mengembalikan SEMUA checkpoint (mis. untuk
 * tampilan "Keseluruhan" yang sengaja tidak digating per hari tertentu). */
export const TOTAL_HARI_SIKLUS = 14;

/**
 * Encodes the two base-knowledge tables the program owner maintains in the
 * spreadsheet: (1) per-column definitions/sumber data/tujuan, and (2) the
 * checkpoint -> hari-ke -> bobot risiko -> indikator grouping used to compute
 * "Nilai Risiko". Groups No.9-12 (Dokumen Admin Terverifikasi/Sesuai, Dokumen
 * Teknis Terunggah/Terverifikasi) were not fully spelled out in the source
 * table but use the same "Hari Ke" values given in table 1.
 *
 * Checkpoint No.8-13 ("Dokumen ..." terunggah/terverifikasi/sesuai) each used
 * to carry 4 indicators (% Sekolah 100%, Rata-rata, Min, % Sekolah < 90%) with
 * only Min+<90% (bobot 4+5) gating the status. Per keputusan admin program,
 * Min/Rata-rata/<90% dianggap tidak perlu - checkpoint ini sekarang cuma
 * dipatok ke satu indikator "% Sekolah dengan Dok. ... 100%/Terverifikasi/
 * Sesuai", yang mengambil alih seluruh bobot (9) sebagai gating.
 */
export const CHECKPOINT_GROUPS: CheckpointGroup[] = [
  {
    no: 1,
    name: "Sudah dihubungi",
    activeFromDay: 2,
    bobotTotal: 9,
    tujuan: "Mengidentifikasi fasil yang sama sekali belum mulai mengisi LK atau belum menghubungi sekolah, dan menganalisis potensi penyebab tidak tercapainya target checkpoint setelahnya.",
    indicators: [
      { kolom: "fasilBelumLoginLK", definisi: 'Yang belum ada Nama Fasilnya. Pilih Nama Fasilitator = Blank', sumberData: "LK Fasil", bobot: 3 },
      { kolom: "pctSekolahBelumDihubungi", definisi: "Pilih A.1 Status Komunikasi = Blank atau Belum", sumberData: "LK Fasil", bobot: 3 },
      { kolom: "frekuensiKomunikasi", definisi: 'Jumlah kolom "Keperluan" yang belum terisi. A.3 Keperluan = Blank. Dihitung setiap hari.', sumberData: "LK Fasil", bobot: 3 },
    ],
  },
  {
    no: 2,
    name: "Sudah login",
    activeFromDay: 2,
    bobotTotal: 5,
    tujuan: "Menganalisis potensi penyebab tidak tercapainya target terkait biodata, upload bukti update dapodik, dan unggah dokumen.",
    indicators: [
      { kolom: "pctSekolahBelumLoginAplikasi", definisi: "S2 di Aplikasi (terhadap Semesta)", sumberData: "Aplikasi Revit", bobot: 5 },
    ],
  },
  {
    no: 3,
    name: "Panlak ada",
    activeFromDay: 2,
    bobotTotal: 4,
    tujuan: "Menganalisis potensi penyebab tidak tercapainya target checkpoint dokumen yang terunggah.",
    indicators: [
      { kolom: "pctTidakPunyaPanlak", definisi: "B.1 Panduan Pelaksanaan (Panlak) = Tidak Memiliki", sumberData: "LK Fasil", bobot: 4 },
    ],
  },
  {
    no: 4,
    name: "Format/template ada",
    activeFromDay: 2,
    bobotTotal: 3,
    tujuan: "Menganalisis potensi penyebab tidak tercapainya target checkpoint dokumen yang terunggah.",
    indicators: [
      { kolom: "pctTidakPunyaFormatTemplate", definisi: "B.2 Format/Template Dokumen = Tidak Memiliki", sumberData: "LK Fasil", bobot: 3 },
    ],
  },
  {
    no: 5,
    name: "Biodata terverifikasi",
    activeFromDay: 3,
    bobotTotal: 5,
    tujuan: "Mengidentifikasi sekolah yang biodatanya belum siap untuk PKS.",
    indicators: [
      { kolom: "pctBiodataBelumTerverifikasi", definisi: "S4 di Aplikasi (terhadap Semesta)", sumberData: "Aplikasi Revit", bobot: 5 },
    ],
  },
  {
    no: 6,
    name: "Perencana ada",
    activeFromDay: 4,
    bobotTotal: 10,
    tujuan: "Menganalisis potensi penyebab tidak tercapainya target checkpoint dokumen yang terunggah teknis.",
    indicators: [
      { kolom: "pctTidakPunyaPerencanaLK", definisi: "C.1 Perencana = Tidak Memiliki", sumberData: "LK Fasil", bobot: 10 },
      {
        kolom: "pctTidakPunyaPerencanaAplikasi",
        definisi: "Versi Aplikasi dari indikator ketersediaan perencana - dibandingkan dengan Hasil LK untuk cek konsistensi pelaporan fasilitator.",
        sumberData: "Aplikasi Revit",
        bobot: 0,
      },
    ],
  },
  {
    no: 7,
    name: "Dapodik sesuai kebutuhan",
    activeFromDay: 4,
    bobotTotal: 5,
    tujuan: "Mengidentifikasi sekolah belum siap menyusun RAB usulan, dan menganalisis potensi penyebab tidak tercapainya target checkpoint dokumen yang terunggah teknis.",
    indicators: [
      { kolom: "pctDapodikTidakSesuaiBelumUpdate", definisi: "F.1 Kesesuaian Dapodik dengan Lapangan = Belum & F.3 Status Update Dapodik (hanya ketika Belum Sesuai Kebutuhan) = Belum", sumberData: "LK Fasil", bobot: 5 },
      { kolom: "pctSudahUpdateDapodik", definisi: "Sekolah yang sudah update Dapodik sesuai kebutuhan lapangan.", sumberData: "LK Fasil", bobot: 0, polarity: "higherIsBetter" },
      { kolom: "pctSudahUploadBuktiUpdateDapodik", definisi: "Sekolah yang sudah upload bukti update Dapodik.", sumberData: "LK Fasil", bobot: 0, polarity: "higherIsBetter" },
    ],
  },
  {
    no: 8,
    name: "Dokumen admin terunggah",
    activeFromDay: 4,
    bobotTotal: 9,
    tujuan: "Memberi peringatan waspada ketika ada sekolah yang dokumen admin terunggahnya di bawah 80%, dan gambaran perlunya pembinaan fasilitator terkait percepatan unggah dokumen oleh sekolah.",
    indicators: [
      { kolom: "pctDokAdminTerunggahLengkap", definisi: "% sekolah dengan dokumen admin terunggah 100% (lengkap).", sumberData: "Aplikasi Revit", bobot: 9, polarity: "higherIsBetter" },
    ],
  },
  {
    no: 9,
    name: "Dokumen admin terverifikasi",
    activeFromDay: 5,
    bobotTotal: 9,
    tujuan: "Memberi alert bahwa ada sekolah yang masih banyak dokumen adminnya belum diverifikasi, dan gambaran perlunya pembinaan fasilitator untuk segera memverifikasi dokumen.",
    indicators: [
      { kolom: "pctDokAdminTerverifikasi", definisi: "% sekolah dengan dokumen admin terverifikasi.", sumberData: "Aplikasi Revit", bobot: 9, polarity: "higherIsBetter" },
    ],
  },
  {
    no: 10,
    name: "Dokumen admin sesuai",
    activeFromDay: 7,
    bobotTotal: 9,
    tujuan: "Memberi peringatan waspada ketika ada sekolah yang dokumen admin sesuainya di bawah 80%, dan gambaran perlunya pembinaan fasilitator terkait peningkatan kualitas pendampingan dan percepatan verifikasi.",
    indicators: [
      { kolom: "pctDokAdminSesuai", definisi: "% sekolah dengan dokumen admin sesuai.", sumberData: "Aplikasi Revit", bobot: 9, polarity: "higherIsBetter" },
    ],
  },
  {
    no: 11,
    name: "Dokumen teknis terunggah",
    activeFromDay: 7,
    bobotTotal: 9,
    tujuan: "Memberi peringatan waspada ketika ada sekolah yang dokumen teknis terunggahnya di bawah 80%, dan gambaran perlunya pembinaan fasilitator terkait percepatan unggah dokumen oleh sekolah.",
    indicators: [
      { kolom: "pctDokTeknisTerunggahLengkap", definisi: "% sekolah dengan dokumen teknis terunggah 100% (lengkap).", sumberData: "Aplikasi Revit", bobot: 9, polarity: "higherIsBetter" },
    ],
  },
  {
    no: 12,
    name: "Dokumen teknis terverifikasi",
    activeFromDay: 8,
    bobotTotal: 9,
    tujuan: "Memberi alert bahwa ada sekolah yang masih banyak dokumen teknisnya belum diverifikasi, dan gambaran perlunya pembinaan fasilitator untuk segera memverifikasi dokumen.",
    indicators: [
      { kolom: "pctDokTeknisTerverifikasi", definisi: "% sekolah dengan dokumen teknis terverifikasi.", sumberData: "Aplikasi Revit", bobot: 9, polarity: "higherIsBetter" },
    ],
  },
  {
    no: 13,
    name: "Dokumen teknis sesuai",
    activeFromDay: 10,
    bobotTotal: 9,
    tujuan: "Memberi peringatan waspada ketika ada sekolah yang dokumen teknis sesuainya di bawah 80%, dan gambaran perlunya pembinaan fasilitator terkait peningkatan kualitas pendampingan dan percepatan verifikasi.",
    indicators: [
      { kolom: "pctDokTeknisSesuai", definisi: "% sekolah dengan dokumen teknis sesuai.", sumberData: "Aplikasi Revit", bobot: 9, polarity: "higherIsBetter" },
    ],
  },
  {
    no: 14,
    name: "RAB sepakat",
    activeFromDay: 12,
    bobotTotal: 5,
    tujuan: "Memantau kesepakatan RAB usulan antara sekolah dan fasilitator menjelang akhir siklus pendampingan.",
    indicators: [
      { kolom: "pctBelumSepakatRAB", definisi: "R4 di Aplikasi", sumberData: "Aplikasi Revit", bobot: 5 },
    ],
  },
];

/** Non-checkpoint columns (identitas & catatan kualitatif) - dipakai supaya
 * InfoTooltip & prompt LLM tetap punya penjelasan untuk semua kolom. */
export const DESCRIPTIVE_COLUMNS: Partial<Record<keyof FacilRow, string>> = {
  atmin: "Admin/PIC yang bertanggung jawab memantau fasilitator ini.",
  hariLabel: "Hari ke berapa dalam siklus pendampingan 14 hari.",
  kodeFasil: "Kode unik fasilitator.",
  namaFasil: "Nama fasilitator.",
  kodeKoor: "Kode unik koordinator yang membawahi fasilitator ini.",
  namaKoor: "Nama koordinator yang membawahi fasilitator ini.",
  penyusunanDokAdminTerkendala: "Catatan hasil LK terkait kendala penyusunan dokumen admin.",
  penyusunanDokTeknisTerkendala: "Catatan hasil LK terkait kendala penyusunan dokumen teknis.",
  kendalaKomunikasi: "Penjelasan bebas dari fasilitator/admin soal kendala komunikasi dengan sekolah.",
  kendalaPanlakFormatTemplate: "Penjelasan bebas soal kendala memiliki Panlak/format/template dokumen.",
  kendalaMendapatkanPerencana: "Penjelasan bebas soal kendala mendapatkan perencana.",
  kendalaVerifikasiBiodata: "Penjelasan bebas soal kendala verifikasi biodata oleh fasilitator.",
  kendalaUpdateDapodik: "Penjelasan bebas soal kendala update Dapodik.",
  kendalaPenyusunanDokAdmin: "Penjelasan bebas soal kendala penyusunan dokumen admin.",
  kendalaVerifikasiDokAdmin: "Penjelasan bebas soal kendala verifikasi dokumen admin oleh fasilitator.",
  kendalaPenyusunanDokTeknis: "Penjelasan bebas soal kendala penyusunan dokumen teknis.",
  kendalaVerifikasiDokTeknis: "Penjelasan bebas soal kendala verifikasi dokumen teknis oleh fasilitator.",
  kendalaPenyepakatanRAB: "Penjelasan bebas soal kendala penyepakatan RAB.",
  analisis: "Analisis kualitatif yang sudah ditulis manusia (admin) untuk hari ini - konteks tambahan yang harus dipertimbangkan, bukan diduplikasi.",
  catatanAdmin: "Catatan tambahan dari admin, termasuk klarifikasi atas data yang tampak ambigu.",
};

/** Semua checkpoint (nomor urut) yang sudah aktif/berlaku pada hari ke-N. */
export function activeCheckpoints(hari: number): CheckpointGroup[] {
  return CHECKPOINT_GROUPS.filter((c) => c.activeFromDay <= hari);
}

/** Cari definisi & bobot suatu kolom (jika ia bagian dari checkpoint). */
export function findIndicator(kolom: keyof FacilRow): { group: CheckpointGroup; indicator: CheckpointIndicator } | null {
  for (const group of CHECKPOINT_GROUPS) {
    const indicator = group.indicators.find((i) => i.kolom === kolom);
    if (indicator) return { group, indicator };
  }
  return null;
}

/** Ringkasan knowledge base dalam bentuk teks, dibatasi hanya checkpoint yang
 * sudah relevan pada hari tsb - dipakai sebagai konteks system prompt LLM.
 * `excludeAplikasi` = true membuang seluruh indikator ber-sumber "Aplikasi
 * Revit" (dan checkpoint yang jadi kosong total setelahnya) - dipakai saat
 * admin cuma mau analisis berbasis catatan Kendala/LK Fasil, tanpa persentase
 * dari Aplikasi (mis. Dokumen Admin/Teknis) ikut jadi bahan kesimpulan. */
export function buildKnowledgeSummary(uptoDay: number, excludeAplikasi = false): string {
  const lines: string[] = [];
  for (const group of activeCheckpoints(uptoDay)) {
    const indicators = excludeAplikasi ? group.indicators.filter((i) => i.sumberData !== "Aplikasi Revit") : group.indicators;
    if (indicators.length === 0) continue;
    lines.push(`- [${group.name}] (aktif sejak Hari ${group.activeFromDay}, bobot risiko total ${group.bobotTotal}) - Tujuan: ${group.tujuan}`);
    for (const ind of indicators) {
      const bobotNote = ind.bobot > 0 ? ` (bobot ${ind.bobot})` : "";
      lines.push(`    - ${ind.kolom}${bobotNote}: ${ind.definisi} [sumber: ${ind.sumberData ?? "-"}]`);
    }
  }
  const notYetActive = CHECKPOINT_GROUPS.filter((c) => c.activeFromDay > uptoDay);
  if (notYetActive.length > 0) {
    lines.push("");
    lines.push("Checkpoint yang BELUM relevan/berlaku pada hari ini (jangan jadikan red flag jika kosong):");
    for (const c of notYetActive) {
      lines.push(`- ${c.name} (baru aktif Hari ${c.activeFromDay})`);
    }
  }
  return lines.join("\n");
}
