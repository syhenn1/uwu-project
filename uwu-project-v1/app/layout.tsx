import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Monitoring Fasilitator Revitalisasi Sekolah",
  description: "Dashboard pemantauan kinerja fasilitator program revitalisasi sekolah.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-background text-ink-primary">
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
            <Link href="/" className="text-sm font-semibold">
              Monitoring Fasilitator
            </Link>
            <nav className="flex gap-4 text-sm text-ink-secondary">
              <Link href="/" className="hover:text-ink-primary">
                Dashboard
              </Link>
              <Link href="/analisis-massal" className="hover:text-ink-primary">
                Analisis Massal
              </Link>
              <Link href="/perbandingan" className="hover:text-ink-primary">
                Perbandingan
              </Link>
              <Link href="/progres-dokumen" className="hover:text-ink-primary">
                Progres Dokumen
              </Link>
              <Link href="/anomali" className="hover:text-ink-primary">
                Anomali
              </Link>
              <Link href="/laporan" className="hover:text-ink-primary">
                Laporan
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
