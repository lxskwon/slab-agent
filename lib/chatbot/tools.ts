import "server-only";
import type OpenAI from "openai";
import {
  getFunds,
  getDashboard,
  getFundTracker,
  getCompanyDetail,
  getTargetQuarter,
  type FundInfo,
} from "@/lib/slab/service";

/**
 * 챗봇 로직의 핵심 — 읽기 전용 도구 정의 + 디스패처.
 *
 * 이 파일이 "나중에 멘토 챗봇에 붙일 로직"의 이식 지점이다.
 * 도구 스키마(CHAT_TOOLS)와 시스템 프롬프트는 그대로 옮기고,
 * dispatchTool 안의 데이터 조회부(service.ts 호출)만 멘토 챗봇의 데이터 소스로 갈아끼우면 된다.
 *
 * 모든 도구는 읽기 전용 — 데이터를 변경하지 않는다.
 */

// ---- 도구 정의 (OpenAI function-calling 스키마) ----
export const CHAT_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_funds",
      description: "SparkLabs가 운용하는 전체 펀드 목록(이름·슬러그)을 반환한다. 어떤 펀드가 있는지, 펀드 이름의 정확한 표기를 확인할 때 사용.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dashboard",
      description:
        "전 펀드 요약을 반환한다: 대상 분기, 총계(불일치·확인필요 건수, 등기부등본 처리율), 펀드별 통계, 그리고 '조치 필요 큐'(후속투자 불일치·감액 미반영·확인 필요 이슈 목록). '지금 확인해야 할 게 뭐야', '전체 현황', '불일치 몇 건' 같은 질문에 사용.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_fund_tracker",
      description:
        "특정 펀드의 후속투자·감액 대조 상세를 반환한다. 각 기업의 등기부/SLAB/분기보고 발행주식수, 일치여부, 감액 반영여부, 비고까지. 특정 펀드의 상태를 물을 때 사용.",
      parameters: {
        type: "object",
        properties: {
          fund: { type: "string", description: "펀드 이름 또는 슬러그 (예: 'SKF4', 'CJFtr', '스파크펫'). 부분 일치도 허용." },
        },
        required: ["fund"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_company_detail",
      description:
        "특정 기업이 속한 모든 펀드에서의 상태를 반환한다: 등기부/SLAB/분기보고 발행주식수, 일치여부, 펀드별 SLAB 투자상태·감액 반영여부. 특정 회사에 대해 물을 때 사용.",
      parameters: {
        type: "object",
        properties: {
          company: { type: "string", description: "회사명 (예: '프론트맨', '엘로이랩'). ㈜/공백 무시하고 부분 일치도 허용." },
        },
        required: ["company"],
        additionalProperties: false,
      },
    },
  },
];

// ---- 이름 정규화 & 조회 헬퍼 ----
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/㈜|\(주\)|주식회사/g, "");
}

async function resolveFund(query: string): Promise<FundInfo | null> {
  const funds = await getFunds();
  const q = norm(query);
  return (
    funds.find((f) => norm(f.search) === q) ||
    funds.find((f) => norm(f.name) === q) ||
    funds.find((f) => norm(f.search).includes(q) || norm(f.name).includes(q)) ||
    null
  );
}

// ---- 응답 컴팩트 매퍼 (토큰 절약 + 답변 grounding) ----
function fmtNum(n: number | null | undefined): number | string | null {
  return n == null ? null : n;
}

function compactFollowup(r: import("@/lib/tracker/mock-data").FollowupRow) {
  return {
    company: r.company,
    companyUrl: r.companyId ? `/company/${r.companyId}` : undefined, // 기업 상세 링크
    투자유치여부: r.investStatus,
    등기부발행주식총수: fmtNum(r.registryShares),
    SLAB발행주식총수: fmtNum(r.slabShares),
    분기보고발행주식수: fmtNum(r.reportShares),
    일치여부: r.match || "(대조불가)",
    등기부확인일: r.registryDate,
    등기부분기: r.registryQuarter ?? null,
    등기부링크: r.registryUrl ?? undefined, // 등기부등본 원본 PDF
    비고: r.note || "",
  };
}

function compactWriteoff(r: import("@/lib/tracker/mock-data").WriteoffRow) {
  return {
    company: r.company,
    companyUrl: r.companyId ? `/company/${r.companyId}` : undefined,
    스프레드시트상태: r.sheetStatus,
    SLAB상태: r.slabStatus ?? "",
    반영여부: r.reflected || "",
    비고: r.note || "",
  };
}

// ---- 디스패처: 도구 이름 → service.ts 조회 → 컴팩트 결과 ----
export async function dispatchTool(name: string, input: unknown): Promise<unknown> {
  const args = (input ?? {}) as Record<string, unknown>;

  switch (name) {
    case "list_funds": {
      const funds = await getFunds();
      return { funds: funds.map((f) => ({ name: f.name, slug: f.search, fundUrl: `/fund/${f.search}` })) };
    }

    case "get_dashboard": {
      const [dash, tq] = await Promise.all([getDashboard(), getTargetQuarter()]);
      return {
        대상분기: tq.label,
        총계: {
          펀드수: dash.totals.funds,
          분석된기업수: dash.totals.companies,
          후속불일치_및_감액미반영: dash.totals.red,
          확인필요: dash.totals.yellow,
          등기부처리율: `${dash.totals.registryPct}%`,
          감액분석완료펀드: dash.totals.processed,
        },
        펀드별: dash.funds.map((f) => ({
          name: f.name,
          slug: f.slug,
          fundUrl: `/fund/${f.slug}`,
          기업수: f.companies,
          후속: f.followup,
          감액: f.writeoffUploaded ? f.writeoff : "미업로드",
          등기부처리율: `${f.registryPct}%`,
          red: f.red,
          yellow: f.yellow,
        })),
        조치필요큐: dash.issues.slice(0, 60).map((i) => ({
          펀드: i.fund,
          기업: i.company,
          companyUrl: i.companyId ? `/company/${i.companyId}` : undefined,
          fundUrl: i.fundSlug ? `/fund/${i.fundSlug}` : undefined,
          종류: i.kind,
          분류: i.category === "followup" ? "후속투자" : "감액",
          심각도: i.severity,
          상세: i.detail,
          검토상태: i.status,
        })),
        큐_전체건수: dash.issues.length,
      };
    }

    case "get_fund_tracker": {
      const fund = await resolveFund(String(args.fund ?? ""));
      if (!fund) {
        const funds = await getFunds();
        return { error: `'${args.fund}' 펀드를 찾지 못했습니다.`, 가능한_펀드: funds.map((f) => f.name) };
      }
      const [t, tq] = await Promise.all([getFundTracker(fund.search), getTargetQuarter()]);
      if (!t) return { error: `'${fund.name}' 트래커를 불러오지 못했습니다.` };
      return {
        펀드: t.fund.name,
        slug: t.fund.search,
        fundUrl: `/fund/${t.fund.search}`,
        대상분기: tq.label,
        감액시트상태: t.sheetState === "processed" ? "업로드·해석 완료" : t.sheetState === "uploaded" ? "업로드됨(미해석)" : "미업로드",
        후속투자: t.followup.map(compactFollowup),
        감액: t.sheetState === "processed" ? t.writeoff.map(compactWriteoff) : "감액 스프레드시트가 업로드되지 않아 판정 불가",
      };
    }

    case "get_company_detail": {
      const query = String(args.company ?? "");
      // 회사명 → companyId: 대시보드의 기업 인덱스에서 해석 (id 필요)
      const dash = await getDashboard();
      const q = norm(query);
      const hit =
        dash.companies.find((c) => norm(c.name) === q) ||
        dash.companies.find((c) => norm(c.name).includes(q) || q.includes(norm(c.name)));
      if (!hit) {
        return { error: `'${query}' 기업을 찾지 못했습니다. 정확한 회사명이나 소속 펀드로 다시 물어봐 주세요.` };
      }
      const detail = await getCompanyDetail(hit.id);
      if (!detail) return { error: `'${query}' 기업 상세를 불러오지 못했습니다.` };
      return {
        기업: detail.name,
        companyUrl: `/company/${hit.id}`,
        영문명: detail.nameEn,
        해외기업: detail.foreign,
        투자유치여부: detail.investStatus,
        후속투자: detail.followup
          ? {
              SLAB발행주식총수: fmtNum(detail.followup.slabShares),
              등기부발행주식총수: fmtNum(detail.followup.registryShares),
              분기보고발행주식수: fmtNum(detail.followup.reportShares),
              등기부분기: detail.followup.registryQuarter,
              등기부확인일: detail.followup.registryDate,
              일치여부: detail.followup.match || "(대조불가)",
              등기부링크: detail.followup.registryUrl ?? undefined,
              비고: detail.followup.note || "",
            }
          : null,
        펀드별: detail.funds.map((f) => ({
          펀드: f.name,
          fundUrl: `/fund/${f.slug}`,
          SLAB투자상태: f.slabStatus || "(미기재)",
          스프레드시트상태: f.writeoffUploaded ? (f.sheetStatus ?? "(미등재)") : "감액시트 미업로드",
          감액분석: f.writeoffUploaded ? (f.reflected ?? "") : "미업로드",
          비고: f.note ?? "",
        })),
      };
    }

    default:
      return { error: `알 수 없는 도구: ${name}` };
  }
}
