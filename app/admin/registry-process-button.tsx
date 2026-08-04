"use client";

import { useState } from "react";

const NAVY = "#1f3a5f";

interface Item { company: string; quarter: string; url: string; ok: boolean; note: string }
type Phase = "idle" | "counting" | "confirm" | "running" | "done" | "error";

export function RegistryProcessButton() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [pending, setPending] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 1단계: OCR 없이 대상 건수만 조회 → 확인 창
  async function check() {
    setPhase("counting"); setError(null); setItems([]); setDoneCount(0); setRemaining(null);
    try {
      const r = await fetch("/api/registry-process"); // GET = 건수만 (비용 없음)
      const j = await r.json();
      if (!j.ok) { setError(j.error || "실패"); setPhase("error"); return; }
      setPending(j.pending);
      setPhase(j.pending === 0 ? "done" : "confirm");
    } catch (e: any) {
      setError(`요청 실패: ${e?.message || e}`); setPhase("error");
    }
  }

  // 2단계: 실제 OCR (확인 후에만). done까지 배치 반복.
  async function run() {
    setPhase("running"); setError(null); setItems([]); setDoneCount(0); setRemaining(pending);
    let total = 0;
    for (let guard = 0; guard < 300; guard++) {
      let j: any;
      try {
        const r = await fetch("/api/registry-process", { method: "POST" });
        j = await r.json();
      } catch (e: any) { setError(`요청 실패: ${e?.message || e}`); setPhase("error"); return; }
      if (!j.ok) { setError(j.error || "실패"); setPhase("error"); return; }
      total += j.processed.length;
      setDoneCount(total);
      setRemaining(j.remaining);
      setItems((prev) => [...j.processed, ...prev].slice(0, 300));
      if (j.done || j.processed.length === 0) break;
    }
    setPhase("done");
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-800">신규 등기부등본 자동 OCR</div>
          <div className="mt-0.5 text-[11px] text-gray-500">
            각 기업의 <b>최신</b> 등기부만 골라 Claude Opus OCR로 판독 → 트래커에 자동 반영. (이미 처리된 건·과거 분기는 건너뜀 · Claude Opus 호출 비용 발생)
          </div>
        </div>
        {(phase === "idle" || phase === "done" || phase === "error") && (
          <button onClick={check} className="shrink-0 rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: NAVY }}>
            새 등기부 확인
          </button>
        )}
        {phase === "counting" && <span className="shrink-0 text-sm text-gray-500">대상 확인 중…</span>}
        {phase === "running" && (
          <span className="shrink-0 rounded-lg px-4 py-2 text-sm font-semibold text-white opacity-70" style={{ background: NAVY }}>
            처리 중… ({doneCount}건{remaining != null ? ` · 남음 ${remaining}` : ""})
          </span>
        )}
      </div>

      {/* 확인 창: 비용 발생 전 마지막 확인 */}
      {phase === "confirm" && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2.5">
          <div className="text-xs text-amber-900">
            처리할 새 등기부 <b>{pending}건</b> — Claude Opus OCR을 <b>{pending}회</b> 호출합니다(건당 비용 발생). 진행할까요?
          </div>
          <div className="flex shrink-0 gap-2">
            <button onClick={() => setPhase("idle")} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600">취소</button>
            <button onClick={run} className="rounded-md px-3 py-1.5 text-xs font-semibold text-white" style={{ background: NAVY }}>진행</button>
          </div>
        </div>
      )}

      {error && <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

      {phase === "done" && !error && (
        <div className="mt-3 text-xs font-medium text-emerald-700">
          {items.length === 0 && pending === 0 ? "새로 처리할 등기부가 없습니다." : `완료 · 총 ${doneCount}건 처리`}
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-2 max-h-64 overflow-auto rounded-md border border-gray-100">
          <table className="w-full text-[11px]">
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-0">
                  <td className="w-6 px-2 py-1 text-center">{it.ok ? "✓" : "—"}</td>
                  <td className="px-2 py-1 font-medium text-gray-700">{it.company}</td>
                  <td className="px-2 py-1 text-gray-400">{it.quarter}</td>
                  <td className={`px-2 py-1 ${it.ok ? "text-gray-600" : "text-amber-700"}`}>{it.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
