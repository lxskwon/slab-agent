import OpenAI from "openai";
import { logLlmUsage, usageFrom } from "@/lib/llm/usage";
import type { ReflectionStatus } from "@/lib/types";

/**
 * FR-2.3 — 감액 판단: 스프레드시트 상태와 SLAB 상태를 LLM이 비교해
 * '이미 반영됨' / '미반영' / '판단애매' 를 판정하고 근거를 남긴다.
 *
 * 규칙 매칭이 아닌 LLM을 쓰는 이유: 두 시스템의 표현이 다르다
 * (예: 스프레드시트 "Written-off" vs SLAB "감액 처리 완료").
 */

const MODEL = "gpt-4.1-mini";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    reflectionStatus: {
      type: "string",
      enum: ["이미 반영됨", "미반영", "판단애매"],
      description:
        "스프레드시트 상태가 SLAB에 반영됐는지: 일치하면 '이미 반영됨', 스프레드시트는 감액/청산인데 SLAB이 정상이면 '미반영', 애매하면 '판단애매'.",
    },
    reasoning: {
      type: "string",
      description: "판단 근거를 한국어 1~3문장으로. 어떤 표현을 어떻게 대응시켰는지.",
    },
  },
  required: ["reflectionStatus", "reasoning"],
} as const;

export interface WriteoffJudgeResult {
  reflectionStatus: ReflectionStatus;
  reasoning: string;
}

function prompt(company: string, sheet: string | null, slab: string | null): string {
  return `SparkLabs 감액(투자자산 상각) 데이터 검증이다.

- 스프레드시트(회사가 관리하는 정답값) 투자상태: ${sheet ?? "(없음)"}
- SLAB(시스템) 투자상태: ${slab ?? "(없음)"}

스프레드시트 상태가 SLAB에 제대로 반영됐는지 판단해라.
- 두 상태가 사실상 같은 의미면 "이미 반영됨"
- 스프레드시트는 Written-off/Exit(감액·청산·손실)인데 SLAB은 정상/투자유지면 "미반영"
- 표현이 부분적으로만 일치하거나(예: Exit vs 청산 진행중) 정보가 부족하면 "판단애매"

기업: ${company}`;
}

export async function judgeWriteoff(
  company: string,
  spreadsheetStatus: string | null,
  slabStatus: string | null,
): Promise<WriteoffJudgeResult> {
  // 정보가 없으면 LLM 호출 없이 판단애매 처리 (조용히 무시 금지)
  if (!spreadsheetStatus || !slabStatus) {
    return {
      reflectionStatus: "판단애매",
      reasoning: `상태 값 부족(스프레드시트=${spreadsheetStatus ?? "없음"}, SLAB=${slabStatus ?? "없음"}) — 사람 확인 필요.`,
    };
  }
  // 키 없으면 LLM 미실행 → 판단애매로 표시 (배포 환경에 키가 없을 때 graceful)
  if (!process.env.OPENAI_API_KEY) {
    return {
      reflectionStatus: "판단애매",
      reasoning: "LLM(OPENAI_API_KEY) 미설정 — 자동 판단 불가, 사람 확인 필요.",
    };
  }

  const client = new OpenAI();
  const res = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    response_format: {
      type: "json_schema",
      json_schema: { name: "writeoff_judge", strict: true, schema: SCHEMA },
    },
    messages: [{ role: "user", content: prompt(company, spreadsheetStatus, slabStatus) }],
  } as never);
  await logLlmUsage({ feature: "감액 판정", model: MODEL, ...usageFrom(res) });

  const text = res.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("감액 판단 응답에 텍스트 결과 없음");
  }
  return JSON.parse(text) as WriteoffJudgeResult;
}
