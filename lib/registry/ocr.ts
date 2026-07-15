import Anthropic, { toFile } from "@anthropic-ai/sdk";
import type { RegistryExtract } from "@/lib/types";

// base64 인라인은 요청 32MB 제한이 있음. 이보다 크면 Files API로 업로드해 file_id로 참조
// (Files API는 최대 500MB) → 대용량 등기부등본도 OCR 가능.
const INLINE_MAX = 20 * 1024 * 1024; // ~20MB raw (base64 팽창 감안)
const FILES_BETA = "files-api-2025-04-14";

/**
 * Phase 2 — 스캔본 등기부등본을 Claude 비전으로 판독한다.
 *
 * 텍스트 파서와 달리 모델이 페이지 이미지를 직접 보므로,
 * 취소선(말소)이 그어진 발행주식의 총수를 **시각적으로 구분**해
 * 현재 유효한 값만 추출할 수 있다.
 *
 * ANTHROPIC_API_KEY가 없으면 호출하지 않는다 (source.ts에서 가드).
 */

const MODEL = "claude-opus-4-8";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    shareCountTotal: {
      type: ["integer", "null"],
      description:
        "발행주식의 총수. 취소선(말소)이 그어지지 않은, 가장 최근에 유효한 값. 판독 불가 시 null. '발행할 주식의 총수'(수권주식수)와 혼동하지 말 것.",
    },
    issueDate: {
      type: ["string", "null"],
      description: "발행일 또는 열람일 (YYYY-MM-DD). 없으면 null.",
    },
    confidence: {
      type: "number",
      description: "판독 신뢰도 0~1 (스캔 품질/글자 선명도 반영).",
    },
    reasoning: {
      type: "string",
      description:
        "어떤 값을 왜 선택했는지, 취소선 여부를 어떻게 판단했는지 한국어로 간단히.",
    },
  },
  required: ["shareCountTotal", "issueDate", "confidence", "reasoning"],
} as const;

interface OcrResult {
  shareCountTotal: number | null;
  issueDate: string | null;
  confidence: number;
  reasoning: string;
}

const PROMPT = `첨부한 법인 등기 서류(한국 등기부등본/등기사항전부증명서, 또는 외국 Certificate of Incorporation 등 외국어 서류)를 판독해줘.

추출할 값:
1. **발행주식의 총수 (shareCountTotal)**: 현재 유효한(취소선/말소되지 않은, 가장 최근) 총 발행주식수.
   - 한국 등기부: "발행주식의 총수". 여러 값이 시간순이면 취소선 없는 최신값. "발행할 주식의 총수"(수권주식수, authorized shares)는 제외.
   - 외국 서류: total issued shares / shares outstanding / 발행된 주식 총수. authorized(수권)와 혼동 금지.
   - 문서에 발행주식총수가 명시돼 있지 않으면 null.
2. **발행일/열람일 (issueDate, YYYY-MM-DD)**: 문서의 발행일·열람일시 또는 발급/증명 일자.

숫자는 콤마 없이 정수. 확신이 낮으면 confidence를 낮추고 reasoning에 이유(언어/스캔품질 등)를 남겨라.`;

function textOf(res: { content?: Array<{ type: string; text?: string }> }): string {
  const b = res.content?.find((x) => x.type === "text");
  if (!b || b.type !== "text" || typeof b.text !== "string") throw new Error("OCR 응답에 텍스트 없음");
  return b.text;
}

function lenientJson(t: string): Partial<OcrResult> {
  try {
    return JSON.parse(t) as OcrResult;
  } catch {
    const m = t.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as OcrResult;
      } catch {
        /* fallthrough */
      }
    }
    throw new Error("OCR JSON 파싱 실패");
  }
}

export async function extractViaVision(
  pdfBuffer: Buffer,
  companyName: string,
  fileName: string,
): Promise<RegistryExtract> {
  const client = new Anthropic({ maxRetries: 4 }); // 연결 오류 재시도 강화
  const large = pdfBuffer.length > INLINE_MAX;

  // 대용량이면 Files API 업로드 후 file_id 참조, 아니면 base64 인라인
  let source: Record<string, unknown>;
  let uploadedId: string | null = null;
  if (large) {
    // 업로드 파일명은 추출과 무관 → 안전한 짧은 이름 사용 (원본이 255자 초과 시 400 방지)
    const uploaded = await client.beta.files.upload({
      file: await toFile(pdfBuffer, "register.pdf", { type: "application/pdf" }),
      betas: [FILES_BETA],
    });
    uploadedId = uploaded.id;
    source = { type: "file", file_id: uploaded.id };
  } else {
    source = {
      type: "base64",
      media_type: "application/pdf",
      data: pdfBuffer.toString("base64"),
    };
  }

  const JSON_INSTR =
    '\n\n반드시 이 JSON만 출력(설명/마크다운 금지): {"shareCountTotal": <정수 또는 null>, "issueDate": "<YYYY-MM-DD 또는 null>", "confidence": <0~1>, "reasoning": "<한 줄>"}';

  try {
    let raw: string;
    if (large) {
      // Files API(beta): output_config(structured)와 조합 시 400 → 프롬프트-JSON + 관대한 파싱
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 2048,
        betas: [FILES_BETA],
        messages: [
          { role: "user", content: [{ type: "document", source }, { type: "text", text: PROMPT + JSON_INSTR }] },
        ],
      } as never);
      raw = textOf(response);
    } else {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        thinking: { type: "adaptive" as const },
        output_config: { format: { type: "json_schema" as const, schema: SCHEMA } },
        messages: [
          { role: "user", content: [{ type: "document", source }, { type: "text", text: PROMPT }] },
        ],
      } as never);
      raw = textOf(response);
    }
    const parsed = lenientJson(raw);
    return {
      companyName,
      fileName,
      issueDate: parsed.issueDate ?? null,
      shareCountTotal: parsed.shareCountTotal ?? null,
      method: "ocr",
      confidence: parsed.confidence ?? null,
    };
  } finally {
    if (uploadedId) {
      try {
        await client.beta.files.delete(uploadedId, { betas: [FILES_BETA] });
      } catch {
        /* 업로드 파일 정리 실패는 무시 */
      }
    }
  }
}
