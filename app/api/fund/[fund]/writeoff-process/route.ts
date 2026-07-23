import { NextResponse } from "next/server";
import { z } from "zod";
import { sheetToText, normName } from "@/lib/writeoff/sheet";
import { interpretSheet } from "@/lib/writeoff/interpret";
import { saveInterp } from "@/lib/writeoff/interp-cache";
import { invalidateFund } from "@/lib/slab/service";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({ tab: z.string().min(1) });

/** 2단계: 선택한 탭을 LLM으로 해석 → 회사별 상태 캐시 → 캐시 무효화 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ fund: string }> },
) {
  const { fund } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "탭 미지정" }, { status: 400 });
  }
  try {
    const { text, names } = await sheetToText(fund, parsed.data.tab);
    if (!text.trim()) {
      return NextResponse.json({ ok: false, error: "탭에서 데이터를 읽지 못함" }, { status: 400 });
    }
    const companies = await interpretSheet(text);
    if (companies.length === 0) {
      return NextResponse.json(
        { ok: false, error: "이 탭에서 회사 목록을 찾지 못했습니다. 회사별 데이터가 있는 탭(예: '투자집행')을 선택하세요." },
        { status: 400 },
      );
    }
    // (1)/(2) 중복은 코드로 결정: 이름에 명시적 (숫자) 접미사가 있는 경우만.
    // (같은 번호로 두 번 나오는 이상치(예: 51/51)는 (1)/(2) 중복이 아니므로 제외)
    const dupBases = new Set<string>();
    for (const nm of names) {
      if (/\(\s*\d+\s*\)\s*$/.test(nm)) {
        const k = normName(nm);
        if (k) dupBases.add(k);
      }
    }
    const duplicatedBases = [...dupBases];
    await saveInterp(fund, { tab: parsed.data.tab, companies, duplicatedBases });
    invalidateFund(fund);
    return NextResponse.json({ ok: true, count: companies.length });
  } catch (err) {
    console.error("[writeoff-process] 해석 실패:", err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
