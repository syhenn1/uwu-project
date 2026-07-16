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
  if (history.length === 0) throw new Error("Tidak ada data histori untuk fasilitator ini.");
  const maxDay = history[history.length - 1].hari;
  const latest = history[history.length - 1];
  
  const rawTable = (!latest.raw || Object.keys(latest.raw).length === 0) 
    ? "(tidak ada data mentah)" 
    : Object.entries(latest.raw).map(([k, v]) => `- ${k}: ${v}`).join("\n");

  const userPrompt = `Fasilitator: ${latest.namaFasil} (${latest.kodeFasil})
Koordinator: ${latest.namaKoor} (${latest.kodeKoor})
Hari ke-${maxDay} dari siklus 14 hari.

## Tabel Persentase Terkini (Sesuai Log Fasilitator)
${rawTable}

## Catatan Kualitatif Tambahan
${buildQualitativeNotes(history)}

Tolong buatkan analisis naratif yang persis meniru gaya penulisan contoh berikut. JANGAN gunakan bullet points, gunakan paragraf deskriptif yang SANGAT SINGKAT, PADAT, dan TO THE POINT (karena ini untuk koordinator yang membaca cepat). Fokuskan analisis PADA DATA TABEL PERSENTASE TERKINI di atas.

ATURAN KETAT (WAJIB DIIKUTI):
1. **DILARANG BERTELE-TELE**: Jangan gunakan frasa basa-basi/analisis kosong seperti "Hal ini menunjukkan bahwa...", "Ini menjadi akar masalah yang signifikan...", "Sementara itu...", atau "Ini menunjukkan komitmen...". Langsung tembak ke angka dan fakta.
2. **DILARANG MENGULANG FAKTA KEBALIKAN**: Jangan menambahkan kalimat sisa yang tidak perlu (misal: "Sudah sesuai 5%. Sementara yang belum 95%." -> cukup sebut yang 5%).
3. **UBAH PERSENTASE JADI ANGKA ABSOLUT (KECUALI DAPODIK)**: Koordinator tidak ingin membaca terlalu banyak persentase. Hitung angka absolutnya (boleh dibulatkan) menggunakan patokan ini:
   - **Total Sekolah = 20 sekolah** (misal: 15% sekolah -> "3 sekolah (15%)")
   - **Total Dokumen Teknis per sekolah = 6 dokumen** (misal: rata-rata 50% -> "rata-rata 3 dokumen (50%)")
   - **Total Dokumen Admin per sekolah = 11 dokumen**
4. **AWAS HALUSINASI ANGKA**: DILARANG KERAS menyalin angka-angka (seperti 5%, 15%, 3 sekolah, dll) dari teks "Contoh Referensi Analisis Manusia" ke dalam jawabanmu. Angka di contoh itu HANYA DUMMY untuk mencontohkan format narasi. Kamu WAJIB MENGAMBIL angka asli dari "Tabel Persentase Terkini" di atas.
5. **KONTEKS TERVERIFIKASI**: Persentase dokumen terverifikasi (baik teknis/admin) dihitung DARI dokumen yang sudah terunggah, bukan dari total keseluruhan. Jangan salah logika.
6. **NARASI SEBAB-AKIBAT (ROOT CAUSE)**: Hubungkan kalimat dengan logika sebab-akibat lugas agar akar masalahnya terlihat jelas, terutama jika ada Catatan Kualitatif.
   - *Contoh 1 (Logika antar indikator)*: "19 sekolah sudah mengunggah 100% dokumen teknisnya. Namun, belum ada satupun dokumen yang diverifikasi fasilitator, yang menyebabkan tidak ada dokumen terverifikasi sesuai."
   - *Contoh 2 (Kualitatif -> Kuantitatif)*: "Terdapat satu sekolah yang mengundurkan diri (berdasarkan catatan), menyebabkan dokumen maksimal hanya menyentuh progress 95%."
7. **PENYEDERHANAAN JIKA SUDAH 100%**: Jika suatu indikator (misalnya Dokumen Admin atau Dokumen Teknis) sudah Sesuai 100% untuk semua sekolah, TIDAK PERLU lagi menjabarkan angka rata-rata, minimum, terverifikasi, atau terunggah secara panjang lebar. Cukup tuliskan 1 kalimat penyimpulan ringkas.
   - *Contoh yang benar*: "Dokumen admin sesuai sudah mencapai 100%. Artinya, dokumen admin terunggah dan terverifikasi juga sudah 100%."

Struktur Paragraf yang Wajib Diikuti:
1. **Pembuka**: Sebutkan apakah hari ini ada checkpoint baru atau masih melanjutkan checkpoint sebelumnya, lalu sebutkan apakah sudah tercapai atau belum.
2. **Dokumen Teknis**: Sebutkan estimasi jumlah sekolah yang sudah sesuai 100%. Lalu sekolah terverifikasi lengkap (dan rata-ratanya dalam X dokumen). Lalu sekolah terunggah lengkap (dan rata-rata & minimumnya dalam X dokumen). JIKA SUDAH 100%, gunakan kalimat penyederhanaan (aturan ke-7).
3. **Dokumen Admin**: Sebutkan estimasi jumlah sekolah sesuai lengkap. Terverifikasi. Terunggah lengkap (termasuk rata-rata & minimum dalam X dokumen). JIKA SUDAH 100%, gunakan kalimat penyederhanaan (aturan ke-7).
4. **Perencana**: Status persentase/jumlah sekolah memiliki perencana.
5. **Dapodik**: Sebutkan HANYA PERSENTASE update bukti dapodik. DILARANG KERAS MENGUBAHNYA MENJADI JUMLAH SEKOLAH MUTLAK (seperti "8 sekolah" atau "sisa 12 sekolah"). 100% di Dapodik berarti "100% dari berapapun sekolah yang butuh update" (bisa 11/11, 2/2, dll). Jika datanya 40%, cukup tulis "Sekolah update bukti dapodik baru mencapai 40%". Jika 100%, tulis "Sekolah update bukti dapodik sudah 100%, berarti semua yang butuh update sudah melakukannya."
6. **Biodata**: Persentase/jumlah sekolah yang biodatanya terverifikasi.
7. **Aplikasi**: Jika ada yang belum login, sebutkan singkat.
8. **Kesimpulan**: Awali dengan "Kesimpulannya, ...", sebutkan alasan utama mengapa checkpoint belum tercapai dalam 1 kalimat lugas.

Contoh Referensi Analisis Manusia (Tiru KERINGKASANNYA dan POLA KALIMATNYA, tapi JANGAN TIRU ANGKA-ANGKANYA):
[Contoh 1]
"Checkpoint hari 11 belum ada, jadi masih melanjutkan checkpoint sebelumnya yaitu dokumen teknis sesuai 100% untuk 100% sekolah. Checkpoint sebelumnya belum tercapai.

Dokumen teknis yang sesuai 100% baru mencapai 1 sekolah (5%), dengan rata-rata 0 dokumen per sekolah (5%). Dokumen teknis terverifikasi lengkap baru 3 sekolah (15%) dengan rata-rata 0 dokumen (5%). Dokumen teknis terunggah lengkap sisa 6 sekolah yang belum mengunggah, dengan progress minimum 0 dokumen (0%).

Dokumen admin sesuai sudah 100% untuk semua sekolah. Artinya, dokumen admin terunggah dan terverifikasi juga 100%.

Status memiliki perencana: sudah semua sekolah memiliki perencana.

Sekolah update bukti dapodik sudah 100%, berarti semua sekolah sudah update atau tidak ada perubahan kebutuhan.

Kesimpulannya, checkpoint sebelumnya masih belum tercapai karena hanya 1 sekolah (5%) yang dokumen teknis sesuainya sudah lengkap, serta terverifikasi dan terunggah masih sedikit."

PENTING MUTLAK: Gunakan HANYA data dari "Tabel Persentase Terkini" untuk menyusun angka-angkanya. Dilarang keras meniru angka dari contoh.`;

  return [
    { role: "system", content: "Anda adalah analis data. Jawab dengan analisis naratif sesuai contoh dan format yang diinstruksikan. Dilarang menggunakan bullet point atau format markdown lain, gunakan paragraf biasa." },
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
