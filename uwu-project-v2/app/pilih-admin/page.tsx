import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAdminList } from "@/lib/admins";
import { setSelectedAdmin } from "@/lib/selectedAdmin";

export default async function PilihAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  const { callbackUrl } = await searchParams;
  const admins = await getAdminList();

  async function pilih(formData: FormData) {
    "use server";
    const nama = String(formData.get("admin") ?? "").trim();
    if (!nama) return;
    await setSelectedAdmin(nama);
    redirect(callbackUrl || "/");
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 py-20">
      <div>
        <h1 className="text-lg font-semibold">Login sebagai Admin</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Masuk sebagai <span className="font-medium text-ink-primary">{session?.user?.email}</span>. Pilih Atmin
          mana yang ingin ditampilkan datanya untuk pemfilteran.
        </p>
      </div>

      {admins.length === 0 ? (
        <p className="rounded-md border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-sm text-[#8a5a00] dark:text-status-warning">
          Belum ada daftar Atmin yang bisa dipilih (cek CONTROLLER_SHEET_URL di .env.local).
        </p>
      ) : (
        <form action={pilih} className="flex flex-col gap-3">
          <select
            name="admin"
            required
            defaultValue=""
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink-primary"
          >
            <option value="" disabled>
              Pilih admin...
            </option>
            {admins.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-series-1 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Lanjut ke Dashboard
          </button>
        </form>
      )}
    </div>
  );
}
