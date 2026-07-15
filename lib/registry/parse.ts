/**
 * 등기부등본(등기사항전부증명서) 텍스트 파싱 — 발행주식의 총수 + 문서일자 추출.
 *
 * 실제 샘플(주식회사모바)에 맞춰 보정됨:
 *  - "발행주식의 총수" 는 시간순으로 나열되며, 말소(crossed-out)된 이전 값이 먼저,
 *    현재 유효한 값이 뒤에 온다. → 마지막 값을 채택한다.
 *  - "발행할 주식의 총수"(수권주식수)는 발행주식의 총수와 다르므로 제외한다.
 *  - 문서 일자는 발급용은 "발행일", 열람용은 "열람일시" 로 표기되며 의미는 동일하다.
 *
 * 스캔본(예: (주)본작)은 텍스트가 거의 없어 여기서 처리 불가 → source.ts에서 OCR로 분기.
 */

export interface RegistryFields {
  shareCountTotal: number | null; // 발행주식의 총수 (말소되지 않은 현재값)
  issueDate: string | null; // 발행일/열람일 (YYYY-MM-DD)
  /** 발견된 모든 발행주식의 총수 후보 (검증/보정용, 시간순) */
  shareCandidates: number[];
  matchedDateText: string | null;
}

/** "106,452" → 106452, 실패 시 null */
function parseKoreanInt(raw: string | undefined): number | null {
  if (!raw) return null;
  const digits = raw.replace(/[,\s]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}

function normalizeDate(y: string, m: string, d: string): string {
  const pad = (s: string) => s.padStart(2, "0");
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function extractRegistryFields(text: string): RegistryFields {
  // NBSP 등 공백 정규화
  const t = text.replace(/ /g, " ");

  // --- 발행주식의 총수 ---
  // "발행주식의 총수  106,452 주". "발행할 주식의 총수"(수권주식)는 앞에 '할'이 있어 제외됨.
  // "발행주식총수"(의/공백 없는 산문 표현)도 허용하되, 곧바로 숫자+주가 와야 매칭.
  const shareRe = /발행주식의?\s*총수[\s.]{0,40}?([0-9][0-9,]*)\s*주/g;
  const shareCandidates: number[] = [];
  for (const m of t.matchAll(shareRe)) {
    const n = parseKoreanInt(m[1]);
    if (n != null) shareCandidates.push(n);
  }
  // 마지막(가장 최근·말소되지 않은) 값을 채택
  const shareCountTotal =
    shareCandidates.length > 0 ? shareCandidates[shareCandidates.length - 1] : null;

  // --- 문서 일자 (발행일 / 열람일시) ---
  const dateRe =
    /(?:발행일|열람일시?)\s*[:：]?\s*(\d{4})\s*[년.\-/]\s*(\d{1,2})\s*[월.\-/]\s*(\d{1,2})\s*일?/;
  let issueDate: string | null = null;
  let matchedDateText: string | null = null;
  const dm = t.match(dateRe);
  if (dm) {
    issueDate = normalizeDate(dm[1], dm[2], dm[3]);
    matchedDateText = dm[0].trim();
  }

  return { shareCountTotal, issueDate, shareCandidates, matchedDateText };
}
