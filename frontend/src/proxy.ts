import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE, isSessionValid } from "@/lib/session";

// Next 16 renamed middleware.ts to proxy.ts and the export to `proxy`.
export async function proxy(request: NextRequest) {
  const onLoginPage = request.nextUrl.pathname === "/login";
  const signedIn = await isSessionValid(request.cookies.get(SESSION_COOKIE)?.value);

  if (!signedIn && !onLoginPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (signedIn && onLoginPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
