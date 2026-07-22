"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NAVY } from "../tracker-tables";

export default function LoginPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !password) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), password }),
      });
      if (r.ok) { router.replace("/"); router.refresh(); return; }
      const d = await r.json().catch(() => ({}));
      setErr(d.error || "로그인에 실패했습니다.");
    } catch { setErr("로그인에 실패했습니다."); }
    setBusy(false);
  };

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="text-xl font-bold" style={{ color: NAVY }}>SLAB 데이터 최신화 대시보드</h1>
      <p className="mt-1 text-xs text-gray-500">이름과 비밀번호를 입력해 주세요. 이름은 메모 작성자로 표시됩니다.</p>
      <form onSubmit={submit} autoComplete="off" className="mt-5 space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">이름</label>
          <input
            value={name} onChange={(e) => setName(e.target.value)} autoFocus
            name="slab-display-name" autoComplete="off"
            placeholder="예: 홍길동"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#1f3a5f] focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">비밀번호</label>
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            name="slab-access-code" autoComplete="new-password"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#1f3a5f] focus:outline-none"
          />
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
        <button
          type="submit" disabled={busy || !name.trim() || !password}
          className="w-full rounded-lg bg-[#1f3a5f] px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
        >{busy ? "확인 중…" : "로그인"}</button>
      </form>
    </div>
  );
}
