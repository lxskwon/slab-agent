"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CompanyIndexEntry } from "@/lib/slab/service";

const MAX = 8;

export default function CompanySearch({ companies }: { companies: CompanyIndexEntry[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return companies.filter((c) => c.name.toLowerCase().includes(t)).slice(0, MAX);
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
