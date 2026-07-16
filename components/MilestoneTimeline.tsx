import { CHECKPOINT_GROUPS } from "@/lib/knowledge/checkpoints";
import type { CheckpointIndicator } from "@/lib/knowledge/checkpoints";
import { KENDALA_BY_CHECKPOINT, classifyKendalaText } from "@/lib/compliance";
import type { CheckpointCompliance, IndicatorCompliance } from "@/lib/compliance";
import type { CheckpointSourceData, FacilRow } from "@/lib/types";
import { classifySeverity, TIER_RANK } from "@/lib/severity";
import type { SeverityTier } from "@/lib/severity";
import { TIER_STYLES } from "./SeverityBadge";

type SimpleStatus = "sesuai" | "belum-sesuai" | "unknown";

const STATUS_LABEL: Record<CheckpointCompliance["status"], string> = {
  sesuai: "Sesuai",
  "belum-sesuai": "Belum sesuai",
  unknown: "Tidak ada data",
};

const TIER_DOT_CLASS: Record<SeverityTier, string> = {
  hijau: "border-status-good bg-status-good text-white",
  kuning: "border-status-warning bg-status-warning text-white",
  oranye: "border-status-serious bg-status-serious text-white",
  merah: "border-status-critical bg-status-critical text-white",
};

const STATUS_DOT: Record<"unknown" | "future", string> = {
  unknown: "border-status-unknown bg-status-unknown text-white",
  future: "border-dashed border-baseline bg-surface text-ink-muted",
};

const STATUS_TEXT_SM: Record<SimpleStatus, string> = {
  sesuai: TIER_STYLES.hijau.text,
  "belum-sesuai": TIER_STYLES.kuning.text,
  unknown: "text-ink-muted",
};

/** trustLkOkValue (lib/compliance.ts) selalu memakai frasa persis "belum
 * diisi" di `note`-nya untuk SATU dari tiga sebab distrust - kolom Kendala
 * terkait literal bilang belum diisi (beda dari 2 sebab lain: "belum login LK
 * sama sekali" / selisih Aplikasi vs LK, yang frasanya beda). Dipakai untuk
 * bedakan "unknown karena datanya genuinely belum pernah dilaporkan" (baiknya
 * dianggap kasus terburuk) dari "unknown karena sekadar tidak bisa dipastikan
 * akurat" (baiknya tetap netral abu-abu). */
function isBelumDiisiNote(note: string | undefined): boolean {
  return !!note && /belum\s*(di\s*)?isi/i.test(note);
}

/**
 * Tier satu bacaan sumber (LK/Aplikasi) - SELALU dari persentase ASLI, tidak
 * di-floor/clamp berdasarkan status "violation" (beda dari CheckpointCompliancePanel,
 * yang menampilkan teks literal "Belum Sesuai" bersebelahan sehingga hijau
 * jadi kontradiktif di sana - baris checkpoint di sini TIDAK menampilkan teks
 * status biner sama sekali, jadi warna murni ikut angka kelengkapan asli, mis.
 * 94.74% tetap Hijau walau checkpoint-nya belum genap 100%. Kontradiksi macam
 * "Aplikasi bilang oke tapi LK melaporkan kendala nyata" (kendalaMismatch)
 * dikomunikasikan lewat tag "ada kendala LK" terpisah, BUKAN dengan
 * menurunkan warna angkanya jadi abu-abu/merah.
 *
 * Pengecualian: "unknown" yang sebabnya kolom Kendala terkait literal bilang
 * "belum diisi" (lihat isBelumDiisiNote) diperlakukan sebagai kasus TERBURUK
 * (Merah) - datanya bukan cuma "tidak dijamin akurat", tapi genuinely belum
 * ada laporan sama sekali, supaya admin tidak salah kira "belum ada masalah".
 * "unknown" karena sebab lain (mis. belum login LK) tetap abu-abu netral -
 * itu genuinely tidak diketahui, bukan berarti pasti buruk.
 */
function readingTier(r: Reading): SeverityTier | null {
  if (r.status === "unknown") return isBelumDiisiNote(r.note) ? "merah" : null;
  if (r.completionPct == null) return null;
  return classifySeverity(r.completionPct, "higherIsBetter").tier;
}

function readingText(r: Reading): string {
  if (r.status === "unknown" && isBelumDiisiNote(r.note)) return "0%, belum diisi";
  if (r.status === "ok") return "Lengkap";
  return r.completionPct != null ? `${r.completionPct}%` : "-";
}

/** Hari paling awal dari rentang hari berturut-turut (berakhir di `uptoDay`)
 * di mana kolom Kendala terkait checkpoint ini (KENDALA_BY_CHECKPOINT) masih
 * konsisten "belum diisi" - dipakai buat kasih akhiran "sejak Hari X" pada
 * bacaan "0%, belum diisi" (lihat readingText), supaya kelihatan sudah berapa
 * lama gap-nya, bukan seolah baru terjadi hari ini. null kalau checkpoint ini
 * tidak punya kolom Kendala terpetakan, atau histori-nya tidak tersedia. */
function belumDiisiSinceDay(history: FacilRow[], checkpointNo: number, uptoDay: number): number | null {
  const kendalaKey = KENDALA_BY_CHECKPOINT[checkpointNo];
  if (!kendalaKey) return null;
  const byHari = new Map(history.map((r) => [r.hari, r]));
  let since: number | null = null;
  for (let h = uptoDay; h >= 1; h--) {
    const row = byHari.get(h);
    if (!row) break;
    const raw = row[kendalaKey];
    const text = typeof raw === "string" ? raw.trim() : "";
    if (classifyKendalaText(text) !== "belum-diisi") break;
    since = h;
  }
  return since;
}

type Source = Exclude<CheckpointSourceData, null>;

const SOURCE_ORDER: Source[] = ["LK Fasil", "Aplikasi Revit"];
const SOURCE_LABEL: Record<Source, string> = { "LK Fasil": "LK", "Aplikasi Revit": "Aplikasi" };

/** Satu "bacaan" kepatuhan dari satu sumber data (LK atau Aplikasi), dinormalisasi
 * jadi skala "makin tinggi makin lengkap/baik" (0-100) supaya kedua sumber bisa
 * dibandingkan apel-ke-apel walau polaritas kolom aslinya beda-beda. `note`
 * dibawa dari IndicatorCompliance.note (alasan distrust trustLkOkValue kalau
 * status "unknown") - dipakai readingTier/readingText buat bedakan "belum
 * diisi" dari sebab unknown lain, lihat isBelumDiisiNote. */
interface Reading {
  status: "ok" | "violation" | "unknown";
  completionPct: number | null;
  note?: string;
}

const READING_SEVERITY: Record<Reading["status"], number> = { ok: 0, unknown: 1, violation: 2 };

/** Pilih bacaan yang lebih "parah" antara dua bacaan sumber yang sama - dipakai
 * saat satu checkpoint punya beberapa indikator gating dari sumber yang sama
 * (mis. Dokumen Admin/Teknis), sesuai keputusan "tampilkan nilai gating
 * terburuk" bukan rata-rata atau tiap kolom terpisah. */
function worseReading(a: Reading, b: Reading): Reading {
  if (READING_SEVERITY[b.status] !== READING_SEVERITY[a.status]) {
    return READING_SEVERITY[b.status] > READING_SEVERITY[a.status] ? b : a;
  }
  if (a.status === "violation" && a.completionPct != null && b.completionPct != null) {
    return b.completionPct < a.completionPct ? b : a;
  }
  return a;
}

/** Completion% (0-100, "makin tinggi makin lengkap") dari satu indikator - dibaca
 * dari `ind.detail`, yang SELALU menyimpan angka mentah kalau memang ada (lihat
 * evaluateIndicator() di lib/compliance.ts: distrust hanya mengubah `status` jadi
 * "unknown", detail mentahnya tidak direset jadi "-"). Sengaja TIDAK nol-kan
 * completion cuma karena status "unknown" - nilai 0%/"Sudah" yang didowngrade
 * trustLkOkValue() tetap ada angkanya, cuma tidak dijamin akurat (ditandai warna
 * abu-abu di UI, bukan disembunyikan jadi "-"). "-" cuma untuk yang MEMANG tidak
 * ada data mentahnya sama sekali. */
function completionPct(ind: IndicatorCompliance, polarity: CheckpointIndicator["polarity"]): number | null {
  if (ind.kolom === "fasilBelumLoginLK") {
    if (ind.detail === "Sudah") return 100;
    if (ind.detail === "Belum") return 0;
    return null;
  }
  const m = ind.detail.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const raw = parseFloat(m[0]);
  return polarity === "higherIsBetter" ? raw : 100 - raw;
}

/** Kumpulkan, per checkpoint, satu bacaan terburuk untuk tiap sumber data yang
 * benar-benar ada (LK dan/atau Aplikasi) - termasuk sumber yang cuma muncul lewat
 * kolom pembanding (`counterpart`, mis. checkpoint Perencana yang Aplikasi-nya
 * bukan indikator gating tersendiri di knowledge base, cuma pembanding kolom LK). */
function buildSourceReadings(group: (typeof CHECKPOINT_GROUPS)[number], entry: CheckpointCompliance | undefined): Map<Source, Reading> {
  const readings = new Map<Source, Reading>();
  if (!entry) return readings;

  const merge = (source: Source, reading: Reading) => {
    const existing = readings.get(source);
    readings.set(source, existing ? worseReading(existing, reading) : reading);
  };

  for (const ind of entry.indicators) {
    if (!ind.gating) continue;
    const polarity = group.indicators.find((gi) => gi.kolom === ind.kolom)?.polarity;

    if (ind.sumberData) {
      merge(ind.sumberData, { status: ind.status, completionPct: completionPct(ind, polarity), note: ind.note });
    }

    if (ind.counterpart) {
      const counterpartSource: Source = ind.sumberData === "LK Fasil" ? "Aplikasi Revit" : "LK Fasil";
      const target = polarity === "higherIsBetter" ? 100 : 0;
      const cVal = ind.counterpart.value;
      const status: Reading["status"] = cVal == null ? "unknown" : cVal === target ? "ok" : "violation";
      const pct = cVal == null ? null : polarity === "higherIsBetter" ? cVal : 100 - cVal;
      merge(counterpartSource, { status, completionPct: pct });
    }
  }

  return readings;
}

type Row =
  | { kind: "checkpoint"; group: (typeof CHECKPOINT_GROUPS)[number] }
  | { kind: "marker"; day: number; variant: "today" | "viewed" };

/** Urutan baris: 14 checkpoint apa adanya (sudah urut per activeFromDay),
 * disisipi penanda "Hari ini"/"Sedang dilihat" tepat di posisi hari yang
 * sesuai - tanpa perlu hitung posisi piksel/persen sama sekali. */
function buildRows(todayHari: number, viewedHari: number): Row[] {
  const markers: { day: number; variant: "today" | "viewed" }[] = [{ day: todayHari, variant: "today" }];
  if (viewedHari !== todayHari) markers.push({ day: viewedHari, variant: "viewed" });
  markers.sort((a, b) => a.day - b.day);

  const rows: Row[] = [];
  let mi = 0;
  for (const g of CHECKPOINT_GROUPS) {
    while (mi < markers.length && markers[mi].day < g.activeFromDay) {
      rows.push({ kind: "marker", ...markers[mi] });
      mi++;
    }
    rows.push({ kind: "checkpoint", group: g });
  }
  while (mi < markers.length) {
    rows.push({ kind: "marker", ...markers[mi] });
    mi++;
  }
  return rows;
}

function MarkerRow({ day, variant }: { day: number; variant: "today" | "viewed" }) {
  const isToday = variant === "today";
  return (
    <div className="relative z-10 flex items-center gap-2.5 py-0.5">
      <div className="flex w-5 shrink-0 justify-center">
        <div className={`h-2 w-2 rounded-full ${isToday ? "bg-series-1" : "border-2 border-ink-secondary bg-surface"}`} />
      </div>
      <span className={`shrink-0 text-[10px] font-semibold ${isToday ? "text-series-1" : "text-ink-secondary"}`}>
        {isToday ? "Hari ini" : "Dilihat"} · H{day}
      </span>
      <div className={`h-px flex-1 ${isToday ? "bg-series-1/40" : "border-t border-dashed border-ink-secondary/50"}`} aria-hidden />
    </div>
  );
}

/** Warna dot lingkaran nomor checkpoint = tier TERBURUK di antara semua
 * bacaan (readingTier, sudah termasuk aturan "unknown karena belum diisi" =
 * Merah) - bukan diturunkan dari entry.status. Ini SENGAJA supaya checkpoint
 * dengan kendalaMismatch (Aplikasi bilang oke, tapi LK melaporkan kendala
 * nyata - entry.status jadi "unknown" di compliance.ts) tetap tampil Hijau
 * kalau angkanya memang oke; kontradiksinya dikomunikasikan lewat tag "ada
 * kendala LK", bukan dot yang jadi abu-abu. Abu-abu cuma dipakai kalau
 * benar-benar tidak ada satupun bacaan yang bisa digradasi. */
function checkpointDotClass(statusKey: CheckpointCompliance["status"] | "future", readings: Map<Source, Reading>): string {
  if (statusKey === "future") return STATUS_DOT.future;
  let worst: SeverityTier | null = null;
  for (const r of readings.values()) {
    const tier = readingTier(r);
    if (tier && (!worst || TIER_RANK[tier] > TIER_RANK[worst])) worst = tier;
  }
  return worst ? TIER_DOT_CLASS[worst] : STATUS_DOT.unknown;
}

function CheckpointRow({
  group,
  entry,
  history,
  viewedHari,
  anomalyFields,
}: {
  group: (typeof CHECKPOINT_GROUPS)[number];
  entry: CheckpointCompliance | undefined;
  history: FacilRow[];
  viewedHari: number;
  anomalyFields?: Set<keyof FacilRow>;
}) {
  const statusKey: CheckpointCompliance["status"] | "future" = entry ? entry.status : "future";
  const violationCount = entry?.indicators.filter((i) => i.gating && i.status === "violation").length ?? 0;
  const kendalaIssue = entry?.kendala?.isIssue;
  // Kolom Kendala checkpoint ini (kalau ada pemetaannya) punya anomali
  // "future_data" AKTIF - data untuk hari yang belum terjadi sudah terisi,
  // jadi datanya tidak bisa dipercaya. Force dot jadi Merah + tag terpisah,
  // SAMA seperti pola "ada kendala LK" yang sudah ada.
  const kendalaKeyForCheckpoint = KENDALA_BY_CHECKPOINT[group.no];
  const hasFutureDataAnomaly = !!(kendalaKeyForCheckpoint && anomalyFields?.has(kendalaKeyForCheckpoint));
  const readings = buildSourceReadings(group, entry);
  const sources = SOURCE_ORDER.filter((s) => readings.has(s));
  const dotClass = hasFutureDataAnomaly ? TIER_DOT_CLASS.merah : checkpointDotClass(statusKey, readings);

  return (
    <div className="relative z-10 flex items-start gap-2.5 py-0.5" title={group.tujuan}>
      <div className="flex w-5 shrink-0 justify-center pt-0.5">
        <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 text-[9px] font-bold ${dotClass}`}>
          {group.no}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0 text-xs leading-tight">
        <span className="font-medium text-ink-primary">{group.name}</span>
        <span className="text-[10px] text-ink-muted">H{group.activeFromDay}·b{group.bobotTotal}</span>

        {sources.length > 0 ? (
          sources.map((s) => {
            const r = readings.get(s)!;
            const text = readingText(r);
            const tier = readingTier(r);
            const textClass = tier ? TIER_STYLES[tier].text : "text-ink-muted";
            const since = r.status === "unknown" && isBelumDiisiNote(r.note) ? belumDiisiSinceDay(history, group.no, viewedHari) : null;
            return (
              <span key={s} className={`font-medium ${textClass}`}>
                {SOURCE_LABEL[s]} {text}
                {since != null && since < viewedHari && ` (sejak Hari ${since})`}
              </span>
            );
          })
        ) : (
          <span className={`font-medium ${entry ? STATUS_TEXT_SM[entry.status === "unknown" ? "unknown" : entry.status] : "text-ink-muted"}`}>
            {entry ? STATUS_LABEL[entry.status] : "Belum jatuh tempo"}
          </span>
        )}

        {violationCount > 0 && <span className="text-[10px] text-status-critical">({violationCount} indikator)</span>}
        {kendalaIssue && (
          <span className="rounded bg-status-critical/10 px-1 py-0.5 text-[9px] font-semibold uppercase text-status-critical">
            ada kendala LK
          </span>
        )}
        {hasFutureDataAnomaly && (
          <span className="rounded bg-status-critical/10 px-1 py-0.5 text-[9px] font-semibold uppercase text-status-critical" title="Data untuk hari yang belum terjadi sudah terisi - lihat Anomali Terdeteksi">
            anomali data
          </span>
        )}
      </div>
    </div>
  );
}

export function MilestoneTimeline({
  compliance,
  history,
  todayHari,
  viewedHari,
  anomalyFields,
}: {
  compliance: CheckpointCompliance[];
  history: FacilRow[];
  todayHari: number;
  viewedHari: number;
  /** Kolom dengan anomali "future_data" AKTIF (lihat lib/anomalies.ts) -
   * checkpoint yang kolom Kendala-nya kena anomali ini dipaksa tampil Merah
   * + tag "anomali data", terlepas dari status compliance normalnya. */
  anomalyFields?: Set<keyof FacilRow>;
}) {
  const rows = buildRows(todayHari, viewedHari);

  return (
    <div className="rounded-lg border border-border bg-surface p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink-primary">Milestone</h2>
        <span className="text-[10px] text-ink-muted">arahkan kursor ke node untuk tujuan checkpoint</span>
      </div>

      <div className="relative">
        <div className="absolute left-2.5 top-0 bottom-0 w-0.5 -translate-x-1/2 rounded-full bg-gridline" aria-hidden />
        <div className="flex flex-col">
          {rows.map((row) =>
            row.kind === "marker" ? (
              <MarkerRow key={`marker-${row.variant}`} day={row.day} variant={row.variant} />
            ) : (
              <CheckpointRow
                key={row.group.no}
                group={row.group}
                entry={compliance.find((c) => c.group.no === row.group.no)}
                history={history}
                viewedHari={viewedHari}
                anomalyFields={anomalyFields}
              />
            )
          )}
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5 border-t border-gridline pt-1.5 text-[9px] text-ink-muted">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-status-good" /> Hijau ≥90% (Sesuai)
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-status-warning" /> Kuning 70-90%
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-status-serious" /> Oranye 30-70%
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-status-critical" /> Merah &lt;30%
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-status-unknown" /> Tidak ada data
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full border border-dashed border-baseline" /> Belum jatuh tempo
        </span>
      </div>
    </div>
  );
}
