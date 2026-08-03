import pdfParse from "pdf-parse";
import type { RegistryExtract } from "@/lib/types";
import { extractRegistryFields } from "./parse";
import { extractViaVision } from "./ocr";

/**
 * PDF 버퍼(로컬/원격 무관)에서 등기부등본 값을 추출.
 * 텍스트가 충분하면 정규식 파싱, 스캔본이면 GPT 비전 OCR.
 * (source.ts의 로컬 파일 로직을 버퍼 기반으로 일반화)
 */
export async function extractFromBuffer(
  buf: Buffer,
  companyName: string,
  fileName: string,
): Promise<RegistryExtract> {
  const parsed = await pdfParse(buf);
  const text = parsed.text ?? "";
  const perPage = text.trim().length / Math.max(1, parsed.numpages);

  if (perPage < 40) {
    // 스캔본 → 비전 OCR (키 있을 때만)
    if (process.env.OPENAI_API_KEY) {
      try {
        return await extractViaVision(buf, companyName, fileName);
      } catch (err) {
        console.error(`[registry] ${companyName} OCR 실패:`, err);
      }
    }
    return {
      companyName,
      fileName,
      issueDate: null,
      shareCountTotal: null,
      method: "ocr",
      confidence: 0,
    };
  }

  const f = extractRegistryFields(text);
  // 텍스트인데 한국어 발행주식총수 패턴을 못 찾음(외국어 등기서류 등) → 비전 OCR 폴백
  if (f.shareCountTotal == null && process.env.OPENAI_API_KEY) {
    try {
      const ocr = await extractViaVision(buf, companyName, fileName);
      if (ocr.shareCountTotal != null) return ocr;
    } catch (err) {
      console.error(`[registry] ${companyName} 텍스트→OCR 폴백 실패:`, err);
    }
  }
  return {
    companyName,
    fileName,
    issueDate: f.issueDate,
    shareCountTotal: f.shareCountTotal,
    method: "text",
    confidence: null,
  };
}
