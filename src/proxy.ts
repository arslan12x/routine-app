import { NextResponse, type NextRequest } from "next/server";

// Optimistic redirect only. Real authorization happens in requireUser() on every page and API route.
export function proxy(req: NextRequest) {
  const has = req.cookies.has("better-auth.session_token") || req.cookies.has("__Secure-better-auth.session_token");
  if (!has) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}
export const config = { matcher: ["/tasks/:path*", "/calendar/:path*", "/insights/:path*", "/friends/:path*", "/admin/:path*", "/settings/:path*"] };
