import { NextResponse } from "next/server";
import { runWriteoff } from "@/lib/pipelines/writeoff";
import { buildWriteoffWorkbook } from "@/lib/checklist/xlsx";

export const runtime = "nodejs";

/** 감액 체크리스트(.xlsx) 생성 + 다운로드. 매 호출마다 최신 데이터로 재실행. */
export async function GET() {
  const now = new Date();
  const stamp = now.toISOString().slice(0, 10);
  const result = await runWriteoff();
  const buf = await buildWriteoffWorkbook(result, now.toLocaleString("ko-KR"));
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="writeoff_checklist_${stamp}.xlsx"`,
    },
  });
}
