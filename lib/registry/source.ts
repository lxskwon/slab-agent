import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pdfParse from "pdf-parse";
import type { RegistryExtract } from "@/lib/types";
import { extractRegistryFields } from "./parse";
import { extractViaVision } from "./ocr";
import { MOCK_REGISTRY } from "./mock-data";

const SAMPLES_DIR = path.join(process.cwd(), "data", "registry-samples");

/**
 * 등기부등본 소스 추상화.
 * - data/registry-samples/ 에 실제 PDF가 있으면 텍스트 파싱해서 사용
 * - 없으면 목업 데이터로 fallback (Phase 0 데모)
 */
export interface RegistrySource {
  getExtract(companyName: string): Promise<RegistryExtract | null>;
}

/** 파일명이 기업명을 포함하면 매칭 (예: "알파테크_등기부등본.pdf") */
async function findPdfForCompany(companyName: string): Promise<string | null> {
  let files: string[];
  try {
    files = await readdir(SAMPLES_DIR);
  } catch {
    return null; // 폴더 없음/비어있음
  }
  const hit = files.find(
    (f) => f.toLowerCase().endsWith(".pdf") && f.includes(companyName),
  );
  return hit ? path.join(SAMPLES_DIR, hit) : null;
}

export class FileRegistrySource implements RegistrySource {
  async getExtract(companyName: string): Promise<RegistryExtract | null> {
    const pdfPath = await findPdfForCompany(companyName);
    if (pdfPath) {
      try {
        const buf = await readFile(pdfPath);
        const parsed = await pdfParse(buf);
        const text = parsed.text ?? "";
        // 페이지당 텍스트가 거의 없으면 스캔본 → Phase 2 OCR 대상으로 표시
        // (예: (주)본작 = 14페이지에 28자)
        const perPage = text.trim().length / Math.max(1, parsed.numpages);
        if (perPage < 40) {
          // 스캔본 → Phase 2 비전 OCR. 키가 있으면 판독, 없으면 '재확인 필요' 표시.
          const fileName = path.basename(pdfPath);
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
            confidence: 0, // OCR 미실행/실패 → 대시보드에서 '재확인 필요'
          };
        }
        const fields = extractRegistryFields(text);
        return {
          companyName,
          fileName: path.basename(pdfPath),
          issueDate: fields.issueDate,
          shareCountTotal: fields.shareCountTotal,
          method: "text",
          confidence: null,
        };
      } catch (err) {
        // 판독 실패는 조용히 무시하지 않는다 (NFR) → null 반환 시 파이프라인이 '확인필요' 처리
        console.error(`[registry] ${companyName} PDF 파싱 실패:`, err);
        return null;
      }
    }
    // 실제 PDF 없음 → 목업
    return MOCK_REGISTRY[companyName] ?? null;
  }
}

export function getRegistrySource(): RegistrySource {
  return new FileRegistrySource();
}
