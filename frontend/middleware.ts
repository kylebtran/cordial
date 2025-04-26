// middleware.ts
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth?.user;
  const { pathname } = req.nextUrl;

  const protectedRoutes = ["/overview", "/project", "/chat"];

  const isAccessingApp = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  if (isAccessingApp && !isLoggedIn) {
    const callbackUrl = encodeURIComponent(req.url);
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${callbackUrl}`, req.url)
    );
  }

  return NextResponse.next();
});

export const config = {
  runtime: "nodejs",
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (Auth.js routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - / (the homepage, assuming it's public) - adjust if needed
     * - /login (assuming login page is public) - adjust if needed
     */
    "/((?!api/auth|_next/static|_next/image|favicon.ico|login|$).*)", // The '$' at the end matches the root '/' exactly
    // Add other public paths here if needed, e.g., '/public/.*'
  ],
};
