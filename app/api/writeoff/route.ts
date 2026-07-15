import { NextResponse } from "next/server";
import { z } from "zod";
import { hasSupabase } from "@/lib/db/client";
import { reviewWriteoff } from "@/lib/db/repositories";

export const runtime = "nodejs";

const Body = z.object({
  resultId: z.string().uuid(),
  reviewer: z.string().min(1),
  overrideStatus: z.enum(["이미 반영됨", "미반영", "판단애매"]).optional(),
  note: z.string().optional(),
});

/** FR-2 / FR-3 — 감액 판정 확인/오버라이드 → history 기록 */
export async function POST(req: Request) {
  if (!hasSupabase()) {
    return NextResponse.json(
      { ok: false, error: "Supabase 미설정 — 저장할 수 없습니다." },
      { status: 400 },
    );
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "잘못된 요청", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    await reviewWriteoff(parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[writeoff] 저장 실패:", err);
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
