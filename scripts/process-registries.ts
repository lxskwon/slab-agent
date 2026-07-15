/**
 * 등기부등본 배치 처리기.
 *   npm run registries -- <fund-slug>   (예: cjftr)
 *   npm run registries -- --all
 *
 * SLAB에서 각 펀드 소속 기업의 등기부등본(company register) PDF를 받아
 * 텍스트/OCR 파싱 → 디스크 캐시(data/registry-cache.json)에 저장한다.
 * 웹은 이 캐시만 읽으므로, 무거운 OCR은 여기서 한 번만 수행된다.
 */
import "./_env";
import { slabList } from "@/lib/slab/api";
import { registerUrl, registerQups } from "@/lib/slab/registry-source";
import { extractFromBuffer } from "@/lib/registry/extract";
import { getCached, setCached } from "@/lib/registry/cache";

const MAX_MB = 450; // Files API 업로드 한도(~500MB) 가드. 그 이하는 모두 처리(대용량은 Files API 경유)

async function fetchPdf(url: string): Promise<Buffer | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 180000); // 대용량 다운로드 대비
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}

async function gather(fundSearch: string): Promise<{ company: string; urls: string[] }[]> {
  const funds = await slabList<any>("fund", { limit: 100 });
  const fund = funds.find((f) => f["fund name for search"] === fundSearch);
  if (!fund) return [];
  const spis = await slabList<any>("sparklabinvestment", {
    constraints: [{ key: "fund", constraint_type: "equals", value: fund._id }],
  });
  const ids = [...new Set(spis.map((s) => s.company).filter(Boolean))] as string[];
  const qups: any[] = [];
  const companies: any[] = [];
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40);
    qups.push(...(await slabList<any>("quarterlyupdate", { constraints: [{ key: "company", constraint_type: "in", value: chunk }] })));
    companies.push(...(await slabList<any>("company", { constraints: [{ key: "_id", constraint_type: "in", value: chunk }] })));
  }
  const nameById = new Map(companies.map((c) => [c._id, c["company name"]]));
  const byCo = new Map<string, any[]>();
  for (const q of qups) {
    const cid = q.company as string;
    (byCo.get(cid) ?? byCo.set(cid, []).get(cid)!).push(q);
  }
  const out: { company: string; urls: string[] }[] = [];
  for (const cid of ids) {
    // 등기부 첨부 분기 최신→과거 순 URL (최신이 잘못됐으면 과거로 폴백)
    const urls = registerQups(byCo.get(cid) ?? []).map((q) => registerUrl(q)!).filter(Boolean);
    if (urls.length) out.push({ company: (nameById.get(cid) as string) ?? cid, urls });
  }
  return out;
}

async function processCompany(company: string, urls: string[]): Promise<string> {
  // 최신→과거 순으로, 아직 시도 안 한(캐시 없는) 등기부만 처리하고 첫 성공에서 멈춤.
  // 실패/용량초과도 캐시에 남겨서 "최신 분기 파일 오첨부" 같은 사유를 웹에서 표기할 수 있게 함.
  const problems: string[] = [];
  for (let k = 0; k < urls.length; k++) {
    const url = urls[k];
    let cached = await getCached(url);
    if (!cached) {
      const buf = await fetchPdf(url);
      if (!buf) { problems.push("다운로드 실패"); continue; }
      const mb = buf.length / 1024 / 1024;
      if (mb > MAX_MB) {
        await setCached(url, { shareCountTotal: null, issueDate: null, method: "ocr", confidence: 0, oversized: true });
      } else {
        const ex = await extractFromBuffer(buf, company, "register.pdf");
        // shareCountTotal이 null이면 오첨부/판독불가로 캐시 (다음 실행 때 재시도 안 함)
        await setCached(url, { shareCountTotal: ex.shareCountTotal, issueDate: ex.issueDate, method: ex.method, confidence: ex.confidence ?? 0 });
      }
      cached = await getCached(url);
    }
    if (cached && cached.shareCountTotal != null) {
      const via = k > 0 ? ` (${k + 1}순위 분기, 최신 ${problems.join("/")})` : "";
      return `${cached.method} · ${cached.shareCountTotal.toLocaleString()}주${cached.issueDate ? ` · ${cached.issueDate}` : ""}${via}`;
    }
    problems.push(cached?.oversized ? "용량초과" : "오첨부/판독불가");
  }
  return `판독 실패 (${problems.join(", ") || "등기부 없음"})`;
}

async function main() {
  const arg = process.argv[2];
  let slugs: string[];
  if (arg === "--all") {
    slugs = (await slabList<any>("fund", { limit: 100 })).map((f) => f["fund name for search"]);
  } else if (arg) {
    slugs = [arg];
  } else {
    console.log("사용법: npm run registries -- <fund-slug|--all>");
    process.exit(1);
  }

  for (const slug of slugs) {
    const regs = await gather(slug);
    console.log(`\n[${slug}] 등기부 ${regs.length}건 처리`);
    let i = 0;
    const workers = Array.from({ length: 2 }, async () => {
      while (i < regs.length) {
        const { company, urls } = regs[i++];
        const res = await processCompany(company, urls);
        console.log(`  ${company.padEnd(18)} ${res}`);
      }
    });
    await Promise.all(workers);
  }
  console.log("\n완료.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
