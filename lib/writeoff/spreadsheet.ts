import type { SpreadsheetStatus } from "@/lib/types";
import { MOCK_SPREADSHEET } from "./mock-data";

/**
 * 감액용 스프레드시트(투자상태) 소스 추상화.
 * Phase 3에서는 목업을 사용하고, Google Sheets 서비스 계정이 확보되면
 * GoogleSheetsSource만 채우면 파이프라인은 그대로 동작한다.
 */
export interface SpreadsheetSource {
  listStatuses(): Promise<SpreadsheetStatus[]>;
}

export class MockSpreadsheetSource implements SpreadsheetSource {
  async listStatuses(): Promise<SpreadsheetStatus[]> {
    return MOCK_SPREADSHEET;
  }
}

/**
 * 실제 Google Sheets 리더 (PRD §11.3 확정 후 구현).
 * 시트: 1VUNVEdrZnB-9azEUagTtTLbNB0ol_hPnHkfyxjrNuiA
 * 서비스 계정(GOOGLE_SERVICE_ACCOUNT_JSON)에 시트 읽기 권한 공유 필요.
 */
export class GoogleSheetsSource implements SpreadsheetSource {
  constructor(
    private readonly sheetId: string,
    private readonly serviceAccountJson: string,
  ) {}

  async listStatuses(): Promise<SpreadsheetStatus[]> {
    // TODO(Sheets): google-spreadsheet/googleapis로 기업명·상태 열 읽기
    throw new Error(
      "GoogleSheetsSource 미구현 — Google 서비스 계정 권한 확정 필요 (PRD §11.3)",
    );
  }
}

/** 서비스 계정 자격증명이 있으면 실제 시트, 없으면 목업. */
export function getSpreadsheetSource(): SpreadsheetSource {
  const sheetId = process.env.WRITEOFF_SHEET_ID;
  const creds = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (sheetId && creds) {
    return new GoogleSheetsSource(sheetId, creds);
  }
  return new MockSpreadsheetSource();
}

export function isSpreadsheetMocked(): boolean {
  return !(process.env.WRITEOFF_SHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
}
