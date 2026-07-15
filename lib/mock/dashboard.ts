// 대시보드 컨셉 목업용 데이터 (SKF4/CJFtr는 실제 근사값, 나머지는 예시)

export const NAVY = "#1f3a5f";

export interface MockFund {
  name: string;
  slug: string;
  companies: number;
  followup: { match: number; mismatch: number; pending: number };
  writeoff: { reflected: number; notReflected: number; pending: number };
  registryPct: number; // 등기부 처리율
  processed: boolean; // 감액 시트 업로드/해석 완료
}

export const FUNDS: MockFund[] = [
  { name: "SKF4", slug: "skf4", companies: 64, followup: { match: 38, mismatch: 6, pending: 18 }, writeoff: { reflected: 62, notReflected: 1, pending: 1 }, registryPct: 91, processed: true },
  { name: "CJFtr", slug: "cjftr", companies: 10, followup: { match: 8, mismatch: 1, pending: 1 }, writeoff: { reflected: 9, notReflected: 0, pending: 1 }, registryPct: 100, processed: true },
  { name: "SKF3", slug: "skf3", companies: 41, followup: { match: 0, mismatch: 0, pending: 41 }, writeoff: { reflected: 0, notReflected: 0, pending: 41 }, registryPct: 0, processed: false },
  { name: "SKF2", slug: "skf2", companies: 33, followup: { match: 0, mismatch: 0, pending: 33 }, writeoff: { reflected: 0, notReflected: 0, pending: 33 }, registryPct: 0, processed: false },
  { name: "Cosmetic", slug: "cosmetic", companies: 12, followup: { match: 0, mismatch: 0, pending: 12 }, writeoff: { reflected: 0, notReflected: 0, pending: 12 }, registryPct: 0, processed: false },
  { name: "Sparkpet1", slug: "sparkpet1", companies: 9, followup: { match: 0, mismatch: 0, pending: 9 }, writeoff: { reflected: 0, notReflected: 0, pending: 9 }, registryPct: 0, processed: false },
  { name: "Discovery1", slug: "discovery1", companies: 15, followup: { match: 0, mismatch: 0, pending: 15 }, writeoff: { reflected: 0, notReflected: 0, pending: 15 }, registryPct: 0, processed: false },
  { name: "Firststep", slug: "firststep", companies: 7, followup: { match: 0, mismatch: 0, pending: 7 }, writeoff: { reflected: 0, notReflected: 0, pending: 7 }, registryPct: 0, processed: false },
];

export type IssueKind = "후속 불일치" | "감액 미반영" | "확인 필요";

export interface MockIssue {
  fund: string;
  company: string;
  kind: IssueKind;
  detail: string;
  severity: "red" | "yellow";
}

export const ISSUES: MockIssue[] = [
  { fund: "SKF4", company: "프론트맨", kind: "감액 미반영", detail: "스프레드시트 Written-off · SLAB Live", severity: "red" },
  { fund: "SKF4", company: "빔스튜디오", kind: "후속 불일치", detail: "등기 562,500 · SLAB 0", severity: "red" },
  { fund: "SKF4", company: "스파크펫", kind: "후속 불일치", detail: "등기 127,228 · SLAB 125,369", severity: "red" },
  { fund: "CJFtr", company: "빔스튜디오", kind: "후속 불일치", detail: "등기 562,500 · SLAB 0", severity: "red" },
  { fund: "SKF4", company: "오오옹", kind: "감액 미반영", detail: "스프레드시트 미등재 (SLAB 전용)", severity: "yellow" },
  { fund: "SKF4", company: "아스타", kind: "확인 필요", detail: "등기부등본 처리 대기 (스캔 판독 실패)", severity: "yellow" },
  { fund: "SKF4", company: "브로츠", kind: "확인 필요", detail: "해외 등기서류 (BROTS SRL)", severity: "yellow" },
  { fund: "SKF4", company: "에이치투", kind: "확인 필요", detail: "해외 등기서류 (H2 Inc.)", severity: "yellow" },
  { fund: "CJFtr", company: "제트커머스", kind: "확인 필요", detail: "등기부등본 미첨부 · Written-off", severity: "yellow" },
];

export const TOTALS = {
  funds: FUNDS.length,
  companies: FUNDS.reduce((s, f) => s + f.companies, 0),
  red: ISSUES.filter((i) => i.severity === "red").length,
  yellow: ISSUES.filter((i) => i.severity === "yellow").length,
  registryPct: 82,
  processedFunds: FUNDS.filter((f) => f.processed).length,
};

export const fundFlags = (f: MockFund) => ({
  red: f.followup.mismatch + f.writeoff.notReflected,
  yellow: f.processed ? f.writeoff.pending : 0,
});
