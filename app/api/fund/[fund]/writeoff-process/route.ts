import { NextResponse } from "next/server";
import { z } from "zod";
import { sheetToText, normName, nameKeys, hasWriteoffSignalInText } from "@/lib/writeoff/sheet";
import { interpretSheet } from "@/lib/writeoff/interpret";
import { saveInterp } from "@/lib/writeoff/interp-cache";
import { invalidateFund, getFundCompanyNames } from "@/lib/slab/service";
import { authUser } from "@/lib/auth";

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
    // 감액/청산을 판단할 명시적 신호(상태 열 또는 폐업/청산/상각 등)가 없으면 억지로 추론하지 않고 안내.
    if (!hasWriteoffSignalInText(text)) {
      return NextResponse.json(
        { ok: false, error: "이 탭에서는 감액/청산 상태를 명확히 읽을 수 없습니다. 상태 열이나 폐업/청산 표기가 있는 다른 탭('투자 및 전환현황' 등)을 선택하거나, 올바른 투자현황 DB 파일인지 확인 후 다시 업로드해 주세요." },
        { status: 400 },
      );
    }
    // 잘못된 펀드의 시트 방지: 시트의 회사들이 이 펀드 포트폴리오와 거의 안 겹치면 거부 (LLM 호출 전, 원문 이름으로 판정).
    const fundCompanies = await getFundCompanyNames(fund);
    if (fundCompanies.length > 0) {
      const sheetKeys = new Set<string>();
      for (const nm of names) for (const k of nameKeys(nm)) sheetKeys.add(k);
      const matched = fundCompanies.filter((fc) => nameKeys(fc.name, fc.nameEn).some((k) => sheetKeys.has(k))).length;
      if (matched / fundCompanies.length < 0.3) {
        return NextResponse.json(
          { ok: false, error: `이 시트의 회사들이 이 펀드 포트폴리오와 거의 일치하지 않습니다 (${matched}/${fundCompanies.length} 매칭). 다른 펀드의 시트일 수 있으니 확인하세요.` },
          { status: 400 },
        );
      }
    }
    const companies = await interpretSheet(text, authUser(req) || undefined);
    if (companies.length === 0) {
      return NextResponse.json(
        { ok: false, error: "이 탭에서 회사 목록을 찾지 못했습니다. 회사별 데이터가 있는 다른 탭을 선택하거나, 올바른 투자현황 DB 파일인지 확인 후 다시 업로드해 주세요." },
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
