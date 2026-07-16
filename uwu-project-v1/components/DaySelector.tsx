import Link from "next/link";

export function DaySelector({
  days,
  current,
  basePath = "/",
  todayHari,
  extraParams,
}: {
  days: number[];
  current: number;
  basePath?: string;
  /** Kalau diisi, hari setelah ini ditandai "belum terjadi" (dari tab "Check Point"). */
  todayHari?: number;
  /** Parameter query lain yang harus dipertahankan (mis. mode=harian). */
  extraParams?: Record<string, string>;
}) {
  function hrefFor(d: number) {
    const params = new URLSearchParams({ ...extraParams, hari: String(d) });
    return `${basePath}?${params.toString()}`;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {days.map((d) => {
          const active = d === current;
          const future = typeof todayHari === "number" && d > todayHari;
          return (
            <Link
              key={d}
              href={hrefFor(d)}
              title={future ? `Hari ${d} belum terjadi (hari ini Hari ${todayHari})` : undefined}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                active
                  ? "border-series-1 bg-series-1 text-white"
                  : future
                    ? "border-border text-ink-muted opacity-50 hover:opacity-80"
                    : "border-border text-ink-secondary hover:border-baseline"
              }`}
            >
              Hari {d}
            </Link>
          );
        })}
      </div>
      {typeof todayHari === "number" && (
        <p className="text-xs text-ink-muted">
          Hari ini = Hari {todayHari}. Hari yang pudar di atas belum terjadi - datanya belum tentu berarti apa-apa.
        </p>
      )}
    </div>
  );
}
