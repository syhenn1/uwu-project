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
  options?: { excludeAplikasi?: boolean; anomalyFields?: Set<keyof FacilRow> }
): ChatMessage[] {
  const excludeAplikasi = options?.excludeAplikasi ?? false;
  if (history.length === 0) throw new Error("Tidak ada data histori untuk fasilitator ini.");
  const maxDay = history[history.length - 1].hari;
  const latest = history[history.length - 1];
  const compliance = getCheckpointCompliance(latest, maxDay);
  const todayOrMostRecent = todayOrMostRecentCheckpoints(compliance, maxDay, excludeAplikasi);
  const problemCheckpoints = buildProblemCheckpoints(compliance, maxDay, excludeAplikasi, todayOrMostRecent);
  const todayCheckpointStatus = buildTodayCheckpointStatus(maxDay, todayOrMostRecent);
  // Anomali "future_data" (lihat lib/anomalies.ts) dideteksi dari HISTORY MENTAH
  // yang BELUM dipotong ke todayHari (beda dari `history` param di sini, yang
  // sudah dibatasi API route) - jadi flag-nya dihitung terpisah di route.ts lalu
  // dikirim lewat opsi ini, BUKAN dihitung ulang dari `history` yang sudah kepotong.
  const komunikasiHasFutureDataAnomaly = !!options?.anomalyFields?.has("kendalaKomunikasi");
  const communicationStatus = buildCommunicationStatus(compliance, history, maxDay, komunikasiHasFutureDataAnomaly);

  const exclusionNote = excludeAplikasi
    ? `\n**Mode "Kecualikan Data Aplikasi" AKTIF: seluruh checkpoint/persentase ber-sumber "Aplikasi Revit" (mis. Login Aplikasi, Biodata Terverifikasi, Dokumen Admin/Teknis Terunggah/Terverifikasi/Sesuai, RAB Sepakat) SUDAH SENGAJA dibuang dari data di atas - JANGAN menyebutnya "tidak ada data"/anomali/kekurangan, itu memang disembunyikan sesuai permintaan pengguna. Fokuskan seluruh analisis HANYA pada checkpoint bersumber LK Fasil (Sudah Dihubungi, Panlak, Format/Template, Perencana, Dapodik) dan catatan Kendala kualitatif.**\n`
    : "";

  const userPrompt = `Fasilitator: ${latest.namaFasil} (${latest.kodeFasil})
Koordinator: ${latest.namaKoor} (${latest.kodeKoor})
Data tersedia sampai Hari ke-${maxDay} dari siklus 14 hari.
${exclusionNote}
## Basis Pengetahuan Checkpoint (kolom, bobot, definisi)
${buildKnowledgeSummary(maxDay, excludeAplikasi)}

## Status Komunikasi Fasilitator dengan Sekolah (Checkpoint 1, apa adanya)
${communicationStatus}${komunikasiHasFutureDataAnomaly ? '\n⚠ ANOMALI TERDETEKSI: kolom Kendala Komunikasi sudah berisi data untuk HARI YANG BELUM TERJADI (diisi mendahului waktunya) - ini indikasi data tidak bisa dipercaya/kemungkinan diisi asal, WAJIB disebut sebagai kendala di poin komunikasi.' : ""}

## Checkpoint yang PERSIS Jatuh Tempo Hari Ini (Hari ke-${maxDay}) - status apa adanya, TERMASUK yang sudah Sesuai
${todayCheckpointStatus}

## Checkpoint Bermasalah - Jatuh Tempo PERSIS Hari Ini (Hari ke-${maxDay})
${problemCheckpoints.today}

## Checkpoint Bermasalah - Sudah Jatuh Tempo Sejak Hari-Hari Sebelumnya
${problemCheckpoints.previous}

## Kalimat SIAP PAKAI - SATU POIN TERPISAH per checkpoint sebelumnya yang bermasalah
${problemCheckpoints.previousItems.length ? problemCheckpoints.previousItems.map((s, i) => `${i + 1}. ${s}`).join("\n") : "(tidak ada checkpoint lain yang masih bermasalah)"}

## Tabel Tren Harian (konteks tambahan kalau perlu)
${buildHistoryTable(history, maxDay, excludeAplikasi)}

## Catatan Kualitatif (Kendala / Analisis / Catatan Admin yang sudah ada)
${buildQualitativeNotes(history)}

Tolong tulis ringkasan SINGKAT untuk dikirim koordinator lewat WhatsApp. FORMAT WAJIB, JANGAN DILANGGAR: pisahkan tiap poin dengan SATU BARIS KOSONG sungguhan (tekan enter dua kali), dan JANGAN taruh apapun di awal baris tiap poin - LANGSUNG kalimatnya. DILARANG KERAS memulai baris dengan tanda "-" (dash), "*", "•", ataupun angka/penomoran "1." "2." dst - kalau kamu terbiasa pakai "-" di awal baris seperti biasanya, JANGAN, itu PERSIS yang dilarang di sini. Contoh format yang BENAR (dua poin, perhatikan TIDAK ADA "-" ataupun bullet apapun di depan kalimat):
"Dokumen teknis belum ada yang sesuai, masih 0%.

Solusi: lakukan pembinaan intensif untuk percepatan verifikasi dokumen teknis."
Contoh yang SALAH (JANGAN seperti ini): "- Dokumen teknis belum ada yang sesuai..." (ada tanda "-" di depan).

Bahasa singkat-padat langsung ke inti, cocok dibaca cepat di chat, BUKAN laporan formal panjang. Tiap poin SATU kalimat pendek (maksimal ~20 kata), TANPA tanda kurung buka-tutup "()" di manapun (pakai koma/titik dua, bukan kurung). KECUALI untuk poin komunikasi dan poin checkpoint hari ini (WAJIB selalu disebut apa adanya termasuk kalau sudah Sesuai), HANYA laporkan checkpoint LAIN yang statusnya Belum Sesuai/bermasalah - checkpoint lain yang Sesuai/aman JANGAN disebut sama sekali. JUMLAH POIN TOTAL itu VARIABEL (tergantung berapa banyak checkpoint bermasalah) - poin komunikasi, poin checkpoint hari ini, poin solusi, DAN poin kinerja SELALU WAJIB ADA (JANGAN dihilangkan, JANGAN berhenti di poin solusi begitu saja); poin "checkpoint lain" JUMLAHNYA mengikuti PERSIS jumlah item di bagian "Kalimat SIAP PAKAI" di bawah. Ikuti urutan berikut persis:

POIN KOMUNIKASI (WAJIB SELALU ADA, SATU poin, taruh PALING ATAS/PERTAMA - ini yang menentukan apakah datanya bisa dipercaya/anomali atau tidak, jadi harus dibaca duluan sebelum poin checkpoint): sebutkan progres komunikasi fasilitator dengan sekolah SUDAH SAMPAI MANA PERSISNYA - dasarkan pada ISI TEKS Kendala Komunikasi yang diberikan di bagian "Status Komunikasi Fasilitator dengan Sekolah" (field "Isi TEKS Kendala Komunikasi saat ini"), BUKAN menebak/menyimpulkan sendiri dari angka persentase. Bedakan dengan jelas: kalau teksnya bilang "semua sekolah" belum dikomunikasikan/belum diisi, baru boleh bilang "belum ada komunikasi ke sekolah"; TAPI kalau teksnya bilang "sebagian sekolah" dengan angka (mis. "3 dari 20"), WAJIB sebutkan angka itu APA ADANYA (mis. "baru 3 dari 20 sekolah yang dikomunikasikan") - JANGAN generalisasi jadi "belum ada komunikasi sama sekali" kalau faktanya sebagian sudah. JANGAN bilang "belum login LK"/"belum login" - itu BUKAN framing yang diinginkan. Kalau bagian "Status Komunikasi..." di atas ada baris "⚠ ANOMALI TERDETEKSI: kolom Kendala Komunikasi sudah berisi data untuk hari yang belum terjadi", WAJIB tambahkan klausa itu sebagai kendala tambahan di akhir poin ini, TANPA tanda kurung - mis. "..., ANOMALI karena ada data untuk hari yang belum terjadi sehingga tidak bisa dipercaya." JANGAN diam soal ini kalau memang ada - TAPI kalau baris ANOMALI itu ADA, JANGAN tambahkan klausa "tidak ada progres baru sejak Hari ke-X" ataupun angka hari lain hasil hitung sendiri dari "Tabel Tren Harian" - riwayat kolom ini sudah ditandai tidak bisa dipercaya karena anomali itu, jadi klaim "sejak Hari ke-X" (dari sumber manapun) TIDAK BOLEH disebut, cukup laporkan anomalinya saja. Kalau baris ANOMALI itu TIDAK ADA dan catatan "Status Komunikasi..." bilang teks ini "PERSIS SAMA sejak Hari ke-X", WAJIB sertakan "tidak ada progres baru sejak Hari ke-X" di akhir kalimat TANPA tanda kurung (pakai angka Hari yang sudah diberikan di catatan itu, jangan hitung ulang sendiri dari tabel manapun).

POIN CHECKPOINT HARI INI (WAJIB SELALU ADA, SATU poin, taruh SETELAH poin komunikasi - ini headline checkpoint TERBARU yang harus dicek admin, sebelum masuk ke rincian dokumen-dokumen lain): sebutkan checkpoint MANA yang PERSIS jatuh tempo hari ini (pakai bagian "Checkpoint yang PERSIS Jatuh Tempo Hari Ini" di atas) dan statusnya apa adanya. Kalau statusnya Belum Sesuai, lanjutkan jelaskan singkat apa yang kurang - kutip isi Kendala terkait dari fasilitator kalau ada di "Catatan Kualitatif" (fokus ke situ, itu yang ditulis fasilitator, bukan angka Aplikasi), atau sebut angka checkpoint singkat kalau Kendala terkait kosong (detailnya ada di bagian "Checkpoint Bermasalah - Jatuh Tempo PERSIS Hari Ini"). Kalau statusnya SUDAH Sesuai, cukup satu kalimat singkat mengonfirmasi itu positif, JANGAN diperpanjang. Kalau bagian itu bilang tidak ada checkpoint yang PERSIS jatuh tempo hari ini dan menunjuk ke checkpoint PALING RECENT sebagai gantinya (ditandai catatan "checkpoint PALING RECENT adalah..."), WAJIB sebutkan checkpoint pengganti itu berikut hari jatuh temponya dan statusnya - JANGAN cuma bilang "tidak ada checkpoint jatuh tempo" tanpa menyebut penggantinya. Hanya kalau memang belum ada satupun checkpoint yang berlaku sampai hari ini (fasilitator baru di hari-hari sangat awal), baru bilang itu apa adanya singkat.

POIN CHECKPOINT LAIN (SATU POIN TERPISAH untuk SETIAP item, JANGAN digabung jadi satu poin besar, taruh SETELAH poin checkpoint hari ini - ini rincian dokumen-dokumen lain, urutannya SUDAH diurutkan dari checkpoint paling baru jatuh tempo ke paling lama, ikuti urutan itu APA ADANYA jangan diacak): checkpoint LAIN (bukan yang hari ini, bukan komunikasi) yang masih Belum Sesuai. Bagian "Kalimat SIAP PAKAI - SATU POIN TERPISAH per checkpoint sebelumnya yang bermasalah" di atas berisi daftar bernomor - untuk SETIAP nomor di daftar itu, buat SATU POIN SENDIRI (dipisah baris kosong seperti poin lain), SALIN isi kalimatnya APA ADANYA (boleh rapikan sedikit kata sambung, TAPI JANGAN tambahkan tanda kurung buka-tutup - hilangkan kurung kalau ada, ganti jadi koma/titik dua). WAJIB MUTLAK: JUMLAH POIN yang kamu tulis di sini HARUS SAMA PERSIS dengan jumlah item di daftar itu - HITUNG dulu ada berapa item, jangan lebih jangan kurang. DILARANG KERAS menambahkan checkpoint/nama/angka APAPUN yang TIDAK ADA di daftar itu (walau kamu lihat checkpoint lain di "Tabel Tren Harian" atau "Basis Pengetahuan Checkpoint" - dua bagian itu berisi SEMUA checkpoint termasuk yang sudah Sesuai, BUKAN sumber untuk poin ini). Kalau daftar itu kosong/placeholder "tidak ada checkpoint lain yang masih bermasalah", tulis SATU poin singkat itu saja - DILARANG menghapus semuanya.

POIN SOLUSI (WAJIB SELALU ADA, SATU poin, taruh setelah semua poin checkpoint, TAPI BUKAN poin PALING AKHIR - masih ada poin kinerja setelahnya): satu poin solusi/tindakan paling penting dan paling actionable untuk koordinator, spesifik ke masalah yang disebut di atas (bukan saran generik) - kalau dari awal tidak ada satupun checkpoint bermasalah, poin ini boleh bilang "tidak ada tindakan mendesak" saja.

POIN KINERJA (WAJIB SELALU ADA, SATU poin, taruh PALING AKHIR - JANGAN dihilangkan/dilewat walau poin solusi terasa sudah jadi penutup): satu kalimat sangat singkat soal kinerja/pola kerja keseluruhan fasilitator ini sejauh ini (mis. rajin update tapi lambat verifikasi ke sekolah, aktif di Aplikasi tapi checkpoint substantif macet, atau progresnya konsisten baik) - JANGAN sebut "Nilai Risiko", dan JANGAN cuma mengulang poin solusi dengan kata lain.`;

  return [
    { role: "system", content: SYSTEM_PROMPT },
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
