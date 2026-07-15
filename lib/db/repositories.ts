import type { FollowupJudgment, WriteoffJudgment } from "@/lib/types";
import { getServiceClient } from "./client";
import type { FollowupRunResult } from "@/lib/pipelines/followup";
import type { WriteoffRunResult } from "@/lib/pipelines/writeoff";

/** DB에서 읽어온 후속투자 결과 행 (대시보드 표시용) */
export interface FollowupResultRow {
  id: string;
  companyName: string;
  slabShareCount: number | null;
  registryShareCount: number | null;
  registryIssueDate: string | null;
  investmentStatus: string | null;
  matchStatus: string | null;
  extractionMethod: string | null;
  ocrConfidence: number | null;
  followupApplicable: "Y" | "N" | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

/** company 이름 → id 확보 (없으면 생성) */
async function upsertCompany(name: string): Promise<string> {
  const supa = getServiceClient();
  if (!supa) throw new Error("Supabase 미설정");
  const { data: existing } = await supa
    .from("companies")
    .select("id")
    .eq("name", name)
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data, error } = await supa
    .from("companies")
    .insert({ name })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/**
 * FR-1.6 — 한 번의 실행을 run_id로 묶어 저장 + review_history 기록.
 * 멱등성: (run_id, company_id) unique이므로 같은 run 재실행 시 upsert.
 */
export async function persistFollowupRun(
  result: FollowupRunResult,
): Promise<{ runId: string }> {
  const supa = getServiceClient();
  if (!supa) throw new Error("Supabase 미설정");

  const { data: run, error: runErr } = await supa
    .from("runs")
    .insert({ kind: "followup", status: "running" })
    .select("id")
    .single();
  if (runErr) throw runErr;
  const runId = run.id as string;

  try {
    for (const j of result.judgments) {
      const companyId = await upsertCompany(j.companyName);

      // 원본 스냅샷/추출 기록 (감사 추적)
      await supa.from("slab_snapshots").insert({
        company_id: companyId,
        share_count_total: j.slabShareCount,
        investment_status: j.investmentStatus,
      });
      await supa.from("registry_extracts").insert({
        company_id: companyId,
        issue_date: j.registryIssueDate,
        share_count_total: j.registryShareCount,
        extraction_method: j.extractionMethod,
        confidence: j.ocrConfidence,
      });

      const { data: resRow, error: resErr } = await supa
        .from("followup_investment_results")
        .upsert(
          {
            company_id: companyId,
            run_id: runId,
            slab_share_count: j.slabShareCount,
            registry_share_count: j.registryShareCount,
            registry_issue_date: j.registryIssueDate,
            investment_status: j.investmentStatus,
            match_status: j.matchStatus,
            extraction_method: j.extractionMethod,
            ocr_confidence: j.ocrConfidence,
            followup_applicable: j.followupApplicable,
          },
          { onConflict: "run_id,company_id" },
        )
        .select("id")
        .single();
      if (resErr) throw resErr;

      await supa.from("review_history").insert({
        result_table: "followup_investment_results",
        result_id: resRow.id,
        actor: "agent",
        action: "auto_judged",
        new_value: `${j.matchStatus}${j.followupApplicable ? ` / ${j.followupApplicable}` : ""}`,
      });
    }

    await supa
      .from("runs")
      .update({ status: "completed", finished_at: new Date().toISOString() })
      .eq("id", runId);
  } catch (err) {
    await supa
      .from("runs")
      .update({ status: "failed", finished_at: new Date().toISOString(), note: String(err) })
      .eq("id", runId);
    throw err;
  }

  return { runId };
}

/** 가장 최근 완료된 followup run의 결과를 기업명과 함께 반환 */
export async function getLatestFollowupResults(): Promise<{
  results: FollowupResultRow[];
  runFinishedAt: string | null;
}> {
  const supa = getServiceClient();
  if (!supa) return { results: [], runFinishedAt: null };

  const { data: run } = await supa
    .from("runs")
    .select("id, finished_at")
    .eq("kind", "followup")
    .eq("status", "completed")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run) return { results: [], runFinishedAt: null };

  const { data, error } = await supa
    .from("followup_investment_results")
    .select(
      "id, slab_share_count, registry_share_count, registry_issue_date, investment_status, match_status, extraction_method, ocr_confidence, followup_applicable, reviewed_by, reviewed_at, companies(name)",
    )
    .eq("run_id", run.id);
  if (error) throw error;

  const results: FollowupResultRow[] = (data ?? []).map((r: any) => ({
    id: r.id,
    companyName: r.companies?.name ?? "(이름없음)",
    slabShareCount: r.slab_share_count,
    registryShareCount: r.registry_share_count,
    registryIssueDate: r.registry_issue_date,
    investmentStatus: r.investment_status,
    matchStatus: r.match_status,
    extractionMethod: r.extraction_method,
    ocrConfidence: r.ocr_confidence,
    followupApplicable: r.followup_applicable,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
  }));

  return { results, runFinishedAt: run.finished_at ?? null };
}

/** 사람이 후속투자 해당여부(Y/N)를 직접 입력/수정 → history 기록 (FR-3 수동 오버라이드) */
export async function setFollowupApplicable(params: {
  resultId: string;
  value: "Y" | "N";
  reviewer: string;
  note?: string;
}): Promise<void> {
  const supa = getServiceClient();
  if (!supa) throw new Error("Supabase 미설정");

  const { data: prev } = await supa
    .from("followup_investment_results")
    .select("followup_applicable")
    .eq("id", params.resultId)
    .maybeSingle();

  const { error } = await supa
    .from("followup_investment_results")
    .update({
      followup_applicable: params.value,
      reviewed_by: params.reviewer,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", params.resultId);
  if (error) throw error;

  await supa.from("review_history").insert({
    result_table: "followup_investment_results",
    result_id: params.resultId,
    actor: params.reviewer,
    action: "manually_overridden",
    old_value: prev?.followup_applicable ?? null,
    new_value: params.value,
    note: params.note ?? null,
  });
}

// ===================== 감액 (Phase 3) =====================

export interface WriteoffResultRow {
  id: string;
  companyName: string;
  spreadsheetStatus: string | null;
  slabStatus: string | null;
  reflectionStatus: string | null;
  llmReasoning: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

/** FR-2.4 — 감액 실행을 run_id로 묶어 저장 + history 기록 (멱등 upsert) */
export async function persistWriteoffRun(
  result: WriteoffRunResult,
): Promise<{ runId: string }> {
  const supa = getServiceClient();
  if (!supa) throw new Error("Supabase 미설정");

  const { data: run, error: runErr } = await supa
    .from("runs")
    .insert({ kind: "writeoff", status: "running" })
    .select("id")
    .single();
  if (runErr) throw runErr;
  const runId = run.id as string;

  try {
    for (const j of result.judgments) {
      const companyId = await upsertCompany(j.companyName);

      await supa.from("spreadsheet_statuses").insert({
        company_id: companyId,
        status: j.spreadsheetStatus,
      });
      await supa.from("slab_snapshots").insert({
        company_id: companyId,
        writeoff_status: j.slabStatus,
      });

      const { data: resRow, error: resErr } = await supa
        .from("writeoff_results")
        .upsert(
          {
            company_id: companyId,
            run_id: runId,
            spreadsheet_status: j.spreadsheetStatus,
            slab_status: j.slabStatus,
            reflection_status: j.reflectionStatus,
            llm_reasoning: j.reasoning,
          },
          { onConflict: "run_id,company_id" },
        )
        .select("id")
        .single();
      if (resErr) throw resErr;

      await supa.from("review_history").insert({
        result_table: "writeoff_results",
        result_id: resRow.id,
        actor: "agent",
        action: "auto_judged",
        new_value: j.reflectionStatus,
        note: j.reasoning,
      });
    }

    await supa
      .from("runs")
      .update({ status: "completed", finished_at: new Date().toISOString() })
      .eq("id", runId);
  } catch (err) {
    await supa
      .from("runs")
      .update({ status: "failed", finished_at: new Date().toISOString(), note: String(err) })
      .eq("id", runId);
    throw err;
  }

  return { runId };
}

/** 가장 최근 완료된 writeoff run의 결과 */
export async function getLatestWriteoffResults(): Promise<{
  results: WriteoffResultRow[];
  runFinishedAt: string | null;
}> {
  const supa = getServiceClient();
  if (!supa) return { results: [], runFinishedAt: null };

  const { data: run } = await supa
    .from("runs")
    .select("id, finished_at")
    .eq("kind", "writeoff")
    .eq("status", "completed")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run) return { results: [], runFinishedAt: null };

  const { data, error } = await supa
    .from("writeoff_results")
    .select(
      "id, spreadsheet_status, slab_status, reflection_status, llm_reasoning, reviewed_by, reviewed_at, companies(name)",
    )
    .eq("run_id", run.id);
  if (error) throw error;

  const results: WriteoffResultRow[] = (data ?? []).map((r: any) => ({
    id: r.id,
    companyName: r.companies?.name ?? "(이름없음)",
    spreadsheetStatus: r.spreadsheet_status,
    slabStatus: r.slab_status,
    reflectionStatus: r.reflection_status,
    llmReasoning: r.llm_reasoning,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
  }));

  return { results, runFinishedAt: run.finished_at ?? null };
}

/** 사람이 감액 판정을 확인/오버라이드 → history 기록 (FR-3) */
export async function reviewWriteoff(params: {
  resultId: string;
  reviewer: string;
  overrideStatus?: string; // 판정을 수정할 경우
  note?: string;
}): Promise<void> {
  const supa = getServiceClient();
  if (!supa) throw new Error("Supabase 미설정");

  const { data: prev } = await supa
    .from("writeoff_results")
    .select("reflection_status")
    .eq("id", params.resultId)
    .maybeSingle();

  const patch: Record<string, unknown> = {
    reviewed_by: params.reviewer,
    reviewed_at: new Date().toISOString(),
  };
  if (params.overrideStatus) patch.reflection_status = params.overrideStatus;

  const { error } = await supa
    .from("writeoff_results")
    .update(patch)
    .eq("id", params.resultId);
  if (error) throw error;

  await supa.from("review_history").insert({
    result_table: "writeoff_results",
    result_id: params.resultId,
    actor: params.reviewer,
    action: params.overrideStatus ? "manually_overridden" : "confirmed",
    old_value: prev?.reflection_status ?? null,
    new_value: params.overrideStatus ?? prev?.reflection_status ?? null,
    note: params.note ?? null,
  });
}

export function writeoffJudgmentsToRows(
  judgments: WriteoffJudgment[],
): WriteoffResultRow[] {
  return judgments.map((j, i) => ({
    id: `mock-w-${i}`,
    companyName: j.companyName,
    spreadsheetStatus: j.spreadsheetStatus,
    slabStatus: j.slabStatus,
    reflectionStatus: j.reflectionStatus,
    llmReasoning: j.reasoning,
    reviewedBy: null,
    reviewedAt: null,
  }));
}

/** 판정 결과 → 화면용 FollowupResultRow 매핑 (Supabase 없을 때 목업 라이브 모드) */
export function judgmentsToRows(judgments: FollowupJudgment[]): FollowupResultRow[] {
  return judgments.map((j, i) => ({
    id: `mock-${i}`,
    companyName: j.companyName,
    slabShareCount: j.slabShareCount,
    registryShareCount: j.registryShareCount,
    registryIssueDate: j.registryIssueDate,
    investmentStatus: j.investmentStatus,
    matchStatus: j.matchStatus,
    extractionMethod: j.extractionMethod,
    ocrConfidence: j.ocrConfidence,
    followupApplicable: j.followupApplicable,
    reviewedBy: null,
    reviewedAt: null,
  }));
}
