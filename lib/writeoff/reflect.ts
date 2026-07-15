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
const cat = statusCategory;

/**
 * 세부 표준 상태 (같은 뜻의 표기를 하나로). W/O=Written-off=writtenoff(동일 → 비고 불필요),
 * 하지만 M&A / Capital Return / Exit 는 서로 다른 표준값(다름 → 비고에 SLAB 표기 명시).
 */
export function canonStatus(s: string | null): string {
  const t = (s ?? "").toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
  if (!t) return "";
  const rules: [RegExp, string][] = [
    [/live|정상|운영/, "live"],
    [/writtenoff|wo|상각|감액/, "writtenoff"],
    [/capitalreturn|자본회수/, "capitalreturn"],
    [/mna|ma|인수합병/, "mna"],
    [/exit|청산|회수|매각/, "exit"],
    [/ipo|상장/, "ipo"],
  ];
  for (const [re, c] of rules) if (re.test(t)) return c;
  return t;
}

export function judgeReflection(sheet: string | null, slab: string | null): ReflectResult {
  const cs = cat(sheet);
  const cl = cat(slab);
  const S = sheet || "—";
  const L = slab || "—";

  // 판단애매는 상태값을 인식 못 할 때만
  if (cs === "unknown" || cl === "unknown") {
    return { reflected: "판단애매", reasoning: `상태 표현 확인 필요 (스프레드시트: ${S} / SLAB: ${L})` };
  }
  if (cs === cl) {
    return { reflected: "이미 반영됨", reasoning: `스프레드시트(${S}) · SLAB(${L}) 상태 일치` };
  }
  // 카테고리가 명확히 다르면(정상↔회수/상각, 어느 방향이든) 미반영
  return { reflected: "미반영", reasoning: `스프레드시트(${S})와 SLAB(${L}) 상태 불일치` };
}
