import Link from "next/link";

export function AnalysisScopeTabs({ tab }: { tab: "fasilitator" | "harian" }) {
  const tabLink = (value: "fasilitator" | "harian", label: string) => {
    const active = tab === value;
    return (
      <Link
        href={`/analisis-massal?tab=${value}`}
        className={`rounded-full px-3 py-1 text-sm transition-colors ${
          active ? "bg-series-1 text-white" : "text-ink-secondary hover:text-ink-primary"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="inline-flex gap-0.5 rounded-full border border-border bg-surface p-0.5">
      {tabLink("fasilitator", "Per Fasilitator")}
      {tabLink("harian", "Ringkasan Harian")}
    </div>
  );
}
