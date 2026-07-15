import type { SlabSnapshot } from "@/lib/types";
import { MOCK_SLAB, MOCK_SLAB_WRITEOFF } from "./mock-data";

/**
 * SLAB 접근을 추상화하는 인터페이스.
 * Phase 0에서는 MockSlabClient를 사용하고, SLAB API가 확보되면
 * RealSlabClient만 채워 넣으면 나머지 파이프라인은 변경 없이 동작한다.
 */
export interface SlabClient {
  /** 대상 기업명 목록 (없으면 소스가 아는 전체) */
  listCompanies(): Promise<string[]>;
  /** 기업별 스냅샷 (발행주식총수 · 투자유치여부 · 감액 상태) */
  getSnapshot(companyName: string): Promise<SlabSnapshot>;
}

export class MockSlabClient implements SlabClient {
  async listCompanies(): Promise<string[]> {
    return Object.keys(MOCK_SLAB);
  }

  async getSnapshot(companyName: string): Promise<SlabSnapshot> {
    const snap = MOCK_SLAB[companyName];
    if (snap) return snap;
    // 감액 데모 기업(스프레드시트에만 있는)은 writeoffStatus만 채워 반환
    if (companyName in MOCK_SLAB_WRITEOFF) {
      return {
        companyName,
        shareCountTotal: null,
        investmentStatus: "미확인",
        writeoffStatus: MOCK_SLAB_WRITEOFF[companyName],
      };
    }
    // 알 수 없는 기업 → 조용히 무시하지 않고 '미확인'으로 표시 (NFR: 에러 명시)
    return {
      companyName,
      shareCountTotal: null,
      investmentStatus: "미확인",
      writeoffStatus: null,
    };
  }
}

/**
 * 실제 SLAB API 클라이언트 (Phase 0 open question §11.1 확정 후 구현).
 * 인증 방식/엔드포인트/rate limit이 확정되면 아래 TODO를 채운다.
 */
export class RealSlabClient implements SlabClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async listCompanies(): Promise<string[]> {
    // TODO(SLAB): GET /companies 등 실제 엔드포인트로 교체
    throw new Error("RealSlabClient 미구현 — SLAB API 스펙 확정 필요 (PRD §11.1)");
  }

  async getSnapshot(_companyName: string): Promise<SlabSnapshot> {
    // TODO(SLAB): 발행주식총수 + 분기보고(투자유치여부) + 감액상태 조회 후 매핑
    throw new Error("RealSlabClient 미구현 — SLAB API 스펙 확정 필요 (PRD §11.1)");
  }
}

/** 환경변수가 있으면 실제 클라이언트, 없으면 목업. */
export function getSlabClient(): SlabClient {
  const baseUrl = process.env.SLAB_API_BASE_URL;
  const apiKey = process.env.SLAB_API_KEY;
  if (baseUrl && apiKey) {
    return new RealSlabClient(baseUrl, apiKey);
  }
  return new MockSlabClient();
}

export function isSlabMocked(): boolean {
  return !(process.env.SLAB_API_BASE_URL && process.env.SLAB_API_KEY);
}
