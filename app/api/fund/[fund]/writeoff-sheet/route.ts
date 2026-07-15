import { NextResponse } from "next/server";
import { saveFundSheet, listTabs } from "@/lib/writeoff/sheet";

export const runtime = "nodejs";

/** 1단계: 감액 시트(.xlsx) 업로드 → 저장 → 탭 목록 반환 (해석은 다음 단계) */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ fund: string }> },
) {
  const { fund } = await params;
  try {
    const buf = Buffer.from(await req.arrayBuffer());
    if (buf.length === 0) {
      return NextResponse.json({ ok: false, error: "빈 파일" }, { status: 400 });
    }
    await saveFundSheet(fund, buf);
    const tabs = await listTabs(fund);
    return NextResponse.json({ ok: true, tabs });
  } catch (err) {
    console.error("[writeoff-sheet] 업로드 실패:", err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
