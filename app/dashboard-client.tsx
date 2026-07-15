"use client";

import Link from "next/link";
import { useState } from "react";
import type { Dashboard } from "@/lib/slab/service";
import { NAVY } from "./tracker-tables";
import QueueBoard from "./queue-board";

function Kpi({ label, value, sub, href, big = true }: { label: string; value: React.ReactNode; sub?: string; href?: string; big?: boolean }) {
  const body = (
    <div className={`flex h-full flex-col rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 shadow-sm ${href ? "transition hover:border-[#1f3a5f] hover:shadow" : ""}`}>
      <div className="flex items-center justify-between text-[11px] font-medium text-gray-500">
        {label}
        {href && <span className="text-gray-300">→</span>}
      </div>
      <div className={`mt-0.5 truncate font-bold tabular-nums ${big ? "text-2xl" : "text-lg"}`} style={{ color: NAVY }}>{value}</div>
      <div className="mt-auto pt-0.5 text-[11px] text-gray-400">{sub ?? " "}</div>
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

export default function DashboardClient({ dash }: { dash: Dashboard }) {
  const [fund, setFund] = useState("all");
  const { totals } = dash;
  const sel = fund === "all" ? null : dash.funds.find((f) => f.slug === fund) ?? null;

  const exportHref = sel ? `/api/export?fund=${sel.slug}` : "/api/export";
  const exportLabel = sel ? `⬇ ${sel.name} 내보내기 (.xlsx)` : "⬇ 전체 내보내기 (.xlsx)";

  return (
    <div className="space-y-4">
      {/* 전역 필터 + 내보내기 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500">보기</span>
          <div className="relative">
            <select
              value={fund}
              onChange={(e) => setFund(e.target.value)}
              className="appearance-none rounded-lg border border-gray-200 bg-white py-1.5 pl-3 pr-8 text-sm font-medium text-gray-800 shadow-sm focus:border-[#1f3a5f] focus:outline-none"
            >
              <option value="all">전체 펀드</option>
              {dash.funds.map((f) => (
                <option key={f.slug} value={f.slug}>{f.name}</option>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>
        <a
          href={exportHref}
          className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:border-[#1f3a5f] hover:text-[#1f3a5f]"
        >
          {exportLabel}
        </a>
      </div>

      {/* KPI — 선택한 펀드에 맞춰 변함 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          label="펀드"
          value={sel ? sel.name : totals.funds}
          big={!sel}
          sub={sel ? "선택된 펀드" : "클릭해서 펀드별 보기"}
          href={sel ? `/fund/${sel.slug}` : "/funds"}
        />
        <Kpi
          label="포트폴리오사 수"
          value={sel ? sel.companies : totals.companies}
          sub={sel ? "이 펀드 기업 수" : `${totals.funds}개 펀드 전체`}
        />
        <Kpi
          label="감액 분석"
          value={sel ? (sel.writeoffUploaded ? "완료" : "미업로드") : `${totals.processed} / ${totals.funds}`}
          big={!sel}
          sub="투자현황 DB"
          href={sel ? `/fund/${sel.slug}?tab=writeoff` : "/funds"}
        />
        <Kpi
          label="등기부등본 처리율"
          value={`${sel ? sel.registryPct : totals.registryPct}%`}
          sub={sel ? "이 펀드 판독률" : "첨부된 등기부등본 중 판독 완료"}
          href={sel ? `/fund/${sel.slug}` : "/funds"}
        />
      </div>

      {/* 조치 필요 큐 — 같은 펀드 필터에 연동 */}
      <QueueBoard issues={dash.issues} fund={fund} />
    </div>
  );
}
