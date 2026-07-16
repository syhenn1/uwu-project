"use client";

import { useState } from "react";

export function ReportActions({ text, filename }: { text: string; filename: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function download() {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex gap-2">
      <button onClick={copy} className="rounded-md bg-series-1 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
        {copied ? "Tersalin!" : "Salin sebagai Teks"}
      </button>
      <button onClick={download} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink-secondary hover:text-ink-primary">
        Unduh .txt
      </button>
    </div>
  );
}
