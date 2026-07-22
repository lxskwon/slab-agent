/** HTTP Basic 인증 헤더에서 사용자 이름(로그인 시 입력한 '사용자 이름')을 디코드. 없으면 "". */
export function authUser(req: Request): string {
  const h = req.headers.get("authorization");
  if (h?.startsWith("Basic ")) {
    try {
      const decoded = atob(h.slice(6)); // "username:password"
      const i = decoded.indexOf(":");
      return (i >= 0 ? decoded.slice(0, i) : decoded).trim();
    } catch {
      /* fallthrough */
    }
  }
  return "";
}
