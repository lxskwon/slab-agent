import { slabList } from "@/lib/slab/api";
import { registerQups, registerUrl, qLabel } from "@/lib/slab/registry-source";
import { extractFromBuffer } from "@/lib/registry/extract";
import { getCached, setCached } from "@/lib/registry/cache";

/**
 * 신규 등기부등본 자동 OCR — 관리자 버튼에서 호출.
 * 전 펀드 기업의 등기부 PDF 중 "아직 캐시에 없는" 것만 골라 OCR → Supabase 캐시에 저장.
 * 이미 처리된 PDF(커밋된 스냅샷 + Supabase)는 건너뛰므로, 분기 변경으로 "새로 붙은" 등기부만 처리된다.
 * 서버리스 타임아웃 안에서 끝나도록 배치 단위로 처리하고 남은 건수를 반환(버튼이 반복 호출).
 */

const MAX_MB = 450; // Files API 업로드 한도 가드

type Reg = { company: string; url: string; quarter: string };

// 전 펀드 등기부 URL 열거는 SLAB API 호출이 많아 짧게 메모(반복 배치 호출 시 재열거 방지)
let enumCache: { at: number; list: Reg[] } | null = null;
const ENUM_TTL = 3 * 60 * 1000;

async function fetchPdf(url: string): Promise<Buffer | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 120000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}

/** 전 펀드 소속 기업의 등기부 PDF URL(중복 제거, 최신→과거) */
async function listAllRegistryUrls(): Promise<Reg[]> {
  if (enumCache && Date.now() - enumCache.at < ENUM_TTL) return enumCache.list;
  const funds = await slabList<any>("fund", { limit: 100 });
  const out: Reg[] = [];
  const seen = new Set<string>();
  for (const fund of funds) {
    const spis = await slabList<any>("sparklabinvestment", {
      constraints: [{ key: "fund", constraint_type: "equals", value: fund._id }],
    });
    const ids = [...new Set(spis.map((s: any) => s.company).filter(Boolean))] as string[];
    if (!ids.length) continue;
    const qups: any[] = [];
    const companies: any[] = [];
    for (let i = 0; i < ids.length; i += 40) {
      const chunk = ids.slice(i, i + 40);
      qups.push(...(await slabList<any>("quarterlyupdate", { constraints: [{ key: "company", constraint_type: "in", value: chunk }] })));
      companies.push(...(await slabList<any>("company", { constraints: [{ key: "_id", constraint_type: "in", value: chunk }] })));
    }
    const nameById = new Map(companies.map((c: any) => [c._id, c["company name"]]));
    const byCo = new Map<string, any[]>();
    for (const q of qups) {
      const cid = q.company as string;
      (byCo.get(cid) ?? byCo.set(cid, []).get(cid)!).push(q);
    }
    for (const cid of ids) {
      for (const q of registerQups(byCo.get(cid) ?? [])) {
        const u = registerUrl(q);
        if (u && !seen.has(u)) {
          seen.add(u);
          out.push({ company: (nameById.get(cid) as string) ?? cid, url: u, quarter: qLabel(q) });
        }
      }
    }
  }
  enumCache = { at: Date.now(), list: out };
  return out;
}

export interface ProcessedItem { company: string; quarter: string; url: string; ok: boolean; note: string }
export interface ProcessResult { processed: ProcessedItem[]; totalUncached: number; remaining: number; done: boolean }

/** 캐시 없는 등기부를 시간/건수 예산 안에서 OCR. 남은 건수를 반환(버튼이 done까지 반복). */
export async function processUncachedRegistries(opts: { limit?: number; timeBudgetMs?: number } = {}): Promise<ProcessResult> {
  const limit = opts.limit ?? 12;
  const timeBudgetMs = opts.timeBudgetMs ?? 240000;
  const all = await listAllRegistryUrls();

  const uncached: Reg[] = [];
  for (const it of all) {
    if (!(await getCached(it.url))) uncached.push(it);
  }

  const start = Date.now();
  const processed: ProcessedItem[] = [];
  for (const it of uncached) {
    if (processed.length >= limit) break;
    if (Date.now() - start > timeBudgetMs) break;
    const buf = await fetchPdf(it.url);
    if (!buf) {
      await setCached(it.url, { shareCountTotal: null, issueDate: null, method: "ocr", confidence: 0 });
      processed.push({ ...it, ok: false, note: "다운로드 실패" });
      continue;
    }
    if (buf.length / 1024 / 1024 > MAX_MB) {
      await setCached(it.url, { shareCountTotal: null, issueDate: null, method: "ocr", confidence: 0, oversized: true });
      processed.push({ ...it, ok: false, note: "용량 초과 · 수동 확인" });
      continue;
    }
    try {
      const ex = await extractFromBuffer(buf, it.company, "register.pdf");
      await setCached(it.url, { shareCountTotal: ex.shareCountTotal, issueDate: ex.issueDate, method: ex.method, confidence: ex.confidence ?? 0 });
      processed.push({
        ...it,
        ok: ex.shareCountTotal != null,
        note: ex.shareCountTotal != null
          ? `${ex.method} · ${ex.shareCountTotal.toLocaleString()}주${ex.issueDate ? ` · ${ex.issueDate}` : ""}`
          : "오첨부/판독 불가",
      });
    } catch (e: any) {
      processed.push({ ...it, ok: false, note: `OCR 오류: ${e?.message || e}` });
    }
  }

  const remaining = Math.max(0, uncached.length - processed.length);
  return { processed, totalUncached: uncached.length, remaining, done: remaining === 0 };
}
