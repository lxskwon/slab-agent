import Link from "next/link";
import { notFound } from "next/navigation";
import { getFundTracker } from "@/lib/slab/service";
import { FollowupTable, WriteoffTable, NAVY } from "../../tracker-tables";
import { WriteoffUpload } from "./writeoff-upload";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "followup", label: "① 후속투자" },
  { key: "writeoff", label: "② 감액" },
];

export default async function FundPage({
  params,
  searchParams,
}: {
  params: Promise<{ fund: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { fund } = await params;
  const { tab = "followup" } = await searchParams;

  const tracker = await getFundTracker(fund);
  if (!tracker) notFound();

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <Link href="/funds" className="text-xs text-gray-400 hover:text-gray-700">
          ← 펀드 목록
        </Link>
      </div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold" style={{ color: NAVY }}>
            {tracker.fund.name} <span className="text-sm font-normal text-gray-400">트래커</span>
          </h1>
          <p className="mt-0.5 text-xs text-gray-500">
            소속 기업 {tracker.followup.length}곳 · 실데이터(SLAB). 최신 제출 분기 기준.
          </p>
        </div>
        <a
          href={`/api/export?fund=${fund}`}
          className="mt-0.5 shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:border-[#1f3a5f] hover:text-[#1f3a5f]"
        >
          ⬇ 내보내기 (.xlsx)
        </a>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/fund/${fund}?tab=${t.key}`}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${
              tab === t.key
                ? "border-[#1f3a5f] font-semibold text-[#1f3a5f]"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "followup" ? (
        <FollowupTable rows={tracker.followup} />
      ) : (
        <>
          <WriteoffUpload fund={fund} sheetState={tracker.sheetState} tabs={tracker.tabs} />
          <WriteoffTable rows={tracker.writeoff} />
        </>
      )}
    </div>
  );
}
