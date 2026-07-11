export type CellValue = string | number | null;

export interface FacilRow {
  atmin: string;
  hari: number;
  hariLabel: string;
  kodeFasil: string;
  namaFasil: string;
  kodeKoor: string;
  namaKoor: string;

  fasilBelumLoginLK: CellValue;
  pctSekolahBelumDihubungi: CellValue;
  pctSekolahBelumLoginAplikasi: CellValue;
  frekuensiKomunikasi: CellValue;
  pctTidakPunyaPanlak: CellValue;
  pctTidakPunyaFormatTemplate: CellValue;
  pctBiodataBelumTerverifikasi: CellValue;
  pctTidakPunyaPerencanaLK: CellValue;
  pctTidakPunyaPerencanaAplikasi: CellValue;
  pctDapodikTidakSesuaiBelumUpdate: CellValue;
  pctSudahUpdateDapodik: CellValue;
  pctSudahUploadBuktiUpdateDapodik: CellValue;
  penyusunanDokAdminTerkendala: CellValue;
  pctDokAdminTerunggahLengkap: CellValue;
  rataDokAdminTerunggah: CellValue;
  minDokAdminTerunggah: CellValue;
  pctDokAdminTerunggahDibawah90: CellValue;
  pctDokAdminTerverifikasi: CellValue;
  rataDokAdminTerverifikasi: CellValue;
  minDokAdminTerverifikasi: CellValue;
  pctDokAdminTerverifikasiDibawah90: CellValue;
  pctDokAdminSesuai: CellValue;
  rataDokAdminSesuai: CellValue;
  minDokAdminSesuai: CellValue;
  pctDokAdminSesuaiDibawah90: CellValue;
  penyusunanDokTeknisTerkendala: CellValue;
  pctDokTeknisTerunggahLengkap: CellValue;
  rataDokTeknisTerunggah: CellValue;
  minDokTeknisTerunggah: CellValue;
  pctDokTeknisTerunggahDibawah90: CellValue;
  pctDokTeknisTerverifikasi: CellValue;
  rataDokTeknisTerverifikasi: CellValue;
  minDokTeknisTerverifikasi: CellValue;
  pctDokTeknisTerverifikasiDibawah90: CellValue;
  pctDokTeknisSesuai: CellValue;
  rataDokTeknisSesuai: CellValue;
  minDokTeknisSesuai: CellValue;
  pctDokTeknisSesuaiDibawah90: CellValue;
  pctBelumSepakatRAB: CellValue;
  nilaiRisiko: CellValue;

  kendalaKomunikasi: CellValue;
  kendalaPanlakFormatTemplate: CellValue;
  kendalaMendapatkanPerencana: CellValue;
  kendalaVerifikasiBiodata: CellValue;
  kendalaUpdateDapodik: CellValue;
  kendalaPenyusunanDokAdmin: CellValue;
  kendalaVerifikasiDokAdmin: CellValue;
  kendalaPenyusunanDokTeknis: CellValue;
  kendalaVerifikasiDokTeknis: CellValue;
  kendalaPenyepakatanRAB: CellValue;
  analisis: CellValue;
  catatanAdmin: CellValue;

  raw: Record<string, string>;
}

export interface FacilitatorSummary {
  kodeFasil: string;
  namaFasil: string;
  kodeKoor: string;
  namaKoor: string;
  atmin: string;
}

export type CheckpointSourceData = "LK Fasil" | "Aplikasi Revit" | null;

export interface CheckpointDef {
  checkpoint: string;
  activeFromDay: number;
  bobotRisiko: number;
  kolom: keyof FacilRow;
  definisi: string;
  sumberData: CheckpointSourceData;
  tujuan: string;
}
