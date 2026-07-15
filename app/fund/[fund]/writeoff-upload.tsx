"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type State = "none" | "uploaded" | "processed";

export function WriteoffUpload({
  fund,
  sheetState,
  tabs,
}: {
  fund: string;
  sheetState: State;
  tabs?: string[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // 업로드 직후/업로드됨 상태에서 탭 선택 UI를 띄우기 위한 로컬 상태
  const [pickTabs, setPickTabs] = useState<string[] | null>(sheetState === "uploaded" ? tabs ?? [] : null);
  const [tab, setTab] = useState<string>(sheetState === "uploaded" ? tabs?.[0] ?? "" : "");

  async function upload(f: File) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/fund/${fund}/writeoff-sheet`, { method: "POST", body: f });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? "업로드 실패");
      setPickTabs(b.tabs ?? []);
      setTab(b.tabs?.[0] ?? "");
      setMsg("업로드됨 — 사용할 탭을 선택하세요.");
    } catch (e) {
      setMsg(`오류: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function process() {
    if (!tab) return;
    setBusy(true);
    setMsg("에이전트가 시트를 읽는 중…");
    try {
      const res = await fetch(`/api/fund/${fund}/writeoff-process`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tab }),
      });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? "처리 실패");
      setPickTabs(null);
      setMsg(`반영 완료 · ${b.count}개 회사`);
      router.refresh();
    } catch (e) {
      setMsg(`오류: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const fileInput = (label: string) => (
    <label className="cursor-pointer rounded border border-gray-300 bg-white px-2.5 py-1 font-medium text-gray-700 hover:bg-gray-50">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        hidden
        disabled={busy}
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
      />
      {busy ? "처리 중…" : label}
    </label>
  );

  // 탭 선택 단계
  if (pickTabs) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-[11px] text-blue-800 ring-1 ring-blue-200">
        <span>사용할 탭:</span>
        <select
          value={tab}
          onChange={(e) => setTab(e.target.value)}
          disabled={busy}
          className="rounded border border-gray-300 bg-white px-2 py-1"
        >
          {pickTabs.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button
          onClick={process}
          disabled={busy || !tab}
          className="rounded bg-gray-900 px-2.5 py-1 font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          이 탭으로 감액 분석
        </button>
        {msg && <span className="text-gray-600">{msg}</span>}
      </div>
    );
  }

  // 처리 완료 — 설명 없이 재업로드만 (필요 시)
  if (sheetState === "processed") {
    return (
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-400">
        {fileInput("다른 파일 업로드")}
        {msg && <span>{msg}</span>}
      </div>
    );
  }

  // 미업로드 — 설명 없이 업로드 버튼만
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-400">
      {fileInput("투자현황 DB 업로드")}
      {msg && <span className="text-gray-600">{msg}</span>}
    </div>
  );
}
