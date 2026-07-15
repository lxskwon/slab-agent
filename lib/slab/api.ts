// SLAB(Bubble.io) Data API 저수준 클라이언트.
// auth: Authorization: Bearer <SLAB_API_KEY>, base: https://slab.sparkerp.co.kr/api/1.1

const BASE = process.env.SLAB_API_BASE_URL ?? "";
const KEY = process.env.SLAB_API_KEY ?? "";

export function slabEnabled(): boolean {
  return Boolean(BASE && KEY);
}

export interface Constraint {
  key: string;
  constraint_type:
    | "equals"
    | "not equal"
    | "text contains"
    | "in"
    | "greater than"
    | "less than";
  value: unknown;
}

interface BubbleListResponse<T> {
  response: { results: T[]; cursor: number; count: number; remaining: number };
}

async function req<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${KEY}` },
    // 항상 최신값 (Next 캐시 방지)
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`SLAB API ${res.status} on ${path}`);
  }
  return res.json() as Promise<T>;
}

/** 데이터 타입 전체 조회 (페이지네이션 자동, constraints 지원) */
export async function slabList<T = Record<string, unknown>>(
  type: string,
  opts: { constraints?: Constraint[]; limit?: number } = {},
): Promise<T[]> {
  const out: T[] = [];
  let cursor = 0;
  const pageSize = opts.limit ?? 100;
  for (let i = 0; i < 200; i++) {
    const params = new URLSearchParams();
    params.set("limit", String(pageSize));
    params.set("cursor", String(cursor));
    if (opts.constraints?.length) {
      params.set("constraints", JSON.stringify(opts.constraints));
    }
    const { response } = await req<BubbleListResponse<T>>(`/obj/${type}?${params}`);
    out.push(...response.results);
    cursor += response.results.length;
    if (response.remaining === 0 || response.results.length === 0) break;
  }
  return out;
}

/** 단일 레코드 조회 */
export async function slabGet<T = Record<string, unknown>>(
  type: string,
  id: string,
): Promise<T> {
  const { response } = await req<{ response: T }>(`/obj/${type}/${id}`);
  return response;
}
