import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
// 읽기전용 환경(Vercel)용 번들 스냅샷 — 배치는 로컬에서 파일을 갱신하고 커밋한다.
import bundled from "@/data/registry-cache.json";

/**
 * 등기부등본 파싱 결과 디스크 캐시.
 * 키 = 등기부 파일 URL(안정적). 성공한 추출만 저장 → 각 PDF는 평생 한 번만 OCR.
 * (Supabase 도입 전 임시 캐시. data/registry-cache.json, gitignored)
 */

export interface CachedExtract {
  shareCountTotal: number | null;
  issueDate: string | null; // YYYY-MM-DD
  method: "text" | "ocr";
  confidence: number | null;
  oversized?: boolean; // 32MB 한도 초과 → OCR 불가 (수동 확인)
}

const FILE = path.join(process.cwd(), "data", "registry-cache.json");
let mem: Record<string, CachedExtract> | null = null;
let writing: Promise<void> = Promise.resolve();

async function load(): Promise<Record<string, CachedExtract>> {
  if (mem) return mem;
  try {
    mem = JSON.parse(await readFile(FILE, "utf8")); // 로컬: 배치가 갱신한 최신 파일
  } catch {
    mem = (bundled as Record<string, CachedExtract>) ?? {}; // 읽기전용 환경: 커밋된 스냅샷
  }
  return mem!;
}

export async function getCached(key: string): Promise<CachedExtract | null> {
  return (await load())[key] ?? null;
}

export async function setCached(key: string, val: CachedExtract): Promise<void> {
  const m = await load();
  m[key] = val;
  // 쓰기 직렬화 (동시 쓰기로 인한 파일 손상 방지)
  writing = writing.then(async () => {
    await mkdir(path.dirname(FILE), { recursive: true });
    await writeFile(FILE, JSON.stringify(m, null, 2));
  });
  await writing;
}
