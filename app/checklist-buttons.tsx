"use client";

import { useState } from "react";

type Job = "followup" | "writeoff";

const LABELS: Record<Job, string> = {
  followup: "후속투자 체크리스트",
  writeoff: "감액 체크리스트",
};

function DownloadButton({ job, desc }: { job: Job; desc: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/checklist/${job}`);
      if (!res.ok) throw new Error(`서버 오류 ${res.status}`);
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const name = /filename="?([^"]+)"?/.exec(cd)?.[1] ?? `${job}_checklist.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMsg(`다운로드됨: ${name}`);
    } catch (e) {
      setMsg(`오류: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="text-base font-semibold">{LABELS[job]}</div>
      <p className="mt-1 text-sm text-gray-500">{desc}</p>
      <button
        onClick={run}
        disabled={busy}
        className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {busy ? "실행 중… (최신 데이터 대조)" : "지금 실행 & 다운로드"}
      </button>
      {msg && <p className="mt-2 text-xs text-gray-500">{msg}</p>}
    </div>
  );
}

export function ChecklistButtons() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <DownloadButton
        job="followup"
        desc="SLAB 발행주식총수 ↔ 등기부등본 대조. 불일치는 빨강으로 표시된 .xlsx 체크리스트로 받습니다."
      />
      <DownloadButton
        job="writeoff"
        desc="스프레드시트 상태 ↔ SLAB 상태를 LLM이 판단. 미반영=빨강, 판단애매=노랑 .xlsx 체크리스트."
      />
    </div>
  );
}
