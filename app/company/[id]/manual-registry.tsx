"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 등기부등본 발행주식총수 수기 입력/수정/삭제 (기업 상세 페이지용).
 * 큐에서 벗어난(일치로 해결된) 건도 여기서 항상 편집·삭제 가능.
 */
export default function ManualRegistry({ url, current, isManual }: { url: string; current: number | null; isManual: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const n = Number(draft.replace(/[,\s]/g, ""));
    if (!Number.isFinite(n) || n < 0) return;
    setBusy(true);
    try {
      await fetch("/api/registry-manual", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, shares: n }), // author는 서버가 로그인 이름으로 설정
      });
    } catch {}
    setDraft(""); setBusy(false); router.refresh();
  };
  const clear = async () => {
    setBusy(true);
    try {
      await fetch("/api/registry-manual", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, remove: true }),
      });
    } catch {}
    setBusy(false); router.refresh();
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-2 ring-1 ring-amber-200">
      <span className="text-[11px] font-medium text-amber-800">
        {isManual ? `수기 입력값: ${current?.toLocaleString("ko-KR")}주 — 수정:` : "등기부등본 판독 불가 — 직접 입력:"}
      </span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); }}
        inputMode="numeric"
        placeholder="발행주식총수"
        className="w-32 rounded border border-amber-300 bg-white px-2 py-1 text-xs focus:border-[#1f3a5f] focus:outline-none"
      />
      <span className="text-[11px] text-gray-400">주</span>
      <button onClick={save} disabled={busy || !draft.trim()} className="rounded-md bg-[#1f3a5f] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40">저장</button>
      {isManual && <button onClick={clear} disabled={busy} className="text-[11px] text-gray-400 hover:text-red-600">지우기</button>}
    </div>
  );
}
