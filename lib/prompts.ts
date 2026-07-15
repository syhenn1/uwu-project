import { activeCheckpoints, buildKnowledgeSummary } from "./knowledge/checkpoints";
import { KEY_TO_HEADER } from "./columns";
import { summarizeDay } from "./metrics";
import { getCheckpointCompliance, countNonCompliant } from "./compliance";
import type { CheckpointCompliance } from "./compliance";
import { documentFunnelAnomalies } from "./documentProgress";
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
- JANGAN PERNAH sebut, hitung, atau singgung "Nilai Risiko" dalam bentuk apapun - metrik itu SENGAJA tidak boleh jadi bagian dari analisis ini sama sekali (dipakai di tempat lain di aplikasi, bukan di sini). Nilai kinerja/urgensi murni dari status checkpoint, tingkat keparahan (Hijau/Kuning/Oranye/Merah), dan catatan Kendala.
- JANGAN menyalahkan fasilitator untuk checkpoint yang belum berlaku pada hari tsb (lihat catatan "belum relevan" di data).
- Jika ada "Catatan Admin" yang sudah ditulis manusia, jadikan itu konteks tambahan - jangan diulang mentah-mentah, tapi boleh dikonfirmasi/dipertajam. Kolom "Analisis" sengaja TIDAK diikutkan sebagai konteks - itu tempat menyimpan hasil analisis AI ini sendiri (lewat fitur "Tambahkan ke Spreadsheet"), supaya tiap analisis baru murni dari data terkini, bukan menggemakan hasil analisis lama.
- Perhatikan pola anomali secara SPESIFIK, jangan cuma bilang "ada anomali" tanpa merinci - sebut jenisnya, mis.: (a) checkpoint yang berulang kali Belum Sesuai padahal sudah lama jatuh tempo, (b) data Hasil LK yang tidak konsisten/tidak sesuai dengan data Aplikasi (dua sumber independen saling bertentangan), (c) data yang sama sekali tidak berubah selama beberapa hari berturut-turut (indikasi fasilitator berhenti mengisi laporan, bukan kondisi stabil), dan (d) fasilitator yang polanya menunjukkan cuma aktif di sisi Aplikasi/administratif (rajin login/isi form) tapi checkpoint substantif ke sekolah tidak kunjung maju - ini patut disebut sebagai indikasi fasilitator kurang proaktif/asal isi di lapangan (kesan malas verifikasi langsung ke sekolah), bukan sekadar "data belum update".
- Format daftar: JANGAN pakai tanda "-" (dash) ataupun penomoran "1.", "2.", dst di depan poin manapun - pisahkan tiap poin dengan SATU BARIS KOSONG (dua kali enter/newline ganda), tanpa marker/bullet apapun di awal baris. Ikuti persis jumlah dan isi poin yang diminta di user prompt.
- Kolom bersumber "LK Fasil" yang terbaca 0% masalah atau "Sudah" TIDAK OTOMATIS berarti kondisinya baik - itu bisa jadi cuma default kosong di sheet kalau fasilitator belum login LK sama sekali, atau catatan "Kendala..." terkait menyebut "belum diisi". Selalu silangkan dengan status "Fasil Belum Login LK" dan catatan Kendala terkait sebelum menyimpulkan sesuatu "aman" - jangan tertipu angka 0% yang sebenarnya berarti "belum ada data", bukan "sudah terverifikasi baik".
- Data yang dianalisis selalu terdiri dari dua jenis, dan JANGAN dicampur jadi satu poin: (1) data KUANTITATIF - persentase checkpoint dokumen (Panlak, Format/Template, Perencana, Dapodik, Dokumen Admin, Dokumen Teknis, dst.) dan status kepatuhannya; (2) data KUALITATIF - catatan bebas seperti Kendala/Analisis Admin/Catatan Admin dari lapangan. Kalau diminta membahas keduanya, tulis sebagai dua bagian terpisah, bukan digabung dalam satu kalimat.
- Kalau diberi bagian "Perbandingan dengan Hari Sebelumnya", pakai itu apa adanya untuk merefleksikan perubahan (naik/turun/berubah status) - JANGAN mengarang perubahan yang tidak ada di data itu. Kalau bagian itu bilang tidak ada data pembanding (mis. Hari 1) atau tidak ada yang berubah, sampaikan itu apa adanya.
- Setiap indikator checkpoint di data sudah dilabeli tingkat keparahan mengikuti acuan admin: Hijau (tidak perlu tindakan), Kuning (monitoring), Oranye (tindak lanjut oleh koordinator), Merah (eskalasi ke pusat/pembinaan intensif). Pakai label ini APA ADANYA saat menyebut urgensi suatu masalah - JANGAN menilai tingkat keparahan sendiri di luar label yang sudah diberikan di data.
- Jawab dalam Bahasa Indonesia. Ikuti persis format/bagian yang diminta (termasuk judul bagian kalau ada) - isi tiap poin dalam bentuk SATU kalimat ringkas, tanpa sub-bullet, tanpa paragraf penjelasan tambahan, tanpa pembuka/penutup di luar yang diminta.
- JANGAN pakai label/judul tebal (format "**Kata Kunci**:") di depan tiap poin, dan jangan sekadar mengisi template kaku - tulis tiap kalimat mengalir seperti sedang bernarasi/bertutur, seolah manusia yang buru-buru mengetik catatan singkat, BUKAN bahasa laporan yang kaku dan baku ala template formulir.`;

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

function buildHistoryTable(history: FacilRow[], maxDay: number, excludeAplikasi: boolean): string {
  const groups = activeCheckpoints(maxDay);
  const cols = groups.flatMap((g) => g.indicators.filter((i) => !excludeAplikasi || i.sumberData !== "Aplikasi Revit").map((i) => i.kolom));
  const uniqueCols = Array.from(new Set(cols));

  const header = ["Hari", ...uniqueCols].join(" | ");
  const sep = uniqueCols.map(() => "---").join(" | ");
  const rows = history.map((row) => {
    const cells = uniqueCols.map((c) => (row.hari >= (groups.find((g) => g.indicators.some((i) => i.kolom === c))?.activeFromDay ?? 0) ? formatCell(row[c]) : "(belum berlaku)"));
    return [`Hari ${row.hari}`, ...cells].join(" | ");
  });

  return [header, `--- | ${sep}`, ...rows].join("\n");
}

/** Bandingkan satu fasilitator antara Hari ke-N (currentRow) dan Hari ke-(N-1)
 * (dicari di `history`, BUKAN sekadar elemen sebelum-terakhir - supaya tetap
 * benar walau ada hari yang datanya bolong). Dipakai supaya analisis per
 * fasilitator eksplisit "merefleksikan" perubahan dari hari sebelumnya,
 * bukan cuma menampilkan tabel tren mentah dan berharap LLM menyimpulkan sendiri. */
function buildFacilitatorDayDiff(history: FacilRow[], currentRow: FacilRow, hari: number, excludeAplikasi: boolean): string {
  if (hari <= 1) return "(Hari ke-1 - belum ada hari sebelumnya untuk dibandingkan.)";
  const prevRow = history.find((r) => r.hari === hari - 1);
  if (!prevRow) return `(Tidak ada data Hari ke-${hari - 1} untuk dibandingkan.)`;

  const cols = activeCheckpoints(hari).flatMap((g) => g.indicators.filter((i) => !excludeAplikasi || i.sumberData !== "Aplikasi Revit").map((i) => i.kolom));
  const uniqueCols = Array.from(new Set(cols));
  const changed: string[] = [];
  for (const col of uniqueCols) {
    const prevVal = prevRow[col];
    const currVal = currentRow[col];
    if (prevVal !== currVal) {
      const label = KEY_TO_HEADER[col] ?? String(col);
      changed.push(`${label}: ${formatCell(prevVal)} -> ${formatCell(currVal)}`);
    }
  }
  return changed.length > 0
    ? `- Kolom checkpoint yang berubah dari kemarin: ${changed.join("; ")}.`
    : `- Tidak ada satupun kolom checkpoint numerik yang berubah dari kemarin (indikasi data belum diupdate ulang).`;
}

/** Versi agregat buildFacilitatorDayDiff untuk ringkasan SELURUH fasilitator -
 * membandingkan statistik hari ini vs kemarin (jumlah fasilitator belum
 * login/checkpoint belum sesuai). SENGAJA tidak menyertakan Nilai Risiko -
 * lihat catatan di SYSTEM_PROMPT soal kenapa metrik itu dikecualikan dari analisis. */
function buildOverallDayDiff(dayRows: FacilRow[], prevDayRows: FacilRow[], hari: number): string {
  if (hari <= 1) return "(Hari ke-1 - belum ada hari sebelumnya untuk dibandingkan.)";
  if (prevDayRows.length === 0) return `(Tidak ada data Hari ke-${hari - 1} untuk dibandingkan.)`;

  const today = summarizeDay(dayRows);
  const yesterday = summarizeDay(prevDayRows);
  const todayNonCompliant = dayRows.filter((r) => countNonCompliant(getCheckpointCompliance(r, hari)) > 0).length;
  const yesterdayNonCompliant = prevDayRows.filter((r) => countNonCompliant(getCheckpointCompliance(r, hari - 1)) > 0).length;

  const lines: string[] = [];
  lines.push(`- Fasilitator belum login LK: ${yesterday.belumLogin} orang -> ${today.belumLogin} orang.`);
  lines.push(`- Fasilitator dengan checkpoint belum sesuai: ${yesterdayNonCompliant} orang -> ${todayNonCompliant} orang.`);
  return lines.join("\n");
}

/** Status checkpoint TERKINI (hasil getCheckpointCompliance, yang sudah
 * memperhitungkan downgrade trust/mismatch di lib/compliance.ts) - dikasih
 * eksplisit ke LLM supaya "checkpoint mana yang belum tercapai" disebut dari
 * status resmi aplikasi, bukan LLM menghitung ulang sendiri dari tabel angka
 * mentah (yang tidak tahu soal distrust 0%/kendala kontradiktif). Tiap
 * indikator (gating maupun info) juga dilabeli tingkat keparahan (lihat
 * classifySeverity) supaya LLM tidak menilai urgensi sendiri dari angka
 * mentah, DAN supaya bisa jelaskan kalau status Belum Sesuai/Merah ternyata
 * didorong oleh satu indikator gating (mis. checkpoint 7 "Dapodik sesuai
 * kebutuhan") yang jauh lebih buruk dari indikator info lain di checkpoint
 * yang sama yang terlihat baik-baik saja - bukan cuma menyebut satu angka
 * yang keliatan kontradiktif. */
function buildCheckpointStatusSummary(
  compliance: CheckpointCompliance[],
  excludeAplikasi: boolean,
  funnelAnomalies: Map<keyof FacilRow, string>
): string {
  if (compliance.length === 0) return "(belum ada checkpoint yang jatuh tempo hari ini)";
  const rows = compliance
    .map(({ group, status, indicators }) => {
      // Kalau excludeAplikasi, buang indikator ber-sumber "Aplikasi Revit" -
      // checkpoint yang SELURUH indikatornya dari Aplikasi (mis. Dokumen
      // Admin/Teknis, Login Aplikasi, Biodata, RAB) jadi kosong total dan
      // di-skip baris-nya (bukan ditampilkan "- ..." tanpa detail).
      const visible = excludeAplikasi ? indicators.filter((i) => i.sumberData !== "Aplikasi Revit") : indicators;
      if (visible.length === 0) return null;
      const label = status === "sesuai" ? "Sesuai" : status === "belum-sesuai" ? "Belum Sesuai" : "Tidak Ada Data";
      // Sertakan juga indikator info (bobot 0) di samping yang gating - satu
      // checkpoint bisa punya indikator "info" yang terlihat baik TAPI status
      // tetap Belum Sesuai/Merah karena indikator gating lain jauh lebih buruk.
      // LLM perlu lihat KEDUANYA supaya bisa jelaskan alasan sebenarnya, bukan
      // cuma nyebut satu angka yang keliatan kontradiktif dengan status di atasnya.
      const detail = visible
        .map((i) => {
          const sev = indicatorSeverity(i, group);
          const tierTag = sev ? ` [${TIER_LABEL[sev.tier]} - ${sev.aksi}]` : "";
          const gatingTag = i.gating ? "" : " (info, tidak menggerakkan status)";
          const anomaly = funnelAnomalies.get(i.kolom);
          const anomalyTag = anomaly ? ` [ANOMALI FUNNEL - JANGAN SEBUT ANGKA PASTI INDIKATOR INI, GANTI DENGAN "...": ${anomaly}]` : "";
          return `${i.label}: ${i.detail}${tierTag}${gatingTag}${anomalyTag}`;
        })
        .join("; ");
      return `- [${group.no}. ${group.name}] ${label} - ${detail}`;
    })
    .filter((line): line is string => line !== null);
  if (rows.length === 0) return "(tidak ada checkpoint bersumber LK Fasil yang jatuh tempo hari ini - semua checkpoint yang jatuh tempo bersumber Aplikasi, disembunyikan sesuai mode aktif)";
  return rows.join("\n");
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

export function buildFacilitatorAnalysisMessages(history: FacilRow[], options?: { excludeAplikasi?: boolean }): ChatMessage[] {
  const excludeAplikasi = options?.excludeAplikasi ?? false;
  if (history.length === 0) throw new Error("Tidak ada data histori untuk fasilitator ini.");
  const maxDay = history[history.length - 1].hari;
  const latest = history[history.length - 1];
  const compliance = getCheckpointCompliance(latest, maxDay);
  const funnelAnomalies = documentFunnelAnomalies(latest);

  const exclusionNote = excludeAplikasi
    ? `\n**Mode "Kecualikan Data Aplikasi" AKTIF: seluruh checkpoint/persentase ber-sumber "Aplikasi Revit" (mis. Login Aplikasi, Biodata Terverifikasi, Dokumen Admin/Teknis Terunggah/Terverifikasi/Sesuai, RAB Sepakat) SUDAH SENGAJA dibuang dari data di atas - JANGAN menyebutnya "tidak ada data"/anomali/kekurangan, itu memang disembunyikan sesuai permintaan pengguna. Fokuskan seluruh analisis HANYA pada checkpoint bersumber LK Fasil (Sudah Dihubungi, Panlak, Format/Template, Perencana, Dapodik) dan catatan Kendala kualitatif.**\n`
    : "";

  // Poin dokumen ditulis MUNDUR dari checkpoint paling baru jatuh tempo ke
  // yang paling awal (Dokumen Teknis Sesuai -> ... -> Panlak) - sesuai
  // instruksi admin: bahas checkpoint yang jatuh tempo hari ini duluan,
  // lalu mundur ke checkpoint-checkpoint sebelumnya satu per satu.
  const documentPoints = excludeAplikasi
    ? "Dapodik (kesesuaian dengan lapangan, % sudah update, % sudah upload bukti - kalau ada kolom terkait yang masih kosong/belum terisi, bilang belum bisa disimpulkan, JANGAN menebak); Perencana; Format/Template; Panlak"
    : `Dokumen Teknis Sesuai; Dokumen Teknis Terverifikasi; Dokumen Teknis Terunggah; Dokumen Admin Sesuai; Dokumen Admin Terverifikasi; Dokumen Admin Terunggah; Dapodik (kesesuaian dengan lapangan, % sudah update, % sudah upload bukti - kalau ada kolom terkait yang masih kosong/belum terisi, bilang belum bisa disimpulkan, JANGAN menebak); Perencana (kalau versi Hasil LK vs Aplikasi beda jauh, sebut & simpulkan artinya DI POIN INI, mis. data Aplikasi kemungkinan masih bersifat administratif/sementara belum solid); Format/Template; Panlak`;

  const userPrompt = `Fasilitator: ${latest.kodeFasil}
Koordinator: ${latest.namaKoor} (${latest.kodeKoor})
Data tersedia sampai Hari ke-${maxDay} dari siklus 14 hari.
${exclusionNote}
## Basis Pengetahuan Checkpoint (kolom, bobot, definisi)
${buildKnowledgeSummary(maxDay, excludeAplikasi)}

## Status Checkpoint Saat Ini (per Hari ke-${maxDay})
${buildCheckpointStatusSummary(compliance, excludeAplikasi, funnelAnomalies)}

## Tabel Tren Harian
${buildHistoryTable(history, maxDay, excludeAplikasi)}

## Perbandingan dengan Hari Sebelumnya (Hari ke-${maxDay - 1})
${buildFacilitatorDayDiff(history, latest, maxDay, excludeAplikasi)}

## Catatan Kualitatif (Kendala / Analisis / Catatan Admin yang sudah ada)
${buildQualitativeNotes(history)}

Tolong tulis dalam bentuk poin-poin yang dipisahkan SATU BARIS KOSONG (tekan enter dua kali di antara tiap poin) - JANGAN pakai tanda "-" (dash) ataupun penomoran 1/2/3/dst di depan poin manapun, dan TANPA label/judul di depan tiap poin - langsung isi kalimatnya, ditulis mengalir seperti bernarasi (BUKAN bahasa laporan yang kaku/baku), JANGAN sebut nama fasilitator maupun "Nilai Risiko" di manapun. Tiap baris instruksi di bawah ini = satu poin terpisah, ikuti urutannya persis:

Apa yang berubah dibanding Hari ke-${maxDay - 1}, pakai bagian "Perbandingan dengan Hari Sebelumnya" di atas. Satu kalimat ringkas (maksimal ~25 kata).

Checkpoint MANA yang PERSIS jatuh tempo hari ini, sebutkan syarat lulusnya DAN persentase aktualnya saat ini (mis. "checkpoint hari ini dokumen teknis terverifikasi, syaratnya 100% dari dokumen teknis yang sudah terunggah, saat ini baru mencapai sekian persen") - boleh juga singgung checkpoint terakhir yang sudah tercapai di hari sebelumnya sebagai konteks. Satu kalimat ringkas.

Untuk SETIAP checkpoint dokumen berikut yang SUDAH jatuh tempo (lewati yang "belum relevan" di Basis Pengetahuan Checkpoint), tulis SATU POIN TERPISAH per dokumen (dipisah baris kosong, BUKAN digabung jadi satu poin besar), walau checkpoint yang jatuh tempo hari ini sudah disebut duluan di poin sebelumnya. Bahas MUNDUR persis urutan berikut (checkpoint paling baru dulu, lalu mundur ke checkpoint-checkpoint sebelumnya): ${documentPoints}. WAJIB sebutkan angka aktualnya (pakai "Status Checkpoint Saat Ini"/"Tabel Tren Harian", jangan mengarang) - KECUALI kalau indikatornya ditandai "[ANOMALI FUNNEL]" di data, dalam hal itu JANGAN sebutkan angkanya, tulis "..." saja sebagai penanda datanya tidak logis/salah hitung. Masing-masing satu kalimat ringkas per dokumen.

Satu poin diawali "Kesimpulan: " yang merangkum seluruh angka dokumen di poin-poin sebelumnya dalam 1-2 kalimat.

Pola anomali paling menonjol - soroti secara spesifik kalau ada checkpoint yang berulang kali tidak sesuai padahal sudah lama jatuh tempo${excludeAplikasi ? "" : ", ketidaksesuaian antara data Hasil LK dan Aplikasi,"} atau tanda-tanda fasilitator ini cuma aktif di sisi Aplikasi (rajin login/isi form) tapi tidak ada tindak lanjut nyata ke sekolah sehingga checkpoint tidak kunjung maju (kesan asal isi/kurang proaktif di lapangan). Bilang tidak ada anomali kalau memang tidak ada. Satu kalimat ringkas.

Satu tindakan paling penting untuk admin/koordinator, sesuaikan urgensinya dengan tingkat keparahan yang ada. Satu kalimat ringkas.`;

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];
}

export function buildDailySummaryMessages(dayRows: FacilRow[], hari: number, prevDayRows: FacilRow[] = []): ChatMessage[] {
  if (dayRows.length === 0) throw new Error("Tidak ada data untuk hari ini.");
  // Diurutkan dari yang paling banyak checkpoint Belum Sesuai - SENGAJA tidak
  // pakai Nilai Risiko (lihat SYSTEM_PROMPT soal kenapa metrik itu dikecualikan
  // dari seluruh analisis AI).
  const sorted = [...dayRows].sort(
    (a, b) => countNonCompliant(getCheckpointCompliance(b, hari)) - countNonCompliant(getCheckpointCompliance(a, hari))
  );

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
      return `- ${r.namaFasil} (${r.kodeFasil}, koor: ${r.namaKoor}) - Belum Login LK: ${formatCell(r.fasilBelumLoginLK)}, Belum Login Aplikasi: ${formatCell(r.pctSekolahBelumLoginAplikasi)}${cpNote}`;
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

## Data Kuantitatif per Fasilitator (checkpoint, diurutkan dari yang paling banyak checkpoint Belum Sesuai)
${table}

## Data Kualitatif dari Lapangan (catatan Kendala/Analisis Admin/Catatan Admin)
${notes || "(tidak ada catatan kualitatif tambahan)"}

## Perbandingan dengan Hari Sebelumnya (Hari ke-${hari - 1})
${buildOverallDayDiff(dayRows, prevDayRows, hari)}

Tolong tulis dalam format tiga bagian di bawah. Tiap poin dipisahkan SATU BARIS KOSONG (tekan enter dua kali di antara tiap poin) - JANGAN pakai tanda "-" (dash) ataupun penomoran 1/2/3/dst di depan poin manapun, dan TANPA label/judul di depan tiap kalimat - langsung isi kalimatnya, natural seperti manusia menulis catatan singkat (judul "##" section TETAP dipakai apa adanya, itu bukan bagian dari larangan dash/penomoran di atas). Poin ke-1, ke-3, ke-4, ke-5, ke-6 masing-masing satu kalimat ringkas (maksimal ~25 kata). Poin ke-2 BOLEH lebih dari satu kalimat kalau fasilitator prioritas itu punya banyak checkpoint Belum Sesuai - JANGAN mengorbankan kejelasan demi memaksakan satu kalimat. Tiap baris instruksi di bawah ini = satu poin terpisah:

## Analisis Kuantitatif
Gambaran keseluruhan kinerja hari ini berdasar status checkpoint, sertakan pola anomali menonjol kalau ada (mis. banyak fasilitator yang checkpoint-nya berulang kali tidak sesuai padahal sudah jatuh tempo, atau data Hasil LK vs Aplikasi yang tidak konsisten).

Siapa yang paling butuh perhatian/intervensi segera. Untuk SETIAP checkpoint Belum Sesuai yang disebut, WAJIB pakai catatan "Checkpoint belum sesuai" di data APA ADANYA (nama indikator + angka + tingkat keparahannya) - DILARANG cuma menulis "NamaCheckpoint (Tingkat)" tanpa keterangan indikator. Sebut juga kalau ada fasilitator yang polanya menunjukkan cuma aktif di sisi Aplikasi (rajin login/isi form) tapi checkpoint substantif ke sekolah tidak kunjung maju (kesan asal isi/kurang proaktif verifikasi lapangan).

Apa yang membaik/memburuk dibanding Hari ke-${hari - 1} (pakai bagian "Perbandingan dengan Hari Sebelumnya" di atas).

## Analisis Kualitatif
Kendala paling menonjol yang berulang di banyak fasilitator, atau bilang tidak ada pola kendala umum kalau memang tidak ada.

Hal penting lain dari catatan lapangan yang belum tercakup di poin sebelumnya, atau bilang tidak ada catatan tambahan kalau memang tidak ada.

## Rekomendasi
Satu tindakan paling penting untuk hari ini/besok, sesuaikan urgensinya dengan tingkat keparahan checkpoint yang ada, mempertimbangkan analisis kuantitatif maupun kualitatif di atas.`;

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];
}
