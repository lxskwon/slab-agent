/** HTTP Basic 인증 헤더에서 사용자 이름(로그인 시 입력한 '사용자 이름')을 디코드. 없으면 "". */
export function authUser(req: Request): string {
  const h = req.headers.get("authorization");
  if (h?.startsWith("Basic ")) {
    try {
      // base64 → UTF-8 (한글 사용자 이름이 깨지지 않도록 Buffer 사용; atob은 Latin-1이라 mojibake)
      const decoded = Buffer.from(h.slice(6), "base64").toString("utf8"); // "username:password"
      const i = decoded.indexOf(":");
      return (i >= 0 ? decoded.slice(0, i) : decoded).trim();
    } catch {
      /* fallthrough */
    }
  }
  return "";
}
