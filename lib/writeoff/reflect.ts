import type { ReflectionStatus } from "@/lib/types";

/**
 * 감액 반영여부 판단 (규칙 기반, 상태 어휘가 닫힌 집합이라 결정론적으로 처리).
 * 표현이 달라도 의미(정상 vs 회수/상각)로 대조 → 스프레드시트 M&A ↔ SLAB Exit 같은 경우도 '이미 반영됨'.
 * 인식 못 하는 상태값은 '판단애매'로 두어 사람이 확인.
 */

export interface ReflectResult {
  reflected: ReflectionStatus;
  reasoning: string;
}

const ACTIVE = ["live", "정상", "운영중"];
const CLOSED = [
  "written-off", "writtenoff", "w/o", "wo", "상각", "감액",
  "exit", "exited", "청산", "해산", "dissolved",
  "m&a", "mna", "인수합병", "capitalreturn", "capital return", "회수", "ipo", "상장",
];

export type StatusCat = "active" | "closed" | "unknown";
export function statusCategory(s: string | null): StatusCat {
  const t = (s ?? "").toLowerCase().replace(/\s/g, "");
  if (!t) return "unknown";
  if (ACTIVE.some((a) => t.includes(a.replace(/\s/g, "")))) return "active";
  if (CLOSED.some((c) => t.includes(c.replace(/\s/g, "")))) return "closed";
  return "unknown";
}

/**
 * 세부 표준 상태 (같은 뜻의 표기를 하나로). W/O=Written-off=writtenoff(동일 → 비고 불필요),
 * 하지만 M&A / Capital Return / Exit 는 서로 다른 표준값(다름 → 비고에 SLAB 표기 명시).
 */
export function canonStatus(s: string | null): string {
  const t = (s ?? "").toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
  if (!t) return "";
  const rules: [RegExp, string][] = [
    [/live|정상|운영/, "live"],
    // 상각·손실(투자금 소실): written-off, 폐업, 파산, 자본잠식, 청산, 해산 등
    [/writtenoff|wo|상각|감액|폐업|파산|자본잠식|청산|해산|dissolv|bankrupt/, "writtenoff"],
    [/capitalreturn|자본회수/, "capitalreturn"],
    [/mna|ma|인수합병/, "mna"],
    // 회수·매각(원금 이상 회수 성격): exit, 회수, 매각
    [/exit|회수|매각|매도/, "exit"],
    [/ipo|상장/, "ipo"],
  ];
  for (const [re, c] of rules) if (re.test(t)) return c;
  return t;
}

/**
 * 반영여부 대조용 대분류. Written-off(손실)와 Exit(회수)는 '둘 다 종료'여도 의미가 달라 다른 그룹.
 * M&A/Capital Return/IPO는 모두 exit 성격 → 같은 그룹(서로 다른 표기여도 반영됨).
 */
type StatusGroup = "active" | "writeoff" | "exit" | "unknown";
function statusGroup(s: string | null): StatusGroup {
  const c = canonStatus(s);
  if (c === "live") return "active";
  if (c === "writtenoff") return "writeoff";
  if (c === "exit" || c === "mna" || c === "capitalreturn" || c === "ipo") return "exit";
  return "unknown"; // 빈 값 또는 인식 못한 표현
}

export function judgeReflection(sheet: string | null, slab: string | null): ReflectResult {
  const gs = statusGroup(sheet);
  const gl = statusGroup(slab);
  const S = sheet || "—";
  const L = slab || "—";

  // 판단애매는 상태값을 인식 못 할 때만
  if (gs === "unknown" || gl === "unknown") {
    return { reflected: "판단애매", reasoning: `상태 표현 확인 필요 (스프레드시트: ${S} / SLAB: ${L})` };
  }
  if (gs === gl) {
    return { reflected: "이미 반영됨", reasoning: `스프레드시트(${S}) · SLAB(${L}) 상태 일치` };
  }
  // 그룹이 다르면(정상↔상각↔회수, 어느 방향이든) 미반영. 특히 상각(written-off) vs 회수(exit)는 다른 것으로 본다.
  return { reflected: "미반영", reasoning: `스프레드시트(${S})와 SLAB(${L}) 상태 불일치` };
}
