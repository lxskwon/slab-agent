import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { setManual, deleteManual } from "@/lib/registry/manual";
import { authUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  url: z.string().url(),
  shares: z.number().int().nonnegative().optional(),
  issueDate: z.string().optional().nullable(),
  remove: z.boolean().optional(),
});

// 등기부등본 판독 불가 건에 대한 수기 입력값 저장/삭제
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  const { url, shares, issueDate, remove } = parsed.data;
  if (remove) {
    await deleteManual(url);
  } else {
    if (shares == null) return NextResponse.json({ ok: false, error: "shares 필요" }, { status: 400 });
    await setManual(url, { shares, issueDate: issueDate ?? null, author: authUser(req) || "익명" });
  }
  revalidateTag("dashboard-base"); // 대시보드 집계 캐시 무효화 → getFundTracker가 수기값을 신선하게 오버레이
  return NextResponse.json({ ok: true });
}
