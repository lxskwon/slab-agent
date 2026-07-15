import { NextResponse } from "next/server";
import { runFollowup } from "@/lib/pipelines/followup";
import { runWriteoff } from "@/lib/pipelines/writeoff";
import { hasSupabase } from "@/lib/db/client";
import { persistFollowupRun, persistWriteoffRun } from "@/lib/db/repositories";
import { invalidateLiveCache } from "@/lib/data";

export const runtime = "nodejs";

/** FR-4 — "지금 새로고침": 후속투자 + 감액 파이프라인 실행 (+ Supabase 있으면 저장) */
export async function POST() {
  try {
    invalidateLiveCache(); // 라이브 프리뷰 캐시 강제 재계산

    const followup = await runFollowup();
    const writeoff = await runWriteoff();

    let persisted = false;
    if (hasSupabase()) {
      await persistFollowupRun(followup);
      await persistWriteoffRun(writeoff);
      persisted = true;
    }

    return NextResponse.json({
      ok: true,
      persisted,
      summary: {
        total: followup.summary.total + writeoff.summary.total,
        followup: followup.summary,
        writeoff: writeoff.summary,
      },
    });
  } catch (err) {
    console.error("[refresh] 실패:", err);
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
