"use client";

import { useState } from "react";

const NAVY = "#1f3a5f";

interface Item { company: string; quarter: string; url: string; ok: boolean; note: string }

export function RegistryProcessButton() {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  async function run() {
    setRunning(true); setError(null); setFinished(false);
    setItems([]); setDone(0); setRemaining(null);
    let total = 0;
    for (let guard = 0; guard < 200; guard++) {
      let j: any;
      try {
        const r = await fetch("/api/registry-process", { method: "POST" });
        j = await r.json();
      } catch (e: any) {
        setError(`요청 실패: ${e?.message || e}`); break;
      }
      if (!j.ok) { setError(j.error || "실패"); break; }
      total += j.processed.length;
      setDone(total);
      setRemaining(j.remaining);
      setItems((prev) => [...j.processed, ...prev].slice(0, 200));
      if (j.done || j.processed.length === 0) { setFinished(true); break; }
    }
    setRunning(false);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-800">신규 등기부등본 자동 OCR</div>
          <div className="mt-0.5 text-[11px] text-gray-500">
            분기가 바뀌어 새로 첨부된 등기부만 골라 Claude OCR로 판독 → 트래커에 자동 반영. (이미 처리된 건은 건너뜀 · Opus 호출 비용 발생)
          </div>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="shrink-0 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: NAVY }}
        >
          {running ? `처리 중… (${done}건${remaining != null ? ` · 남음 ${remaining}` : ""})` : "새 등기부 처리"}
        </button>
      </div>

      {error && <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

      {(finished || items.length > 0) && (
        <div className="mt-3">
          {finished && !error && (
            <div className="mb-2 text-xs font-medium text-emerald-700">
              완료 · 총 {done}건 처리{done === 0 ? " (새로 처리할 등기부 없음)" : ""}
            </div>
          )}
          {items.length > 0 && (
            <div className="max-h-64 overflow-auto rounded-md border border-gray-100">
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
      )}
    </div>
  );
}
