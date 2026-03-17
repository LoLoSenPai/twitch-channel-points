import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function getCanonicalOrigin() {
  const raw = String(process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "").trim();
  if (!raw) return null;

  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return NextResponse.next();
  }

  const host = (request.headers.get("host") ?? request.nextUrl.host).toLowerCase();
  const hostname = host.split(":")[0];
  if (!hostname.endsWith(".vercel.app")) {
    return NextResponse.next();
  }

  const canonical = getCanonicalOrigin();
  if (!canonical) {
    return NextResponse.next();
  }

  const canonicalHost = canonical.host.toLowerCase();
  const canonicalHostname = canonical.hostname.toLowerCase();
  if (!canonicalHostname || canonicalHostname.endsWith(".vercel.app") || canonicalHost === host) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.protocol = canonical.protocol;
  url.host = canonicalHost;

  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
