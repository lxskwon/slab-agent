// 트래커 웹 뷰용 목업 — 실제 시트(스크린샷)를 그대로 옮긴 프리뷰 데이터.
// API 키가 생기면 파이프라인 결과를 이 구조로 매핑한다. 여기 숫자는 mock.

export type Flag = "red" | "yellow" | undefined;

export interface FollowupRow {
  no: number;
  company: string;
  companyId?: string; // SLAB company _id — 펀드 간 중복 제거(고유 기업 수) 및 펀드 연결용
  quarter: string; // 분기(대상)
  investStatus: string; // 투자유치여부(자가보고): 해당없음/투자예정/투자완료/미확인
  registryDate: string | null; // 등기부등본 확인일
  registryShares: number | null; // 등기상 발행주식총수
  slabShares: number | null; // SLAB상 발행주식총수
  reportShares?: number | null; // 분기보고상 총발행주식수 (latest issued share outstanding)
  match: "일치" | "불일치" | ""; // 일치여부 (에이전트 자동)
  followupApplicable: string; // 후속투자 해당여부 (일치→N 자동 / 불일치→사람)
  note: string; // 비고
  flag?: Flag;
  registryQuarter?: string | null; // 채택된 등기부 분기 (예: "2025년 3분기")
  registryUrl?: string | null; // 등기부 PDF 원본 링크 (증거)
}

export interface WriteoffRow {
  no: number;
  company: string;
  companyId?: string; // SLAB company _id
  sheetStatus: string; // 스프레드시트 상태: Live/Written-off/Exit/M&A/Capital Return
  reflected: "이미 반영됨" | "미반영" | "판단애매" | ""; // SLAB 반영여부 (에이전트)
  note: string; // 비고
  flag?: Flag;
  slabStatus?: string; // SLAB 투자상태 원문 (증거)
  sheetName?: string; // 스프레드시트에서 매칭된 회사명 (증거)
}

export interface Section<T> {
  round?: string; // "1차 적용" (표시용, 선택)
  fund: string; // "CJFtr"
  rows: T[];
}

export const FOLLOWUP_SECTIONS: Section<FollowupRow>[] = [
  {
    round: "1차 적용",
    fund: "CJFtr",
    rows: [
      { no: 1, company: "㈜도시곳간", quarter: "2026년 1분기", investStatus: "해당없음", registryDate: "2026년 2월 12일", registryShares: 166385, slabShares: 166385, match: "일치", followupApplicable: "N", note: "" },
      { no: 2, company: "㈜에스앤이컴퍼니", quarter: "2026년 1분기", investStatus: "투자예정", registryDate: "2026년 4월 10일", registryShares: 449740, slabShares: 449740, match: "일치", followupApplicable: "N", note: "" },
      { no: 3, company: "㈜엘로이랩", quarter: "2026년 1분기", investStatus: "해당없음", registryDate: "2026년 4월 24일", registryShares: 204246, slabShares: 204246, match: "일치", followupApplicable: "N", note: "" },
      { no: 4, company: "㈜왓섭", quarter: "2026년 1분기", investStatus: "해당없음", registryDate: "2026년 4월 20일", registryShares: 7356025, slabShares: 7356025, match: "일치", followupApplicable: "N", note: "" },
      { no: 5, company: "㈜잇그린", quarter: "2026년 1분기", investStatus: "해당없음", registryDate: "2026년 5월 13일", registryShares: 92764, slabShares: 92764, match: "일치", followupApplicable: "N", note: "" },
      { no: 6, company: "㈜잇마플", quarter: "2026년 1분기", investStatus: "해당없음", registryDate: "2025년 11월 5일", registryShares: 661696, slabShares: 661696, match: "일치", followupApplicable: "N", note: "2025년 4분기" },
      { no: 7, company: "㈜제트커머스코퍼레이션", quarter: "2026년 1분기", investStatus: "미확인", registryDate: null, registryShares: null, slabShares: 6677, match: "", followupApplicable: "", note: "Written-off" },
      { no: 8, company: "㈜현관앞마켓", quarter: "2026년 1분기", investStatus: "미확인", registryDate: null, registryShares: null, slabShares: null, match: "", followupApplicable: "", note: "주식정보 등록 X, 등기부등본 첨부 X" },
      { no: 9, company: "담화컴퍼니㈜", quarter: "2026년 1분기", investStatus: "해당없음", registryDate: "2026년 1월 21일", registryShares: 30568, slabShares: 30568, match: "일치", followupApplicable: "N", note: "" },
      { no: 10, company: "베러먼데이코리아㈜", quarter: "2026년 1분기", investStatus: "미확인", registryDate: "2026년 1월 8일", registryShares: 10342, slabShares: 10342, match: "일치", followupApplicable: "N", note: "2025년 4분기" },
    ],
  },
  {
    round: "2차 적용",
    fund: "SKF4",
    rows: [
      { no: 1, company: "부톡", quarter: "2026년 1분기", investStatus: "투자예정", registryDate: "2025년 1월 24일", registryShares: 125958, slabShares: 125958, match: "일치", followupApplicable: "N", note: "등기부·SLAB 일치, 분기보고 발행주식수(12,596) 상이" },
      { no: 2, company: "파이노버스랩", quarter: "2026년 1분기", investStatus: "해당없음", registryDate: "2026년 4월 22일", registryShares: 3036, slabShares: 3036, match: "일치", followupApplicable: "N", note: "등기여부 확인일: \"열람일시\"" },
      { no: 3, company: "핸들", quarter: "2026년 1분기", investStatus: "미확인", registryDate: "2025년 8월 25일", registryShares: 1490027, slabShares: 1490027, match: "일치", followupApplicable: "N", note: "Exit · 등기부·SLAB 일치, 분기보고 발행주식수(146,077) 상이" },
      { no: 4, company: "배젠", quarter: "2026년 1분기", investStatus: "해당없음", registryDate: "2026년 2월 25일", registryShares: 18499, slabShares: 18499, match: "일치", followupApplicable: "N", note: "" },
      { no: 5, company: "도지마", quarter: "2026년 1분기", investStatus: "미확인", registryDate: null, registryShares: null, slabShares: 0, match: "", followupApplicable: "", note: "Written-off" },
      { no: 6, company: "에이치투씨", quarter: "2026년 1분기", investStatus: "미확인", registryDate: null, registryShares: null, slabShares: 0, match: "", followupApplicable: "", note: "분기보고 Company Register 첨부파일 오첨부(다른 certificate)" },
      { no: 7, company: "나인하이어", quarter: "2026년 1분기", investStatus: "미확인", registryDate: null, registryShares: null, slabShares: 128208, match: "", followupApplicable: "", note: "Exit" },
      { no: 8, company: "브라이트 코퍼레이션", quarter: "2026년 1분기", investStatus: "미확인", registryDate: null, registryShares: null, slabShares: 73682, match: "", followupApplicable: "", note: "Written-off" },
      { no: 9, company: "빌리오", quarter: "2026년 1분기", investStatus: "미확인", registryDate: null, registryShares: null, slabShares: 0, match: "", followupApplicable: "", note: "Written-off" },
      { no: 10, company: "틴고랜드", quarter: "2026년 1분기", investStatus: "투자예정", registryDate: "2026년 3월 11일", registryShares: 36967, slabShares: 36967, match: "일치", followupApplicable: "N", note: "" },
      { no: 11, company: "폴슨", quarter: "2026년 1분기", investStatus: "해당없음", registryDate: "2025년 12월 12일", registryShares: 44630, slabShares: 44630, match: "일치", followupApplicable: "N", note: "등기부·SLAB 일치, 분기보고 발행주식수(44,440) 상이" },
      { no: 12, company: "잇그린", quarter: "2026년 1분기", investStatus: "해당없음", registryDate: "2026년 5월 13일", registryShares: 92764, slabShares: 92764, match: "일치", followupApplicable: "N", note: "" },
      { no: 13, company: "빔스튜디오", quarter: "2026년 1분기", investStatus: "해당없음", registryDate: "2026년 4월 7일", registryShares: 562500, slabShares: 0, match: "불일치", followupApplicable: "", note: "", flag: "red" },
      { no: 14, company: "그로스핏", quarter: "2026년 1분기", investStatus: "미확인", registryDate: null, registryShares: null, slabShares: 0, match: "", followupApplicable: "", note: "Written-off" },
      { no: 15, company: "하이퍼액션", quarter: "2026년 1분기", investStatus: "미확인", registryDate: null, registryShares: null, slabShares: 0, match: "", followupApplicable: "", note: "Written-off · SLAB 사명 상이(인피티느아워글래스)" },
      { no: 16, company: "브로츠", quarter: "2026년 1분기", investStatus: "미확인", registryDate: null, registryShares: null, slabShares: 12729, match: "", followupApplicable: "", note: "해외기업(이탈리아어) 등기서류 판독 불가", flag: "yellow" },
      { no: 32, company: "스파크펫 (1)", quarter: "2026년 1분기", investStatus: "투자예정", registryDate: "2025년 5월 6일", registryShares: 127228, slabShares: 125369, match: "불일치", followupApplicable: "", note: "65번(스파크펫 2)과 중복", flag: "red" },
    ],
  },
];

export const WRITEOFF_SECTIONS: Section<WriteoffRow>[] = [
  {
    round: "1차 적용",
    fund: "CJFtr",
    rows: [
      { no: 1, company: "㈜도시곳간", sheetStatus: "Live", reflected: "이미 반영됨", note: "" },
      { no: 2, company: "㈜에스앤이컴퍼니", sheetStatus: "Live", reflected: "이미 반영됨", note: "" },
      { no: 3, company: "㈜엘로이랩", sheetStatus: "Live", reflected: "이미 반영됨", note: "" },
      { no: 4, company: "㈜왓섭", sheetStatus: "Live", reflected: "이미 반영됨", note: "" },
      { no: 5, company: "㈜잇그린", sheetStatus: "Live", reflected: "이미 반영됨", note: "" },
      { no: 6, company: "㈜잇마플", sheetStatus: "Live", reflected: "이미 반영됨", note: "" },
      { no: 7, company: "㈜제트커머스코퍼레이션", sheetStatus: "Written-off", reflected: "이미 반영됨", note: "" },
      { no: 8, company: "㈜현관앞마켓", sheetStatus: "Live", reflected: "이미 반영됨", note: "" },
      { no: 9, company: "담화컴퍼니㈜", sheetStatus: "Live", reflected: "이미 반영됨", note: "" },
      { no: 10, company: "베러먼데이코리아㈜", sheetStatus: "Live", reflected: "이미 반영됨", note: "" },
    ],
  },
  {
    round: "2차 적용",
    fund: "SKF4",
    rows: [
      { no: 1, company: "부톡", sheetStatus: "Live", reflected: "이미 반영됨", note: "" },
      { no: 2, company: "파이노버스랩", sheetStatus: "Live", reflected: "이미 반영됨", note: "" },
      { no: 3, company: "핸들", sheetStatus: "M&A", reflected: "이미 반영됨", note: "SLAB: Exit" },
      { no: 4, company: "배젠", sheetStatus: "Live", reflected: "이미 반영됨", note: "" },
      { no: 5, company: "도지마", sheetStatus: "Written-off", reflected: "이미 반영됨", note: "" },
      { no: 6, company: "에이치투씨", sheetStatus: "Live", reflected: "이미 반영됨", note: "" },
      { no: 7, company: "나인하이어", sheetStatus: "M&A", reflected: "이미 반영됨", note: "SLAB: Exit" },
      { no: 8, company: "브라이트 코퍼레이션", sheetStatus: "Written-off", reflected: "이미 반영됨", note: "" },
      { no: 9, company: "빌리오", sheetStatus: "Written-off", reflected: "이미 반영됨", note: "" },
      { no: 10, company: "틴고랜드", sheetStatus: "Live", reflected: "이미 반영됨", note: "" },
      { no: 15, company: "하이퍼액션", sheetStatus: "Written-off", reflected: "이미 반영됨", note: "SLAB 사명 상이(인피티느아워글래스)" },
      { no: 23, company: "프론트맨", sheetStatus: "Written-off", reflected: "미반영", note: "SLAB=Live, Cosmetic=Written-off 상이", flag: "red" },
      { no: 35, company: "라이다", sheetStatus: "Capital Return", reflected: "이미 반영됨", note: "SLAB: Exit" },
      { no: 45, company: "퀸라이브", sheetStatus: "M&A", reflected: "이미 반영됨", note: "SLAB: Exit" },
    ],
  },
];
