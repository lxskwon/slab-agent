import { NextResponse } from "next/server";
import { z } from "zod";
import { hasSupabase } from "@/lib/db/client";
import { setFollowupApplicable } from "@/lib/db/repositories";

export const runtime = "nodejs";

const Body = z.object({
  resultId: z.string().uuid(),
  value: z.enum(["Y", "N"]),
  reviewer: z.string().min(1),
  note: z.string().optional(),
});

/** FR-1.5 / FR-3 수동 오버라이드 — 후속투자 해당여부(Y/N) 입력 → history 기록 */
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
    await setFollowupApplicable(parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[followup] 저장 실패:", err);
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
