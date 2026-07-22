import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * SITE_PASSWORD가 있으면 커스텀 로그인(/login)으로 보호.
 * - 페이지 요청: 인증 쿠키(slab_auth) 없으면 /login 으로 리다이렉트
 * - /api/* : 쿠키 또는 basic-auth(테스트용) 허용, 없으면 401
 * SITE_PASSWORD 미설정(로컬)이면 통과.
 */
export function middleware(req: NextRequest) {
  const pw = process.env.SITE_PASSWORD;
  if (!pw) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login" || pathname === "/api/logout") return NextResponse.next();

  if (req.cookies.get("slab_auth")?.value === pw) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    const auth = req.headers.get("authorization");
    if (auth?.startsWith("Basic ")) {
      try {
        const decoded = atob(auth.slice(6));
        if (decoded.slice(decoded.indexOf(":") + 1) === pw) return NextResponse.next();
      } catch { /* fall through */ }
    }
    return new NextResponse("인증이 필요합니다.", { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
