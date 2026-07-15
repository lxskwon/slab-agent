import Link from "next/link";
import { getDashboard, slabEnabled } from "@/lib/slab/service";
import { NAVY } from "./tracker-tables";
import QueueBoard from "./queue-board";

export const dynamic = "force-dynamic";

function Kpi({ label, value, sub, href }: { label: string; value: string | number; sub?: string; href?: string }) {
  const body = (
    <div className={`flex h-full flex-col rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 shadow-sm ${href ? "transition hover:border-[#1f3a5f] hover:shadow" : ""}`}>
      <div className="flex items-center justify-between text-[11px] font-medium text-gray-500">
        {label}
        {href && <span className="text-gray-300">→</span>}
      </div>
      <div className="mt-0.5 text-2xl font-bold tabular-nums" style={{ color: NAVY }}>{value}</div>
      <div className="mt-auto pt-0.5 text-[11px] text-gray-400">{sub ?? " "}</div>
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

export default async function DashboardPage() {
  if (!slabEnabled()) {
    return <div className="text-sm text-gray-600">SLAB API 미설정 (.env.local 확인)</div>;
  }
  let dash;
  try {
    dash = await getDashboard();
  } catch (e) {
    return <div className="text-sm text-red-600">SLAB 연결 오류: {(e as Error).message}</div>;
  }
  const { totals, issues } = dash;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: NAVY }}>SLAB 데이터 최신화 대시보드</h1>
          <p className="mt-1 text-sm text-gray-500">전 펀드 자동 대조 · 사람은 아래 큐만 확인하면 됩니다</p>
        </div>
        <a
          href="/api/export"
          className="mt-1 shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:border-[#1f3a5f] hover:text-[#1f3a5f]"
        >
          ⬇ 전체 내보내기 (.xlsx)
        </a>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="펀드" value={totals.funds} sub="클릭해서 펀드별 보기" href="/funds" />
        <Kpi label="분석된 기업" value={totals.companies} sub={`${totals.funds}개 펀드 전체`} />
        <Kpi label="감액 분석" value={`${totals.processed} / ${totals.funds}`} sub="투자현황 DB 업로드됨" href="/funds" />
        <Kpi label="등기부등본 처리율" value={`${totals.registryPct}%`} sub="첨부된 등기부등본 중 판독 완료" href="/funds" />
      </div>

      {/* 조치 필요 큐 — 후속투자 / 감액 분리 + 필터/스크롤 */}
      <QueueBoard issues={issues} />
    </div>
  );
}
