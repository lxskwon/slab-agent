import "server-only";
import { runFollowup } from "@/lib/pipelines/followup";
import { runWriteoff } from "@/lib/pipelines/writeoff";
import { hasSupabase } from "@/lib/db/client";
import {
  getLatestFollowupResults,
  getLatestWriteoffResults,
  judgmentsToRows,
  writeoffJudgmentsToRows,
  type FollowupResultRow,
  type WriteoffResultRow,
} from "@/lib/db/repositories";

export interface FollowupView {
  rows: FollowupResultRow[];
  /** 'db' = 저장된 실행 결과 / 'live' = Supabase 미설정 → 목업 실시간 판정 */
  source: "db" | "live";
  updatedAt: string | null;
  summary: {
    total: number;
    matched: number;
    mismatched: number;
    needsCheck: number;
    lowConfidenceOcr: number;
  };
}

function summarize(rows: FollowupResultRow[]): FollowupView["summary"] {
  return {
    total: rows.length,
    matched: rows.filter((r) => r.matchStatus === "일치").length,
    mismatched: rows.filter((r) => r.matchStatus === "불일치").length,
    needsCheck: rows.filter((r) => r.matchStatus === "확인필요").length,
    lowConfidenceOcr: rows.filter(
      (r) => r.extractionMethod === "ocr" && (r.ocrConfidence ?? 1) < 0.8,
    ).length,
  };
}

export async function getFollowupView(): Promise<FollowupView> {
  if (hasSupabase()) {
    const { results, runFinishedAt } = await getLatestFollowupResults();
    // 저장된 결과가 없으면(최초 실행 전) 라이브 판정으로 프리뷰
    if (results.length > 0) {
      return {
        rows: results,
        source: "db",
        updatedAt: runFinishedAt,
        summary: summarize(results),
      };
    }
  }
  // 라이브(목업) 모드: 매 페이지 로드마다 OCR을 재실행하면 느리므로 메모리에 캐시.
  // "지금 새로고침"이 invalidateLiveCache()로 강제 재계산한다.
  if (!liveCache) {
    const { judgments } = await runFollowup();
    const rows = judgmentsToRows(judgments);
    liveCache = { rows, source: "live", updatedAt: null, summary: summarize(rows) };
  }
  return liveCache;
}

let liveCache: FollowupView | null = null;

// ===================== 감액 (Phase 3) =====================

export interface WriteoffView {
  rows: WriteoffResultRow[];
  source: "db" | "live";
  updatedAt: string | null;
  summary: {
    total: number;
    reflected: number;
    notReflected: number;
    ambiguous: number;
  };
}

function summarizeWriteoff(rows: WriteoffResultRow[]): WriteoffView["summary"] {
  return {
    total: rows.length,
    reflected: rows.filter((r) => r.reflectionStatus === "이미 반영됨").length,
    notReflected: rows.filter((r) => r.reflectionStatus === "미반영").length,
    ambiguous: rows.filter((r) => r.reflectionStatus === "판단애매").length,
  };
}

let writeoffCache: WriteoffView | null = null;

export async function getWriteoffView(): Promise<WriteoffView> {
  if (hasSupabase()) {
    const { results, runFinishedAt } = await getLatestWriteoffResults();
    if (results.length > 0) {
      return {
        rows: results,
        source: "db",
        updatedAt: runFinishedAt,
        summary: summarizeWriteoff(results),
      };
    }
  }
  if (!writeoffCache) {
    const { judgments } = await runWriteoff();
    const rows = writeoffJudgmentsToRows(judgments);
    writeoffCache = {
      rows,
      source: "live",
      updatedAt: null,
      summary: summarizeWriteoff(rows),
    };
  }
  return writeoffCache;
}

/** 라이브 캐시 무효화 (새로고침 시 호출) — 두 파이프라인 모두 */
export function invalidateLiveCache(): void {
  liveCache = null;
  writeoffCache = null;
}
