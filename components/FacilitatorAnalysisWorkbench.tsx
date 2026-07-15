"use client";

import { useState } from "react";
import Link from "next/link";
import type { FacilRow } from "@/lib/types";
import { QUALITATIVE_FIELDS } from "@/lib/notes";
import { KEY_TO_HEADER } from "@/lib/columns";
import { KENDALA_ACTIVE_FROM_DAY, classifyKendalaText } from "@/lib/compliance";
import type { CheckpointCompliance } from "@/lib/compliance";
import { classifySeverity } from "@/lib/severity";
import { findIndicator } from "@/lib/knowledge/checkpoints";
import { TIER_STYLES } from "./SeverityBadge";
import { InfoTooltip } from "./InfoTooltip";

const KENDALA_FIELDS = QUALITATIVE_FIELDS.filter((f) => f.key !== "analisis" && f.key !== "catatanAdmin");

function fieldValue(row: FacilRow, key: keyof FacilRow): string {
  const v = row[key];
  if (typeof v !== "string" || v === "Belum Diisi") return "";
  return v;
}

/** "aman" (hijau) = tidak ada kendala nyata, "belum-diisi" (kuning) = fasilitator
 * belum menanggapi padahal checkpoint sudah jatuh tempo (gap administratif,
 * belum tentu ada masalah lapangan), "ada-kendala" (merah) = laporan masalah
 * nyata dari lapangan, "netral" (abu) = checkpoint terkait belum jatuh tempo. */
type KendalaState = "aman" | "belum-diisi" | "ada-kendala" | "netral";

interface KendalaDisplay {
  text: string;
  state: KendalaState;
  /** true kalau `text` teks sintetis buatan UI (bukan isi asli sel sheet) - dipakai buat gaya italic. */
  isPlaceholder: boolean;
  /** Khusus kolom Kendala Komunikasi: pesan status otomatis ("Belum diisi
   * status komunikasi semua/sebagian sekolah...") yang dipisah keluar dari
   * `text` - ditampilkan sebagai card kecil di LUAR input field, bukan
   * dicampur dengan narasi bebas fasilitator. null kalau tidak ada/tidak relevan. */
  statusNote: string | null;
}

/** Kolom Kendala Komunikasi bisa berisi DUA hal berbeda digabung dengan
 * pemisah " | ": narasi kendala asli dari fasilitator (mis. "Kepala sekolah
 * sulit dihubungi, Jaringan internet sekolah bermasalah"), dan/atau pesan
 * status kelengkapan data OTOMATIS kalau kolom G (status) kosong untuk
 * sebagian/semua sekolah hari itu (mis. "Belum diisi status komunikasi
 * sebagian sekolah (3 dari 20)"). Sheet SENGAJA memisah keduanya pakai " | "
 * (bukan koma) supaya beda jelas dari narasi asli - dipakai persis di sini
 * untuk memisah juga: pesan status ditaruh sebagai card kecil di LUAR input
 * field, narasi asli (kalau ada) tetap di dalam field seperti kolom Kendala
 * lain. */
const STATUS_KOMUNIKASI_PATTERN = /^belum\s+diisi\s+status\s+komunikasi\s+(semua|sebagian)\s+sekolah(\s*\(\s*\d+\s*dari\s*\d+\s*\))?\.?$/i;

function extractStatusKomunikasiNote(text: string): { note: string | null; rest: string } {
  const parts = text
    .split("|")
    .map((p) => p.trim())
    .filter((p) => p !== "");
  const noteParts = parts.filter((p) => STATUS_KOMUNIKASI_PATTERN.test(p));
  const restParts = parts.filter((p) => !STATUS_KOMUNIKASI_PATTERN.test(p));
  return { note: noteParts.length ? noteParts.join(" | ") : null, rest: restParts.join(" | ") };
}

/** Cari hari terakhir SEBELUM `beforeDay` di mana kolom Kendala Komunikasi
 * benar-benar menunjukkan fasilitator aktif melapor (narasi kendala asli,
 * ATAU konfirmasi eksplisit "tidak ada kendala") - BUKAN sekadar "Belum
 * Diisi"/pesan status "belum diisi status komunikasi ...", yang keduanya
 * bukan bukti aktivitas. Dipakai supaya "Belum diisi status komunikasi
 * semua sekolah" dikasih konteks "terakhir kali dia beneran lapor kapan",
 * bukan cuma bilang "belum diisi" tanpa riwayat. null kalau tidak ketemu
 * sama sekali di histori yang tersedia (mis. memang belum pernah lapor). */
function lastActiveCommunicationDay(history: FacilRow[], beforeDay: number): number | null {
  const byHari = new Map(history.map((r) => [r.hari, r]));
  for (let h = beforeDay - 1; h >= 1; h--) {
    const row = byHari.get(h);
    if (!row) continue;
    const raw = row.kendalaKomunikasi;
    const text = typeof raw === "string" ? raw.trim() : "";
    if (text === "") continue;
    const { rest } = extractStatusKomunikasiNote(text);
    const state = classifyKendalaText(rest);
    if (state === "ada-kendala" || state === "tidak-ada-kendala") return h;
  }
  return null;
}

/** Cari hari paling awal dari rentang hari berturut-turut (berakhir di `hari`)
 * yang nilai kolom `key`-nya identik dengan `rawText` - dipakai supaya kendala
 * yang tidak berubah berhari-hari kelihatan "sejak Hari X", bukan seolah baru
 * dilaporkan hari ini. Berhenti begitu ketemu hari dengan nilai beda ATAU baris
 * hari itu tidak ada di histori. */
function streakStartDay(history: FacilRow[], key: keyof FacilRow, hari: number, rawText: string): number {
  const byHari = new Map(history.map((r) => [r.hari, r]));
  let start = hari;
  for (let h = hari - 1; h >= 1; h--) {
    const row = byHari.get(h);
    if (!row) break;
    const raw = row[key];
    const text = typeof raw === "string" ? raw.trim() : "";
    if (text !== rawText) break;
    start = h;
  }
  return start;
}

/**
 * Kolom Kendala kosong TIDAK otomatis berarti "belum diisi" - itu cuma
 * masalah (state "belum-diisi") kalau selnya literal "Belum Diisi" DAN
 * checkpoint terkait sudah jatuh tempo. Kosong beneran (tidak ada teks) atau
 * konfirmasi eksplisit "tidak ada kendala/aman" berarti fasilitator memang
 * tidak melaporkan kendala = aman (hijau), dan kosong SEBELUM checkpoint
 * terkait jatuh tempo (lihat KENDALA_ACTIVE_FROM_DAY) memang belum relevan
 * sama sekali (netral, abu) - ketiganya BUKAN sinyal masalah lapangan. Pakai
 * classifyKendalaText yang sama dengan lib/compliance.ts (isIssue) supaya
 * definisi "ini laporan masalah beneran" konsisten satu sumber.
 *
 * Kalau nilai sel (mentah, sebelum diklasifikasi) sama persis selama >1 hari
 * berturut-turut sampai `hari`, teksnya dikasih akhiran "(sejak Hari X)" -
 * berlaku untuk teks kendala asli MAUPUN "Belum Diisi" (biar kelihatan sudah
 * berapa lama belum ditanggapi), tapi tidak untuk sel yang kosong beneran
 * (tidak ada narasi "sejak" yang berarti buat itu).
 */
function kendalaDisplay(row: FacilRow, history: FacilRow[], key: keyof FacilRow, hari: number): KendalaDisplay {
  const raw = row[key];
  const rawText = typeof raw === "string" ? raw.trim() : "";
  const activeFromDay = KENDALA_ACTIVE_FROM_DAY[key];
  const notYetDue = typeof activeFromDay === "number" && hari < activeFromDay;

  if (notYetDue) {
    return { text: `(belum jatuh tempo - checkpoint terkait mulai Hari ${activeFromDay})`, state: "netral", isPlaceholder: true, statusNote: null };
  }

  const since = rawText !== "" ? streakStartDay(history, key, hari, rawText) : hari;
  const sinceSuffix = since < hari ? ` (sejak Hari ${since})` : "";

  // Pisahkan pesan status otomatis ("Belum diisi status komunikasi ...
  // sekolah") keluar dari teks yang dievaluasi sebagai kendala - lihat
  // extractStatusKomunikasiNote. Sisa teks (kalau ada) diperlakukan seperti
  // kolom Kendala lain (narasi asli fasilitator).
  let text = rawText;
  let statusNote: string | null = null;
  if (key === "kendalaKomunikasi") {
    const extracted = extractStatusKomunikasiNote(rawText);
    if (extracted.note) {
      const lastActive = lastActiveCommunicationDay(history, since);
      const lastActiveNote = lastActive != null ? `terakhir kali melapor komunikasi: Hari ${lastActive}` : "belum pernah melapor komunikasi di histori yang tersedia";
      statusNote = `${extracted.note}${sinceSuffix} - ${lastActiveNote}`;
      text = extracted.rest;
    }
  }

  const kendalaState = classifyKendalaText(text);
  if (kendalaState === "belum-diisi") {
    // Sentinel literal "Belum Diisi" tidak punya info tambahan - tampilkan
    // placeholder sintetis. Teks lain yang masih lolos ke sini (bukan sentinel
    // persis) adalah info asli dari sheet - jangan ditimpa.
    const isLiteralSentinel = text === "Belum Diisi";
    const displayText = isLiteralSentinel ? "(belum diisi fasilitator, padahal checkpoint sudah jatuh tempo)" : text;
    return { text: `${displayText}${sinceSuffix}`, state: "belum-diisi", isPlaceholder: isLiteralSentinel, statusNote };
  }
  if (kendalaState === "kosong") {
    return { text: "(tidak ada kendala / aman)", state: "aman", isPlaceholder: true, statusNote };
  }
  if (kendalaState === "tidak-ada-kendala") {
    return { text: `${text}${sinceSuffix}`, state: "aman", isPlaceholder: false, statusNote };
  }
  return { text: `${text}${sinceSuffix}`, state: "ada-kendala", isPlaceholder: false, statusNote };
}

const KENDALA_STATE_CONTAINER: Record<KendalaState, string> = {
  aman: `${TIER_STYLES.hijau.bg} border-status-good/40`,
  "belum-diisi": `${TIER_STYLES.kuning.bg} border-status-warning/40`,
  "ada-kendala": `${TIER_STYLES.merah.bg} border-status-critical/40`,
  netral: "border-border bg-background",
};

/** Definisi/sumber "% Sekolah Belum Dihubungi" - dipakai buat tooltip supaya
 * "5%" itu jelas jawabannya "dari mana": persentase mentah dari kolom LK
 * Fasil (dihitung fasilitator sendiri terhadap semesta sekolah yang
 * ditangani di Lembar Kerja), bukan hasil hitung ulang aplikasi ini dari
 * daftar sekolah individual - makanya tidak bisa ditampilkan "X dari Y
 * sekolah" persis di sini (beda dari catatan Kendala Komunikasi yang
 * kadang-kadang sudah menuliskan rinciannya sendiri, mis. "17 dari 20"). */
const komunikasiIndicatorInfo = findIndicator("pctSekolahBelumDihubungi");

/** Status "sudah/belum menghubungi sekolah" untuk hari yang dilihat - ditaruh
 * di atas kolom Kendala Komunikasi (bukan bagian isi field-nya) supaya
 * konteks checkpoint 1 ("Sudah dihubungi") langsung kelihatan tanpa perlu
 * cek kartu checkpoint terpisah.
 *
 * SENGAJA baca dari `compliance` (hasil getCheckpointCompliance, yang sudah
 * lolos trustLkOkValue di lib/compliance.ts), BUKAN raw row.pctSekolahBelumDihubungi
 * langsung - kolom itu ber-sumber LK Fasil, jadi 0% "sudah menghubungi semua
 * sekolah" bisa cuma artefak sheet (belum ada data) kalau kolom Kendala
 * Komunikasi terkait masih bilang "belum diisi". Tanpa trust-check ini badge
 * bisa bilang "Sudah menghubungi semua sekolah" padahal Kendala Komunikasi-nya
 * sendiri persis bilang "Belum diisi status komunikasi semua sekolah". */
function ContactStatusNote({ compliance }: { compliance: CheckpointCompliance[] }) {
  const ind = compliance.find((c) => c.group.no === 1)?.indicators.find((i) => i.kolom === "pctSekolahBelumDihubungi");
  if (!ind) return null;

  const tooltipText = komunikasiIndicatorInfo
    ? `${komunikasiIndicatorInfo.indicator.definisi} (sumber: ${komunikasiIndicatorInfo.indicator.sumberData ?? "-"}). Persentase mentah dari LK Fasil - dihitung fasilitator sendiri terhadap semesta sekolah yang ditangani, bukan dihitung ulang aplikasi ini.`
    : undefined;

  if (ind.status === "unknown") {
    return (
      <div className="inline-flex w-fit items-center gap-1.5 rounded bg-status-unknown/10 px-2 py-1 text-[11px] font-medium text-ink-muted">
        ⚠ Status hubungi belum bisa dipastikan{ind.note ? ` - ${ind.note}` : ""}
        {tooltipText && <InfoTooltip text={tooltipText} />}
      </div>
    );
  }
  const raw = parseFloat(ind.detail);
  if (Number.isNaN(raw)) return null;
  const { tier } = classifySeverity(raw, "higherIsWorse");
  const s = TIER_STYLES[tier];
  const label = raw === 0 ? "Sudah menghubungi semua sekolah" : `Belum menghubungi ${ind.detail} sekolah`;
  return (
    <div className={`inline-flex w-fit items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium ${s.bg} ${s.text}`}>
      {label}
      {tooltipText && <InfoTooltip text={tooltipText} />}
    </div>
  );
}

interface FacilitatorRef {
  kodeFasil: string;
  namaFasil: string;
}

function facilHref(kodeFasil: string, hari: number, mode: "alltime" | "harian"): string {
  const params = new URLSearchParams();
  if (mode === "alltime") params.set("mode", "alltime");
  else params.set("hari", String(hari));
  return `/fasilitator/${kodeFasil}?${params.toString()}`;
}

/**
 * Panel review satu fasilitator: kolom-kolom Kendala (baca saja, buat konteks
 * sekilas tanpa scroll ke tiap kartu checkpoint) + kolom Analisis yang bisa
 * diisi manual ATAU digenerate AI (dua-duanya boleh diedit lagi sebelum
 * disimpan), plus tombol simpan ke spreadsheet (kolom "Analisis", lewat
 * webhook yang sama dengan /analisis-massal) dan navigasi Sebelumnya/
 * Selanjutnya supaya bisa direview satu-satu tanpa balik ke daftar. */
export function FacilitatorAnalysisWorkbench({
  row,
  history,
  compliance,
  hari,
  mode,
  prevFacilitator,
  nextFacilitator,
}: {
  row: FacilRow;
  history: FacilRow[];
  compliance: CheckpointCompliance[];
  hari: number;
  mode: "alltime" | "harian";
  prevFacilitator: FacilitatorRef | null;
  nextFacilitator: FacilitatorRef | null;
}) {
  const [hasil, setHasil] = useState(fieldValue(row, "analisis"));
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [excludeAplikasi, setExcludeAplikasi] = useState(false);

  async function generate() {
    setGenerating(true);
    setGenError(null);
    try {
      const basePayload = mode === "alltime" ? { kodeFasil: row.kodeFasil } : { kodeFasil: row.kodeFasil, hari };
      const payload = { ...basePayload, excludeAplikasi };
      const res = await fetch("/api/analyze/facilitator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat analisis.");
      setHasil(data.result);
      setSaveState("idle");
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Terjadi kesalahan tak terduga.");
    } finally {
      setGenerating(false);
    }
  }

  async function saveToSheet() {
    if (!hasil.trim()) return;
    setSaveState("saving");
    setSaveError(null);
    try {
      const res = await fetch("/api/analyze/save-to-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ kodeFasil: row.kodeFasil, namaFasil: row.namaFasil, hari, hasil }] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan ke spreadsheet.");
      if ((data.updated ?? 0) === 0) {
        setSaveState("error");
        setSaveError(
          `Tidak ditemukan baris "${row.kodeFasil}" + Hari ${hari} di spreadsheet tujuan webhook - cek lagi WRITE_SHEETS_WEBHOOK_URL.`
        );
      } else {
        setSaveState("done");
      }
    } catch (err) {
      setSaveState("error");
      setSaveError(err instanceof Error ? err.message : "Gagal menyimpan ke spreadsheet.");
    }
  }

  return (
    <div className="flex flex-col rounded-lg border border-border bg-surface lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
      {/* Header + navigasi: di luar area scroll internal di bawah, supaya
          "Selanjutnya" selalu bisa diklik tanpa scroll dulu, walau daftar
          Kendala di bawahnya panjang. */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-gridline p-4">
        <h3 className="text-sm font-semibold text-ink-primary">Catatan Kendala &amp; Analisis (Hari ke-{hari})</h3>
        <div className="flex items-center justify-between gap-2 text-xs">
          {prevFacilitator ? (
            <Link href={facilHref(prevFacilitator.kodeFasil, hari, mode)} className="text-series-1 hover:underline">
              ← {prevFacilitator.namaFasil}
            </Link>
          ) : (
            <span className="text-ink-muted">← (awal daftar)</span>
          )}
          {nextFacilitator ? (
            <Link
              href={facilHref(nextFacilitator.kodeFasil, hari, mode)}
              className="rounded-md bg-series-1 px-2.5 py-1 font-medium text-white transition-opacity hover:opacity-90"
            >
              Selanjutnya: {nextFacilitator.namaFasil} →
            </Link>
          ) : (
            <span className="text-ink-muted">(akhir daftar) →</span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 overflow-y-auto p-4">
        <div className="flex flex-col gap-3">
          {KENDALA_FIELDS.map((f) => {
            const d = kendalaDisplay(row, history, f.key, hari);
            return (
              <label key={String(f.key)} className="flex flex-col gap-1 text-xs text-ink-secondary">
                {KEY_TO_HEADER[f.key] ?? f.label}
                {f.key === "kendalaKomunikasi" && <ContactStatusNote compliance={compliance} />}
                {d.statusNote && (
                  <div className={`inline-flex w-fit items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium ${TIER_STYLES.kuning.bg} ${TIER_STYLES.kuning.text}`}>
                    {d.statusNote}
                  </div>
                )}
                <textarea
                  readOnly
                  value={d.text}
                  rows={2}
                  className={`resize-y rounded border px-2 py-1.5 text-sm ${KENDALA_STATE_CONTAINER[d.state]} ${
                    d.isPlaceholder ? "italic text-ink-muted" : "text-ink-primary"
                  }`}
                />
              </label>
            );
          })}
        </div>

        <div className="flex flex-col gap-1.5 border-t border-gridline pt-3">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="hasil-analisis" className="text-xs font-medium text-ink-secondary">
              Hasil Analisis
            </label>
            <button
              onClick={generate}
              disabled={generating}
              className="rounded-md bg-series-1 px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {generating ? "Menganalisis..." : hasil ? "Generate Ulang dengan AI" : "Generate dengan AI"}
            </button>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-ink-secondary" title='Buang seluruh checkpoint/persentase ber-sumber "Aplikasi Revit" (Login Aplikasi, Biodata, Dokumen Admin/Teknis, RAB) dari data yang dikirim ke AI - analisis jadi fokus ke checkpoint LK Fasil & catatan Kendala saja.'>
            <input
              type="checkbox"
              checked={excludeAplikasi}
              onChange={(e) => setExcludeAplikasi(e.target.checked)}
              className="rounded border-border"
            />
            Kecualikan data Aplikasi (fokus ke Kendala &amp; LK Fasil saja)
          </label>
          <textarea
            id="hasil-analisis"
            value={hasil}
            onChange={(e) => {
              setHasil(e.target.value);
              setSaveState("idle");
            }}
            placeholder='Tulis manual, atau klik "Generate dengan AI" di atas lalu edit hasilnya di sini...'
            rows={8}
            className="resize-y rounded border border-border bg-background px-2 py-1.5 text-sm text-ink-primary placeholder:text-ink-muted placeholder:italic"
          />
          {genError && <p className="text-xs text-status-critical">{genError}</p>}

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <button
              onClick={saveToSheet}
              disabled={saveState === "saving" || !hasil.trim()}
              className="rounded-md bg-series-2 px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saveState === "saving" ? "Menyimpan..." : "Tambahkan ke Spreadsheet"}
            </button>
            {saveState === "done" && <span className="text-xs text-status-good">Tersimpan ke spreadsheet (kolom Analisis, Hari {hari}).</span>}
            {saveState === "error" && <span className="text-xs text-status-critical">{saveError}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
