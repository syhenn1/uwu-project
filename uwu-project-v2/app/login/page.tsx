import { signIn } from "@/lib/auth";

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "Akun Google ini belum terdaftar sebagai admin (lihat ADMIN_EMAILS di .env.local). Hubungi pengelola untuk ditambahkan.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-5 py-24 text-center">
      <div>
        <h1 className="text-lg font-semibold">Monitoring Fasilitator</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Masuk dengan akun Google admin untuk mengakses dashboard.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-status-critical/40 bg-status-critical/10 px-3 py-2 text-sm text-status-critical">
          {ERROR_MESSAGES[error] ?? "Gagal masuk, coba lagi."}
        </p>
      )}

      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: callbackUrl || "/" });
        }}
      >
        <button
          type="submit"
          className="rounded-md bg-series-1 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Masuk dengan Google
        </button>
      </form>
    </div>
  );
}
