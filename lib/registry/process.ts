import { slabList } from "@/lib/slab/api";
import { registerQups, registerUrl, qLabel, dateFromFilename } from "@/lib/slab/registry-source";
import { extractFromBuffer } from "@/lib/registry/extract";
import { getCached, setCached } from "@/lib/registry/cache";

/**
 * 신규 등기부등본 자동 OCR — 관리자 버튼에서 호출.
 * 각 기업의 **가장 최신** 등기부 PDF 1건만 대상으로, 아직 캐시에 없으면 OCR → Supabase 캐시 저장.
 * (분기가 바뀌어 '새로 붙은' 최신 등기부만 처리. 과거 분기 등기부는 건드리지 않는다.
 *  최신이 판독 불가면 registryView가 이미 캐시된 과거 분기로 폴백/표기하므로 여기서 과거를 OCR하지 않음.)
 * 서버리스 타임아웃 안에서 끝나도록 배치 단위로 처리하고 남은 건수를 반환(버튼이 반복 호출).
 */

const MAX_MB = 450; // Files API 업로드 한도 가드
type Reg = { company: string; url: string; quarter: string };

// 전 펀드 열거는 SLAB API 호출이 많아 짧게 메모(반복 배치 호출 시 재열거 방지)
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

/** 전 펀드 소속 기업의 '최신' 등기부 PDF 1건씩 (중복 URL 제거) */
async function listNewestRegistries(): Promise<Reg[]> {
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
      const newest = registerQups(byCo.get(cid) ?? [])[0]; // 최신 등기부 첨부 분기 1건
      if (!newest) continue;
      const u = registerUrl(newest);
      if (u && !seen.has(u)) {
        seen.add(u);
        out.push({ company: (nameById.get(cid) as string) ?? cid, url: u, quarter: qLabel(newest) });
      }
    }
  }
  enumCache = { at: Date.now(), list: out };
  return out;
}

/** OCR 대상(최신 등기부가 아직 캐시에 없는 기업) 건수 — 비용 확인용, OCR 안 함. */
export async function countPending(): Promise<number> {
  const all = await listNewestRegistries();
  let n = 0;
  for (const it of all) if (!(await getCached(it.url))) n++;
  return n;
}

export interface ProcessedItem { company: string; quarter: string; url: string; ok: boolean; note: string }
export interface ProcessResult { processed: ProcessedItem[]; totalPending: number; remaining: number; done: boolean }

/** 캐시 없는 '최신' 등기부를 시간/건수 예산 안에서 OCR. 남은 건수를 반환(버튼이 done까지 반복). */
export async function processPending(opts: { limit?: number; timeBudgetMs?: number } = {}): Promise<ProcessResult> {
  const limit = opts.limit ?? 10;
  const timeBudgetMs = opts.timeBudgetMs ?? 240000;
  const all = await listNewestRegistries();

  const uncached: Reg[] = [];
  for (const it of all) if (!(await getCached(it.url))) uncached.push(it);
  const totalPending = uncached.length;

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
      // 발행일은 파일명(신뢰도 높음) 우선, 없으면 OCR 값
      const issueDate = dateFromFilename(it.url) ?? ex.issueDate;
      await setCached(it.url, { shareCountTotal: ex.shareCountTotal, issueDate, method: ex.method, confidence: ex.confidence ?? 0 });
      processed.push({
        ...it,
        ok: ex.shareCountTotal != null,
        note: ex.shareCountTotal != null
          ? `${ex.method} · ${ex.shareCountTotal.toLocaleString()}주${issueDate ? ` · ${issueDate}` : ""}`
          : "오첨부/판독 불가",
      });
    } catch (e: any) {
      processed.push({ ...it, ok: false, note: `OCR 오류: ${e?.message || e}` });
    }
  }

  const remaining = Math.max(0, totalPending - processed.length);
  return { processed, totalPending, remaining, done: remaining === 0 };
}
