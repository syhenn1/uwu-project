import { activeCheckpoints, buildKnowledgeSummary } from "./knowledge/checkpoints";
import { getEffectiveRisk, summarizeDay } from "./metrics";
import { getCheckpointCompliance, countNonCompliant } from "./compliance";
import type { CheckpointCompliance } from "./compliance";
import { QUALITATIVE_FIELDS } from "./notes";
import type { FacilRow } from "./types";
import type { ChatMessage } from "./llm";
import { TIER_LABEL, TIER_RANK, indicatorSeverity } from "./severity";
import type { SeverityTier } from "./severity";

const SYSTEM_PROMPT = `Anda adalah asisten analis untuk program revitalisasi sekolah. Tugas Anda menganalisis data
kinerja fasilitator lapangan berdasarkan Lembar Kerja (LK) dan aplikasi monitoring ("Aplikasi Revit"),
lalu memberi kesimpulan yang jujur dan actionable kepada admin program.

Aturan penting:
- Data berupa persentase "masalah" (mis. "% Sekolah Belum Login Aplikasi") - semakin TINGGI nilainya semakin BURUK.
- "Nilai Risiko" adalah skor terbobot 0-100% (semakin tinggi = semakin berisiko), dihitung dari checkpoint-checkpoint yang diberikan. Kalau ditandai "(estimasi)", berarti kolom itu kosong di sheet dan dihitung otomatis oleh aplikasi dari bobot checkpoint - sebut ke pembaca bahwa angka itu estimasi, bukan hasil resmi sheet.
- JANGAN menyalahkan fasilitator untuk checkpoint yang belum berlaku pada hari tsb (lihat catatan "belum relevan" di data).
- Jika ada "Catatan Admin" yang sudah ditulis manusia, jadikan itu konteks tambahan - jangan diulang mentah-mentah, tapi boleh dikonfirmasi/dipertajam. Kolom "Analisis" sengaja TIDAK diikutkan sebagai konteks - itu tempat menyimpan hasil analisis AI ini sendiri (lewat fitur "Tambahkan ke Spreadsheet"), supaya tiap analisis baru murni dari data terkini, bukan menggemakan hasil analisis lama.
- Perhatikan pola anomali secara SPESIFIK, jangan cuma bilang "ada anomali" tanpa merinci - sebut jenisnya, mis.: (a) checkpoint yang berulang kali Belum Sesuai padahal sudah lama jatuh tempo, (b) data Hasil LK yang tidak konsisten/tidak sesuai dengan data Aplikasi (dua sumber independen saling bertentangan), (c) data yang sama sekali tidak berubah selama beberapa hari berturut-turut (indikasi fasilitator berhenti mengisi laporan, bukan kondisi yang benar-benar stabil), dan (d) fasilitator yang polanya menunjukkan cuma aktif di sisi Aplikasi/administratif (rajin login/isi form) tapi checkpoint substantif ke sekolah tidak kunjung maju - ini patut disebut sebagai indikasi fasilitator kurang proaktif/asal isi di lapangan (kesan malas verifikasi langsung ke sekolah), bukan sekadar "data belum update".
- Format daftar: ikuti PERSIS instruksi pemisah/marker antar poin yang diberikan di user prompt (mis. dash "-" di awal baris, baris kosong, atau token custom seperti "/br/br") - JANGAN pakai default lain (dash atau penomoran "1.", "2.", dst) kalau user prompt secara eksplisit meminta format pemisah yang berbeda. Ikuti persis jumlah dan isi poin yang diminta.
- Kolom bersumber "LK Fasil" yang terbaca 0% masalah atau "Sudah" TIDAK OTOMATIS berarti kondisinya baik - itu bisa jadi cuma default kosong di sheet kalau fasilitator belum login LK sama sekali, atau catatan "Kendala..." terkait menyebut "belum diisi". Selalu silangkan dengan status "Fasil Belum Login LK" dan catatan Kendala terkait sebelum menyimpulkan sesuatu "aman" - jangan tertipu angka 0% yang sebenarnya berarti "belum ada data", bukan "sudah terverifikasi baik".
- Data yang dianalisis selalu terdiri dari dua jenis, dan JANGAN dicampur jadi satu poin: (1) data KUANTITATIF - Nilai Risiko, persentase checkpoint, status kepatuhan; (2) data KUALITATIF - catatan bebas seperti Kendala/Analisis Admin/Catatan Admin dari lapangan. Kalau diminta membahas keduanya, tulis sebagai dua bagian terpisah, bukan digabung dalam satu kalimat.
- Kalau diberi bagian "Perbandingan dengan Hari Sebelumnya", pakai itu apa adanya untuk merefleksikan perubahan (naik/turun/berubah status) - JANGAN mengarang perubahan yang tidak ada di data itu. Kalau bagian itu bilang tidak ada data pembanding (mis. Hari 1) atau tidak ada yang berubah, sampaikan itu apa adanya.
- Setiap indikator checkpoint di data sudah dilabeli tingkat keparahan mengikuti acuan admin: Hijau (tidak perlu tindakan), Kuning (monitoring), Oranye (tindak lanjut oleh koordinator), Merah (eskalasi ke pusat/pembinaan intensif). Pakai label ini APA ADANYA saat menyebut urgensi suatu masalah - JANGAN menilai tingkat keparahan sendiri di luar label yang sudah diberikan di data.
- Jawab dalam Bahasa Indonesia. Ikuti persis format/bagian yang diminta (termasuk judul bagian kalau ada) - isi tiap poin dalam bentuk SATU kalimat ringkas, tanpa sub-bullet, tanpa paragraf penjelasan tambahan, tanpa pembuka/penutup di luar yang diminta.
- JANGAN pakai label/judul tebal (format "**Kata Kunci**:") di depan tiap poin, dan jangan sekadar mengisi template kaku - tulis tiap kalimat mengalir natural, seolah manusia yang buru-buru mengetik catatan singkat, bukan laporan AI yang formal.`;

/** QUALITATIVE_FIELDS tanpa "analisis" - dipakai khusus untuk konteks yang
 * dikirim ke LLM (lihat catatan di SYSTEM_PROMPT soal kenapa kolom itu
 * dikecualikan). Tampilan UI (halaman detail fasilitator, chart aktivitas)
 * tetap pakai QUALITATIVE_FIELDS penuh dari lib/notes.ts. */
const PROMPT_QUALITATIVE_FIELDS = QUALITATIVE_FIELDS.filter((f) => f.key !== "analisis");

function formatCell(v: FacilRow[keyof FacilRow]): string {
  if (v == null) return "-";
  if (typeof v === "number") return `${v}%`;
  return String(v);
}

function formatRisk(row: FacilRow): string {
  const risk = getEffectiveRisk(row);
  if (risk.value == null) return "-";
  return `${risk.value.toFixed(1)}%${risk.estimated ? " (estimasi)" : ""}`;
}

function buildHistoryTable(history: FacilRow[], maxDay: number, excludeAplikasi: boolean): string {
  const groups = activeCheckpoints(maxDay);
  const cols = groups.flatMap((g) => g.indicators.filter((i) => !excludeAplikasi || i.sumberData !== "Aplikasi Revit").map((i) => i.kolom));
  const uniqueCols = Array.from(new Set(cols));

  const header = ["Hari", "Nilai Risiko", ...uniqueCols].join(" | ");
  const sep = uniqueCols.map(() => "---").join(" | ");
  const rows = history.map((row) => {
    const cells = uniqueCols.map((c) => (row.hari >= (groups.find((g) => g.indicators.some((i) => i.kolom === c))?.activeFromDay ?? 0) ? formatCell(row[c]) : "(belum berlaku)"));
    return [`Hari ${row.hari}`, formatRisk(row), ...cells].join(" | ");
  });

  return [header, `--- | --- | ${sep}`, ...rows].join("\n");
}

function formatDelta(prev: number, curr: number): string {
  const diff = curr - prev;
  if (Math.abs(diff) < 0.05) return "tetap";
  return diff > 0 ? `naik ${diff.toFixed(1)} poin` : `turun ${Math.abs(diff).toFixed(1)} poin`;
}

/** Versi agregat untuk ringkasan SELURUH fasilitator - membandingkan statistik
 * hari ini vs kemarin (rata-rata risiko, jumlah fasilitator risiko
 * tinggi/belum login/checkpoint belum sesuai). */
function buildOverallDayDiff(dayRows: FacilRow[], prevDayRows: FacilRow[], hari: number): string {
  if (hari <= 1) return "(Hari ke-1 - belum ada hari sebelumnya untuk dibandingkan.)";
  if (prevDayRows.length === 0) return `(Tidak ada data Hari ke-${hari - 1} untuk dibandingkan.)`;

  const today = summarizeDay(dayRows);
  const yesterday = summarizeDay(prevDayRows);
  const todayNonCompliant = dayRows.filter((r) => countNonCompliant(getCheckpointCompliance(r, hari)) > 0).length;
  const yesterdayNonCompliant = prevDayRows.filter((r) => countNonCompliant(getCheckpointCompliance(r, hari - 1)) > 0).length;

  const lines: string[] = [];
  if (today.avgRisiko != null && yesterday.avgRisiko != null) {
    lines.push(`- Rata-rata Nilai Risiko: ${yesterday.avgRisiko.toFixed(1)}% -> ${today.avgRisiko.toFixed(1)}% (${formatDelta(yesterday.avgRisiko, today.avgRisiko)}).`);
  } else {
    lines.push(`- Rata-rata Nilai Risiko: tidak bisa dibandingkan (data belum cukup di salah satu hari).`);
  }
  lines.push(`- Fasilitator risiko tinggi: ${yesterday.tinggiCount} orang -> ${today.tinggiCount} orang.`);
  lines.push(`- Fasilitator belum login LK: ${yesterday.belumLogin} orang -> ${today.belumLogin} orang.`);
  lines.push(`- Fasilitator dengan checkpoint belum sesuai: ${yesterdayNonCompliant} orang -> ${todayNonCompliant} orang.`);
  return lines.join("\n");
}

function visibleIndicatorsOf(entry: CheckpointCompliance, excludeAplikasi: boolean) {
  return excludeAplikasi ? entry.indicators.filter((i) => i.sumberData !== "Aplikasi Revit") : entry.indicators;
}

/** Checkpoint yang jadi acuan "hari ini" - checkpoint yang PERSIS jatuh tempo
 * di `maxDay` kalau ada, atau (banyak hari dalam siklus 14 hari memang tidak
 * punya checkpoint sendiri) checkpoint PALING RECENT yang sudah jatuh tempo
 * (activeFromDay tertinggi yang <= maxDay) sebagai gantinya. Dipakai BERSAMA
 * oleh buildTodayCheckpointStatus (untuk ditampilkan) dan buildProblemCheckpoints
 * (untuk DIKECUALIKAN dari daftar "checkpoint lain" supaya checkpoint yang
 * sama tidak dilaporkan dua kali - sekali sebagai "checkpoint hari ini",
 * sekali lagi sebagai "checkpoint lain"). */
function todayOrMostRecentCheckpoints(compliance: CheckpointCompliance[], maxDay: number, excludeAplikasi: boolean): CheckpointCompliance[] {
  const isVisible = (c: CheckpointCompliance) => visibleIndicatorsOf(c, excludeAplikasi).length > 0;
  const exact = compliance.filter((c) => c.group.activeFromDay === maxDay && isVisible(c));
  if (exact.length > 0) return exact;

  const dueSoFar = compliance.filter((c) => c.group.activeFromDay <= maxDay && isVisible(c));
  if (dueSoFar.length === 0) return [];
  const mostRecentDay = Math.max(...dueSoFar.map((c) => c.group.activeFromDay));
  return dueSoFar.filter((c) => c.group.activeFromDay === mostRecentDay);
}

/** Checkpoint yang SUDAH jatuh tempo dan MASIH Belum Sesuai, dipisah antara
 * yang PERSIS jatuh tempo Hari ini vs yang sudah jatuh tempo di hari-hari
 * SEBELUMNYA - difilter DI KODE (bukan diserahkan ke LLM) supaya checkpoint
 * yang sudah Sesuai/aman PASTI tidak pernah muncul di data yang dikirim ke
 * LLM sama sekali, bukan cuma "diminta untuk dilewati" (yang terbukti kurang
 * reliable diikuti model). Dipakai untuk ringkasan singkat ala WhatsApp yang
 * HANYA melaporkan masalah.
 *
 * `todayOrMostRecent` = hasil todayOrMostRecentCheckpoints - checkpoint di
 * situ SELALU dikecualikan dari daftar "previous" di sini, baik itu benar-
 * benar jatuh tempo hari ini MAUPUN cuma fallback "paling recent" (kalau
 * fallback, checkpoint itu sudah dilaporkan lewat poin "checkpoint hari ini"
 * di buildTodayCheckpointStatus - jangan diulang lagi di sini). */
function buildProblemCheckpoints(
  compliance: CheckpointCompliance[],
  maxDay: number,
  excludeAplikasi: boolean,
  todayOrMostRecent: CheckpointCompliance[]
): { today: string; previous: string; previousItems: string[] } {
  const visibleIndicators = (entry: CheckpointCompliance) => visibleIndicatorsOf(entry, excludeAplikasi);
  const todayOrMostRecentNos = new Set(todayOrMostRecent.map((c) => c.group.no));

  const formatEntry = (entry: CheckpointCompliance): string | null => {
    const visible = visibleIndicators(entry);
    if (visible.length === 0) return null;
    const detail = visible
      .map((i) => {
        const sev = indicatorSeverity(i, entry.group);
        const tierTag = sev ? ` [${TIER_LABEL[sev.tier]} - ${sev.aksi}]` : "";
        const gatingTag = i.gating ? "" : " (info, tidak menggerakkan status)";
        return `${i.label}: ${i.detail}${tierTag}${gatingTag}`;
      })
      .join("; ");
    // Dihitung DI KODE (bukan diserahkan ke LLM menghitung sendiri) supaya
    // angka "sudah berapa hari lewat tenggat" pasti benar - dipakai untuk
    // poin "checkpoint sebelumnya" yang boleh mention durasi keterlambatan.
    const daysOverdue = maxDay - entry.group.activeFromDay;
    const overdueTag = daysOverdue > 0 ? ` (jatuh tempo sejak Hari ke-${entry.group.activeFromDay}, sudah ${daysOverdue} hari lewat tenggat)` : "";
    return `- [${entry.group.no}. ${entry.group.name}] ${detail}${overdueTag}`;
  };

  // Versi SATU KALIMAT per checkpoint, siap pakai jadi SATU POIN TERPISAH
  // masing-masing - dibangun SEPENUHNYA di kode supaya LLM tidak perlu
  // "memutuskan" checkpoint mana yang masuk/tidak (itu terbukti kurang
  // reliable - model kadang menambah checkpoint yang sebenarnya sudah
  // Sesuai, atau bilang "tidak ada masalah" untuk checkpoint yang seharusnya
  // tidak disebut sama sekali). LLM tinggal menyalin tiap kalimat ini apa
  // adanya jadi satu poin. SENGAJA tanpa tanda kurung "()" - pakai koma.
  const compactEntry = (entry: CheckpointCompliance): string | null => {
    const visible = visibleIndicators(entry);
    if (visible.length === 0) return null;
    const detail = visible.map((i) => `${i.label} ${i.detail}`).join(", ");
    const daysOverdue = maxDay - entry.group.activeFromDay;
    const overdueTag = daysOverdue > 0 ? `, sudah ${daysOverdue} hari lewat tenggat` : "";
    return `${entry.group.name}: ${detail}${overdueTag}.`;
  };

  // Checkpoint 1 (Sudah Dihubungi/komunikasi) SENGAJA dikecualikan di sini -
  // itu sudah dilaporkan tersendiri lewat buildCommunicationStatus (poin
  // komunikasi punya bagian sendiri di prompt), jadi kalau ikut dihitung di
  // sini juga, checkpoint yang sama bisa disebut DUA KALI (di poin komunikasi
  // DAN di poin "checkpoint lain").
  const problems = compliance.filter((c) => c.status === "belum-sesuai" && c.group.no !== 1);
  const todayLines = problems
    .filter((c) => todayOrMostRecentNos.has(c.group.no))
    .map(formatEntry)
    .filter((l): l is string => l !== null);
  // Checkpoint lain diurutkan dari yang PALING BARU jatuh tempo ke yang paling
  // lama - jadi checkpoint Dokumen Teknis (tenggat paling akhir) disebut duluan,
  // baru Dokumen Admin, baru Biodata/Perencana dst (tenggat paling awal) di
  // akhir. Ini kebalikan dari urutan alami CHECKPOINT_GROUPS (yang ascending
  // by activeFromDay) - koordinator lebih butuh lihat masalah TERBARU dulu,
  // bukan masalah yang sudah lama diketahui. Checkpoint yang sudah dilaporkan
  // lewat poin "checkpoint hari ini" (todayOrMostRecentNos, termasuk kalau itu
  // cuma fallback "paling recent") DIKECUALIKAN supaya tidak dobel.
  const previousProblems = problems
    .filter((c) => !todayOrMostRecentNos.has(c.group.no))
    .sort((a, b) => b.group.activeFromDay - a.group.activeFromDay || b.group.no - a.group.no);
  const previousLines = previousProblems.map(formatEntry).filter((l): l is string => l !== null);
  const previousItems = previousProblems.map(compactEntry).filter((l): l is string => l !== null);

  return {
    today: todayLines.length ? todayLines.join("\n") : "(checkpoint yang PERSIS jatuh tempo hari ini sudah Sesuai, atau tidak ada checkpoint baru jatuh tempo hari ini)",
    previous: previousLines.length ? previousLines.join("\n") : "(tidak ada checkpoint dari hari-hari sebelumnya yang masih Belum Sesuai)",
    previousItems,
  };
}

/** Nama + status checkpoint yang PERSIS jatuh tempo hari ini, APA ADANYA
 * (termasuk yang sudah Sesuai) - beda dari buildProblemCheckpoints yang
 * SENGAJA cuma berisi yang bermasalah. Dipakai supaya ringkasan WhatsApp
 * tetap kasih konteks "checkpoint hari ini apa" walau kebetulan sudah
 * Sesuai, bukan diam total soal itu.
 *
 * `todayOrMostRecent` = hasil todayOrMostRecentCheckpoints - kalau isinya
 * bukan checkpoint yang PERSIS jatuh tempo di `maxDay` (fallback "paling
 * recent"), tambahkan catatan itu supaya LLM tidak salah kira ini benar-benar
 * jatuh tempo hari ini. */
function buildTodayCheckpointStatus(maxDay: number, todayOrMostRecent: CheckpointCompliance[]): string {
  const formatStatus = (c: CheckpointCompliance) => {
    const label = c.status === "sesuai" ? "Sesuai" : c.status === "belum-sesuai" ? "Belum Sesuai" : "Tidak Ada Data";
    return `- [${c.group.no}. ${c.group.name}] ${label}`;
  };

  if (todayOrMostRecent.length === 0) return "(belum ada checkpoint yang berlaku sampai hari ini)";
  const isExactlyToday = todayOrMostRecent[0].group.activeFromDay === maxDay;
  if (isExactlyToday) return todayOrMostRecent.map(formatStatus).join("\n");

  const mostRecentDay = todayOrMostRecent[0].group.activeFromDay;
  return `(tidak ada checkpoint baru yang jatuh tempo persis hari ini - checkpoint PALING RECENT adalah yang jatuh tempo Hari ke-${mostRecentDay})\n${todayOrMostRecent.map(formatStatus).join("\n")}`;
}

/** Hari paling awal (mundur dari `maxDay`) di mana ISI TEKS MENTAH kolom
 * Kendala Komunikasi sudah IDENTIK PERSIS dengan kondisi saat ini - dipakai
 * untuk bilang "sejak Hari X" (durasi macetnya).
 *
 * SENGAJA membandingkan TEKS Kendala Komunikasi, BUKAN angka persentase
 * (% Sekolah Belum Dihubungi/Frekuensi Komunikasi) - kolom angka checkpoint
 * bisa kebaca "tidak berubah" sekian hari padahal itu cuma nilai
 * formula/snapshot yang ikut freeze, BUKAN bukti nyata tidak ada progres.
 * Teks Kendala Komunikasi jauh lebih informatif soal PROGRES SEBENARNYA -
 * mis. bedanya "Belum diisi status komunikasi SEMUA sekolah" (belum satupun
 * dihubungi) vs "...SEBAGIAN sekolah (3 dari 20)" (3 sudah, sisanya belum) -
 * begitu teksnya berubah (mis. angka "3 dari 20" jadi "10 dari 20"), streak
 * berhenti karena itu tandanya ADA progres, bukan macet total. */
function communicationStagnantSinceDay(history: FacilRow[], maxDay: number): number {
  const byHari = new Map(history.map((r) => [r.hari, r]));
  const current = byHari.get(maxDay);
  if (!current) return maxDay;
  const currentText = typeof current.kendalaKomunikasi === "string" ? current.kendalaKomunikasi.trim() : "";
  let since = maxDay;
  for (let h = maxDay - 1; h >= 1; h--) {
    const row = byHari.get(h);
    if (!row) break;
    const text = typeof row.kendalaKomunikasi === "string" ? row.kendalaKomunikasi.trim() : "";
    if (text !== currentText) break;
    since = h;
  }
  return since;
}

/** Status checkpoint 1 "Sudah Dihubungi" (komunikasi fasilitator ke sekolah) -
 * SELALU ditampilkan apa adanya (bukan cuma kalau bermasalah), karena admin
 * mau tahu progres komunikasi sebagai konteks awal terlepas dari sesuai/tidak.
 * SENGAJA fokus ke indikator KOMUNIKASI (% belum dihubungi, frekuensi
 * komunikasi) + isi TEKS Kendala Komunikasi mentah (supaya beda "semua" vs
 * "sebagian X dari Y sekolah" kelihatan jelas, bukan cuma angka persen) +
 * sejak hari berapa TEKS itu (bukan angka persen) terakhir berubah -
 * "Fasil Belum Login LK" TIDAK disertakan sebagai headline karena kurang
 * informatif (cuma bilang Sudah/Belum, tidak bilang sudah berapa lama).
 *
 * `hasFutureDataAnomaly` = true kalau kolom Kendala Komunikasi kena anomali
 * "future_data" (ada hari yang belum terjadi tapi sudah terisi, lihat
 * lib/anomalies.ts) - kalau begitu, streak "identik sejak Hari X" di bawah
 * SENGAJA tidak dihitung/ditampilkan. Riwayat kolom ini sendiri sudah
 * ditandai tidak bisa dipercaya, jadi klaim "belum ada progres sejak Hari X"
 * cuma mengulang ketidakpastian yang sama dengan framing lain (dan Hari X
 * yang dihasilkan bisa menyesatkan kalau ikut membandingkan ke baris masa
 * depan yang anomali) - cukup laporkan anomalinya saja. */
function buildCommunicationStatus(compliance: CheckpointCompliance[], history: FacilRow[], maxDay: number, hasFutureDataAnomaly: boolean): string {
  const comm = compliance.find((c) => c.group.no === 1);
  if (!comm) return "(checkpoint komunikasi belum berlaku pada hari ini)";
  const label = comm.status === "sesuai" ? "Sesuai" : comm.status === "belum-sesuai" ? "Belum Sesuai" : "Tidak Ada Data";
  const detail = comm.indicators
    .filter((i) => i.kolom !== "fasilBelumLoginLK")
    .map((i) => `${i.label}: ${i.detail}`)
    .join("; ");
  const latest = history[history.length - 1];
  const kendalaText = typeof latest.kendalaKomunikasi === "string" ? latest.kendalaKomunikasi.trim() : "";
  const kendalaNote = kendalaText !== "" ? ` | Isi TEKS Kendala Komunikasi saat ini: "${kendalaText}"` : ` | Kolom Kendala Komunikasi kosong`;
  const since = communicationStagnantSinceDay(history, maxDay);
  const sinceNote =
    !hasFutureDataAnomaly && since < maxDay
      ? ` - TEKS Kendala Komunikasi ini PERSIS SAMA sejak Hari ke-${since} (tidak berubah, indikasi tidak ada progres komunikasi baru sejak itu)`
      : "";
  return `[${label}] ${detail}${kendalaNote}${sinceNote}`;
}

function buildQualitativeNotes(history: FacilRow[]): string {
  const lines: string[] = [];
  for (const row of history) {
    for (const field of PROMPT_QUALITATIVE_FIELDS) {
      const value = row[field.key];
      if (typeof value === "string" && value.trim() !== "" && value !== "Belum Diisi") {
        lines.push(`- Hari ${row.hari} - ${field.label}: ${value}`);
      }
    }
  }
  return lines.length ? lines.join("\n") : "(tidak ada catatan kualitatif tambahan)";
}

export function buildFacilitatorAnalysisMessages(
  history: FacilRow[],
  options?: { excludeAplikasi?: boolean; anomalyFields?: Set<keyof FacilRow>; targetHari?: number }
): ChatMessage[] {
  if (history.length === 0) throw new Error("Tidak ada data histori untuk fasilitator ini.");
  const maxDay = history[history.length - 1].hari;
  const latest = history[history.length - 1];
  
  const dokTeknisTerunggah = Math.round(((latest.rataDokTeknisTerunggah as number) ?? 0) / 100 * 120);
  const dokTeknisTerverifikasi = Math.round(((latest.rataDokTeknisTerverifikasi as number) ?? 0) / 100 * dokTeknisTerunggah);
  const dokTeknisSesuai = Math.round(((latest.rataDokTeknisSesuai as number) ?? 0) / 100 * 120);

  const dokAdminTerunggah = Math.round(((latest.rataDokAdminTerunggah as number) ?? 0) / 100 * 220);
  const dokAdminTerverifikasi = Math.round(((latest.rataDokAdminTerverifikasi as number) ?? 0) / 100 * dokAdminTerunggah);
  const dokAdminSesuai = Math.round(((latest.rataDokAdminSesuai as number) ?? 0) / 100 * 220);

  const formatPercent = (val: any) => typeof val === "number" ? parseFloat(val.toFixed(2)) : (val ?? 0);

  const promptData = {
    fasilitator: latest.namaFasil,
    kodeFasil: latest.kodeFasil,
    koordinator: latest.namaKoor,
    kodeKoor: latest.kodeKoor,
    hariKe: maxDay,
    skorAkhir: formatPercent(latest.skorAkhir),
    progressPengisianLK: options?.targetHari && maxDay < options.targetHari 
      ? `Fasilitator baru mengisi LK sampai Hari ke-${maxDay} (padahal siklus berjalan saat ini sudah Hari ke-${options.targetHari}). Ini berarti fasilitator telat update data!` 
      : "Data Up-to-date",
    // Kita filter data persentase hanya yang esensial agar AI tidak salah ambil
    persentaseTerkini: {
      "Sekolah Belum Login Aplikasi": `${formatPercent(latest.pctSekolahBelumLoginAplikasi)}%`,
      "Sekolah Belum Punya Perencana": `${formatPercent(latest.pctTidakPunyaPerencanaLK)}%`,
      "Sekolah Belum Sepakat RAB": `${formatPercent(latest.pctBelumSepakatRAB)}%`,
      "Rata-rata Dok. Teknis Terunggah": `${formatPercent(latest.rataDokTeknisTerunggah)}%`,
      "Rata-rata Dok. Teknis Terverifikasi": `${formatPercent(latest.rataDokTeknisTerverifikasi)}%`,
      "Rata-rata Dok. Teknis Sesuai": `${formatPercent(latest.rataDokTeknisSesuai)}%`,
      "Rata-rata Dok. Admin Terunggah": `${formatPercent(latest.rataDokAdminTerunggah)}%`,
      "Rata-rata Dok. Admin Terverifikasi": `${formatPercent(latest.rataDokAdminTerverifikasi)}%`,
      "Rata-rata Dok. Admin Sesuai": `${formatPercent(latest.rataDokAdminSesuai)}%`,
    },
    // Hitungan absolut disiapkan agar AI tidak usah menghitung sendiri (karena AI sering halusinasi)
    angkaAbsolut: {
      "Dokumen Teknis Terunggah": `${dokTeknisTerunggah} dari 120`,
      "Dokumen Teknis Terverifikasi": `${dokTeknisTerverifikasi} dari ${dokTeknisTerunggah} terunggah`,
      "Dokumen Teknis Sesuai": `${dokTeknisSesuai} dari 120`,
      "Dokumen Admin Terunggah": `${dokAdminTerunggah} dari 220`,
      "Dokumen Admin Terverifikasi": `${dokAdminTerverifikasi} dari ${dokAdminTerunggah} terunggah`,
      "Dokumen Admin Sesuai": `${dokAdminSesuai} dari 220`,
      "Sekolah Belum Login Aplikasi": Math.round(((latest.pctSekolahBelumLoginAplikasi as number) ?? 0) / 100 * 20),
      "Sekolah Belum Punya Perencana": Math.round(((latest.pctTidakPunyaPerencanaLK as number) ?? 0) / 100 * 20),
      "Sekolah Mengundurkan Diri": parseInt(String(latest.jumlahSekolahMengundurkanDiri || "0"), 10),
    },
    catatanKualitatif: history.flatMap((row) =>
      PROMPT_QUALITATIVE_FIELDS.filter(
        (f) => typeof row[f.key] === "string" && (row[f.key] as string).trim() !== "" && row[f.key] !== "Belum Diisi"
      ).map((f) => ({ hari: row.hari, label: f.label, isi: row[f.key] }))
    )
  };

  const userPrompt = `## Data Fasilitator
\`\`\`json
${JSON.stringify(promptData, null, 2)}
\`\`\`

## Basis Pengetahuan Checkpoint yang Relevan Hari Ini
${buildKnowledgeSummary(maxDay)}

Tolong buatkan analisis naratif yang persis mengikuti ATURAN WAJIB dan FORMAT OUTPUT YANG DIHARAPKAN di bawah. Fokuskan analisis PADA DATA TABEL PERSENTASE TERKINI.

ATURAN WAJIB:
1. LANGSUNG KE INTI: JANGAN pernah memberikan kalimat pengantar atau menjelaskan cara Anda menghitung jumlah sekolah. Output harus langsung dimulai dengan kalimat: "Nilai capaian fasil atas [Nama Fasil] berada di angka [Skor Akhir]."
2. HITUNG TOTAL SEKOLAH (DI BALIK LAYAR): Hitung total sekolah binaan fasilitator berdasarkan rasio persentasenya. Gunakan angka absolut ini (jumlah unit sekolah) pada narasi "% Sekolah...", BUKAN sekadar menyalin persentase. Kamu tidak perlu menghitung manual, cukup gunakan angka dari \`angkaAbsolut\` di JSON "Data Fasilitator".
3. GAYA BAHASA OBJEKTIF: JANGAN gunakan opini, asumsi penyebab kendala, atau komentar subjektif (DILARANG menggunakan kata "lamban", "bottleneck", atau menyalahkan fasil). Gunakan bahasa formal, faktual, dan murni membaca data.
4. PENJABARAN ANGKA DOKUMEN: Untuk poin yang mengandung kata "unggah" (Dokumen Admin dan Dokumen Teknis), Anda harus mengonversi persentase "Rata-rata % Dokumen Terunggah" menjadi angka pasti.
   - Syarat Admin: Gunakan angka pembanding 220 dokumen. (Contoh: jika rata-rata 100%, tulis "atau 220 dari 220 dokumen telah terunggah"). Gunakan angka dari \`angkaAbsolut\` JSON.
   - Syarat Teknis: Gunakan angka pembanding 120 dokumen. (Contoh: jika rata-rata 50%, tulis "atau 60 dari 120 dokumen telah terunggah"). Gunakan angka dari \`angkaAbsolut\` JSON.
5. KETERANGAN KENDALA (WAJIB ADA DI SETIAP POIN BERMASALAH): Untuk SETIAP poin/metrik yang persentasenya BELUM 100% (belum tuntas), Anda WAJIB MENGAKHIRI PARAGRAF TERSEBUT dengan penjelasan kendalanya.
   - Jika ada "Catatan Kualitatif" terkait dari fasilitator di JSON, sebutkan kendala aslinya.
   - Jika TIDAK ADA catatan kualitatif terkait di JSON, Anda WAJIB menambahkan kalimat persis ini: "Kendala terkait [Nama Poin/Topik] tidak teridentifikasi karena fasil tidak mengisi informasi terkait hal di LK Fasil."
   - Jangan pernah melupakan kalimat ini pada metrik yang bermasalah.
6. PENGHILANGAN TOTAL JIKA 100% ATAU SEMPURNA (SANGAT PENTING): Jika suatu metrik sudah 100% (sempurna) atau 0 masalah, KAMU DILARANG MENYEBUTKANNYA SAMA SEKALI di bagian list (lewati saja poin itu).

FORMAT OUTPUT YANG DIHARAPKAN:
Nilai capaian fasil atas [Nama Fasil] berada di angka [Skor Akhir]. [Beri 1-2 kalimat rangkuman objektif terkait capaian mana yang sudah 100% dan mana yang masih rendah, termasuk jika ada Sekolah Mengundurkan Diri (ambil dari angkaAbsolut)].

Checkpoint wajib untuk hari ke-${maxDay} yaitu [Sebutkan checkpoint hari ini dan tujuannya]. Namun, sampai saat ini [sebutkan progresnya, misal: tidak ada sekolah yang sudah sepakat RAB (0%)]. Beberapa hal berikut berpotensi berpengaruh terhadap capaian tersebut:

Sekolah login aplikasi: [Penjelasan objektif]. [Kalimat Keterangan Kendala Wajib (karena tidak ada kolom khusus untuk ini)]
Perencana: [Penjelasan objektif]. [Isi "Kendala Mendapatkan Perencana" JIKA ADA di JSON, ATAU Kalimat Keterangan Kendala Wajib jika kosong]
Unggah dokumen admin: [Penjelasan objektif + Penjabaran angka /220 dokumen]. [Isi "Kendala Penyusunan Dok. Admin" JIKA ADA di JSON, ATAU Kalimat Keterangan Kendala Wajib jika kosong]
Verifikasi dokumen admin: [Penjelasan objektif]. [Isi "Kendala Verifikasi Dok. Admin" JIKA ADA di JSON, ATAU Kalimat Keterangan Kendala Wajib jika kosong]
Verifikasi dokumen admin "Sesuai": [Penjelasan objektif]. [Isi "Kendala Verifikasi Dok. Admin" JIKA ADA di JSON, ATAU Kalimat Keterangan Kendala Wajib jika kosong]
Unggah dokumen teknis: [Penjelasan objektif + Penjabaran angka /120 dokumen]. [Isi "Kendala Penyusunan Dok. Teknis" JIKA ADA di JSON, ATAU Kalimat Keterangan Kendala Wajib jika kosong]
Verifikasi dokumen teknis: [Penjelasan objektif]. [Isi "Kendala Verifikasi Dok. Teknis" JIKA ADA di JSON, ATAU Kalimat Keterangan Kendala Wajib jika kosong]
Verifikasi dokumen teknis "Sesuai": [Penjelasan objektif]. [Isi "Kendala Verifikasi Dok. Teknis" JIKA ADA di JSON, ATAU Kalimat Keterangan Kendala Wajib jika kosong]

Catatan lain:
- [Jelaskan sisa metrik yang belum dibahas di atas HANYA JIKA bermasalah, seperti Biodata, Dapodik, Keterhubungan, Panlak, Template. Ingat, jika ada metrik di catatan lain ini yang belum 100%, cantumkan juga kalimat Keterangan Kendala wajibnya jika tidak ada catatan kualitatif].

PENTING MUTLAK: Gunakan HANYA data dari JSON "Data Fasilitator" untuk menyusun angka-angkanya.`;

  return [
    { role: "system", content: "Anda adalah analis data. Jawab dengan analisis naratif objektif sesuai format yang diinstruksikan. Gunakan gaya bahasa baku dan faktual tanpa opini." },
    { role: "user", content: userPrompt },
  ];
}

export function buildDailySummaryMessages(dayRows: FacilRow[], hari: number, prevDayRows: FacilRow[] = []): ChatMessage[] {
  if (dayRows.length === 0) throw new Error("Tidak ada data untuk hari ini.");
  const sorted = [...dayRows].sort((a, b) => {
    const av = getEffectiveRisk(a).value ?? -1;
    const bv = getEffectiveRisk(b).value ?? -1;
    return bv - av;
  });

  const table = sorted
    .map((r) => {
      const belumSesuai = getCheckpointCompliance(r, hari)
        .filter((c) => c.status === "belum-sesuai")
        .map((c) => {
          let worst: { label: string; detail: string; tier: SeverityTier } | null = null;
          for (const i of c.indicators) {
            if (!i.gating) continue;
            const sev = indicatorSeverity(i, c.group);
            if (sev && (worst == null || TIER_RANK[sev.tier] > TIER_RANK[worst.tier])) {
              worst = { label: i.label, detail: i.detail, tier: sev.tier };
            }
          }
          return worst ? `${c.group.name} [${TIER_LABEL[worst.tier]} - ${worst.label}: ${worst.detail}]` : c.group.name;
        });
      const cpNote = belumSesuai.length > 0 ? `, Checkpoint belum sesuai: ${belumSesuai.join(", ")}` : ", Checkpoint belum sesuai: tidak ada";
      return `- ${r.namaFasil} (${r.kodeFasil}, koor: ${r.namaKoor}) - Nilai Risiko: ${formatRisk(r)}, Belum Login LK: ${formatCell(r.fasilBelumLoginLK)}, Belum Login Aplikasi: ${formatCell(r.pctSekolahBelumLoginAplikasi)}${cpNote}`;
    })
    .join("\n");

  const notes = dayRows
    .flatMap((r) =>
      PROMPT_QUALITATIVE_FIELDS.filter((f) => {
        const v = r[f.key];
        return typeof v === "string" && v.trim() !== "" && v !== "Belum Diisi";
      }).map((f) => `- ${r.namaFasil}: [${f.label}] ${r[f.key]}`)
    )
    .join("\n");

  const userPrompt = `Ringkasan seluruh fasilitator (${dayRows.length} orang) pada Hari ke-${hari} dari siklus 14 hari.

## Basis Pengetahuan Checkpoint yang Relevan Hari Ini
${buildKnowledgeSummary(hari)}

## Data Kuantitatif per Fasilitator (Nilai Risiko & checkpoint, diurutkan dari risiko tertinggi)
${table}

## Data Kualitatif dari Lapangan (catatan Kendala/Analisis Admin/Catatan Admin)
${notes || "(tidak ada catatan kualitatif tambahan)"}

## Perbandingan dengan Hari Sebelumnya (Hari ke-${hari - 1})
${buildOverallDayDiff(dayRows, prevDayRows, hari)}

Tolong tulis dalam format tiga bagian di bawah, TANPA label/judul di depan tiap kalimat - langsung isi kalimatnya, natural seperti manusia menulis catatan singkat (judul "##" section boleh tetap dipakai apa adanya). Poin 1, 3, 4, 5, 6 masing-masing satu kalimat ringkas (maksimal ~25 kata). Poin 2 BOLEH lebih dari satu kalimat kalau fasilitator prioritas itu punya banyak checkpoint Belum Sesuai - JANGAN mengorbankan kejelasan demi memaksakan satu kalimat:

## Analisis Kuantitatif
- Gambaran keseluruhan kinerja hari ini berdasar Nilai Risiko & status checkpoint, sertakan pola anomali menonjol kalau ada (mis. banyak fasilitator yang checkpoint-nya berulang kali tidak sesuai padahal sudah jatuh tempo, atau data Hasil LK vs Aplikasi yang tidak konsisten).
- Siapa yang paling butuh perhatian/intervensi segera. Untuk SETIAP checkpoint Belum Sesuai yang disebut, WAJIB pakai catatan "Checkpoint belum sesuai" di data APA ADANYA (nama indikator + angka + tingkat keparahannya) - DILARANG cuma menulis "NamaCheckpoint (Tingkat)" tanpa keterangan indikator. Sebut juga kalau ada fasilitator yang polanya menunjukkan cuma aktif di sisi Aplikasi (rajin login/isi form) tapi checkpoint substantif ke sekolah tidak kunjung maju (kesan asal isi/kurang proaktif verifikasi lapangan).
- Apa yang membaik/memburuk dibanding Hari ke-${hari - 1} (pakai bagian "Perbandingan dengan Hari Sebelumnya" di atas).

## Analisis Kualitatif
- Kendala paling menonjol yang berulang di banyak fasilitator, atau bilang tidak ada pola kendala umum kalau memang tidak ada.
- Hal penting lain dari catatan lapangan yang belum tercakup di poin sebelumnya, atau bilang tidak ada catatan tambahan kalau memang tidak ada.

## Rekomendasi
- Satu tindakan paling penting untuk hari ini/besok, sesuaikan urgensinya dengan tingkat keparahan checkpoint yang ada, mempertimbangkan analisis kuantitatif maupun kualitatif di atas.`;

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];
}

// --- Prompt untuk tombol "Copy Prompt" (paste manual ke Gemini Pro dkk.) --

/** Total "semesta" tetap yang dipakai sebagai pembagi absolut - SELALU dipakai
 * apa adanya untuk SETIAP metrik terkait (unggah/verifikasi/sesuai), TIDAK
 * dirantai dari hasil metrik sebelumnya (mis. jumlah terverifikasi BUKAN
 * dihitung dari jumlah terunggah, keduanya independen dari total tetap ini) -
 * dikonfirmasi eksplisit oleh program owner 2026-07-18. */
const TOTAL_SEKOLAH = 20;
const TOTAL_DOK_TEKNIS = 120;
const TOTAL_DOK_ADMIN = 220;

function numOrZero(v: FacilRow[keyof FacilRow]): number {
  return typeof v === "number" ? v : 0;
}

function absFromPct(v: FacilRow[keyof FacilRow], total: number): number {
  return Math.round((numOrZero(v) / 100) * total);
}

function kendalaTextOrEmpty(v: FacilRow[keyof FacilRow]): string {
  if (typeof v !== "string") return "";
  const trimmed = v.trim();
  return trimmed === "" || trimmed === "Belum Diisi" ? "" : trimmed;
}

const KENDALA_FIELDS_FOR_STALL_CHECK: (keyof FacilRow)[] = [
  "kendalaKomunikasi",
  "kendalaPanlakFormatTemplate",
  "kendalaMendapatkanPerencana",
  "kendalaVerifikasiBiodata",
  "kendalaUpdateDapodik",
  "kendalaPenyusunanDokAdmin",
  "kendalaVerifikasiDokAdmin",
  "kendalaPenyusunanDokTeknis",
  "kendalaVerifikasiDokTeknis",
  "kendalaPenyepakatanRAB",
];

/** "sampai Hari ke-N" di kolom Kendala manapun - dipakai admin sebagai catatan
 * manual kalau fasilitator berhenti mengisi LK sebelum hari ini (mis. "Baru
 * mengisi sampai Hari ke-11 (harusnya sudah Hari ke-13)"). */
const STALL_NOTE_PATTERN = /sampai\s+hari\s+ke-?\s*(\d+)/i;

/**
 * "Hari terakhir fasilitator ini BENERAN mengisi LK Fasil" - BUKAN row.hari!
 * row.hari di tab "masterLog" itu artinya "hari yang direpresentasikan
 * snapshot ini" (SAMA untuk SEMUA fasilitator dalam satu snapshot, sekarang
 * kebetulan selalu 13 karena baru ada satu snapshot) - BUKAN "hari terakhir
 * fasilitator ini update", beda dari arsitektur lama (tab "Log" per
 * fasilitator) yang row.hari-nya memang berarti begitu. DIKONFIRMASI
 * 2026-07-18: satu-satunya sinyal "fasilitator ini macet sejak hari X" yang
 * tersedia sekarang adalah catatan manual admin di kolom Kendala (pola
 * "sampai Hari ke-N") - kalau tidak ketemu pola itu di kolom manapun,
 * fallback ke `hari` (hari ini/yang lagi dilihat), ASUMSI fasilitator masih
 * update normal. Heuristik berbasis teks bebas ini TIDAK dijamin selalu
 * akurat - kalau ternyata ada sumber data terstruktur yang lebih baik untuk
 * ini, ganti fungsi ini yang duluan. */
function findLastFilledDay(row: FacilRow, fallbackHari: number): number {
  for (const key of KENDALA_FIELDS_FOR_STALL_CHECK) {
    const text = kendalaTextOrEmpty(row[key]);
    const match = text.match(STALL_NOTE_PATTERN);
    if (match) return parseInt(match[1], 10);
  }
  return fallbackHari;
}

const COPY_PROMPT_REFERENCE_EXAMPLE = `Fasil ini hanya mengisi LK Fasil sampai hari ke-4.

Nilai capaian fasil atas Muhammad Haditya Yervan sangat rendah di angka 26.41 (masuk kriteria "Kritis") karena banyak checkpoint yang capaiannya masih rendah.

Checkpoint wajib untuk hari ke-12 yaitu seluruh sekolah telah sepakat RAB (Final Checkpoint). Namun, sampai saat ini tidak ada sekolah yang sudah sepakat RAB. Beberapa hal yang berpengaruh terhadap capaian tersebut adalah belum tercapainya checkpoint perencana dan rendahnya angka unggah dan verifikasi dokumen teknis.

Sekolah login aplikasi: Masih ada 5 sekolah yang belum login ke aplikasi (78.95% sekolah yang sudah login aplikasi). Artinya ada 5 sekolah yang pasti belum mengunggah dokumen admin dan teknisnya.

Perencana: Masih ada 14 sekolah yang belum memiliki perencana sehingga sekolah belum dapat menyelesaikan penyusunan dokumen admin dan memulai menyusun dokumen teknis. Kendala terkait perencana tidak teridentifikasi karena fasil tidak mengisi informasi terkait perencana di LK Fasil.

Unggah dokumen teknis: Baru sekitar 16 dari 120 dokumen teknis yang terunggah (14.04% rata-rata dokumen teknis terunggah). Artinya masih sekitar 104 dokumen yang harus ditagih untuk segera diunggah. Angka minimal persen terunggah menunjukan masih adanya sekolah yang belum mengunggah satupun dokumen (0% minimal dokumen teknis terunggah). Kendala terkait unggah dokumen teknis tidak teridentifikasi karena fasil tidak mengisi informasi terkait hal di LK Fasil.

Verifikasi dokumen teknis: Dari sekitar 16 dokumen teknis yang terunggah, belum ada dokumen teknis yang terverifikasi oleh fasil (0% rata-rata dok. teknis terverifikasi). Kendala terkait verifikasi dokumen teknis tidak teridentifikasi karena fasil tidak mengisi informasi terkait hal ini di LK Fasil.

Verifikasi dokumen teknis "Sesuai": Belum ada dokumen teknis yang terverifikasi.

Unggah dokumen admin: Baru sekitar 150 dari 220 dokumen admin yang terunggah (68.42% rata-rata dokumen admin terunggah). Artinya masih sekitar 70 dokumen yang harus ditagih untuk segera diunggah. Angka minimal persen terunggah menunjukan adanya sekolah yang belum mengunggah sama sekali dari 11 dokumen (0% minimal dokumen admin terunggah). Kendala terkait unggah dokumen admin adalah dokumen belum tersedia lengkap di sekolah (Sumber: LK Fasil).

Verifikasi dokumen admin: Dari sekitar 150 dokumen admin yang terunggah, yang sudah terverifikasi oleh fasil sekitar 76 dokumen (51.20% rata-rata dokumen admin terverifikasi). Artinya masih sekitar 74 dokumen admin yang harus segera diverifikasi.

Verifikasi dokumen admin "Sesuai": Dari sekitar 76 dokumen admin yang terverifikasi oleh fasil, baru sekitar 35 dokumen admin yang terverifikasi dengan status "Sesuai" (46.89% rata dokumen admin terverifikasi "Sesuai").

Catatan lain:
Biodata: Masih 8 sekolah yang belum terverifikasi "Sesuai" biodatanya (63.16% sekolah biodata sudah terverifikasi sesuai).
Dapodik: Seluruh sekolah yang data dapodiknya belum sesuai rincian menu yang dibutuhkan tidak bisa mengupdate Dapodik dikarenakan Dapodik terkunci (Sumber: LK Fasil).`;

/**
 * Prompt untuk tombol "Copy Prompt" (FacilitatorAnalysisWorkbench.tsx) - BEDA
 * TOTAL dari buildFacilitatorAnalysisMessages() di atas (yang dipakai tombol
 * "Generate dengan AI"/panggilan API internal, format SANGAT ringkas satu
 * kalimat per poin). Ini untuk admin yang mau paste manual ke Gemini Pro (atau
 * chat LLM lain) dan minta narasi PANJANG per kategori checkpoint, gaya
 * persis seperti COPY_PROMPT_REFERENCE_EXAMPLE - dikonfirmasi langsung oleh
 * program owner 2026-07-18, JANGAN disamakan dengan gaya "Generate dengan AI"
 * di atas (dilarang bertele-tele dkk itu TIDAK berlaku di sini).
 *
 * Aturan kunci (BEDA dari prompt "Generate dengan AI" di atas):
 * - SETIAP kategori (login aplikasi, perencana, dok teknis x3, dok admin x3)
 *   SELALU disebut walau capaiannya sudah 100%/sempurna - TIDAK di-skip
 *   (beda dari aturan "PENGHILANGAN TOTAL JIKA 100%" di buildFacilitatorAnalysisMessages).
 * - Pembagi absolut SELALU tetap: 220 untuk seluruh metrik Dokumen Admin
 *   (unggah/verifikasi/sesuai), 120 untuk seluruh metrik Dokumen Teknis,
 *   20 untuk metrik per-sekolah (login aplikasi, perencana, biodata) -
 *   TIDAK dirantai dari hasil metrik sebelumnya.
 */
export function buildFacilitatorCopyPromptText(row: FacilRow, hari: number): string {
  const compliance = getCheckpointCompliance(row, hari);
  const dueCheckpoints = activeCheckpoints(hari); // urut ascending activeFromDay
  const currentGroup = dueCheckpoints[dueCheckpoints.length - 1] ?? null; // checkpoint PALING BARU jatuh tempo
  const currentCompliance = currentGroup ? compliance.find((c) => c.group.no === currentGroup.no) ?? null : null;

  const data = {
    fasilitator: row.namaFasil,
    kodeFasil: row.kodeFasil,
    hariTerakhirDiisiFasil: findLastFilledDay(row, hari),
    hariIni: hari,
    skorAkhir: typeof row.skorAkhir === "number" ? row.skorAkhir : null,
    checkpointWajibHariIni: currentGroup
      ? {
          nama: currentGroup.name,
          tujuan: currentGroup.tujuan,
          aktifSejakHari: currentGroup.activeFromDay,
          statusSaatIni: currentCompliance?.status ?? "unknown",
          indikator: currentGroup.indicators.map((i) => ({ label: i.definisi, nilaiSheet: row[i.kolom] })),
        }
      : "(belum ada checkpoint yang berlaku sampai hari ini)",
    sekolahLoginAplikasi: {
      totalSekolah: TOTAL_SEKOLAH,
      belumLoginPersen: numOrZero(row.pctSekolahBelumLoginAplikasi),
      belumLoginJumlah: absFromPct(row.pctSekolahBelumLoginAplikasi, TOTAL_SEKOLAH),
    },
    perencana: {
      totalSekolah: TOTAL_SEKOLAH,
      belumPunyaPersen: numOrZero(row.pctTidakPunyaPerencanaLK),
      belumPunyaJumlah: absFromPct(row.pctTidakPunyaPerencanaLK, TOTAL_SEKOLAH),
      kendala: kendalaTextOrEmpty(row.kendalaMendapatkanPerencana),
    },
    dokumenTeknis: {
      totalDokumen: TOTAL_DOK_TEKNIS,
      unggahPersen: numOrZero(row.rataDokTeknisTerunggah),
      unggahJumlah: absFromPct(row.rataDokTeknisTerunggah, TOTAL_DOK_TEKNIS),
      unggahMinimalPersen: numOrZero(row.minDokTeknisTerunggah),
      kendalaUnggah: kendalaTextOrEmpty(row.kendalaPenyusunanDokTeknis),
      verifikasiPersen: numOrZero(row.rataDokTeknisTerverifikasi),
      verifikasiJumlah: absFromPct(row.rataDokTeknisTerverifikasi, TOTAL_DOK_TEKNIS),
      kendalaVerifikasi: kendalaTextOrEmpty(row.kendalaVerifikasiDokTeknis),
      sesuaiPersen: numOrZero(row.rataDokTeknisSesuai),
      sesuaiJumlah: absFromPct(row.rataDokTeknisSesuai, TOTAL_DOK_TEKNIS),
    },
    dokumenAdmin: {
      totalDokumen: TOTAL_DOK_ADMIN,
      unggahPersen: numOrZero(row.rataDokAdminTerunggah),
      unggahJumlah: absFromPct(row.rataDokAdminTerunggah, TOTAL_DOK_ADMIN),
      unggahMinimalPersen: numOrZero(row.minDokAdminTerunggah),
      kendalaUnggah: kendalaTextOrEmpty(row.kendalaPenyusunanDokAdmin),
      verifikasiPersen: numOrZero(row.rataDokAdminTerverifikasi),
      verifikasiJumlah: absFromPct(row.rataDokAdminTerverifikasi, TOTAL_DOK_ADMIN),
      kendalaVerifikasi: kendalaTextOrEmpty(row.kendalaVerifikasiDokAdmin),
      sesuaiPersen: numOrZero(row.rataDokAdminSesuai),
      sesuaiJumlah: absFromPct(row.rataDokAdminSesuai, TOTAL_DOK_ADMIN),
    },
    catatanLain: {
      biodata: {
        totalSekolah: TOTAL_SEKOLAH,
        belumTerverifikasiPersen: numOrZero(row.pctBiodataBelumTerverifikasi),
        belumTerverifikasiJumlah: absFromPct(row.pctBiodataBelumTerverifikasi, TOTAL_SEKOLAH),
        kendala: kendalaTextOrEmpty(row.kendalaVerifikasiBiodata),
      },
      dapodik: {
        sudahUploadBuktiPersen: numOrZero(row.pctSudahUploadBuktiUpdateDapodik),
        kendala: kendalaTextOrEmpty(row.kendalaUpdateDapodik),
      },
      komunikasi: { belumDihubungiPersen: numOrZero(row.pctSekolahBelumDihubungi), kendala: kendalaTextOrEmpty(row.kendalaKomunikasi) },
      mengundurkanDiri: parseInt(String(row.jumlahSekolahMengundurkanDiri || "0"), 10),
      panlakFormat: {
        belumPanlakPersen: numOrZero(row.pctTidakPunyaPanlak),
        belumFormatPersen: numOrZero(row.pctTidakPunyaFormatTemplate),
        kendala: kendalaTextOrEmpty(row.kendalaPanlakFormatTemplate),
      },
      rab: { belumSepakatPersen: numOrZero(row.pctBelumSepakatRAB), kendala: kendalaTextOrEmpty(row.kendalaPenyepakatanRAB) },
    },
  };

  return `Anda adalah asisten analis untuk program revitalisasi sekolah. Tolong tulis analisis naratif untuk SATU fasilitator lapangan, PERSIS meniru gaya, struktur, dan urutan paragraf dari "CONTOH REFERENSI" di bawah - tapi SELURUH angka harus berasal dari "DATA FASILITATOR" (JSON) di bawahnya, JANGAN sekali-kali memakai angka dari contoh referensi.

=== CONTOH REFERENSI (tiru gaya & strukturnya, BUKAN angkanya) ===
${COPY_PROMPT_REFERENCE_EXAMPLE}
=== AKHIR CONTOH REFERENSI ===

ATURAN WAJIB:
1. Ikuti urutan paragraf PERSIS seperti contoh: (a) baris pembuka "Fasil ini hanya mengisi LK Fasil sampai hari ke-X.", (b) baris "Nilai capaian fasil atas [Nama] [kata sifat sesuai skornya] di angka [Skor Akhir] (masuk kriteria "[label]")..." - pilih sendiri kata sifat & label kriteria (mis. Kritis/Rendah/Cukup/Baik/Sangat Baik) yang paling sesuai dengan besarnya skor, (c) paragraf "Checkpoint wajib untuk hari ke-X yaitu ...", jelaskan checkpoint yang sedang berlaku (lihat "checkpointWajibHariIni" di data) dan status pencapaiannya, tutup dengan menyebutkan SPESIFIK checkpoint/kategori mana yang jadi penyebab utama (bukan kalimat generik "beberapa hal berpotensi berpengaruh").
2. SETELAH itu, WAJIB bahas KE-8 kategori berikut, satu paragraf per kategori, SATU PER SATU dengan urutan dan label PERSIS ini (pakai tanda kutip dua untuk kata "Sesuai"): "Sekolah login aplikasi:", "Perencana:", "Unggah dokumen teknis:", "Verifikasi dokumen teknis:", "Verifikasi dokumen teknis "Sesuai":", "Unggah dokumen admin:", "Verifikasi dokumen admin:", "Verifikasi dokumen admin "Sesuai":".
3. PENTING - BEDA DARI KEBIASAAN UMUM: WAJIB SEBUTKAN SEMUA 8 kategori itu WALAUPUN capaiannya sudah 100%/sempurna - JANGAN pernah dilewati/di-skip. Kalau sudah 100%, tulis dengan nada positif (contoh: "seluruhnya sudah terverifikasi oleh fasil"), JANGAN dihilangkan dari hasil.
4. Kalau ada kolom "kendala..." yang isinya bukan string kosong di data, sertakan isinya apa adanya sebagai kalimat kendala di paragraf terkait. Kalau kosong, tulis kalimat seperti pada contoh ("Kendala terkait ... tidak teridentifikasi karena fasil tidak mengisi informasi terkait hal ini di LK Fasil").
5. Kalau ada ketimpangan besar antara satu tahap dan tahap berikutnya dalam kategori yang sama (mis. banyak yang terunggah tapi sedikit yang terverifikasi, atau banyak yang terverifikasi tapi sedikit yang "Sesuai"), sertakan juga angka selisihnya secara eksplisit di kalimatnya.
6. WAJIB tutup dengan bagian "Catatan lain:" (judul PERSIS begitu, tanpa paragraf lain di atasnya dulu) berisi baris-baris singkat (BUKAN paragraf panjang seperti kategori di atas) untuk checkpoint yang belum dibahas di kategori manapun di atas: Biodata (field catatanLain.biodata), Dapodik (field catatanLain.dapodik), Sekolah Mengundurkan Diri (HANYA JIKA field catatanLain.mengundurkanDiri > 0), dan HANYA kalau field catatanLain.komunikasi/panlakFormat/rab menunjukkan ada masalah nyata (persennya jauh dari sempurna ATAU field kendala-nya berisi laporan masalah) - kalau field itu kosong/sempurna, JANGAN disebut sama sekali di "Catatan lain" (beda dari 8 kategori wajib di poin 2-3 yang harus selalu disebut).
7. Data dari field "kendala..." yang kosong ("") berarti memang belum ada catatan dari fasilitator - JANGAN mengarang kendala yang tidak ada di data.
8. Tulis paragraf mengalir natural (bukan bullet point/list), Bahasa Indonesia, TANPA judul tebal markdown di depan tiap paragraf (label kategori seperti "Perencana:" cukup teks biasa, bukan **Perencana:**).

=== DATA FASILITATOR (SATU-SATUNYA sumber angka yang boleh dipakai) ===
\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`

${buildKnowledgeSummary(hari)}`;
}
