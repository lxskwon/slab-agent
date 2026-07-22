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
