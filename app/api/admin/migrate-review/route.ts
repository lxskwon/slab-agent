import { NextResponse } from "next/server";
import { migrateStripKind } from "@/lib/review/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 1회성: 검토 상태 id에서 kind 제거 마이그레이션. (basic-auth 미들웨어 뒤) */
export async function POST() {
  const result = await migrateStripKind();
  return NextResponse.json({ ok: true, ...result });
}
