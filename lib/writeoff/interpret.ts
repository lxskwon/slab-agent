import OpenAI from "openai";
import { logLlmUsage, usageFrom } from "@/lib/llm/usage";

/**
 * LLM 기반 투자현황 시트 해석기 (형식 무관).
 * 명시적 상태 열이 있으면 사용, 없으면 현재시점 재무지표 + 비고로 감액 여부를 추론.
 * (1)/(2) 트랜치는 한 회사로 합침.
 */

const MODEL = "gpt-4.1-mini";

export interface InterpretedCompany {
  name: string; // 시트에 적힌 국문 회사명 (트랜치 접미사 제거)
  nameEn: string; // 시트의 영문 회사명 (있으면, 없으면 "") — SLAB 매칭 보강용
  status: "live" | "writeoff" | "exit" | "uncertain"; // 표준 분류 (판정용)
  statusLabel: string; // 시트 상태 열에 적힌 원문 그대로 (예: "M&A", "Capital Return", "Exit"). 상태 열 없으면 ""
  duplicated: boolean; // 시트에 (1),(2) 등으로 중복 기재됨
  note: string; // 감액/exit 사유 등 핵심 비고 (없으면 "")
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    companies: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          nameEn: { type: "string" },
          status: { type: "string", enum: ["live", "writeoff", "exit", "uncertain"] },
          statusLabel: { type: "string" },
          duplicated: { type: "boolean" },
          note: { type: "string" },
        },
        required: ["name", "nameEn", "status", "statusLabel", "duplicated", "note"],
      },
    },
  },
  required: ["companies"],
} as const;

const PROMPT = `아래는 벤처펀드 '투자자산관리' 스프레드시트 한 탭의 내용이다(열=값 형태). 맨 위에 [상단 요약]이 있을 수 있다.
각 회사(기업명 기준)의 현재 감액(impairment)/청산·회수(exit) 상태를 판정하라.

⚠️ 가장 중요한 원칙: **오직 '명시적인 상태 표현'이 있을 때만 writeoff/exit로 분류한다. 재무 수치로 추론하지 마라.**
- 후속투자유치 금액=0, 평가금액이 작음, MOIC 낮음, 보유주식수 미기재, 지분율 낮음 → 이런 재무 지표만으로는 절대 writeoff/exit로 보지 말 것. 전부 live로 둔다.
- 후속투자를 못 받았다고 감액/청산이 아니다. 멀쩡히 운영 중인 회사도 후속투자=0 이 흔하다.

판정 규칙:
1. **명시적 상태 열(상태/Status)이 있으면 그 값을 그대로 매핑(최우선).**
   - Live/정상/운영 → live
   - Written-off/W/O/상각/감액 → writeoff
   - Exit/M&A/Capital Return/회수/매각 → exit
   ※ 상태 열이 'M&A'면 비고에 '타진 중/진행 중'이라 적혀 있어도 exit(상태 열이 정답).
2. 상태 열이 없으면, **비고(또는 [상단 요약])에 아래 명시적 표현이 있는 회사만** 분류한다:
   - writeoff 신호: '폐업', '파산', '청산', '해산', '완전자본잠식'/'자본잠식', '상각', '감액', 'written-off', 'W/O'
   - exit 신호: '매각(완료)', '회수(완료)', 'M&A', 'Capital Return', 'IPO/상장', 'Exit'
   - '상환 중'/'회수 진행 중'/'라운드 진행 중' 등 진행형·부분 표현은 아직 보유 중 → live
   - 위 명시적 신호가 전혀 없으면 → **live** (재무 지표로 넘겨짚지 말 것)
3. [상단 요약]에 '감액 기업: A, B' 처럼 특정 회사를 명시하면, 그 회사는 표(회사 목록)에서 찾아 writeoff로 분류한다.
4. 같은 회사의 여러 트랜치((1),(2),(n))는 하나로 합치고 duplicated=true.
5. name은 시트에 적힌 국문 회사명 그대로(㈜ 등 포함, 트랜치 접미사만 제거). 임의 번역·정규화 금지.
   회사명(영문) 열이 있으면 nameEn에 그대로(없으면 "").
6. status ∈ live/writeoff/exit/uncertain. note는 감액/exit 사유나 비고 핵심 한 줄(정상이면 "").
   ※ writeoff/exit로 판정한 경우 note에 시트의 **원문 근거를 그대로** 반드시 넣어라(예: "파산", "폐업", "완전자본잠식", "M&A", "청산"). 표준 라벨로 바꾸지 말고 시트에 적힌 단어를 쓸 것.
7. **statusLabel: 상태(Status) 열에 실제 적힌 문자열을 원문 그대로**(예: "M&A", "Capital Return", "Exit", "Live", "Written-off"). 상태 열이 없으면 statusLabel="".
표(회사 목록)에 실제 있는 회사만 반환한다([상단 요약]에만 있고 표에 없는 이름은 제외).`;

export async function interpretSheet(sheetText: string, user?: string): Promise<InterpretedCompany[]> {
  const client = new OpenAI({ maxRetries: 3 });
  const res = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 16000,
    response_format: {
      type: "json_schema",
      json_schema: { name: "sheet_companies", strict: true, schema: SCHEMA },
    },
    messages: [{ role: "user", content: `${PROMPT}\n\n---\n${sheetText}` }],
  } as never);
  await logLlmUsage({ feature: "감액 해석", model: MODEL, user, ...usageFrom(res) });
  const text = res.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("시트 해석 응답 없음");
  const parsed = JSON.parse(text) as { companies: InterpretedCompany[] };
  return parsed.companies ?? [];
}
