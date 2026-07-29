import "server-only";
import { unstable_cache } from "next/cache";
import { slabList, slabGet, slabEnabled, type Constraint } from "./api";
import { getCached } from "@/lib/registry/cache";
import { getManualMap, type ManualReg } from "@/lib/registry/manual";
import { qKey, qLabel, quarterNum, registerQups, registerUrl } from "./registry-source";
import { nameKeys, normName, hasFundSheet, listTabs } from "@/lib/writeoff/sheet";
import { loadInterp } from "@/lib/writeoff/interp-cache";
import type { InterpretedCompany } from "@/lib/writeoff/interpret";
import { judgeReflection, canonStatus } from "@/lib/writeoff/reflect";
import { getReviewState, type ReviewStatus, type Memo } from "@/lib/review/store";

/** 해석된 상태 → 표시/판정용 문자열 */
function mapStatus(s: InterpretedCompany["status"]): string {
  return s === "writeoff" ? "Written-off" : s === "exit" ? "Exit" : s === "live" ? "Live" : "미확인";
}
// 시트 원문 상태를 표시용으로 다듬기: 약어만 정식 표기로(W/O→Written-off, LIVE→Live). M&A/Capital Return/Exit 등은 그대로.
function prettyStatusLabel(label: string): string {
  const t = label.toLowerCase().replace(/\s/g, "");
  if (/^(w\/o|wo|written-?off|상각|감액)$/.test(t)) return "Written-off";
  if (/^(live|정상|운영중)$/.test(t)) return "Live";
  return label;
}
import type { FollowupRow, WriteoffRow } from "@/lib/tracker/mock-data";

export interface FundInfo {
  id: string;
  name: string;
  search: string;
  order: number;
}
export interface FundTracker {
  fund: FundInfo;
  followup: FollowupRow[];
  writeoff: WriteoffRow[];
  // 감액 시트 상태: 미업로드 / 업로드됨(탭 선택 대기) / 해석 완료
  sheetState: "none" | "uploaded" | "processed";
  tabs?: string[]; // uploaded 상태일 때 선택 가능한 탭 목록
}

/** 업로드/변경 후 해당 펀드 캐시 무효화 */
export function invalidateFund(fundSearch: string): void {
  trackerCache.delete(fundSearch);
}

// ---- 대시보드 집계 ----

export interface IssueEvidence {
  // 후속투자
  registryShares?: number | null;
  registryDate?: string | null;
  registryQuarter?: string | null;
  registryUrl?: string | null;
  registryManual?: boolean;
  slabShares?: number | null;
  reportShares?: number | null;
  // 감액
  sheetStatus?: string;
  slabStatus?: string;
  sheetName?: string;
}
export interface DashIssue {
  id: string; // 검토 상태 저장 키 (실행마다 안정적)
  fund: string;
  fundSlug: string;
  company: string;
  companyId?: string; // 기업 상세 페이지 링크용
  fundSlugs?: string[]; // 후속투자 이슈가 걸친 모든 펀드 (펀드 필터 매칭용)
  kind: "후속 불일치" | "감액 미반영" | "확인 필요";
  category: "followup" | "writeoff"; // 후속투자 / 감액
  detail: string;
  severity: "red" | "yellow";
  evidence: IssueEvidence;
  status: ReviewStatus; // open/ack/dismissed (사람 검토, 메모와 독립)
  memos: Memo[]; // 작성자별 메모 (여러 명 · 공유)
}
export interface DashFund {
  name: string;
  slug: string;
  processed: boolean; // 후속투자 분석됨(=SLAB에서 기업 데이터 확보). 이제 전 펀드 true.
  writeoffUploaded: boolean; // 감액 투자현황 DB 업로드/해석 완료 여부
  companies: number;
  followup: { match: number; mismatch: number; pending: number };
  writeoff: { reflected: number; notReflected: number; pending: number };
  registryPct: number;
  red: number;
  yellow: number;
}
export interface CompanyIndexEntry {
  id: string;
  name: string;
  funds: string[]; // 이 기업이 속한 펀드 이름들
}
export interface Dashboard {
  totals: { funds: number; companies: number; red: number; yellow: number; registryPct: number; processed: number };
  issues: DashIssue[];
  funds: DashFund[];
  companies: CompanyIndexEntry[]; // 검색용 전체 기업 목록(companyId 기준 중복 제거)
}

// SLAB 집계(무거움)만 계산 — 사람 검토(메모/상태) 병합은 하지 않음. 이 결과가 캐시된다.
async function computeDashboardBase(): Promise<Dashboard> {
  const funds = await getFunds();
  const dashFunds: DashFund[] = [];
  const issues: DashIssue[] = [];
  let totAttached = 0, totParsed = 0; // 등기부 보유 기업 / 그중 판독 완료
  // 후속투자는 회사 단위 판정(등기부·SLAB) → 같은 회사가 여러 펀드에 있어도 큐에는 1건만. 펀드 수는 카운트해서 라벨에 표기.
  const fuSeen = new Set<string>();
  const fuFundCount = new Map<string, number>();
  const fuFundSlugs = new Map<string, string[]>();

  // 전 펀드 트래커를 병렬(배치)로 미리 계산 → 콜드 로드 단축. 집계는 순서 유지하며 순차 처리.
  const BATCH = 6;
  const built: { f: FundInfo; t: FundTracker | null }[] = [];
  for (let i = 0; i < funds.length; i += BATCH) {
    const chunk = funds.slice(i, i + BATCH);
    built.push(...(await Promise.all(chunk.map((f) => getFundTracker(f.search).then((t) => ({ f, t }))))));
  }

  for (const { f, t } of built) {
    // 후속투자는 SLAB만으로 분석 가능 → 전 펀드 계산. 감액은 투자현황 DB 업로드된 펀드만.
    if (!t) continue;
    const writeoffUploaded = t.sheetState === "processed";

    // ── 후속투자 (항상) ──
    const fu = { match: 0, mismatch: 0, pending: 0 };
    let hasReg = 0;
    for (const r of t.followup) {
      if (r.match === "일치") fu.match += 1;
      else if (r.match === "불일치") fu.mismatch += 1;
      else fu.pending += 1;
      if (r.registryShares != null) hasReg += 1;
      const fuEvidence: IssueEvidence = {
        registryShares: r.registryShares, registryDate: r.registryDate,
        registryQuarter: r.registryQuarter, registryUrl: r.registryUrl, registryManual: r.registryManual,
        slabShares: r.slabShares, reportShares: r.reportShares,
      };
      // 수기 입력했지만 SLAB 발행주식총수가 없어 대조 불가한 건도 계속 표시(조용히 사라지지 않도록)
      const worthy = r.match === "불일치" || (r.registryManual && r.slabShares == null) || /처리 대기|판독 불가|오첨부|상이|해외/.test(r.note);
      if (worthy) {
        const key = r.companyId || r.company;
        fuFundCount.set(key, (fuFundCount.get(key) ?? 0) + 1);
        (fuFundSlugs.get(key) ?? fuFundSlugs.set(key, []).get(key)!).push(f.search);
        if (!fuSeen.has(key)) {
          fuSeen.add(key);
          if (r.match === "불일치") {
            issues.push(mkIssue(f, r, "후속 불일치", "followup", "red", `등기 ${fmt(r.registryShares)} · SLAB ${fmt(r.slabShares)}`, fuEvidence));
          } else {
            issues.push(mkIssue(f, r, "확인 필요", "followup", "yellow", r.note, fuEvidence));
          }
        }
      }
    }

    // ── 감액 (투자현황 DB 업로드된 펀드만) ──
    const wo = { reflected: 0, notReflected: 0, pending: 0 };
    if (writeoffUploaded) {
      for (const r of t.writeoff) {
        if (r.reflected === "이미 반영됨") wo.reflected += 1;
        else if (r.reflected === "미반영") wo.notReflected += 1;
        else wo.pending += 1;
        const woEvidence: IssueEvidence = { sheetStatus: r.sheetStatus, slabStatus: r.slabStatus, sheetName: r.sheetName };
        if (r.reflected === "미반영") {
          issues.push(mkIssue(f, r, "감액 미반영", "writeoff", "red", r.note || "", woEvidence));
        } else if (r.reflected === "판단애매" || r.flag === "yellow") {
          issues.push(mkIssue(f, r, "확인 필요", "writeoff", "yellow", r.note || "", woEvidence));
        }
      }
    }

    // 등기부등본 처리율 = 판독 완료(hasReg) / 등기부등본 보유(미첨부 아닌 기업)
    const attached = t.followup.filter((r) => !/미첨부/.test(r.note)).length;
    totAttached += attached;
    totParsed += hasReg;
    const red = fu.mismatch + wo.notReflected;
    // 큐와 동일하게 기업당 하나만 집계: 불일치(red)인 행은 yellow로 중복 계산하지 않음
    const followupYellow = t.followup.filter((r) => r.match !== "불일치" && ((r.registryManual && r.slabShares == null) || /처리 대기|판독 불가|오첨부|상이|해외/.test(r.note))).length;
    const yellow = (writeoffUploaded ? wo.pending : 0) + followupYellow;
    dashFunds.push({
      name: f.name, slug: f.search, processed: true, writeoffUploaded, companies: t.followup.length,
      followup: fu, writeoff: wo, registryPct: attached ? Math.round((hasReg / attached) * 100) : 100, red, yellow,
    });
  }

  // 여러 펀드에 걸친 후속투자 이슈는 펀드 수로 라벨 표기 (예: "8개 펀드")
  for (const i of issues) {
    if (i.category === "followup") {
      const key = i.companyId || i.company;
      i.fundSlugs = fuFundSlugs.get(key);
      const n = fuFundCount.get(key) ?? 1;
      if (n > 1) i.fund = `${n}개 펀드`;
    }
  }

  const red = issues.filter((i) => i.severity === "red").length;
  const yellow = issues.filter((i) => i.severity === "yellow").length;
  // 고유 기업 수: 한 회사가 여러 펀드에 있으면 한 번만 (SLAB 공식 수치와 일치). id 없으면 이름으로 폴백.
  const uniqCompanies = new Set<string>();
  for (const { t } of built) {
    if (!t) continue;
    for (const r of t.followup) uniqCompanies.add(r.companyId || r.company.replace(/\s/g, ""));
  }
  const companies = uniqCompanies.size;

  // 검색용 기업 인덱스: companyId 있는 기업만, 펀드 이름 모아서 중복 제거
  const coIndex = new Map<string, { name: string; funds: Set<string> }>();
  for (const { f, t } of built) {
    if (!t) continue;
    for (const r of t.followup) {
      if (!r.companyId) continue;
      const e = coIndex.get(r.companyId) ?? { name: r.company, funds: new Set<string>() };
      e.funds.add(f.name);
      coIndex.set(r.companyId, e);
    }
  }
  const companyIndex: CompanyIndexEntry[] = [...coIndex.entries()]
    .map(([id, e]) => ({ id, name: e.name, funds: [...e.funds] }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  const writeoffCount = dashFunds.filter((f) => f.writeoffUploaded).length;
  const registryPct = totAttached ? Math.round((totParsed / totAttached) * 100) : 100;
  // red 먼저, 그 다음 yellow
  issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "red" ? -1 : 1));
  return {
    totals: { funds: funds.length, companies, red, yellow, registryPct, processed: writeoffCount },
    issues,
    funds: dashFunds,
    companies: companyIndex,
  };
}

// SLAB 집계는 5분 캐시(콜드 로드/타임아웃 완화). 메모/검토상태는 매 요청 Redis에서 신선하게 병합.
// 15분 캐시: 콜드 재계산(22개 펀드 SLAB 빌드) 빈도를 낮춤. 사용자 쓰기(수기입력·감액분석)는 revalidateTag로 즉시 무효화되므로 안전.
const cachedBase = unstable_cache(computeDashboardBase, ["dashboard-base-v9"], { revalidate: 900, tags: ["dashboard-base"] });

export async function getDashboard(): Promise<Dashboard> {
  const base = await cachedBase();
  const rs = await getReviewState();
  const issues = base.issues.map((i) => ({ ...i, status: rs[i.id]?.status ?? "open", memos: rs[i.id]?.memos ?? [] }));
  return { ...base, issues };
}

function fmt(n: number | null): string {
  return n == null ? "—" : n.toLocaleString("ko-KR");
}

/** 검토 상태 저장 키. kind(불일치/확인필요 등)는 심각도가 바뀌면 변하므로 제외 — 회사·펀드·분류 단위로 안정적이어야 메모가 유지됨. */
export function issueId(fundSlug: string, category: string, company: string): string {
  return [fundSlug, category, company].join("|");
}
function mkIssue(
  f: FundInfo,
  row: { company: string; companyId?: string },
  kind: DashIssue["kind"],
  category: DashIssue["category"],
  severity: DashIssue["severity"],
  detail: string,
  evidence: IssueEvidence,
): DashIssue {
  return {
    id: issueId(f.search, category, row.company),
    fund: f.name, fundSlug: f.search, company: row.company, companyId: row.companyId,
    kind, category, severity, detail, evidence,
    status: "open", memos: [],
  };
}
export { slabEnabled };

type Obj = Record<string, any>;

// ---- helpers ----
function isSubmitted(q: Obj): boolean {
  return Boolean(q["report made"] || q["complete"]);
}
function latestSubmitted(qups: Obj[]): Obj | null {
  const s = qups.filter(isSubmitted);
  return s.length ? s.sort((a, b) => qKey(b) - qKey(a))[0] : null;
}
function investStatus(qup: Obj | null): string {
  if (!qup) return "미확인";
  const v = qup["any new funding round?"];
  if (v === "Done") return "투자완료";
  if (v === "Expected") return "투자예정";
  return "해당없음";
}
function isJunkCompany(name: string | undefined): boolean {
  if (!name) return true;
  const t = name.trim();
  return t === "" || /^\d+$/.test(t);
}
function formatK(d: string | null): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d ?? "");
  return m ? `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일` : d;
}
async function listByIdsIn<T = Obj>(type: string, key: string, ids: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 40) {
    const constraints: Constraint[] = [{ key, constraint_type: "in", value: ids.slice(i, i + 40) }];
    out.push(...(await slabList<T>(type, { constraints })));
  }
  return out;
}

// ---- funds ----
let fundsCache: FundInfo[] | null = null;
export async function getFunds(): Promise<FundInfo[]> {
  if (fundsCache) return fundsCache;
  const raw = await slabList<Obj>("fund", { limit: 100 });
  fundsCache = raw
    .map((f) => ({
      id: f._id as string,
      name: (f["fund name"] as string) ?? "(이름없음)",
      search: (f["fund name for search"] as string) ?? (f._id as string),
      order: (f.order as number) ?? 999,
    }))
    .sort((a, b) => a.order - b.order);
  return fundsCache;
}

/** 펀드의 SLAB 포트폴리오 회사명 목록 (감액 시트가 이 펀드 것인지 검증용). company의 'fund type' 기준. */
export async function getFundCompanyNames(fundSearch: string): Promise<{ name: string; nameEn: string }[]> {
  const fund = (await getFunds()).find((f) => f.search === fundSearch);
  if (!fund) return [];
  const companies = await slabList<Obj>("company", {
    constraints: [{ key: "fund type", constraint_type: "contains", value: fund.id }],
  });
  return companies
    .map((c) => ({ name: (c["company name"] as string) ?? "", nameEn: (c["company name eng"] as string) ?? "" }))
    .filter((c) => !isJunkCompany(c.name));
}

// ---- registry (CACHE-ONLY: 파싱/OCR은 배치 스크립트가 담당) ----
interface RegistryView {
  shares: number | null;
  date: string | null;
  regLabel: string | null;
  fromDifferentQuarter: boolean;
  attached: boolean;
  cachedOk: boolean;
  oversized: boolean;
  unprocessed: boolean; // 첨부됐지만 아직 배치 미처리
  lowConfidenceOcr: boolean;
  supersededNote: string | null; // 더 최신 분기 등기부가 오첨부/판독불가여서 과거로 폴백한 경우
  url: string | null; // 채택된 등기부 PDF 원본 링크 (증거 확인용)
}

// 대상 분기 = 지금 '광범위하게 제출되는' 분기 (자동 감지). 최근 제출 200건 중 가장 흔한(mode) 분기.
// 최댓값이 아니라 최빈값을 쓰는 이유: 일부 기업이 다음 분기를 일찍 제출해도 대부분이 아직 이번 분기면
// 리뷰 대상은 이번 분기여야 함(안 그러면 미제출 기업들 데이터가 비어 이슈가 사라짐).
export interface TargetQuarter { year: number; quarter: string; key: number; label: string }
let _target: TargetQuarter | null = null;
export async function getTargetQuarter(): Promise<TargetQuarter> {
  if (_target) return _target;
  try {
    const rows = await slabList<Obj>("quarterlyupdate", { sort: { field: "report made", descending: true }, limit: 200, maxPages: 1 });
    const cnt = new Map<number, number>();
    for (const r of rows) {
      if (!isSubmitted(r)) continue;
      const k = ((r.year as number) ?? 0) * 10 + quarterNum(r.quarter as string);
      if (k > 0) cnt.set(k, (cnt.get(k) ?? 0) + 1);
    }
    let bestKey = 0, bestCnt = -1;
    for (const [k, c] of cnt) {
      if (c > bestCnt || (c === bestCnt && k > bestKey)) { bestCnt = c; bestKey = k; } // 최빈값, 동률이면 최신
    }
    if (bestKey > 0) {
      const y = Math.floor(bestKey / 10), q = bestKey % 10;
      _target = { year: y, quarter: `${q}분기`, key: bestKey, label: `${y}년 ${q}분기` };
      return _target;
    }
  } catch { /* 폴백 */ }
  _target = { year: 2026, quarter: "1분기", key: 20261, label: "2026년 1분기" };
  return _target;
}

async function registryView(qups: Obj[], targetKey: number): Promise<RegistryView> {
  const empty: RegistryView = {
    shares: null, date: null, regLabel: null, fromDifferentQuarter: false,
    attached: false, cachedOk: false, oversized: false, unprocessed: false, lowConfidenceOcr: false,
    supersededNote: null, url: null,
  };
  const regs = registerQups(qups); // 최신 → 과거
  if (regs.length === 0) return empty;

  const mk = (q: Obj, extra: Partial<RegistryView>): RegistryView => ({
    ...empty, attached: true, regLabel: qLabel(q), url: registerUrl(q), fromDifferentQuarter: qKey(q) !== targetKey, ...extra,
  });

  // 최신부터: 판독 성공한 가장 최근 등기부를 채택 (최신 파일이 잘못/판독불가면 과거로 폴백).
  // 성공 분기보다 최신인데 오첨부/판독불가/용량초과였던 분기는 비고에 남겨서 SLAB 첨부를 고치도록 함.
  const problems: string[] = [];
  let oversized: Obj | null = null;
  for (const q of regs) {
    const cached = await getCached(registerUrl(q)!);
    if (!cached) continue; // 아직 미처리 → 과거 분기 시도 (확정 문제는 아님)
    if (cached.oversized) {
      oversized ??= q;
      problems.push(`${qLabel(q)} 등기부등본 용량 초과`);
      continue;
    }
    if (cached.shareCountTotal != null) {
      return mk(q, {
        shares: cached.shareCountTotal,
        date: formatK(cached.issueDate),
        cachedOk: true,
        lowConfidenceOcr: cached.method === "ocr" && (cached.confidence ?? 1) < 0.8,
        supersededNote: problems.length ? problems.join(" · ") : null,
      });
    }
    // 첨부는 됐지만 판독 실패 → 오첨부(다른 서류)이거나 판독불가
    problems.push(`${qLabel(q)} 등기부등본 오첨부/판독불가`);
  }
  if (oversized) return mk(oversized, { oversized: true });
  // 판독 성공 분기 없음: 하나라도 시도해서 실패했으면 '판독 불가', 전부 미처리면 '처리 대기'
  const allAttempted = problems.length === regs.length;
  return mk(regs[0], allAttempted ? {} : { unprocessed: true });
}

// ---- per-fund tracker ----
const trackerCache = new Map<string, FundTracker>();

// 수기 입력 등기부등본값을 후속투자 행에 덮어씀 (판독 불가였던 건). 캐시된 트래커에 매번 신선하게 오버레이.
function applyManualRow(r: FollowupRow, manual: Map<string, ManualReg>): FollowupRow {
  if (r.registryShares != null || !r.registryUrl) return r;
  const mo = manual.get(r.registryUrl);
  if (!mo) return r;
  let match: FollowupRow["match"] = r.match;
  let followupApplicable = r.followupApplicable;
  let flag: FollowupRow["flag"] = r.flag;
  if (r.slabShares != null) {
    if (mo.shares === r.slabShares) { match = "일치"; followupApplicable = "N"; flag = undefined; }
    else { match = "불일치"; flag = "red"; }
  }
  // 판독 불가/처리 대기/오첨부 관련 비고 제거 후 '수기 입력' 표시
  const kept = r.note.split(" · ").filter((s) => s && !/판독|처리 대기|오첨부/.test(s));
  kept.push(`등기부등본 수기 입력${mo.author ? ` (${mo.author})` : ""}`);
  return { ...r, registryShares: mo.shares, registryDate: mo.issueDate ?? r.registryDate, registryManual: true, match, followupApplicable, flag, note: kept.join(" · ") };
}

export async function getFundTracker(fundSearch: string): Promise<FundTracker | null> {
  const base = await buildTracker(fundSearch);
  if (!base) return null;
  const manual = await getManualMap();
  if (manual.size === 0) return base;
  return { ...base, followup: base.followup.map((r) => applyManualRow(r, manual)) };
}

async function buildTracker(fundSearch: string): Promise<FundTracker | null> {
  const cached = trackerCache.get(fundSearch);
  if (cached) return cached;

  const fund = (await getFunds()).find((f) => f.search === fundSearch);
  if (!fund) return null;
  const target = await getTargetQuarter();

  // 감액: 펀드별 업로드 파일 → 탭 선택 → LLM 해석(캐시). 상태별 UI 분기.
  const interp = await loadInterp(fund.search);
  const fileExists = await hasFundSheet(fund.search);
  const sheetState: FundTracker["sheetState"] = interp ? "processed" : fileExists ? "uploaded" : "none";
  const tabs = sheetState === "uploaded" ? await listTabs(fund.search) : undefined;

  const sheetMap = new Map<string, InterpretedCompany>();
  const dupSet = new Set(interp?.duplicatedBases ?? []); // 코드로 결정한 (1)/(2) 중복
  if (interp) {
    for (const c of interp.companies) {
      for (const k of nameKeys(c.name, c.nameEn)) if (!sheetMap.has(k)) sheetMap.set(k, c);
    }
  }

  // 펀드 포트폴리오 = company의 'fund type' 리스트에 이 펀드가 포함된 회사 (공동투자 포함).
  // SLAB 온보딩 화면과 동일 기준. (기존엔 sparklabinvestment.fund로 잡아 공동투자 회사가 누락됐음.)
  const [companies, spis] = await Promise.all([
    slabList<Obj>("company", { constraints: [{ key: "fund type", constraint_type: "contains", value: fund.id }] }),
    slabList<Obj>("sparklabinvestment", { constraints: [{ key: "fund", constraint_type: "equals", value: fund.id }] }),
  ]);
  // SLAB 투자상태: 이 펀드의 sparklabinvestment 값이 있으면 우선, 없으면(공동투자 등) company 자체 상태로 폴백.
  const statusByCompany = new Map<string, string>();
  for (const s of spis) {
    const cid = s.company as string;
    if (cid && !statusByCompany.has(cid)) statusByCompany.set(cid, (s["investment status"] as string) ?? "");
  }
  const companyIds = companies.map((c) => c._id as string);
  const qupsAll = await listByIdsIn<Obj>("quarterlyupdate", "company", companyIds);
  const qupsByCompany = new Map<string, Obj[]>();
  for (const q of qupsAll) {
    const cid = q.company as string;
    (qupsByCompany.get(cid) ?? qupsByCompany.set(cid, []).get(cid)!).push(q);
  }

  // 이름 정규화 기준 중복 제거 (데이터 있는 쪽 우선)
  const dedup = new Map<string, Obj>();
  for (const co of companies) {
    const name = (co["company name"] as string) ?? "";
    if (isJunkCompany(name)) continue;
    const key = name.replace(/\s/g, "");
    const prev = dedup.get(key);
    const score = (c: Obj) =>
      (typeof c["share outstanding"] === "number" && c["share outstanding"] > 0 ? 2 : 0) +
      ((qupsByCompany.get(c._id) ?? []).length > 0 ? 1 : 0);
    if (!prev || score(co) > score(prev)) dedup.set(key, co);
  }

  const followup: FollowupRow[] = [];
  const writeoff: WriteoffRow[] = [];
  for (const co of dedup.values()) {
    const name = co["company name"] as string;
    const qups = qupsByCompany.get(co._id) ?? [];
    // 투자유치여부는 대상 분기(자동 감지) 제출 보고 기준. 없으면 미확인.
    const targetQup = qups.find((q) => q.year === target.year && q.quarter === target.quarter && isSubmitted(q)) ?? null;
    // 명시적 0은 '0주'로 표시, null/미기재만 '미기재'
    const rawShareOut = co["share outstanding"];
    const slabShares = typeof rawShareOut === "number" ? rawShareOut : null;
    // 분기보고 자체가 기재한 총발행주식수 (대상 분기 보고 기준) — SLAB/등기부와 교차검증
    const reportQup = targetQup ?? qups.find((q) => q.year === target.year && q.quarter === target.quarter) ?? null;
    const rawReport = reportQup?.["latest issued share outstanding"];
    const reportShares = typeof rawReport === "number" ? rawReport : null;
    const lang = co["main language for the contract"] as string | undefined;
    const foreign = Boolean(lang && lang !== "Korean");
    const slabStatus = statusByCompany.get(co._id) ?? (co["company investment status"] as string) ?? "";

    const reg = await registryView(qups, target.key);

    let match: FollowupRow["match"] = "";
    let followupApplicable = "";
    let flag: FollowupRow["flag"];
    if (reg.shares != null && slabShares != null) {
      if (reg.shares === slabShares) {
        match = "일치";
        followupApplicable = "N";
      } else {
        match = "불일치";
        flag = "red";
      }
    } else if (reg.oversized) {
      flag = "yellow";
    }

    const notes: string[] = [];
    // SLAB 투자상태가 Exit/Written-off면 등기부 여부와 무관하게 비고에 표기
    const slabCanon = canonStatus(slabStatus);
    if (slabCanon === "exit") notes.push("SLAB: Exit");
    else if (slabCanon === "writtenoff") notes.push("SLAB: Written-off");
    if (reg.attached && reg.fromDifferentQuarter && reg.regLabel) notes.push(`등기부등본 ${reg.regLabel} 기준`);
    if (reg.supersededNote) notes.push(reg.supersededNote); // 최신 분기 오첨부로 폴백한 경우 사유
    if (!reg.attached) notes.push("등기부등본 미첨부");
    else if (reg.oversized) notes.push("등기부등본 용량 초과 · 수동 확인 필요");
    else if (reg.unprocessed) notes.push("등기부등본 처리 대기");
    else if (!reg.cachedOk) notes.push(foreign ? "해외기업 등기서류 판독 불가" : "등기서류 판독 불가");
    else if (foreign) notes.push("해외기업");
    if (reg.lowConfidenceOcr) notes.push("OCR 판독(재확인 권장)");
    if (slabShares == null) notes.push("SLAB 발행주식총수 미기재");

    // 분기보고 총발행주식수가 SLAB/등기부와 다르면 비고로 표기 (세 출처 모두 다르면 명시)
    if (reportShares != null) {
      const hasReg = reg.shares != null;
      // 등기부등본이 있으면 그것과 비교. (분기보고가 등기부등본과 같으면 불일치는 이미 등기 vs SLAB로 잡히므로
      //  '분기보고 상이'는 노이즈 → 표기 안 함.) 등기부등본이 없을 때만 SLAB과의 차이를 교차검증으로 표기.
      const meaningful = hasReg ? reportShares !== reg.shares : (slabShares != null && reportShares !== slabShares);
      if (meaningful) {
        const distinct = new Set([slabShares, reg.shares, reportShares].filter((n): n is number => n != null));
        const threeWay = slabShares != null && hasReg && distinct.size === 3;
        notes.push(`분기보고 발행주식수(${fmt(reportShares)}) 상이${threeWay ? " · SLAB·등기부등본·분기보고 세 출처 모두 상이" : ""}`);
        if (!flag) flag = "yellow";
      }
    }

    followup.push({
      no: 0, company: name, companyId: co._id as string, quarter: target.label,
      investStatus: investStatus(targetQup), registryDate: reg.date, registryShares: reg.shares,
      slabShares, reportShares, match, followupApplicable, note: notes.join(" · "), flag,
      registryQuarter: reg.regLabel, registryUrl: reg.url,
    });
    // 감액: 스프레드시트 상태 ↔ SLAB 상태 대조
    let woSheetStatus = "";
    let woReflected: WriteoffRow["reflected"] = "";
    let woNote = "";
    let woFlag: WriteoffRow["flag"];
    let woSheetName: string | undefined;
    if (interp) {
      // 국문 본체 / 괄호 안 별칭 / 영문명 순으로 매칭
      const enName = co["company name eng"] as string | undefined;
      let hit: InterpretedCompany | undefined;
      for (const k of nameKeys(name, enName)) {
        hit = sheetMap.get(k);
        if (hit) break;
      }
      if (hit) {
        // 표시: 시트 원문 상태 우선(M&A/Capital Return 등 그대로). 상태 열 없어 추론한 경우만 표준 라벨.
        const displayStatus = prettyStatusLabel(hit.statusLabel?.trim() || mapStatus(hit.status));
        woSheetStatus = displayStatus;
        woSheetName = hit.name;
        // 판정: 신뢰 가능한 표준 enum으로 (원문 라벨이 목록에 없어도 안전)
        woReflected = judgeReflection(mapStatus(hit.status), slabStatus).reflected;
        if (woReflected === "미반영") woFlag = "red";
        else if (woReflected === "판단애매") woFlag = "yellow";

        // 비고: 필요한 것만. 표기는 다르지만 의미가 같으면(M&A/Capital Return ↔ Exit) SLAB 상태를 명시해 '반영됨' 근거를 남김.
        const parts: string[] = [];
        // 스프레드시트 원문 근거 명시 (예: "스프레드시트: 파산") — 왜 이 상태로 봤는지 근거를 남김
        const sheetReason = (hit.note || "").trim();
        if (sheetReason) parts.push(`스프레드시트: ${sheetReason}`);
        if (normName(name) !== normName(hit.name)) parts.push(`시트명: ${hit.name}`);
        if (dupSet.has(normName(hit.name))) parts.push("스프레드시트 (1),(2) 중복");
        if (canonStatus(displayStatus) !== canonStatus(slabStatus)) parts.push(`SLAB: ${slabStatus}`);
        woNote = parts.join(" · ");
      } else {
        woNote = "스프레드시트 미등재";
        woFlag = "yellow";
      }
    }
    // (시트 미업로드 시 woSheetStatus/woReflected/woNote 는 빈 값 유지 — 업로드 안내는 페이지에서)
    writeoff.push({
      no: 0, company: name, companyId: co._id as string, sheetStatus: woSheetStatus, reflected: woReflected,
      note: woNote, flag: woFlag, slabStatus, sheetName: woSheetName,
    });
  }

  followup.sort((a, b) => a.company.localeCompare(b.company, "ko"));
  writeoff.sort((a, b) => a.company.localeCompare(b.company, "ko"));
  followup.forEach((r, i) => (r.no = i + 1));
  writeoff.forEach((r, i) => (r.no = i + 1));

  const tracker: FundTracker = { fund, followup, writeoff, sheetState, tabs };
  trackerCache.set(fundSearch, tracker);
  return tracker;
}

// ---- 기업 상세 (여러 펀드에 걸친 한 회사) ----
export interface CompanyFundLink {
  name: string;
  slug: string;
  slabStatus: string; // SLAB이 이 펀드에서 기록한 투자상태 (전 펀드 표시)
  writeoffUploaded: boolean;
  reflected?: string; // 감액 DB 업로드된 펀드만: 이미 반영됨/미반영/판단애매
  sheetStatus?: string; // 감액 DB 업로드된 펀드만: 투자현황 DB(스프레드시트) 상태
  note?: string; // 업로드된 펀드의 비고 (중복 등)
}
export interface CompanyDetail {
  id: string;
  name: string;
  nameEn: string | null;
  lang: string | null;
  foreign: boolean;
  investStatus: string;
  followup: {
    slabShares: number | null;
    registryShares: number | null;
    registryQuarter: string | null;
    registryDate: string | null;
    registryUrl: string | null;
    registryManual: boolean;
    reportShares: number | null;
    match: FollowupRow["match"];
    note: string;
  } | null;
  funds: CompanyFundLink[];
}

export async function getCompanyDetail(companyId: string): Promise<CompanyDetail | null> {
  const co = await slabGet<Obj>("company", companyId);
  if (!co) return null;

  const spis = await slabList<Obj>("sparklabinvestment", {
    constraints: [{ key: "company", constraint_type: "equals", value: companyId }],
  });
  const fundIds = new Set(spis.map((s) => s.fund).filter(Boolean) as string[]);
  const myFunds = (await getFunds()).filter((f) => fundIds.has(f.id));

  let followup: CompanyDetail["followup"] = null;
  const funds: CompanyFundLink[] = [];
  for (const f of myFunds) {
    const t = await getFundTracker(f.search);
    if (!t) continue;
    const fuRow = t.followup.find((r) => r.companyId === companyId);
    const woRow = t.writeoff.find((r) => r.companyId === companyId);
    if (fuRow && !followup) {
      followup = {
        slabShares: fuRow.slabShares, registryShares: fuRow.registryShares,
        registryQuarter: fuRow.registryQuarter ?? null, registryDate: fuRow.registryDate,
        registryUrl: fuRow.registryUrl ?? null, registryManual: !!fuRow.registryManual, reportShares: fuRow.reportShares ?? null,
        match: fuRow.match, note: fuRow.note,
      };
    }
    const uploaded = t.sheetState === "processed";
    funds.push({
      name: f.name, slug: f.search,
      slabStatus: woRow?.slabStatus ?? "",
      writeoffUploaded: uploaded,
      reflected: uploaded ? (woRow?.reflected || undefined) : undefined,
      sheetStatus: uploaded ? (woRow?.sheetStatus || undefined) : undefined,
      note: uploaded ? (woRow?.note || undefined) : undefined,
    });
  }
  funds.sort((a, b) => a.name.localeCompare(b.name, "ko"));

  const lang = (co["main language for the contract"] as string) ?? null;
  return {
    id: companyId,
    name: (co["company name"] as string) ?? companyId,
    nameEn: (co["company name eng"] as string) ?? null,
    lang,
    foreign: Boolean(lang && lang !== "Korean"),
    investStatus: (co["company investment status"] as string) ?? "",
    followup,
    funds,
  };
}
