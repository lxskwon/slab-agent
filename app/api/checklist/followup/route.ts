import { NextResponse } from "next/server";
import { runFollowup } from "@/lib/pipelines/followup";
import { buildFollowupWorkbook } from "@/lib/checklist/xlsx";

export const runtime = "nodejs";

/** 후속투자 체크리스트(.xlsx) 생성 + 다운로드. 매 호출마다 최신 데이터로 재실행. */
export async function GET() {
  const now = new Date();
  const stamp = now.toISOString().slice(0, 10);
  const result = await runFollowup();
  const buf = await buildFollowupWorkbook(result, now.toLocaleString("ko-KR"));
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="followup_checklist_${stamp}.xlsx"`,
    },
  });
}
