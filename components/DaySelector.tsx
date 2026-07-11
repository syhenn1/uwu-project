import Link from "next/link";

export function DaySelector({
  days,
  current,
  basePath = "/",
}: {
  days: number[];
  current: number;
  basePath?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {days.map((d) => {
        const active = d === current;
        return (
          <Link
            key={d}
            href={`${basePath}?hari=${d}`}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              active
                ? "border-series-1 bg-series-1 text-white"
                : "border-border text-ink-secondary hover:border-baseline"
            }`}
          >
            Hari {d}
          </Link>
        );
      })}
    </div>
  );
}
