import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
// 읽기전용 환경(Vercel)용 번들 스냅샷 — 배치는 로컬에서 파일을 갱신하고 커밋한다.
import bundled from "@/data/registry-cache.json";
import { getServiceClient } from "@/lib/db/client";

/**
 * 등기부등본 파싱 결과 캐시.
 * 키 = 등기부 파일 URL(안정적). 성공/실패 모두 저장 → 각 PDF는 평생 한 번만 OCR.
 *
 * 백엔드 우선순위:
 *   1) Supabase(registry_cache)  — 런타임(Vercel)에서 쓰기 가능. 자동 OCR 결과가 여기 쌓인다.
 *   2) 로컬 파일 data/registry-cache.json / 번들 seed  — 이미 처리된 기존 스냅샷(읽기 폴백).
 * Supabase가 있으면 파일 위에 덮어써(런타임 결과 우선) 병합해 읽는다.
 */

export interface CachedExtract {
  shareCountTotal: number | null;
  issueDate: string | null; // YYYY-MM-DD
  method: "text" | "ocr";
  confidence: number | null;
  oversized?: boolean; // 32MB 한도 초과 → OCR 불가 (수동 확인)
}

const TABLE = "registry_cache";
const FILE = path.join(process.cwd(), "data", "registry-cache.json");
let mem: Record<string, CachedExtract> | null = null;
let writing: Promise<void> = Promise.resolve();

async function load(): Promise<Record<string, CachedExtract>> {
  if (mem) return mem;
  // 기반: 로컬 파일(배치 갱신) 있으면 그걸, 없으면 커밋된 번들 스냅샷
  let base: Record<string, CachedExtract>;
  try {
    base = JSON.parse(await readFile(FILE, "utf8"));
  } catch {
    base = { ...((bundled as Record<string, CachedExtract>) ?? {}) };
  }
  // Supabase(런타임에 쌓인 OCR 결과)를 덮어써 병합
  const c = getServiceClient();
  if (c) {
    try {
      const { data, error } = await c
        .from(TABLE)
        .select("url,share_count_total,issue_date,method,confidence,oversized");
      if (error) throw error;
      for (const r of (data ?? []) as any[]) {
        base[r.url] = {
          shareCountTotal: r.share_count_total == null ? null : Number(r.share_count_total),
          issueDate: r.issue_date ?? null,
          method: (r.method as "text" | "ocr") ?? "ocr",
          confidence: r.confidence == null ? null : Number(r.confidence),
          oversized: !!r.oversized,
        };
      }
    } catch (e) {
      console.error("[registry-cache] Supabase load 실패(파일 폴백):", e);
    }
  }
  mem = base;
  return mem;
}

export async function getCached(key: string): Promise<CachedExtract | null> {
  return (await load())[key] ?? null;
}

export async function setCached(key: string, val: CachedExtract): Promise<void> {
  const m = await load();
  m[key] = val;
  const c = getServiceClient();
  if (c) {
    const { error } = await c.from(TABLE).upsert({
      url: key,
      share_count_total: val.shareCountTotal,
      issue_date: val.issueDate,
      method: val.method,
      confidence: val.confidence,
      oversized: !!val.oversized,
      updated_at: new Date().toISOString(),
    });
    if (error) console.error("[registry-cache] Supabase upsert 실패:", error);
    return;
  }
  // 로컬(파일) 폴백 — 쓰기 직렬화(동시 쓰기 손상 방지)
  writing = writing.then(async () => {
    await mkdir(path.dirname(FILE), { recursive: true });
    await writeFile(FILE, JSON.stringify(m, null, 2));
  });
  await writing;
}
