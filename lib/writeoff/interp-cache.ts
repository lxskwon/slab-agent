import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { InterpretedCompany } from "./interpret";

/** 펀드별 시트 해석 결과 캐시 (data/writeoff-sheet/<fund>.interp.json) */

const DIR = path.join(process.cwd(), "data", "writeoff-sheet");
const file = (slug: string) => path.join(DIR, `${slug}.interp.json`);

export interface FundInterp {
  tab: string;
  companies: InterpretedCompany[];
  duplicatedBases?: string[]; // (1)/(2) 중복인 정규화 회사명 (코드로 결정, LLM 아님)
}

export async function loadInterp(slug: string): Promise<FundInterp | null> {
  try {
    return JSON.parse(await readFile(file(slug), "utf8")) as FundInterp;
  } catch {
    return null;
  }
}

export async function saveInterp(slug: string, data: FundInterp): Promise<void> {
  await mkdir(DIR, { recursive: true });
  await writeFile(file(slug), JSON.stringify(data, null, 2));
}
