import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

const AUTH_PAGES = ["/signin"];
// Legacy ingestion routes authenticate machines with their own dedicated bearer token.
const PUBLIC_PREFIXES = ["/docs", "/api/ingest/legacy"];
// Docs are public, and their Cmd/Ctrl+K search calls /api/search — keep it reachable without a session.
const PUBLIC_PAGES = ["/", "/api/search"];

export function shouldRedirectUnauthenticated(
  session: unknown,
  pathname: string,
) {
  const isAuthPage = AUTH_PAGES.includes(pathname);
  const isPublicPage =
    PUBLIC_PAGES.includes(pathname) ||
    PUBLIC_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
    );

  return !session && !isAuthPage && !isPublicPage;
}

export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const { pathname } = request.nextUrl;
  const isAuthPage = AUTH_PAGES.includes(pathname);

  if (shouldRedirectUnauthenticated(session, pathname)) {
    return NextResponse.redirect(new URL("/signin", request.url));
  }

  if (session && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (session && pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/auth|api/cron|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
