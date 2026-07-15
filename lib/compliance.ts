import { activeCheckpoints, CHECKPOINT_GROUPS } from "./knowledge/checkpoints";
import type { CheckpointGroup, CheckpointIndicator } from "./knowledge/checkpoints";
import { KEY_TO_HEADER } from "./columns";
import { LK_APLIKASI_PAIRS, MISMATCH_THRESHOLD } from "./anomalies";
import type { CheckpointSourceData, FacilRow } from "./types";

export type IndicatorStatus = "ok" | "violation" | "unknown";

/** Nilai pembanding dari sisi lain (LK <-> Aplikasi) untuk indikator yang
 * punya pasangan sungguhan di LK_APLIKASI_PAIRS - dipakai supaya panel tidak
 * cuma menampilkan satu sisi (mis. Aplikasi) padahal versi LK-nya juga ada. */
export interface IndicatorCounterpart {
  kolom: keyof FacilRow;
  label: string;
  value: number | null;
  selisih: number | null;
  konsisten: boolean;
}

export interface IndicatorCompliance {
  kolom: keyof FacilRow;
  label: string;
  status: IndicatorStatus;
  detail: string;
  sumberData: CheckpointSourceData;
  /** true kalau indikator ini penggerak status checkpoint (bobot > 0). */
  gating: boolean;
  /** Kenapa nilai "ok" mentah di sheet didowngrade jadi "unknown" (kalau ada). */
  note?: string;
  counterpart?: IndicatorCounterpart;
}

export interface CheckpointCompliance {
  group: CheckpointGroup;
  status: "sesuai" | "belum-sesuai" | "unknown";
  indicators: IndicatorCompliance[];
  /** Catatan "Kendala ..." dari Hasil LK terkait checkpoint ini - konteks kualitatif sisi LK,
   * ditampilkan juga untuk checkpoint yang status Sesuai/Belum Sesuai-nya cuma bersumber Aplikasi,
   * supaya jelas kalau memang sumber datanya beda (bukan LK "bilang aman" - LK-nya cuma belum
   * punya catatan apapun untuk checkpoint ini). `text: null` = kolom kendalanya kosong total.
   * `isIssue` = kendala ini genuinely melaporkan masalah dari hasil wawancara ke sekolah (bukan
   * placeholder "belum diisi", dan bukan juga konfirmasi eksplisit "tidak ada kendala"/kosong -
   * keduanya BUKAN laporan masalah) - dipakai sebagai status LK tersirat: ada kendala berarti
   * sisi LK-nya "Belum", tanpa perlu kolom status LK terpisah. */
  kendala?: { label: string; text: string | null; isIssue: boolean };
  /** true kalau Aplikasi bilang "sesuai" (tidak ada gating indicator yang violation/unknown) tapi
   * hasil wawancara LK ke sekolah (kolom Kendala) justru melaporkan masalah nyata - dua sumber data
   * independen bertentangan, jadi status di atas didowngrade dari "sesuai" ke "unknown" alih-alih
   * dipercaya begitu saja. Ini menangkap kasus fasilitator asal isi Aplikasi padahal sekolah
   * mengaku masih ada kendala saat diwawancara. */
  kendalaMismatch?: boolean;
}

/** Kolom -> pasangannya di sisi lain (LK Fasil <-> Aplikasi Revit), dibangun
 * dari LK_APLIKASI_PAIRS supaya konsisten dengan anomaly detection. */
const COUNTERPART_MAP = new Map<keyof FacilRow, { kolom: keyof FacilRow; label: string }>();
for (const pair of LK_APLIKASI_PAIRS) {
  COUNTERPART_MAP.set(pair.lk, { kolom: pair.aplikasi, label: pair.label });
  COUNTERPART_MAP.set(pair.aplikasi, { kolom: pair.lk, label: pair.label });
}

function attachCounterpart(base: IndicatorCompliance, row: FacilRow): IndicatorCompliance {
  const counterpart = COUNTERPART_MAP.get(base.kolom);
  if (!counterpart) return base;
  const counterpartRaw = row[counterpart.kolom];
  const rawVal = row[base.kolom];
  const value = typeof counterpartRaw === "number" ? counterpartRaw : null;
  const rawNum = typeof rawVal === "number" ? rawVal : null;
  const selisih = value != null && rawNum != null ? Math.abs(value - rawNum) : null;
  return {
    ...base,
    counterpart: {
      kolom: counterpart.kolom,
      label: KEY_TO_HEADER[counterpart.kolom] ?? String(counterpart.kolom),
      value,
      selisih,
      konsisten: selisih != null ? selisih < MISMATCH_THRESHOLD : true,
    },
  };
}

/**
 * Beberapa checkpoint "Kolom LK Admin" punya kolom "Kendala ..." yang paling
 * relevan untuk memverifikasi apakah nilai 0%/"Sudah"-nya kredibel atau cuma
 * artefak sheet (tidak ada data = default 0%, bukan #DIV/0!). Dipetakan per
 * nomor checkpoint, bukan per kolom individual, karena satu kendala kadang
 * menaungi beberapa indikator (mis. checkpoint 3 & 4 sama-sama pakai kendala
 * Panlak/Format). Diekspor supaya UI (mis. MilestoneTimeline) bisa telusuri
 * histori kolom Kendala yang sama untuk cari "sejak Hari berapa" tanpa
 * menduplikasi pemetaan ini.
 */
export const KENDALA_BY_CHECKPOINT: Partial<Record<number, keyof FacilRow>> = {
  1: "kendalaKomunikasi",
  3: "kendalaPanlakFormatTemplate",
  4: "kendalaPanlakFormatTemplate",
  5: "kendalaVerifikasiBiodata",
  6: "kendalaMendapatkanPerencana",
  7: "kendalaUpdateDapodik",
  8: "kendalaPenyusunanDokAdmin",
  9: "kendalaVerifikasiDokAdmin",
  11: "kendalaPenyusunanDokTeknis",
  12: "kendalaVerifikasiDokTeknis",
  14: "kendalaPenyepakatanRAB",
};

/** Kebalikan KENDALA_BY_CHECKPOINT: kolom Kendala -> hari paling awal
 * checkpoint terkait jatuh tempo (kalau kolomnya menaungi >1 checkpoint,
 * mis. Panlak/Format Template di checkpoint 3 & 4, dipakai yang PALING
 * AWAL). Diekspor untuk dipakai UI (FacilitatorAnalysisWorkbench) supaya
 * kolom Kendala yang masih kosong SEBELUM checkpoint terkait jatuh tempo
 * tidak disalahartikan sebagai "belum diisi padahal harusnya sudah" - itu
 * memang belum relevan sama sekali, beda dari kosong SETELAH jatuh tempo
 * (yang juga bukan otomatis masalah - kosong = tidak ada kendala/aman;
 * yang jadi sinyal masalah adalah kalau selnya literal "Belum Diisi"). */
export const KENDALA_ACTIVE_FROM_DAY: Partial<Record<keyof FacilRow, number>> = (() => {
  const result: Partial<Record<keyof FacilRow, number>> = {};
  for (const group of CHECKPOINT_GROUPS) {
    const kendalaKey = KENDALA_BY_CHECKPOINT[group.no];
    if (!kendalaKey) continue;
    const existing = result[kendalaKey];
    if (existing === undefined || group.activeFromDay < existing) result[kendalaKey] = group.activeFromDay;
  }
  return result;
})();

/** Frasa yang menandakan admin/fasilitator sendiri bilang datanya belum diisi -
 * ditemukan langsung di kasus nyata: "Panlak belum diisi, Format/Template
 * dokumen belum diisi" pada fasilitator yang % masalahnya kebaca 0.00%.
 * Sengaja TIDAK menyertakan kata "kosong" berdiri sendiri - itu juga jawaban
 * valid untuk "tidak ada kendala" (mis. fasilitator menulis "Kosong" sebagai
 * jawaban kolom Kendala), bukan berarti kolomnya belum sungguh diisi. Sentinel
 * pasti untuk "belum diisi" di sheet ini adalah string "Belum Diisi" (lihat
 * lib/notes.ts, lib/anomalies.ts, lib/prompts.ts). */
const BELUM_DIISI_PATTERN = /belum\s*(di\s*)?isi|belum\s+mengisi|belum\s+ada\s+data/i;

/** Checkpoint 3 (Panlak) & 4 (Format/Template) berbagi SATU kolom Kendala
 * ("Kendala Memiliki Panlak/Format/Template Dokumen") yang bisa melaporkan
 * kedua sub-item sekaligus dalam satu kalimat gabungan, mis. "Panlak belum
 * diisi, Format/Template dokumen belum diisi". BELUM_DIISI_PATTERN saja tidak
 * cukup dipakai apa adanya di sini - itu bakal bikin checkpoint 3 ikut
 * didistrust hanya karena KLAUSA Format/Template-nya yang belum diisi
 * (padahal Panlak-nya sendiri sudah), atau sebaliknya. Dicocokkan per-klausa
 * (dipisah koma/titik/titik koma) + kata kunci sub-item supaya distrust cuma
 * berlaku untuk sub-item yang benar-benar disebut belum diisi. */
const KENDALA_SUBITEM_KEYWORD: Partial<Record<number, RegExp>> = {
  3: /panlak/i,
  4: /format\s*\/?\s*template/i,
};

function kendalaMatchesForCheckpoint(kendalaVal: string, checkpointNo: number): boolean {
  const subitemKeyword = KENDALA_SUBITEM_KEYWORD[checkpointNo];
  if (!subitemKeyword) return BELUM_DIISI_PATTERN.test(kendalaVal);
  return kendalaVal.split(/[,;.]/).some((clause) => subitemKeyword.test(clause) && BELUM_DIISI_PATTERN.test(clause));
}

/** Frasa yang secara eksplisit menyatakan TIDAK ADA kendala (beda dari kolom
 * yang belum diisi sama sekali) - dipakai supaya kolom Kendala yang isinya
 * cuma konfirmasi "aman" (mis. "Tidak ada kendala", "Kosong", "-", "Nihil")
 * tidak ikut dianggap sebagai laporan masalah nyata di `isIssue` (lihat
 * getCheckpointCompliance). Match seluruh isi kolom (bukan substring) supaya
 * tidak salah tangkap kalimat panjang yang kebetulan diawali "Tidak ada". */
const TIDAK_ADA_KENDALA_PATTERN = /^((tidak|tdk)\s*ada(\s+(kendala|masalah|hambatan))?|nihil|aman|kosong|-|n\/?a)\.?$/i;

export type KendalaTextState = "kosong" | "belum-diisi" | "tidak-ada-kendala" | "ada-kendala";

/** Mengklasifikasi ISI MENTAH satu sel kolom Kendala (bukan status checkpoint)
 * jadi 4 kemungkinan: kosong total, placeholder "Belum Diisi", konfirmasi
 * eksplisit "tidak ada kendala/aman", atau genuinely melaporkan masalah.
 * Dipakai bareng oleh getCheckpointCompliance (isIssue) dan UI
 * (FacilitatorAnalysisWorkbench) supaya definisi "ini laporan masalah beneran
 * atau bukan" satu sumber, tidak dua regex yang bisa drift. */
export function classifyKendalaText(text: string): KendalaTextState {
  const trimmed = text.trim();
  if (trimmed === "") return "kosong";
  if (BELUM_DIISI_PATTERN.test(trimmed)) return "belum-diisi";
  if (TIDAK_ADA_KENDALA_PATTERN.test(trimmed)) return "tidak-ada-kendala";
  return "ada-kendala";
}

/** Kolom "Hasil LK" yang punya versi pembanding "Aplikasi" - kalau keduanya
 * bertolak belakang jauh, versi LK-nya patut dicurigai, bukan otomatis dipakai. */
const APLIKASI_COUNTERPART: Partial<Record<keyof FacilRow, keyof FacilRow>> = {
  pctTidakPunyaPerencanaLK: "pctTidakPunyaPerencanaAplikasi",
};

/**
 * Menilai apakah nilai "ok" (0% masalah / "Sudah") dari sebuah indikator
 * ber-sumber "LK Fasil" layak dipercaya. Sengaja TIDAK hanya mengandalkan
 * "Fasil Belum Login LK" - ada tiga sinyal yang dicek, urut dari yang paling kuat:
 * 1) kalau indikator ini punya versi "Aplikasi" pembanding (APLIKASI_COUNTERPART)
 *    dan nilainya numerik: selisih jauh (>= MISMATCH_THRESHOLD) jadi sinyal
 *    distrust tersendiri, TAPI kalau konsisten DAN sama-sama menunjukkan status
 *    "ok" itu sudah konfirmasi independen (Aplikasi bukan laporan mandiri
 *    fasilitator, lihat catatan bawah) - langsung dipercaya, tidak perlu lolos
 *    dua sinyal di bawah lagi.
 * 2) fasilitator belum login LK sama sekali (indikasi paling kasar/menyeluruh)
 * 3) kolom "Kendala ..." terkait secara eksplisit menyebut "belum diisi"
 *    (menangkap kasus fasilitator SUDAH login tapi bagian ini belum ia isi -
 *    jawaban "tidak ada kendala"/"kosong" TIDAK termasuk di sini, itu jawaban
 *    valid soal tidak ada masalah, bukan tanda kolom belum diisi). Untuk
 *    checkpoint yang kolom Kendala-nya menaungi beberapa sub-item sekaligus
 *    (checkpoint 3 & 4, lihat KENDALA_SUBITEM_KEYWORD), dicocokkan per-klausa
 *    supaya distrust cuma kena ke sub-item yang benar-benar disebut belum
 *    diisi, bukan ke keduanya cuma karena salah satunya belum diisi.
 * Kolom ber-sumber "Aplikasi Revit" tidak melalui pengecekan ini karena datanya
 * langsung dari aplikasi, bukan laporan mandiri fasilitator.
 */
function trustLkOkValue(row: FacilRow, group: CheckpointGroup, ind: CheckpointIndicator): string | null {
  const counterpartKey = APLIKASI_COUNTERPART[ind.kolom];
  if (counterpartKey) {
    const counterpartVal = row[counterpartKey];
    const rawVal = row[ind.kolom];
    if (typeof counterpartVal === "number" && typeof rawVal === "number") {
      const selisih = Math.abs(counterpartVal - rawVal);
      if (selisih >= MISMATCH_THRESHOLD) {
        const label = KEY_TO_HEADER[counterpartKey] ?? String(counterpartKey);
        return `Tidak konsisten dengan "${label}" yang menunjukkan ${counterpartVal}% - versi Hasil LK dan Aplikasi berselisih jauh.`;
      }
      const target = ind.polarity === "higherIsBetter" ? 100 : 0;
      if (counterpartVal === target) {
        return null;
      }
    }
  }

  if (row.fasilBelumLoginLK === "Belum") {
    return "Fasilitator belum login LK sama sekali, jadi kolom ini kemungkinan besar belum sungguh-sungguh terisi (0% bisa jadi default sheet, bukan hasil verifikasi).";
  }

  const kendalaKey = KENDALA_BY_CHECKPOINT[group.no];
  if (kendalaKey) {
    const kendalaVal = row[kendalaKey];
    if (typeof kendalaVal === "string" && kendalaMatchesForCheckpoint(kendalaVal, group.no)) {
      const label = KEY_TO_HEADER[kendalaKey] ?? String(kendalaKey);
      return `Catatan "${label}" menyebutkan ini belum diisi: "${kendalaVal}".`;
    }
  }

  return null;
}

function evaluateIndicator(row: FacilRow, group: CheckpointGroup, ind: CheckpointIndicator): IndicatorCompliance {
  const label = KEY_TO_HEADER[ind.kolom] ?? String(ind.kolom);
  const raw = row[ind.kolom];
  const sumberData = ind.sumberData;
  const gating = ind.bobot > 0;

  let status: IndicatorStatus;
  let detail: string;
  let note: string | undefined;

  if (ind.kolom === "fasilBelumLoginLK") {
    if (raw !== "Sudah" && raw !== "Belum") {
      status = "unknown";
      detail = "-";
    } else {
      status = raw === "Sudah" ? "ok" : "violation";
      detail = raw;
    }
  } else if (typeof raw !== "number") {
    status = "unknown";
    detail = "-";
  } else {
    const target = ind.polarity === "higherIsBetter" ? 100 : 0;
    const looksOk = raw === target;
    detail = `${raw}%`;
    status = looksOk ? "ok" : "violation";

    if (looksOk && sumberData === "LK Fasil") {
      const distrustReason = trustLkOkValue(row, group, ind);
      if (distrustReason) {
        status = "unknown";
        note = distrustReason;
      }
    }
  }

  return attachCounterpart({ kolom: ind.kolom, label, status, detail, note, sumberData, gating }, row);
}

/**
 * Mengecek, untuk checkpoint-checkpoint yang sudah jatuh tempo pada `todayHari`,
 * apakah indikator penggeraknya (bobot > 0) sudah sepenuhnya terpenuhi. Karena
 * kolom angka di sheet ternyata tidak berubah antar hari (lihat catatan di
 * lib/sheet.ts), ini membandingkan kondisi TERKINI fasilitator terhadap
 * checkpoint yang seharusnya sudah selesai per hari ini - bukan tren historis.
 *
 * Indikator ber-sumber LK Fasil yang tampak "ok" (0%) tapi tidak lolos
 * trustLkOkValue() didowngrade jadi "unknown" - mencegah nilai 0% yang
 * sebenarnya cuma artefak "belum ada data" terbaca sebagai kepatuhan asli.
 */
export function getCheckpointCompliance(row: FacilRow, todayHari: number): CheckpointCompliance[] {
  return activeCheckpoints(todayHari).map((group) => {
    const indicators = group.indicators.map((ind) => evaluateIndicator(row, group, ind));
    const gating = indicators.filter((i) => i.gating);
    const hasViolation = gating.some((i) => i.status === "violation");
    const hasUnknown = gating.some((i) => i.status === "unknown");
    let status: CheckpointCompliance["status"] = hasViolation ? "belum-sesuai" : hasUnknown ? "unknown" : "sesuai";

    const kendalaKey = KENDALA_BY_CHECKPOINT[group.no];
    const kendalaVal = kendalaKey ? row[kendalaKey] : null;
    const kendalaTextRaw = typeof kendalaVal === "string" ? kendalaVal.trim() : "";
    // Selalu buat objek kendala (bukan undefined) kalau checkpoint ini punya
    // pemetaan kolom Kendala - supaya sisi LK SELALU eksplisit ditampilkan,
    // termasuk saat kolomnya kosong total. Checkpoint yang drivernya Aplikasi
    // (mis. Biodata) sebelumnya "diam" soal LK kalau kolomnya kosong, bikin
    // kesan cuma ada 1 sumber data padahal LK memang belum ada catatan sama
    // sekali untuk ini (beda dari "LK bilang aman").
    const kendala = kendalaKey
      ? {
          label: KEY_TO_HEADER[kendalaKey] ?? String(kendalaKey),
          text: kendalaTextRaw === "" ? null : kendalaTextRaw,
          isIssue: classifyKendalaText(kendalaTextRaw) === "ada-kendala",
        }
      : undefined;

    let kendalaMismatch = false;
    if (status === "sesuai" && kendala?.isIssue) {
      status = "unknown";
      kendalaMismatch = true;
    }

    return { group, status, indicators, kendala, kendalaMismatch };
  });
}

export function countNonCompliant(compliance: CheckpointCompliance[]): number {
  return compliance.filter((c) => c.status === "belum-sesuai").length;
}
