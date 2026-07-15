import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { InterpretedCompany } from "./interpret";
import { CLOUD, redis } from "@/lib/cloud";

/** 펀드별 시트 해석 결과 캐시. 클라우드=Redis, 로컬=디스크(data/writeoff-sheet/<fund>.interp.json) */

const DIR = path.join(process.cwd(), "data", "writeoff-sheet");
const file = (slug: string) => path.join(DIR, `${slug}.interp.json`);
const key = (slug: string) => `slab:interp:${slug}`;

export interface FundInterp {
  tab: string;
  companies: InterpretedCompany[];
  duplicatedBases?: string[]; // (1)/(2) 중복인 정규화 회사명 (코드로 결정, LLM 아님)
}

export async function loadInterp(slug: string): Promise<FundInterp | null> {
  if (CLOUD) {
    return (await redis().get<FundInterp>(key(slug))) ?? null;
  }
  try {
    return JSON.parse(await readFile(file(slug), "utf8")) as FundInterp;
  } catch {
    return null;
  }
}

export async function saveInterp(slug: string, data: FundInterp): Promise<void> {
  if (CLOUD) {
    await redis().set(key(slug), data);
    return;
  }
  await mkdir(DIR, { recursive: true });
  await writeFile(file(slug), JSON.stringify(data, null, 2));
}
