import OpenAI, { toFile } from "openai";
import { logLlmUsage, usageFrom } from "@/lib/llm/usage";
import type { RegistryExtract } from "@/lib/types";

// base64 인라인은 요청 페이로드가 커지므로 이보다 크면 Files API로 업로드해 file_id로 참조.
const INLINE_MAX = 20 * 1024 * 1024; // ~20MB raw

/**
 * Phase 2 — 스캔본 등기부등본을 GPT 비전으로 판독한다.
 *
 * 텍스트 파서와 달리 모델이 페이지 이미지를 직접 보므로,
 * 취소선(말소)이 그어진 발행주식의 총수를 **시각적으로 구분**해
 * 현재 유효한 값만 추출할 수 있다.
 *
 * 정확도가 가장 중요한 경로라 상위 모델(gpt-4.1)을 쓴다.
 * OPENAI_API_KEY가 없으면 호출하지 않는다 (extract.ts에서 가드).
 */

const MODEL = "gpt-4.1";

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
  const client = new OpenAI({ maxRetries: 4 }); // 연결 오류 재시도 강화
  const large = pdfBuffer.length > INLINE_MAX;

  // 대용량이면 Files API 업로드 후 file_id 참조, 아니면 base64 data URL 인라인
  let filePart: { type: "file"; file: { file_id: string } | { filename: string; file_data: string } };
  let uploadedId: string | null = null;
  if (large) {
    // 업로드 파일명은 추출과 무관 → 안전한 짧은 이름 사용
    const uploaded = await client.files.create({
      file: await toFile(pdfBuffer, "register.pdf", { type: "application/pdf" }),
      purpose: "user_data",
    });
    uploadedId = uploaded.id;
    filePart = { type: "file", file: { file_id: uploaded.id } };
  } else {
    filePart = {
      type: "file",
      file: {
        filename: "register.pdf",
        file_data: `data:application/pdf;base64,${pdfBuffer.toString("base64")}`,
      },
    };
  }

  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 2048,
      response_format: {
        type: "json_schema",
        json_schema: { name: "registry_extract", strict: true, schema: SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: PROMPT }, filePart],
        },
      ],
    } as never);
    await logLlmUsage({ feature: "등기부 OCR", model: MODEL, ...usageFrom(response) });

    const raw = response.choices?.[0]?.message?.content;
    if (typeof raw !== "string" || !raw.trim()) throw new Error("OCR 응답에 텍스트 없음");
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
        await client.files.delete(uploadedId);
      } catch {
        /* 업로드 파일 정리 실패는 무시 */
      }
    }
  }
}
