import type { AnomalyItem } from "@/lib/anomalies";

const TYPE_LABEL: Record<AnomalyItem["type"], string> = {
  future_data: "Data melewati hari ini",
  never_logged_in: "Belum login LK",
  lk_aplikasi_mismatch: "LK vs Aplikasi tidak konsisten",
  contradicted_zero: "0% dikontradiksi catatan",
};

export function AnomalyList({ items }: { items: AnomalyItem[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, i) => (
        <li
          key={i}
          className={`rounded-lg border p-3 text-sm ${
            item.severity === "tinggi" ? "border-status-critical/30 bg-status-critical/5" : "border-status-warning/30 bg-status-warning/5"
          }`}
        >
          <span
            className={`mr-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
              item.severity === "tinggi" ? "bg-status-critical/15 text-status-critical" : "bg-status-warning/20 text-[#8a5a00] dark:text-status-warning"
            }`}
          >
            {TYPE_LABEL[item.type]}
          </span>
          <span className="text-ink-secondary">{item.detail}</span>
        </li>
      ))}
    </ul>
  );
}
