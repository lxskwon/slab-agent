// 잠재용(parked) 대시보드 — 현재 메인 UX는 / 의 체크리스트 다운로드.
// 나중에 대시보드 방향이 정해지면 여기서 이어간다.
import Link from "next/link";
import { getFollowupView, getWriteoffView } from "@/lib/data";
import { RefreshButton } from "../refresh-button";

export const dynamic = "force-dynamic";

function Card({
  label,
  value,
  tone = "gray",
  href,
}: {
  label: string;
  value: number | string;
  tone?: "gray" | "red" | "amber" | "green";
  href?: string;
}) {
  const tones: Record<string, string> = {
    gray: "text-gray-900",
    red: "text-red-600",
    amber: "text-amber-600",
    green: "text-green-600",
  };
  const body = (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tones[tone]}`}>{value}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function OverviewPage() {
  const [view, writeoff] = await Promise.all([
    getFollowupView(),
    getWriteoffView(),
  ]);
  const { summary } = view;
  const w = writeoff.summary;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">개요 (parked)</h1>
          <p className="mt-1 text-sm text-gray-500">
            {view.source === "db"
              ? `마지막 업데이트: ${view.updatedAt ? new Date(view.updatedAt).toLocaleString("ko-KR") : "—"}`
              : "라이브 프리뷰 (목업 데이터 · Supabase 미설정)"}
          </p>
        </div>
        <RefreshButton />
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium text-gray-700">후속투자</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card label="전체 기업" value={summary.total} href="/followup" />
          <Card label="🔴 불일치" value={summary.mismatched} tone="red" href="/followup?filter=불일치" />
          <Card label="⚪ 확인필요" value={summary.needsCheck} tone="gray" href="/followup?filter=확인필요" />
          <Card label="OCR 재확인" value={summary.lowConfidenceOcr} tone="amber" href="/followup" />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-gray-700">감액</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card label="전체 기업" value={w.total} href="/writeoff" />
          <Card label="🔴 미반영" value={w.notReflected} tone="red" href="/writeoff?filter=미반영" />
          <Card label="🟡 판단애매" value={w.ambiguous} tone="amber" href="/writeoff?filter=판단애매" />
          <Card label="🟢 이미 반영됨" value={w.reflected} tone="green" href="/writeoff" />
        </div>
      </section>
    </div>
  );
}
