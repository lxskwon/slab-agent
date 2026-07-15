import { NextResponse } from "next/server";
import { z } from "zod";
import { setStatus, addMemo, editMemo, deleteMemo, getReviewState } from "@/lib/review/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  id: z.string().min(1),
  status: z.enum(["open", "ack", "dismissed"]).optional(),
  memo: z.object({ memoId: z.string().min(1), author: z.string().trim().min(1).max(60), content: z.string().trim().min(1).max(1000) }).optional(),
  editMemo: z.object({ memoId: z.string().min(1), content: z.string().trim().min(1).max(1000) }).optional(),
  deleteMemo: z.object({ memoId: z.string().min(1) }).optional(),
});

// 상태 변경 / 메모 추가·수정·삭제
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  }
  const { id, status, memo, editMemo: edit, deleteMemo: del } = parsed.data;
  const now = new Date().toISOString();
  if (memo) await addMemo(id, { id: memo.memoId, author: memo.author, content: memo.content, at: now });
  if (edit) await editMemo(id, edit.memoId, edit.content, now);
  if (del) await deleteMemo(id, del.memoId, now);
  if (status) await setStatus(id, status, now);
  return NextResponse.json({ ok: true });
}

// 라이브 폴링용: 전체 검토 상태 반환
export async function GET() {
  return NextResponse.json(await getReviewState());
}
