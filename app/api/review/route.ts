import { NextResponse } from "next/server";
import { z } from "zod";
import { setReviewItem } from "@/lib/review/store";

export const runtime = "nodejs";

const Body = z.object({
  id: z.string().min(1),
  status: z.enum(["open", "ack", "dismissed"]),
  note: z.string().max(500).default(""),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  }
  const { id, status, note } = parsed.data;
  await setReviewItem(id, { status, note, updatedAt: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
