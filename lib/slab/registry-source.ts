// SLAB quarterlyupdate에서 등기부등본(company register) 관련 헬퍼.
// server/CLI 공용 (server-only 아님).

type Obj = Record<string, any>;

export function quarterNum(q: string | undefined): number {
  const m = /([1-4])분기/.exec(q ?? "");
  return m ? Number(m[1]) : 0;
}

export function qKey(q: Obj): number {
  return (q.year ?? 0) * 10 + quarterNum(q.quarter);
}

export function qLabel(q: Obj): string {
  return `${q.year}년 ${q.quarter}`;
}

/**
 * 등기부 PDF 파일명에 인코딩된 발급일을 YYYY-MM-DD로 추출 (없으면 null).
 * 실제 파일명 관례가 다양함: "…_20260701.pdf", "…(2026.04.16).pdf", "… 2026-01-21.pdf",
 * "…_26.04.15.pdf" 등. 구분자(. - _ / 공백 년월일) 유무를 모두 처리.
 * OCR로 읽은 날짜보다 신뢰도가 높아 표시/저장 시 이 값을 우선한다.
 * (파일명 끝쪽 날짜를 우선하도록 각 패턴에서 마지막 매치를 채택; 유효한 월·일만 인정)
 */
export function dateFromFilename(url: string | null | undefined): string | null {
  if (!url) return null;
  let name = url.split("/").pop() ?? "";
  try { name = decodeURIComponent(name); } catch { /* 원본 유지 */ }
  const pad = (s: string) => s.padStart(2, "0");
  const last = (re: RegExp) => { const a = [...name.matchAll(re)]; return a.length ? a[a.length - 1] : null; };
  const MO = "(0?[1-9]|1[0-2])", DY = "(0?[1-9]|[12]\\d|3[01])", SEP = "[.\\-_/ 년월]";
  // 1) YYYY(구분자)MM(구분자)DD  2) YYYYMMDD  3) YY(구분자)MM(구분자)DD  4) YYMMDD
  let m = last(new RegExp(`(?<!\\d)(20\\d{2})${SEP}${MO}${SEP}${DY}(?!\\d)`, "g"));
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = last(/(?<!\d)(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?!\d)/g);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = last(new RegExp(`(?<!\\d)(\\d{2})${SEP}${MO}${SEP}${DY}(?!\\d)`, "g"));
  if (m) return `20${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = last(/(?<!\d)(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?!\d)/g);
  if (m) return `20${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

/** quarterlyupdate에 첨부된 company register 파일 URL (없으면 null) */
export function registerUrl(q: Obj): string | null {
  const cr = q["company register"];
  if (Array.isArray(cr) && cr.length && typeof cr[0] === "string" && cr[0].trim()) {
    let u = cr[0].trim();
    if (u.startsWith("//")) u = "https:" + u;
    return u;
  }
  return null;
}

/** 등기부가 첨부된 분기보고들, 최신→과거 순 (최신 파일이 잘못됐을 때 과거로 폴백) */
export function registerQups(qups: Obj[]): Obj[] {
  return qups.filter((q) => registerUrl(q)).sort((a, b) => qKey(b) - qKey(a));
}

/** 등기부가 첨부된 분기보고 중 가장 최근 것 */
export function latestRegisterQup(qups: Obj[]): Obj | null {
  return registerQups(qups)[0] ?? null;
}
