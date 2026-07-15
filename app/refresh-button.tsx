"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "실행 실패");
      setMsg(
        body.persisted
          ? `새로고침 완료 (${body.summary.total}건 저장)`
          : `새로고침 완료 (${body.summary.total}건 · Supabase 미설정으로 저장 생략)`,
      );
      startTransition(() => router.refresh());
    } catch (e) {
      setMsg(`오류: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onClick}
        disabled={busy || pending}
        className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {busy || pending ? "실행 중…" : "지금 새로고침"}
      </button>
      {msg && <span className="text-xs text-gray-500">{msg}</span>}
    </div>
  );
}
