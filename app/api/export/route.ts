import { NextRequest } from "next/server";
import { getDashboard, getFundTracker } from "@/lib/slab/service";
import { buildTrackerWorkbook } from "@/lib/tracker/xlsx";
import type { Section, FollowupRow, WriteoffRow } from "@/lib/tracker/mock-data";

export const dynamic = "force-dynamic";

// GET /api/export            → 분석 완료된 전 펀드를 하나의 워크북으로
// GET /api/export?fund=skf4  → 해당 펀드만
export async function GET(req: NextRequest) {
  const only = req.nextUrl.searchParams.get("fund");

  const targets: string[] = only
    ? [only]
    : (await getDashboard()).funds.map((f) => f.slug); // 후속투자는 전 펀드

  const followup: Section<FollowupRow>[] = [];
  const writeoff: Section<WriteoffRow>[] = [];
  for (const slug of targets) {
    const t = await getFundTracker(slug);
    if (!t) continue;
    followup.push({ fund: t.fund.name, rows: t.followup });
    // 감액은 투자현황 DB가 업로드된 펀드만 (미업로드 펀드의 빈 섹션 방지)
    if (t.sheetState === "processed") writeoff.push({ fund: t.fund.name, rows: t.writeoff });
  }

  if (followup.length === 0) {
    return new Response("내보낼 분석 완료 펀드가 없습니다.", { status: 404 });
  }

  const buf = await buildTrackerWorkbook(followup, writeoff);
  const today = new Date().toISOString().slice(0, 10);
  const base = only ? `SLAB_트래커_${only}` : "SLAB_트래커_전체";
  const filename = `${base}_${today}.xlsx`;

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
