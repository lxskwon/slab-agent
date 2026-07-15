import type { SlabSnapshot } from "@/lib/types";

/**
 * 데모 기업 = 실제 등기부등본 샘플과 짝을 이룬다.
 * 등기부 값은 data/registry-samples/의 실제 PDF에서 파싱된다(진짜 값).
 * SLAB 값은 API 미연동이라 아직 null → 비교결과는 '확인필요'로 표시된다.
 * (SLAB API가 붙으면 shareCountTotal이 채워지고 일치/불일치가 판정된다.)
 */
export const MOCK_SLAB: Record<string, SlabSnapshot> = {
  "모바": {
    companyName: "모바",
    shareCountTotal: null, // SLAB API 미연동
    investmentStatus: "미확인",
    writeoffStatus: null,
  },
  "본작": {
    companyName: "본작",
    shareCountTotal: null, // SLAB API 미연동
    investmentStatus: "미확인",
    writeoffStatus: null,
  },
};

/**
 * 감액(Phase 3) 데모용 SLAB 투자상태.
 * 스프레드시트(lib/writeoff/mock-data.ts)와 표현이 일부러 다르다
 * → 규칙 매칭이 아닌 LLM 판단이 필요함을 보여준다.
 */
export const MOCK_SLAB_WRITEOFF: Record<string, string> = {
  "알파": "감액 처리 완료 (2024.12 상각)", // 스프레드시트 Written-off와 일치 → 이미 반영됨
  "베타": "정상 · 투자 유지중", // 스프레드시트 Written-off인데 SLAB은 정상 → 미반영
  "감마": "청산 절차 진행 중", // 스프레드시트 Exit → 청산 진행중, 완료 아님 → 판단애매
  "델타": "정상", // 스프레드시트 Live와 일치 → 이미 반영됨
};
