import Anthropic from "@anthropic-ai/sdk";

/**
 * LLM 기반 투자현황 시트 해석기 (형식 무관).
 * 명시적 상태 열이 있으면 사용, 없으면 현재시점 재무지표 + 비고로 감액 여부를 추론.
 * (1)/(2) 트랜치는 한 회사로 합침.
 */

const MODEL = "claude-opus-4-8";

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

const PROMPT = `아래는 벤처펀드 '투자자산관리' 스프레드시트 한 탭의 내용이다(열=값 형태).
각 회사(기업명 기준)의 현재 감액(impairment) 상태를 판정하라.

판정 규칙:
1. **명시적 상태 열(상태/Status)이 있으면 그 값을 그대로 매핑한다(최우선, 다른 정황으로 뒤집지 말 것).**
   - Live/정상 → live
   - Written-off/W/O/상각/감액 → writeoff
   - Exit/M&A/Capital Return/회수/청산/매각 → exit
   ※ 상태 열이 'M&A'면 비고에 '타진 중/진행 중'이라 적혀 있어도 exit로 본다(상태 열이 정답).
2. 상태 열이 없을 때만 '현재시점' 재무지표 + 비고로 추론한다:
   - 투자라운드 없음 + 평가금액≈0(예 1,000원) + MOIC≈0 → 감액 의심. 단 보유주식수 NA/지분율 미기재만으로는 감액 아님.
   - 비고 '감액/상각' → writeoff / 완전히 종료된 회수·청산·매각 → exit
   - '상환 중'/'회수 진행 중'/부분 회수 등 아직 보유·운영 중 → live (아직 exit 아님)
   - 그 외 정상 → live
3. 같은 회사의 여러 트랜치((1),(2),(n))는 하나로 합치고 duplicated=true.
5. name은 시트에 적힌 국문 회사명을 그대로(㈜ 등 포함, 트랜치 접미사만 제거). 임의 번역·정규화 금지.
   회사명(영문) 열이 있으면 nameEn에 그대로 넣어라(없으면 "").
6. status ∈ live/writeoff/exit/uncertain. note는 감액/exit 사유나 비고 핵심 한 줄(정상이면 "").
7. **statusLabel: 시트의 상태(Status) 열에 실제 적힌 문자열을 원문 그대로 넣어라** (예: "M&A", "Capital Return", "Exit", "Live", "Written-off"). status로 뭉뚱그리지 말 것. 상태 열이 없어 재무지표로 추론한 경우엔 statusLabel="".
스프레드시트에 실제 있는 회사만 반환한다.`;

export async function interpretSheet(sheetText: string): Promise<InterpretedCompany[]> {
  const client = new Anthropic({ maxRetries: 3 });
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: `${PROMPT}\n\n---\n${sheetText}` }],
  });
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("시트 해석 응답 없음");
  const parsed = JSON.parse(block.text) as { companies: InterpretedCompany[] };
  return parsed.companies ?? [];
}
