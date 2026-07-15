// 표시용 포매팅 + 플래그 색상 (클라이언트/서버 공용)

export function fmtInt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("ko-KR");
}

export function fmtDate(d: string | null | undefined): string {
  return d ?? "—";
}

/** 후속투자 일치여부 배지 색상 (연한 tint 스타일) */
export function matchBadge(status: string | null): {
  label: string;
  className: string;
} {
  switch (status) {
    case "일치":
      return { label: "일치", className: "bg-green-50 text-green-700 ring-green-200" };
    case "불일치":
      return { label: "불일치", className: "bg-red-50 text-red-700 ring-red-200" };
    case "확인필요":
      return { label: "확인필요", className: "bg-gray-100 text-gray-600 ring-gray-300" };
    default:
      return { label: status ?? "—", className: "bg-gray-100 text-gray-600 ring-gray-300" };
  }
}

/** 감액 반영여부 배지 (Phase 3) */
export function reflectionBadge(status: string | null): {
  label: string;
  className: string;
} {
  switch (status) {
    case "이미 반영됨":
      return { label: "이미 반영됨", className: "bg-green-50 text-green-700 ring-green-200" };
    case "미반영":
      return { label: "미반영", className: "bg-red-50 text-red-700 ring-red-200" };
    case "판단애매":
      return { label: "판단애매", className: "bg-amber-50 text-amber-700 ring-amber-200" };
    default:
      return { label: status ?? "—", className: "bg-gray-100 text-gray-600 ring-gray-300" };
  }
}
