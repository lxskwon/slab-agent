"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ConfirmCell({
  resultId,
  reviewedBy,
  editable,
}: {
  resultId: string;
  reviewedBy: string | null;
  editable: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(!!reviewedBy);

  if (done) {
    return <span className="text-xs text-gray-500">확인됨{reviewedBy ? ` · ${reviewedBy}` : ""}</span>;
  }

  async function confirm() {
    if (!editable) return;
    setBusy(true);
    try {
      const note = window.prompt("메모(선택):") ?? undefined;
      const res = await fetch("/api/writeoff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resultId, reviewer: "reviewer", note }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "실패");
      setDone(true);
      router.refresh();
    } catch (e) {
      alert(`오류: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={confirm}
      disabled={busy || !editable}
      title={editable ? "" : "확인하려면 Supabase 연결이 필요합니다"}
      className="rounded px-2 py-0.5 text-xs ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-40"
    >
      확인
    </button>
  );
}
