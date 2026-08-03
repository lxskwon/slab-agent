// 관리자 이름 목록. 로그인 이름이 여기 있으면 관리자(사용량 대시보드 접근). 이름 기반이라 해당 이름으로 로그인하면 자동 관리자.
const ADMIN_NAMES = ["권지윤", "김호민", "이준행"];

/** 이름이 관리자인지. */
export function isAdminName(name: string | null | undefined): boolean {
  return ADMIN_NAMES.includes((name ?? "").trim());
}

/** 요청의 로그인 사용자가 관리자인지. */
export function isAdmin(req: Request): boolean {
  return isAdminName(authUser(req));
}

/** 로그인한 사용자 이름. 우선순위: slab_name 쿠키(커스텀 로그인) → basic-auth 사용자명(테스트용). 없으면 "". */
export function authUser(req: Request): string {
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(/(?:^|;\s*)slab_name=([^;]+)/);
  if (m) {
    try { return decodeURIComponent(m[1]).trim(); } catch { return m[1].trim(); }
  }
  const h = req.headers.get("authorization");
  if (h?.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(h.slice(6), "base64").toString("utf8"); // "username:password"
      const i = decoded.indexOf(":");
      return (i >= 0 ? decoded.slice(0, i) : decoded).trim();
    } catch {
      /* fallthrough */
    }
  }
  return "";
}
