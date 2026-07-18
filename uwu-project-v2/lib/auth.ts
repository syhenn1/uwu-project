import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Login Google + whitelist email, GANTI dari alur berbasis webhook Apps
 * Script (lihat lib/writeSheet.ts) - tujuan akhirnya supaya baca/tulis sheet
 * bisa langsung lewat token OAuth admin yang login, tanpa perlu deploy script
 * terpisah lagi. Untuk sekarang scope-nya baru gerbang login + pemilihan
 * admin (lihat lib/admins.ts) - pemakaian token OAuth untuk baca/tulis
 * "masterLog" menyusul.
 *
 * ADMIN_EMAILS kosong = TOLAK SEMUA login (fail-closed), bukan fail-open -
 * whitelist ini satu-satunya kontrol akses ke data kinerja fasilitator.
 */
const allowedEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      // Nama env var eksplisit GOOGLE_CLIENT_ID/SECRET (bukan default
      // AUTH_GOOGLE_ID/SECRET Auth.js v5) - sesuai istilah "Client ID"/
      // "Client Secret" yang dipakai Google Cloud Console.
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email || !allowedEmails.includes(email)) {
        console.warn(`[auth] Login ditolak untuk "${email ?? "(tanpa email)"}" - tidak ada di ADMIN_EMAILS.`);
        return false;
      }
      return true;
    },
  },
});
