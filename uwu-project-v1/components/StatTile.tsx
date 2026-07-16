export function StatTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warning" | "critical";
}) {
  const valueColor =
    tone === "critical" ? "text-status-critical" : tone === "warning" ? "text-[#8a5a00] dark:text-status-warning" : "text-ink-primary";
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="text-xs text-ink-secondary">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${valueColor}`}>{value}</div>
    </div>
  );
}
