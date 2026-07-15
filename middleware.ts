import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * SITE_PASSWORD 환경변수가 있으면 HTTP Basic 인증으로 전체 사이트를 보호.
 * (Vercel 공개 URL에 내부 재무데이터가 올라가므로 공유 비밀번호로 게이트)
 * 로컬/컨테이너에서 SITE_PASSWORD 미설정 시 통과 → 기존 동작 유지.
 */
export function middleware(req: NextRequest) {
  const pw = process.env.SITE_PASSWORD;
  if (!pw) return NextResponse.next();

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.slice(6));
      const pass = decoded.slice(decoded.indexOf(":") + 1);
      if (pass === pw) return NextResponse.next();
    } catch {
      /* fallthrough */
    }
  }
  return new NextResponse("인증이 필요합니다.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="SLAB", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
