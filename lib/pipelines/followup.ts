import type {
  FollowupJudgment,
  RegistryExtract,
  SlabSnapshot,
} from "@/lib/types";
import { getSlabClient, type SlabClient } from "@/lib/slab/client";
import { getRegistrySource, type RegistrySource } from "@/lib/registry/source";

/**
 * FR-1.4 / FR-1.5 — 후속투자 핵심 판정 (순수 함수, 규칙 기반 exact match).
 * - 두 값 중 하나라도 없으면 '확인필요' (조용히 무시 금지)
 * - 같으면 '일치' → followupApplicable = 'N' 자동
 * - 다르면 '불일치' → 빨간 플래그, followupApplicable = null (사람이 Y/N 입력)
 */
export function judgeFollowup(
  slab: SlabSnapshot,
  registry: RegistryExtract | null,
): FollowupJudgment {
  const slabCount = slab.shareCountTotal;
  const regCount = registry?.shareCountTotal ?? null;

  let matchStatus: FollowupJudgment["matchStatus"];
  let followupApplicable: FollowupJudgment["followupApplicable"];

  if (slabCount == null || regCount == null) {
    matchStatus = "확인필요";
    followupApplicable = null;
  } else if (slabCount === regCount) {
    matchStatus = "일치";
    followupApplicable = "N";
  } else {
    matchStatus = "불일치";
    followupApplicable = null;
  }

  return {
    companyName: slab.companyName,
    slabShareCount: slabCount,
    registryShareCount: regCount,
    registryIssueDate: registry?.issueDate ?? null,
    investmentStatus: slab.investmentStatus,
    matchStatus,
    extractionMethod: registry?.method ?? null,
    ocrConfidence: registry?.confidence ?? null,
    followupApplicable,
  };
}

export interface FollowupRunResult {
  judgments: FollowupJudgment[];
  summary: {
    total: number;
    matched: number;
    mismatched: number;
    needsCheck: number;
    lowConfidenceOcr: number;
  };
}

/** 전체 기업에 대해 SLAB + 등기부를 모아 판정 (persist는 repositories에서 별도) */
export async function runFollowup(
  slabClient: SlabClient = getSlabClient(),
  registrySource: RegistrySource = getRegistrySource(),
): Promise<FollowupRunResult> {
  const companies = await slabClient.listCompanies();
  const judgments: FollowupJudgment[] = [];

  for (const name of companies) {
    const [slab, registry] = await Promise.all([
      slabClient.getSnapshot(name),
      registrySource.getExtract(name),
    ]);
    judgments.push(judgeFollowup(slab, registry));
  }

  const summary = {
    total: judgments.length,
    matched: judgments.filter((j) => j.matchStatus === "일치").length,
    mismatched: judgments.filter((j) => j.matchStatus === "불일치").length,
    needsCheck: judgments.filter((j) => j.matchStatus === "확인필요").length,
    lowConfidenceOcr: judgments.filter(
      (j) => j.extractionMethod === "ocr" && (j.ocrConfidence ?? 1) < 0.8,
    ).length,
  };

  return { judgments, summary };
}
