// 공용 도메인 타입

export type InvestmentStatus =
  | "투자완료"
  | "투자예정"
  | "해당없음"
  | "미확인";

export type MatchStatus = "일치" | "불일치" | "확인필요";

export type ReflectionStatus = "이미 반영됨" | "미반영" | "판단애매";

export type ExtractionMethod = "text" | "ocr";

/** SLAB에서 가져온 기업 스냅샷 (후속투자 + 감액에 필요한 값) */
export interface SlabSnapshot {
  companyName: string;
  shareCountTotal: number | null; // 발행주식총수
  investmentStatus: InvestmentStatus; // 투자유치여부 (분기보고 기반)
  writeoffStatus: string | null; // 감액 관련 SLAB 상태 (Phase 3)
  raw?: unknown; // API 원본 응답 (디버깅용)
}

/** 등기부등본 파싱 결과 */
export interface RegistryExtract {
  companyName: string;
  fileName: string | null;
  issueDate: string | null; // 발행일 (YYYY-MM-DD)
  shareCountTotal: number | null; // 발행주식총수
  method: ExtractionMethod;
  confidence: number | null; // OCR인 경우 0~1
}

/** 후속투자 한 기업 판정 결과 */
export interface FollowupJudgment {
  companyName: string;
  slabShareCount: number | null;
  registryShareCount: number | null;
  registryIssueDate: string | null;
  investmentStatus: InvestmentStatus;
  matchStatus: MatchStatus;
  extractionMethod: ExtractionMethod | null;
  ocrConfidence: number | null;
  /** 일치 → 'N', 불일치/확인필요 → null (사람이 채움) */
  followupApplicable: "Y" | "N" | null;
}

/** 감액용 스프레드시트 상태 (Live / Written-off / Exit) */
export interface SpreadsheetStatus {
  companyName: string;
  status: string; // 원본 표기 (표현이 다양할 수 있음)
}

/** 감액 한 기업 판정 결과 */
export interface WriteoffJudgment {
  companyName: string;
  spreadsheetStatus: string | null;
  slabStatus: string | null;
  reflectionStatus: ReflectionStatus;
  reasoning: string; // LLM 판단 근거
}
