export function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex items-center align-middle">
      <span
        tabIndex={0}
        className="ml-1 inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-baseline text-[9px] leading-none text-ink-muted focus:outline-none"
        aria-label={text}
      >
        i
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-56 -translate-x-1/2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-ink-secondary opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
