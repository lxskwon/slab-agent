import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { isAdmin } from "@/lib/auth";
import { getServiceClient } from "@/lib/db/client";
import { processUncachedRegistries } from "@/lib/registry/process";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * 신규 등기부등본 자동 OCR (관리자 전용).
 * 캐시 없는 등기부를 배치 단위로 OCR → Supabase 캐시 저장 → 대시보드 무효화.
 * 남은 건수(remaining)를 반환하므로, 클라이언트가 done까지 반복 호출한다.
 */
export async function POST(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, error: "관리자만 실행할 수 있습니다." }, { status: 403 });
  }
  // OCR 결과를 저장할 곳(Supabase registry_cache)이 준비돼야 실행 — 없으면 OCR 비용만 쓰고 저장 실패하는 걸 방지.
  const db = getServiceClient();
  if (!db) {
    return NextResponse.json({ ok: false, error: "Supabase가 설정되지 않았습니다. (SUPABASE_URL / SERVICE_ROLE_KEY 확인)" }, { status: 400 });
  }
  const { error: tblErr } = await db.from("registry_cache").select("url").limit(1);
  if (tblErr) {
    return NextResponse.json({ ok: false, error: "registry_cache 테이블이 아직 없습니다. supabase-schema.sql의 registry_cache를 SQL Editor에서 먼저 실행하세요." }, { status: 400 });
  }
  try {
    const res = await processUncachedRegistries({ limit: 12, timeBudgetMs: 240000 });
    if (res.processed.length > 0) {
      revalidateTag("dashboard-base"); // OCR 결과를 대시보드/트래커에 즉시 반영
    }
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    console.error("[registry-process] 실패:", err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
