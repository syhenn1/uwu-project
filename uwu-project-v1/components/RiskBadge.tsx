import type { RiskLevel } from "@/lib/metrics";

const STYLES: Record<RiskLevel, { label: string; dot: string; text: string; bg: string }> = {
  rendah: { label: "Rendah", dot: "bg-status-good", text: "text-status-good", bg: "bg-status-good/10" },
  sedang: { label: "Sedang", dot: "bg-status-warning", text: "text-[#8a5a00] dark:text-status-warning", bg: "bg-status-warning/15" },
  tinggi: { label: "Tinggi", dot: "bg-status-critical", text: "text-status-critical", bg: "bg-status-critical/10" },
  unknown: { label: "Tidak diketahui", dot: "bg-status-unknown", text: "text-ink-muted", bg: "bg-status-unknown/10" },
};

export function RiskBadge({ level, value, estimated }: { level: RiskLevel; value: number | null; estimated?: boolean }) {
  const s = STYLES[level];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
      {typeof value === "number" && (
        <span className="text-ink-muted">
          · {value.toFixed(1)}%{estimated ? " (estimasi)" : ""}
        </span>
      )}
    </span>
  );
}
