import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { auth, signOut } from "@/lib/auth";
import { getSelectedAdmin } from "@/lib/selectedAdmin";

export const metadata: Metadata = {
  title: "Monitoring Fasilitator Revitalisasi Sekolah (v2)",
  description: "Dashboard pemantauan kinerja fasilitator program revitalisasi sekolah - sumber data 30 LK Fasil individual.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const selectedAdmin = session ? await getSelectedAdmin() : null;

  return (
    <html lang="id" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-background text-ink-primary">
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-[1600px] items-center gap-6 px-6 py-3">
            <Link href="/" className="text-sm font-semibold">
              Monitoring Fasilitator <span className="text-ink-muted">v2</span>
            </Link>
            <nav className="flex gap-4 text-sm text-ink-secondary">
              <Link href="/" className="hover:text-ink-primary">
                Dashboard
              </Link>
              <Link href="/analisis-massal" className="hover:text-ink-primary">
                Analisis Massal
              </Link>
            </nav>
            {session?.user && (
              <div className="ml-auto flex items-center gap-3 text-sm text-ink-secondary">
                {selectedAdmin && (
                  <Link href="/pilih-admin" className="hover:text-ink-primary" title="Ganti admin">
                    Admin: <span className="font-medium text-ink-primary">{selectedAdmin}</span>
                  </Link>
                )}
                <span className="text-ink-muted">{session.user.email}</span>
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/login" });
                  }}
                >
                  <button type="submit" className="hover:text-ink-primary">
                    Keluar
                  </button>
                </form>
              </div>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
