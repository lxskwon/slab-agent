import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { InterpretedCompany } from "./interpret";
import { getServiceClient } from "@/lib/db/client";

/** 펀드별 시트 해석 결과 캐시. Supabase(fund_interp 테이블) 있으면 그걸, 없으면 로컬 디스크. */

const DIR = path.join(process.cwd(), "data", "writeoff-sheet");
const file = (slug: string) => path.join(DIR, `${slug}.interp.json`);
const TABLE = "fund_interp";

export interface FundInterp {
  tab: string;
  companies: InterpretedCompany[];
  duplicatedBases?: string[]; // (1)/(2) 중복인 정규화 회사명 (코드로 결정, LLM 아님)
}

export async function loadInterp(slug: string): Promise<FundInterp | null> {
  const c = getServiceClient();
  if (c) {
    const { data } = await c.from(TABLE).select("data").eq("fund", slug).maybeSingle();
    return (data?.data as FundInterp) ?? null;
  }
  try {
    return JSON.parse(await readFile(file(slug), "utf8")) as FundInterp;
  } catch {
    return null;
  }
}

export async function saveInterp(slug: string, data: FundInterp): Promise<void> {
  const c = getServiceClient();
  if (c) {
    await c.from(TABLE).upsert({ fund: slug, data, updated_at: new Date().toISOString() });
    return;
  }
  await mkdir(DIR, { recursive: true });
  await writeFile(file(slug), JSON.stringify(data, null, 2));
}
