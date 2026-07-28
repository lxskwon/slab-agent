import "server-only";
import { getServiceClient } from "@/lib/db/client";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * LLM 토큰/비용 사용 기록. Claude 호출마다 logLlmUsage()로 남기고,
 * 관리자 대시보드에서 getUsageSummary()로 집계. Supabase(llm_usage) 또는 디스크(폴백).
 * 비용 계산이 정확하도록 모델별 단가를 명시 (claude-api 스킬 기준, $/1M tokens).
 */

const PRICING: Record<string, { in: number; out: number }> = {
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-opus-4-7": { in: 5, out: 25 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};
const DEFAULT_PRICE = { in: 5, out: 25 };

export interface UsageInput {
  feature: string; // 예: "등기부 OCR", "감액 해석", "감액 판정", "챗봇"
  model: string;
  user?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

/** Anthropic 응답의 usage 블록에서 토큰 수 추출 (필드 없으면 0). */
export function usageFrom(res: unknown): { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number } {
  const u = (res as { usage?: Record<string, number> })?.usage ?? {};
  return {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
  };
}

function costOf(model: string, u: UsageInput): number {
  const p = PRICING[model] ?? DEFAULT_PRICE;
  const cents =
    u.inputTokens * p.in +
    (u.cacheCreationTokens ?? 0) * p.in * 1.25 +
    (u.cacheReadTokens ?? 0) * p.in * 0.1 +
    u.outputTokens * p.out;
  return cents / 1_000_000;
}

const DISK = path.join(process.cwd(), "data", "llm-usage.jsonl");

/** 사용 기록 1건 저장. 실패해도 본 작업을 막지 않도록 조용히 흡수. */
export async function logLlmUsage(u: UsageInput): Promise<void> {
  try {
    const rec = {
      feature: u.feature,
      model: u.model,
      usr: u.user ?? "시스템",
      input_tokens: u.inputTokens,
      output_tokens: u.outputTokens,
      cache_read_tokens: u.cacheReadTokens ?? 0,
      cache_creation_tokens: u.cacheCreationTokens ?? 0,
      cost_usd: costOf(u.model, u),
      created_at: new Date().toISOString(),
    };
    const c = getServiceClient();
    if (c) {
      await c.from("llm_usage").insert(rec);
    } else {
      await mkdir(path.dirname(DISK), { recursive: true });
      let prev = "";
      try { prev = await readFile(DISK, "utf8"); } catch { /* 최초 */ }
      await writeFile(DISK, prev + JSON.stringify(rec) + "\n");
    }
  } catch (e) {
    console.error("[llm-usage] 기록 실패:", (e as Error).message);
  }
}

interface Row {
  feature: string; model: string; usr: string;
  input_tokens: number; output_tokens: number;
  cache_read_tokens: number; cache_creation_tokens: number;
  cost_usd: number; created_at: string;
}

async function loadRows(): Promise<Row[]> {
  const c = getServiceClient();
  if (c) {
    const { data } = await c.from("llm_usage").select("*").order("created_at", { ascending: false }).limit(10000);
    return (data as Row[]) ?? [];
  }
  try {
    const txt = await readFile(DISK, "utf8");
    return txt.split("\n").filter(Boolean).map((l) => JSON.parse(l) as Row).reverse();
  } catch {
    return [];
  }
}

export interface UsageSummary {
  totals: { calls: number; inputTokens: number; outputTokens: number; costUsd: number };
  byFeature: { feature: string; calls: number; tokens: number; costUsd: number }[];
  byUser: { user: string; calls: number; tokens: number; costUsd: number }[];
  byDay: { day: string; calls: number; tokens: number; costUsd: number }[];
  recent: { at: string; feature: string; user: string; model: string; inputTokens: number; outputTokens: number; costUsd: number }[];
}

export async function getUsageSummary(): Promise<UsageSummary> {
  const rows = await loadRows();
  const totals = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
  const feat = new Map<string, { calls: number; tokens: number; costUsd: number }>();
  const usr = new Map<string, { calls: number; tokens: number; costUsd: number }>();
  const day = new Map<string, { calls: number; tokens: number; costUsd: number }>();
  for (const r of rows) {
    const tok = (r.input_tokens ?? 0) + (r.output_tokens ?? 0);
    totals.calls += 1; totals.inputTokens += r.input_tokens ?? 0; totals.outputTokens += r.output_tokens ?? 0; totals.costUsd += r.cost_usd ?? 0;
    const bump = (m: Map<string, { calls: number; tokens: number; costUsd: number }>, k: string) => {
      const e = m.get(k) ?? { calls: 0, tokens: 0, costUsd: 0 };
      e.calls += 1; e.tokens += tok; e.costUsd += r.cost_usd ?? 0; m.set(k, e);
    };
    bump(feat, r.feature || "(미상)");
    bump(usr, r.usr || "시스템");
    bump(day, (r.created_at || "").slice(0, 10));
  }
  const toArr = <T extends string>(m: Map<string, { calls: number; tokens: number; costUsd: number }>, key: T) =>
    [...m.entries()].map(([k, v]) => ({ [key]: k, ...v })).sort((a, b) => b.costUsd - a.costUsd);
  return {
    totals,
    byFeature: toArr(feat, "feature") as UsageSummary["byFeature"],
    byUser: toArr(usr, "user") as UsageSummary["byUser"],
    byDay: [...day.entries()].map(([day, v]) => ({ day, ...v })).sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, 30),
    recent: rows.slice(0, 50).map((r) => ({
      at: r.created_at, feature: r.feature, user: r.usr, model: r.model,
      inputTokens: r.input_tokens ?? 0, outputTokens: r.output_tokens ?? 0, costUsd: r.cost_usd ?? 0,
    })),
  };
}
