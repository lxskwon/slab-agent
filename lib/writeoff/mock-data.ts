import type { SpreadsheetStatus } from "@/lib/types";

/**
 * Phase 3 감액 데모용 스프레드시트 상태.
 * SLAB 상태(lib/slab/mock-data.ts MOCK_SLAB_WRITEOFF)와 짝을 이루며
 * 표현이 일부러 다르다 → LLM 판단 필요.
 *
 * 실제로는 Google Sheets에서 읽는다:
 * https://docs.google.com/spreadsheets/d/1VUNVEdrZnB-9azEUagTtTLbNB0ol_hPnHkfyxjrNuiA
 */
export const MOCK_SPREADSHEET: SpreadsheetStatus[] = [
  { companyName: "알파", status: "Written-off" }, // SLAB 감액완료 → 이미 반영됨(초록)
  { companyName: "베타", status: "Written-off" }, // SLAB 정상 → 미반영(빨강)
  { companyName: "감마", status: "Exit" }, // SLAB 청산진행중 → 판단애매(노랑)
  { companyName: "델타", status: "Live" }, // SLAB 정상 → 이미 반영됨(초록)
];
