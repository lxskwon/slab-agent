import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { setManual } from "@/lib/registry/manual";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  url: z.string().url(),
  shares: z.number().int().nonnegative(),
  issueDate: z.string().optional().nullable(),
  author: z.string().trim().max(60).optional(),
});

// 등기부등본 판독 불가 건에 대한 수기 입력값 저장
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  const { url, shares, issueDate, author } = parsed.data;
  await setManual(url, { shares, issueDate: issueDate ?? null, author: author ?? "" });
  revalidateTag("dashboard-base"); // 대시보드 집계 캐시 무효화 → getFundTracker가 수기값을 신선하게 오버레이
  return NextResponse.json({ ok: true });
}
