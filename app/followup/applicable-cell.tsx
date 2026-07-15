"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ApplicableCell({
  resultId,
  value,
  matchStatus,
  editable,
}: {
  resultId: string;
  value: "Y" | "N" | null;
  matchStatus: string | null;
  editable: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<"Y" | "N" | null>(value);

  // 일치 → 자동 'N' (수정 불필요), 불일치/확인필요 → 사람이 Y/N 입력
  if (matchStatus === "일치") {
    return <span className="text-gray-500">N (자동)</span>;
  }

  async function set(v: "Y" | "N") {
    if (!editable) return;
    setBusy(true);
    try {
      const note = window.prompt("사유(선택):") ?? undefined;
      const res = await fetch("/api/followup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resultId, value: v, reviewer: "reviewer", note }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "실패");
      setCurrent(v);
      router.refresh();
    } catch (e) {
      alert(`오류: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      {(["Y", "N"] as const).map((v) => (
        <button
          key={v}
          disabled={busy || !editable}
          onClick={() => set(v)}
          title={editable ? "" : "저장하려면 Supabase 연결이 필요합니다"}
          className={`rounded px-2 py-0.5 text-xs ring-1 disabled:opacity-40 ${
            current === v
              ? "bg-gray-900 text-white ring-gray-900"
              : "bg-white text-gray-700 ring-gray-300 hover:bg-gray-50"
          }`}
        >
          {v}
        </button>
      ))}
      {current == null && <span className="ml-1 text-xs text-red-500">미입력</span>}
    </div>
  );
}
