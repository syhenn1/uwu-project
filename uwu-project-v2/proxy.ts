import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { SELECTED_ADMIN_COOKIE } from "@/lib/selectedAdmin";
import { ADMIN_EMAIL_MAP } from "@/lib/admins";

/** Path yang boleh diakses TANPA login sama sekali. */
const PUBLIC_PATHS = ["/login", "/api/auth"];
/** Path yang butuh login, tapi TIDAK butuh pemilihan admin dulu (ini justru
 * halaman untuk memilihnya). */
const SKIP_ADMIN_PICK_PATHS = ["/pilih-admin"];

function matches(pathname: string, paths: string[]): boolean {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default auth((req) => {
  const { pathname, search, origin } = req.nextUrl;

  if (matches(pathname, PUBLIC_PATHS)) {
    return NextResponse.next();
  }

  if (!req.auth) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("callbackUrl", pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  const hasSelectedAdmin = !!req.cookies.get(SELECTED_ADMIN_COOKIE)?.value;
  const email = req.auth?.user?.email?.toLowerCase();

  // Kalau belum pilih admin tapi emailnya ada di whitelist mapping, otomatis set Atmin-nya
  if (!hasSelectedAdmin && email && ADMIN_EMAIL_MAP[email]) {
    const autoAdmin = ADMIN_EMAIL_MAP[email];
    
    // Redirect ke halaman yang sama persis (supaya browser retry dengan cookie baru)
    // Kalau sedang di /pilih-admin, arahkan ke dashboard (/) supaya tidak stuck
    const targetPath = matches(pathname, SKIP_ADMIN_PICK_PATHS) ? "/" : (pathname + search);
    const res = NextResponse.redirect(new URL(targetPath, origin));
    
    res.cookies.set(SELECTED_ADMIN_COOKIE, autoAdmin, {
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    return res;
  }

  if (!hasSelectedAdmin && !matches(pathname, SKIP_ADMIN_PICK_PATHS)) {
    const pickUrl = new URL("/pilih-admin", origin);
    pickUrl.searchParams.set("callbackUrl", pathname + search);
    return NextResponse.redirect(pickUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
