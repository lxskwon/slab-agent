"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CompanyIndexEntry } from "@/lib/slab/service";

const MAX = 8;

const CHO = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
// 입력 문자가 초성 자음인지 (예: ㅅ, ㅌ)
const isCho = (ch: string) => CHO.includes(ch);
// 완성형 한글 음절의 초성. 음절이 아니면 그대로 반환.
function choOf(ch: string): string {
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return CHO[Math.floor((code - 0xac00) / 588)];
  return ch;
}
// 회사명 앞의 ㈜/(주)/주식회사/공백 제거 → 매칭 기준을 실제 이름 첫 글자로.
const normalize = (name: string) => name.replace(/^\s*(?:㈜|\(주\)|주식회사)\s*/, "");
// name[off..] 가 query 와 앞에서부터 일치하는지. query 문자가 초성이면 초성 비교, 아니면 글자 비교.
function matchAt(name: string, q: string, off: number): boolean {
  if (off + q.length > name.length) return false;
  for (let i = 0; i < q.length; i++) {
    const qc = q[i], nc = name[off + i];
    if (isCho(qc)) { if (choOf(nc) !== qc) return false; }
    else if (nc.toLowerCase() !== qc.toLowerCase()) return false;
  }
  return true;
}

export default function CompanySearch({ companies }: { companies: CompanyIndexEntry[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const t = q.trim();
    if (!t) return [];
    // tier 0: 이름 앞에서부터 일치(접두), tier 1: 이름 중간에서 일치(폴백) — 접두 우선.
    const scored: { c: CompanyIndexEntry; tier: number }[] = [];
    for (const c of companies) {
      const norm = normalize(c.name);
      if (matchAt(norm, t, 0)) { scored.push({ c, tier: 0 }); continue; }
      let hit = false;
      for (let off = 1; off + t.length <= norm.length; off++) {
        if (matchAt(norm, t, off)) { hit = true; break; }
      }
      if (hit) scored.push({ c, tier: 1 });
    }
    scored.sort((a, b) => a.tier - b.tier || a.c.name.localeCompare(b.c.name, "ko"));
    return scored.slice(0, MAX).map((s) => s.c);
  }, [q, companies]);

  const go = (c: CompanyIndexEntry) => {
    setOpen(false);
    setQ("");
    router.push(`/company/${c.id}`);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open || !matches.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); go(matches[active] ?? matches[0]); }
    else if (e.key === "Escape") { setOpen(false); }
  };

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <div className="relative">
        <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKey}
          placeholder="기업 검색…"
          className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-9 pr-3 text-sm shadow-sm focus:border-[#1f3a5f] focus:outline-none"
        />
      </div>
      {open && q.trim() && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          {matches.length === 0 ? (
            <div className="px-3 py-2.5 text-xs text-gray-400">검색 결과 없음</div>
          ) : (
            matches.map((c, i) => (
              <button
                key={c.id}
                onMouseDown={(e) => { e.preventDefault(); go(c); }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${i === active ? "bg-gray-50" : ""}`}
              >
                <span className="truncate font-medium text-gray-800">{c.name}</span>
                <span className="shrink-0 truncate text-[11px] text-gray-400">
                  {c.funds.length > 1 ? `${c.funds[0]} 외 ${c.funds.length - 1}` : c.funds[0]}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
