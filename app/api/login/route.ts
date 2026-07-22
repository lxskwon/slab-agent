import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ name: z.string().trim().min(1).max(60), password: z.string() });

// 커스텀 로그인: 이름 + 비밀번호. 비밀번호 맞으면 인증 쿠키 + 이름 쿠키 설정.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "이름과 비밀번호를 입력하세요." }, { status: 400 });
  const { name, password } = parsed.data;
  const pw = process.env.SITE_PASSWORD;
  if (pw && password !== pw) return NextResponse.json({ ok: false, error: "비밀번호가 올바르지 않습니다." }, { status: 401 });

  const res = NextResponse.json({ ok: true });
  const opts = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 30 };
  if (pw) res.cookies.set("slab_auth", pw, opts);
  res.cookies.set("slab_name", encodeURIComponent(name), opts);
  return res;
}
