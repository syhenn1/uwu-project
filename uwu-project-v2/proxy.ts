import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { SELECTED_ADMIN_COOKIE } from "@/lib/selectedAdmin";

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
