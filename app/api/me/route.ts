import { NextResponse } from "next/server";
import { authUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 현재 로그인한 사용자 이름 (메모 작성자 표시/낙관적 업데이트용) */
export async function GET(req: Request) {
  return NextResponse.json({ user: authUser(req) });
}
