import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const pathname = request.nextUrl.pathname;

  // app.bair1.live → serve /dashboard as the root
  if (host.startsWith("app.")) {
    if (pathname === "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.rewrite(url);
    }
  }

  // bair1.live/dashboard → redirect to app.bair1.live
  if (!host.startsWith("app.") && pathname.startsWith("/dashboard")) {
    const url = new URL("https://app.bair1.live");
    url.search = request.nextUrl.search;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|bear-logo\\.png|bear-logo\\.jpg|icons\\.svg).*)",
  ],
};
