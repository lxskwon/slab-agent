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
