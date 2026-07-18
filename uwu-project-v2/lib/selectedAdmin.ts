import { cookies } from "next/headers";

export const SELECTED_ADMIN_COOKIE = "selected_admin";

/** Admin (Atmin) yang dipilih admin yang sedang login, dipakai nanti untuk
 * memfilter log per admin (lihat lib/admins.ts). null kalau belum pilih -
 * middleware.ts yang memaksa user mampir ke /pilih-admin dulu sebelum ini
 * bisa null di halaman lain. */
export async function getSelectedAdmin(): Promise<string | null> {
  const store = await cookies();
  return store.get(SELECTED_ADMIN_COOKIE)?.value || null;
}

export async function setSelectedAdmin(nama: string): Promise<void> {
  const store = await cookies();
  store.set(SELECTED_ADMIN_COOKIE, nama, {
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
}

export async function clearSelectedAdmin(): Promise<void> {
  const store = await cookies();
  store.delete(SELECTED_ADMIN_COOKIE);
}
