import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Authentication identity is tab-isolated via sessionStorage and Authorization: Bearer headers.
  // We do not use shared cross-tab cookies to redirect pages, ensuring concurrent multi-tab sessions work seamlessly.
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/stock/:path*",
    "/operations/:path*",
    "/move-history/:path*",
    "/settings/:path*",
    "/profile/:path*",
    "/unauthorized",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
  ],
};
