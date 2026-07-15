import Link from "next/link";
import { getDashboard, slabEnabled, type DashFund } from "@/lib/slab/service";
import { NAVY } from "../tracker-tables";

export const dynamic = "force-dynamic";

function Bar({ seg }: { seg: { v: number; c: string }[] }) {
  const total = seg.reduce((s, x) => s + x.v, 0) || 1;
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-gray-100">
      {seg.map((x, i) => (
        <div key={i} className={x.c} style={{ width: `${(x.v / total) * 100}%` }} />
      ))}
    </div>
  );
}

function FundCard({ f }: { f: DashFund }) {
  return (
    <Link href={`/fund/${f.slug}`} className="group block rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-[#1f3a5f] hover:shadow">
      <div className="flex items-center justify-between">
        <span className="text-base font-bold" style={{ color: NAVY }}>{f.name}</span>
        <div className="flex gap-1 text-[11px]">
          {f.red > 0 && <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700">🔴 {f.red}</span>}
          {f.yellow > 0 && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700">🟡 {f.yellow}</span>}
          {f.red === 0 && f.yellow === 0 && <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-700">✓</span>}
        </div>
      </div>
      <div className="mt-1 text-[11px] text-gray-400">{f.companies}개 기업 · 등기부등본 {f.registryPct}%</div>
      <div className="mt-3 space-y-2">
        {/* 후속투자 — 전 펀드 자동 */}
        <div>
          <div className="mb-1 text-[10px] text-gray-400">
            <span className="text-[11px] font-semibold" style={{ color: NAVY }}>후속투자</span> · 일치 {f.followup.match} / 불일치 {f.followup.mismatch}
            {f.followup.pending > 0 && <span className="text-gray-400"> / 미확정 {f.followup.pending}</span>}
          </div>
          <Bar seg={[{ v: f.followup.match, c: "bg-green-400" }, { v: f.followup.mismatch, c: "bg-red-400" }, { v: f.followup.pending, c: "bg-gray-200" }]} />
        </div>
        {/* 감액 — DB 업로드된 펀드만 */}
        <div>
          <div className="mb-1 text-[10px] text-gray-400">
            <span className="text-[11px] font-semibold" style={{ color: NAVY }}>감액</span>
            {f.writeoffUploaded ? (
              <> · 반영 {f.writeoff.reflected} / 미반영 {f.writeoff.notReflected}
                {f.writeoff.pending > 0 && <span className="text-gray-400"> / 미확정 {f.writeoff.pending}</span>}
              </>
            ) : (
              <span className="text-gray-400"> · DB 미업로드</span>
            )}
          </div>
          {f.writeoffUploaded ? (
            <Bar seg={[{ v: f.writeoff.reflected, c: "bg-green-400" }, { v: f.writeoff.notReflected, c: "bg-red-400" }, { v: f.writeoff.pending, c: "bg-gray-200" }]} />
          ) : (
            <div className="text-[10px] text-gray-400">투자현황 DB를 업로드하면 분석됩니다</div>
          )}
        </div>
      </div>
    </Link>
  );
}

export default async function FundsPage() {
  if (!slabEnabled()) return <div className="text-sm text-gray-600">SLAB API 미설정</div>;
  let dash;
  try {
    dash = await getDashboard();
  } catch (e) {
    return <div className="text-sm text-red-600">SLAB 연결 오류: {(e as Error).message}</div>;
  }
  // 후속투자는 전 펀드 분석됨. 감액 DB 업로드 여부로만 구분.
  const withWriteoff = dash.funds.filter((f) => f.writeoffUploaded);
  const followupOnly = dash.funds.filter((f) => !f.writeoffUploaded);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-2">
        <Link href="/" className="text-xs text-gray-400 hover:text-gray-700">← 대시보드</Link>
      </div>
      <div>
        <h1 className="text-lg font-bold" style={{ color: NAVY }}>펀드 현황</h1>
        <p className="mt-0.5 text-xs text-gray-500">
          전 펀드 후속투자 분석 · 감액 DB {withWriteoff.length}/{dash.funds.length} · 등기부등본 처리율 {dash.totals.registryPct}%
        </p>
      </div>

      {withWriteoff.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-medium text-gray-600">후속투자 + 감액 분석 완료</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {withWriteoff.map((f) => <FundCard key={f.slug} f={f} />)}
          </div>
        </div>
      )}

      {followupOnly.length > 0 && (
        <div>
          <h2 className="mb-2 mt-4 text-sm font-medium text-gray-600">후속투자만 · 감액 DB 미업로드</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {followupOnly.map((f) => <FundCard key={f.slug} f={f} />)}
          </div>
        </div>
      )}
    </div>
  );
}
