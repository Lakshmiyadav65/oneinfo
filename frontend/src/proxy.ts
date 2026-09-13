import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/mock-provider";

/**
 * Session-presence gate. This keeps protected routes redirect-safe on
 * refresh/direct-navigation without a client-side flash. It only checks
 * for a session marker — real authorization always happens server-side
 * against the authenticated identity, never a client-supplied creator id.
 */

// Every signed-in destination belongs here AND in `config.matcher` below. The
// two are spelled differently - a bare prefix here, a `/:path*` suffix there -
// which is exactly how one of them ends up forgotten.
const PROTECTED_PATHS = [
  "/dashboard",
  "/knowledge",
  "/create",
  "/projects",
  "/media",
  "/posters",
  "/settings",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthenticated = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  const isProtected = PROTECTED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (pathname === "/") {
    return NextResponse.redirect(
      new URL(isAuthenticated ? "/dashboard" : "/login", request.url)
    );
  }

  if (isProtected && !isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/login" && isAuthenticated) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/dashboard/:path*",
    "/knowledge/:path*",
    "/create/:path*",
    "/projects/:path*",
    "/media/:path*",
    "/posters/:path*",
    "/settings/:path*",
  ],
};
