import type { CheckpointCompliance, IndicatorCompliance } from "@/lib/compliance";
import type { CheckpointGroup } from "@/lib/knowledge/checkpoints";
import { indicatorSeverity, clampToNonHijau, TIER_LABEL, TIER_RANK } from "@/lib/severity";
import type { SeverityTier } from "@/lib/severity";
import { TIER_STYLES } from "./SeverityBadge";

const STATUS_LABEL = { sesuai: "Sesuai", "belum-sesuai": "Belum sesuai", unknown: "Tidak ada data" } as const;
const NEUTRAL_STATUS_STYLE = { dot: "bg-status-unknown", text: "text-ink-muted" };

/** Nilai indikator persentase (mis. "89.47%") diwarnai per tingkat keparahan
 * 4-tingkat (Hijau/Kuning/Oranye/Merah, lihat lib/severity.ts) - BUKAN
 * otomatis merah cuma karena statusnya "violation"/gagal target. Target
 * checkpoint di sini memang persis 100% (biner), jadi mis. 89.47% tetap
 * "Belum Sesuai" secara status, tapi warnanya harus Kuning (dekat target),
 * bukan disamaratakan semerah indikator yang benar-benar 0%. Untuk indikator
 * yang masih "violation" (`clampHijau`), tier hijau di-floor ke kuning -
 * lihat clampToNonHijau. */
function IndicatorValue({
  ind,
  group,
  fallbackClass,
  clampHijau = false,
}: {
  ind: IndicatorCompliance;
  group: CheckpointGroup;
  fallbackClass: string;
  clampHijau?: boolean;
}) {
  const sev = indicatorSeverity(ind, group);
  if (!sev) return <span className={`font-medium ${fallbackClass}`}>{ind.detail}</span>;
  const tier = clampHijau ? clampToNonHijau(sev.tier) : sev.tier;
  const s = TIER_STYLES[tier];
  return (
    <>
      <span className={`font-medium ${s.text}`}>{ind.detail}</span>
      <span className={`ml-1 text-[10px] font-semibold uppercase tracking-wide ${s.text}`}>[{TIER_LABEL[tier]}]</span>
    </>
  );
}

/** Warna badge status checkpoint (dot + teks) - untuk "belum-sesuai", dipakai
 * tingkat keparahan TERBURUK di antara indikator gating yang violation, BUKAN
 * selalu merah. Enum tanpa gradasi (mis. "Fasil Belum Login LK" = "Belum")
 * dianggap merah (tidak ada versi "dekat tapi belum" untuk kolom begitu).
 * Hijau di-floor ke kuning (clampToNonHijau) - badge "Belum Sesuai" tidak
 * boleh pernah tampil hijau, itu klaim "sudah oke" yang salah. */
function statusStyle(status: CheckpointCompliance["status"], violations: IndicatorCompliance[], group: CheckpointGroup) {
  if (status !== "belum-sesuai") {
    return status === "sesuai" ? TIER_STYLES.hijau : NEUTRAL_STATUS_STYLE;
  }
  let worst: SeverityTier | null = null;
  for (const v of violations) {
    const tier = clampToNonHijau(indicatorSeverity(v, group)?.tier ?? "merah");
    if (worst === null || TIER_RANK[tier] > TIER_RANK[worst]) worst = tier;
  }
  return TIER_STYLES[worst ?? "merah"];
}

function SourceTag({ source }: { source: IndicatorCompliance["sumberData"] }) {
  if (!source) return null;
  const isLk = source === "LK Fasil";
  return (
    <span
      className={`mt-0.5 inline-block shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        isLk ? "bg-series-5/10 text-series-5" : "bg-series-1/10 text-series-1"
      }`}
    >
      {isLk ? "LK" : "Aplikasi"}
    </span>
  );
}

/** Menampilkan nilai LK dan Aplikasi berdampingan kalau indikator ini punya
 * pasangan sungguhan di kolom lain - supaya tidak cuma satu sisi yang terlihat. */
function ComparisonNote({ ind }: { ind: IndicatorCompliance }) {
  if (!ind.counterpart) return null;
  const { counterpart } = ind;
  const lk = ind.sumberData === "LK Fasil" ? ind.detail : counterpart.value != null ? `${counterpart.value}%` : "-";
  const aplikasi = ind.sumberData === "Aplikasi Revit" ? ind.detail : counterpart.value != null ? `${counterpart.value}%` : "-";
  return (
    <span className="text-ink-muted">
      {" "}
      (Hasil LK: <span className="font-medium text-ink-secondary">{lk}</span> · Aplikasi:{" "}
      <span className="font-medium text-ink-secondary">{aplikasi}</span>
      {counterpart.selisih != null && !counterpart.konsisten && (
        <span className="font-medium text-status-warning"> · selisih {counterpart.selisih} poin ⚠</span>
      )}
      )
    </span>
  );
}

export function CheckpointCompliancePanel({ compliance, todayHari }: { compliance: CheckpointCompliance[]; todayHari: number }) {
  if (compliance.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4 text-sm text-ink-muted">
        Belum ada checkpoint yang jatuh tempo sampai Hari ke-{todayHari}.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {compliance.map(({ group, status, indicators, kendala, kendalaMismatch }) => {
        const violations = indicators.filter((i) => i.gating && i.status === "violation");
        const unknowns = indicators.filter((i) => i.gating && i.status === "unknown");
        const info = indicators.filter((i) => !i.gating);
        const s = statusStyle(status, violations, group);
        return (
          <div key={group.no} className="flex flex-col rounded-xl border border-border bg-surface p-3.5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-ink-primary">
                {group.no}. {group.name}
                <span className="ml-2 text-xs font-normal text-ink-muted">jatuh tempo Hari {group.activeFromDay}</span>
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${s.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
                {STATUS_LABEL[status]}
              </span>
            </div>

            {kendalaMismatch && (
              <div className="mt-1.5 rounded-md border border-status-warning/40 bg-status-warning/10 px-2 py-1.5 text-[11px] font-medium text-[#8a5a00]">
                ⚠ Aplikasi bilang tidak ada masalah, tapi hasil wawancara LK ke sekolah melaporkan kendala nyata - status
                diturunkan jadi &ldquo;Tidak ada data&rdquo; sampai dicek manual, bukan otomatis dipercaya &ldquo;Sesuai&rdquo;.
              </div>
            )}

            {violations.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1.5 text-xs text-ink-secondary">
                {violations.map((v) => (
                  <li key={v.kolom} className="flex items-start gap-1.5">
                    <SourceTag source={v.sumberData} />
                    <span>
                      {v.label}: <IndicatorValue ind={v} group={group} fallbackClass="text-status-critical" clampHijau />
                      <ComparisonNote ind={v} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {unknowns.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1.5 text-xs text-ink-muted">
                {unknowns.map((v) => (
                  <li key={v.kolom} className="flex items-start gap-1.5">
                    <SourceTag source={v.sumberData} />
                    <span>
                      {v.label}: <span className="font-medium">{v.detail}</span>
                      {v.note && <span> - {v.note}</span>}
                      <ComparisonNote ind={v} />
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {info.length > 0 && (
              <div className="mt-2 border-t border-gridline pt-2">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Info &amp; pembanding</p>
                <ul className="flex flex-col gap-1.5 text-xs text-ink-secondary">
                  {info.map((v) => (
                    <li key={v.kolom} className="flex items-start gap-1.5">
                      <SourceTag source={v.sumberData} />
                      <span>
                        {v.label}: <IndicatorValue ind={v} group={group} fallbackClass="text-ink-primary" />
                        <ComparisonNote ind={v} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {kendala && (
              <div className="mt-2 rounded-md bg-background px-2.5 py-2 text-xs text-ink-secondary">
                <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-ink-muted">{kendala.label} (LK)</span>
                  {kendala.isIssue && (
                    <span className="rounded-full bg-status-critical/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-status-critical">
                      tersirat: Belum
                    </span>
                  )}
                </div>
                {kendala.text ?? (
                  <span className="italic text-ink-muted">
                    Tidak ada catatan kendala tercatat dari LK untuk ini - status di atas murni dari sisi lain.
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
