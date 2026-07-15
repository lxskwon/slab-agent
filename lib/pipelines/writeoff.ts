import type { WriteoffJudgment } from "@/lib/types";
import { getSlabClient, type SlabClient } from "@/lib/slab/client";
import {
  getSpreadsheetSource,
  type SpreadsheetSource,
} from "@/lib/writeoff/spreadsheet";
import { judgeWriteoff } from "@/lib/writeoff/judge";

export interface WriteoffRunResult {
  judgments: WriteoffJudgment[];
  summary: {
    total: number;
    reflected: number; // 이미 반영됨
    notReflected: number; // 미반영
    ambiguous: number; // 판단애매
  };
}

/**
 * FR-2 감액 파이프라인.
 * 스프레드시트를 정답 소스로 삼아 각 기업의 SLAB 상태를 조회하고 LLM으로 판단한다.
 */
export async function runWriteoff(
  spreadsheetSource: SpreadsheetSource = getSpreadsheetSource(),
  slabClient: SlabClient = getSlabClient(),
): Promise<WriteoffRunResult> {
  const statuses = await spreadsheetSource.listStatuses();

  // 기업별 판단을 병렬로 (LLM 호출이 기업 수만큼 있으므로 순차 실행하면 느림)
  const judgments: WriteoffJudgment[] = await Promise.all(
    statuses.map(async (s) => {
      const snapshot = await slabClient.getSnapshot(s.companyName);
      const slabStatus = snapshot.writeoffStatus;
      const { reflectionStatus, reasoning } = await judgeWriteoff(
        s.companyName,
        s.status,
        slabStatus,
      );
      return {
        companyName: s.companyName,
        spreadsheetStatus: s.status,
        slabStatus,
        reflectionStatus,
        reasoning,
      };
    }),
  );

  const summary = {
    total: judgments.length,
    reflected: judgments.filter((j) => j.reflectionStatus === "이미 반영됨").length,
    notReflected: judgments.filter((j) => j.reflectionStatus === "미반영").length,
    ambiguous: judgments.filter((j) => j.reflectionStatus === "판단애매").length,
  };

  return { judgments, summary };
}
